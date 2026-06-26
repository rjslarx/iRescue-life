import Stripe from 'stripe';
import { decrypt } from './encryption';
import type { Tenant } from '@shared/schema';
import { getPlatformStripeSecretKey } from '../config/platform';
import { isAchEligible, type AchSurface } from '@shared/ach-eligibility';

/**
 * In-memory cache for Connect-account ACH capability lookups.
 * `accounts.retrieve` is rate-limited and runs on every checkout, so we
 * memoize per Connect account for a short window (10 minutes). Refreshed on
 * cache miss; never hold stale data long enough that a newly-enabled
 * account stays gated for hours.
 */
const ACH_CAPABILITY_CACHE_TTL_MS = 10 * 60 * 1000;
const achCapabilityCache = new Map<string, { ok: boolean; checkedAt: number }>();

export async function connectAccountSupportsAch(
  stripe: Stripe,
  connectedAccountId: string,
): Promise<boolean> {
  const cached = achCapabilityCache.get(connectedAccountId);
  if (cached && Date.now() - cached.checkedAt < ACH_CAPABILITY_CACHE_TTL_MS) {
    return cached.ok;
  }
  try {
    const acct = await stripe.accounts.retrieve(connectedAccountId);
    // Stripe's canonical capability key is `us_bank_account_ach_payments`;
    // accept the legacy `us_bank_account_payments` alias to be safe across
    // account shapes.
    const caps = acct.capabilities as Record<string, string | undefined> | undefined;
    const ok = caps?.us_bank_account_ach_payments === 'active'
      || caps?.us_bank_account_payments === 'active';
    achCapabilityCache.set(connectedAccountId, { ok, checkedAt: Date.now() });
    return ok;
  } catch (err) {
    // Lookup failed: fall back to card-only.
    console.warn(
      `[stripe-service] Connect ACH capability check failed for ${connectedAccountId}; defaulting to card-only.`,
      (err as Error)?.message,
    );
    achCapabilityCache.set(connectedAccountId, { ok: false, checkedAt: Date.now() });
    return false;
  }
}

/** Test-only escape hatch so unit tests can reset the capability cache. */
export function _resetAchCapabilityCacheForTests() {
  achCapabilityCache.clear();
}

// Re-export for convenience
export { isStripeTestMode } from '../config/platform';

export function toStripeStatementDescriptor(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!cleaned || !/[A-Z]/.test(cleaned)) return 'RESCUE';
  return cleaned.slice(0, 22);
}

// Get the appropriate platform Stripe key based on test mode
export function getPlatformStripeKey(): string | undefined {
  return getPlatformStripeSecretKey();
}

export class StripeService {
  private stripeClients: Map<string, Stripe> = new Map();

  getStripeClient(tenant: Tenant): Stripe | null {
    if (!tenant.stripeEnabled || !tenant.stripeSecretKeyEncrypted) {
      return null;
    }

    const cachedClient = this.stripeClients.get(tenant.id);
    if (cachedClient) {
      return cachedClient;
    }

    try {
      const secretKey = decrypt(tenant.stripeSecretKeyEncrypted);
      const client = new Stripe(secretKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });

      this.stripeClients.set(tenant.id, client);
      return client;
    } catch (error) {
      console.error('Failed to initialize Stripe client:', error);
      return null;
    }
  }

  clearCache(tenantId: string) {
    this.stripeClients.delete(tenantId);
  }

  async validateApiKey(secretKey: string): Promise<boolean> {
    try {
      const testStripe = new Stripe(secretKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      await testStripe.accounts.retrieve();
      return true;
    } catch (error) {
      return false;
    }
  }

  async createCheckoutSession(
    tenant: Tenant,
    params: {
      amount: number;
      currency: string;
      customerEmail?: string;
      isRecurring: boolean;
      interval?: 'week' | 'month' | 'year';
      successUrl: string;
      cancelUrl: string;
      metadata?: Record<string, string>;
      platformFeeAmount?: number;
      connectedAccountId?: string;
      productName?: string;
      productDescription?: string;
      collectEmail?: boolean;
      /**
       * Which user-facing surface this checkout is for. Determines whether
       * us_bank_account (ACH) is offered as a payment method (gated by amount
       * thresholds in shared/ach-eligibility.ts). Defaults to 'donation'
       * which preserves the legacy "ACH on for all one-time" behaviour.
       */
      surface?: AchSurface;
      /**
       * Force-disable ACH regardless of surface/amount. Used by callers that
       * have a hard requirement for instant settlement (votes, ticket sales,
       * etc.) even if the surface would otherwise qualify.
       */
      forceCardOnly?: boolean;
    }
  ): Promise<Stripe.Checkout.Session | null> {
    // Determine which Stripe client to use
    let stripe: Stripe;
    const platformKey = getPlatformStripeKey();
    
    // Check if tenant has their own Stripe key configured
    const tenantHasOwnStripeKey = tenant.stripeEnabled && tenant.stripeSecretKeyEncrypted;
    const useStripeConnect = Boolean(params.connectedAccountId && platformKey);
    const collectPlatformFee = useStripeConnect && params.platformFeeAmount && params.platformFeeAmount > 0;

    if (useStripeConnect && platformKey) {
      stripe = new Stripe(platformKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
    } else if (tenantHasOwnStripeKey) {
      const tenantStripe = this.getStripeClient(tenant);
      if (!tenantStripe) {
        throw new Error('Failed to initialize tenant Stripe client');
      }
      stripe = tenantStripe;
    } else if (params.connectedAccountId && !platformKey) {
      throw new Error(
        'This organization uses Stripe Connect but the platform Stripe key is not configured. ' +
        'Please set PLATFORM_STRIPE_SECRET_KEY environment variable to enable donations.'
      );
    } else {
      throw new Error('Stripe is not configured for this rescue. Please complete Stripe setup in Settings.');
    }

    // ACH gates: not force-disabled, surface/amount/recurring eligible, Connect capability active.
    const surface: AchSurface = params.surface ?? 'donation';
    let offerAch = false;
    if (!params.forceCardOnly) {
      const eligible = isAchEligible({
        amountCents: params.amount,
        isRecurring: params.isRecurring,
        surface,
      });
      if (eligible) {
        if (useStripeConnect && params.connectedAccountId) {
          offerAch = await connectAccountSupportsAch(stripe, params.connectedAccountId);
        } else {
          offerAch = true;
        }
      }
    }

    const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] =
      offerAch ? ['card', 'us_bank_account'] : ['card'];

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: params.isRecurring ? 'subscription' : 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      metadata: {
        tenantId: tenant.id,
        ...params.metadata,
        achSurface: surface,
        achOffered: offerAch ? 'true' : 'false',
      },
      payment_method_types: paymentMethodTypes,
    };

    // Enable Financial Connections for instant ACH bank verification.
    if (offerAch) {
      sessionParams.payment_method_options = {
        ...(sessionParams.payment_method_options || {}),
        us_bank_account: {
          financial_connections: {
            permissions: ['payment_method', 'balances'],
          },
          verification_method: 'instant',
        },
      };
    }

    // Collect email if requested and not already provided
    if (params.collectEmail && !params.customerEmail) {
      sessionParams.customer_email = undefined;
      (sessionParams as any).customer_creation = 'always';
    }

    if (params.isRecurring) {
      const recurringInterval = params.interval || 'month';
      const intervalLabel =
        recurringInterval === 'week' ? 'Weekly'
        : recurringInterval === 'year' ? 'Annual'
        : 'Monthly';
      const price = await stripe.prices.create({
        unit_amount: params.amount,
        currency: params.currency,
        recurring: {
          interval: recurringInterval,
        },
        product_data: {
          name: params.productName || `${intervalLabel} Donation to ${tenant.name}`,
          ...(params.productDescription ? { description: params.productDescription } : {}),
        },
      });

      sessionParams.line_items = [
        {
          price: price.id,
          quantity: 1,
        },
      ];

      sessionParams.subscription_data = {
        metadata: {
          tenantId: tenant.id,
          ...(params.metadata || {}),
        },
        // Subscription must accept us_bank_account when ACH is offered.
        ...(offerAch ? {
          payment_settings: {
            payment_method_types: ['card', 'us_bank_account'],
            save_default_payment_method: 'on_subscription',
          },
        } : {}),
        // For Stripe Connect subscriptions, route payments to tenant account
        ...(useStripeConnect && params.connectedAccountId ? {
          transfer_data: {
            destination: params.connectedAccountId,
          },
          // Apply platform fee percent for recurring payments (only if fee > 0)
          // Stripe requires application_fee_percent to have at most 2 decimal places
          ...(collectPlatformFee && params.platformFeeAmount ? {
            application_fee_percent: Math.round((params.platformFeeAmount / params.amount) * 10000) / 100,
          } : {}),
        } : {}),
      };
    } else {
      sessionParams.line_items = [
        {
          price_data: {
            currency: params.currency,
            unit_amount: params.amount,
            product_data: {
              name: params.productName || `Donation to ${tenant.name}`,
              ...(params.productDescription ? { description: params.productDescription } : {}),
            },
          },
          quantity: 1,
        },
      ];

      if (useStripeConnect && params.connectedAccountId) {
        sessionParams.payment_intent_data = {
          on_behalf_of: params.connectedAccountId,
          transfer_data: {
            destination: params.connectedAccountId,
          },
          statement_descriptor_suffix: toStripeStatementDescriptor(tenant.name),
          ...(collectPlatformFee && params.platformFeeAmount ? {
            application_fee_amount: params.platformFeeAmount,
          } : {}),
        };
      } else {
        sessionParams.payment_intent_data = {
          ...(sessionParams.payment_intent_data || {}),
          statement_descriptor_suffix: toStripeStatementDescriptor(tenant.name),
        };
      }
    }

    return await stripe.checkout.sessions.create(sessionParams);
  }

  async handleWebhook(
    rawBody: Buffer,
    signature: string,
    webhookSecret: string
  ): Promise<Stripe.Event> {
    const stripe = new Stripe('sk_temp_for_webhook_verification', {
      apiVersion: '2025-09-30.clover',
      typescript: true,
    });

    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async createPaymentIntent(
    tenant: Tenant,
    params: {
      amount: number;
      currency?: string;
      description: string;
      receiptEmail?: string;
      metadata?: Record<string, string>;
      platformFeeAmount?: number;
      connectedAccountId?: string;
    }
  ): Promise<Stripe.PaymentIntent> {
    let stripe: Stripe;
    const platformKey = getPlatformStripeKey();
    
    // Check if tenant has their own Stripe key configured
    const tenantHasOwnStripeKey = tenant.stripeEnabled && tenant.stripeSecretKeyEncrypted;
    
    const useStripeConnect = Boolean(params.connectedAccountId && platformKey);
    const collectPlatformFee = useStripeConnect && params.platformFeeAmount && params.platformFeeAmount > 0;

    if (useStripeConnect && platformKey) {
      stripe = new Stripe(platformKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
    } else if (tenantHasOwnStripeKey) {
      const tenantStripe = this.getStripeClient(tenant);
      if (!tenantStripe) {
        throw new Error('Failed to initialize tenant Stripe client');
      }
      stripe = tenantStripe;
    } else {
      throw new Error('Stripe is not configured for this rescue organization');
    }

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: params.amount,
      currency: params.currency || 'usd',
      description: params.description,
      receipt_email: params.receiptEmail,
      statement_descriptor_suffix: toStripeStatementDescriptor(tenant.name),
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        tenantId: tenant.id,
        ...params.metadata,
      },
    };
    
    // Add Stripe Connect destination charge with platform fee if applicable
    if (useStripeConnect && params.connectedAccountId) {
      paymentIntentParams.transfer_data = {
        destination: params.connectedAccountId,
      };
      
      // Add application fee if there is one (free tier has fee, pro tier has 0)
      if (collectPlatformFee && params.platformFeeAmount) {
        paymentIntentParams.application_fee_amount = params.platformFeeAmount;
      }
    }

    return await stripe.paymentIntents.create(paymentIntentParams);
  }

  async confirmPaymentIntent(
    tenant: Tenant,
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.getStripeClient(tenant);
    if (!stripe) {
      throw new Error('Stripe is not configured for this rescue organization');
    }

    return await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  }

  async retrievePaymentIntent(
    tenant: Tenant,
    paymentIntentId: string
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.getStripeClient(tenant);
    if (!stripe) {
      throw new Error('Stripe is not configured for this rescue organization');
    }

    return await stripe.paymentIntents.retrieve(paymentIntentId);
  }

  /**
   * Get Stripe balance for a tenant (either Connect account or direct)
   */
  async getBalance(tenant: Tenant): Promise<Stripe.Balance | null> {
    const platformKey = getPlatformStripeKey();
    
    // For Stripe Connect accounts
    if (tenant.stripeConnectedAccountId && platformKey) {
      const stripe = new Stripe(platformKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      return await stripe.balance.retrieve(
        {},
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
    }
    
    // For tenants with their own Stripe key
    const stripe = this.getStripeClient(tenant);
    if (!stripe) {
      return null;
    }
    return await stripe.balance.retrieve();
  }

  /**
   * Get recent payouts for a tenant
   */
  async getPayouts(tenant: Tenant, limit: number = 10): Promise<{ payouts: Stripe.Payout[] | null; error?: string }> {
    const platformKey = getPlatformStripeKey();
    
    // For Stripe Connect accounts
    if (tenant.stripeConnectedAccountId && platformKey) {
      try {
        const stripe = new Stripe(platformKey, {
          apiVersion: '2025-09-30.clover',
          typescript: true,
        });
        const payouts = await stripe.payouts.list(
          { limit },
          { stripeAccount: tenant.stripeConnectedAccountId }
        );
        return { payouts: payouts.data };
      } catch (err: any) {
        console.error(`[Stripe] Error fetching payouts for connected account:`, err.message);
        return { payouts: null, error: err.message || 'Failed to fetch payouts' };
      }
    }
    
    // For tenants with their own Stripe key
    const stripe = this.getStripeClient(tenant);
    if (!stripe) {
      return { payouts: null, error: 'No Stripe client configured' };
    }
    
    try {
      const payouts = await stripe.payouts.list({ limit });
      return { payouts: payouts.data };
    } catch (err: any) {
      console.error(`[Stripe] Error fetching payouts with tenant key:`, err.message);
      return { payouts: null, error: err.message || 'Failed to fetch payouts' };
    }
  }

  /**
   * Get recent transactions/charges for a tenant
   */
  async getTransactions(tenant: Tenant, limit: number = 50): Promise<{ charges: Stripe.Charge[] | null; error?: string }> {
    const platformKey = getPlatformStripeKey();
    
    console.log(`[Stripe] getTransactions for tenant ${tenant.subdomain}: connectedAccountId=${tenant.stripeConnectedAccountId ? 'yes' : 'no'}, platformKey=${platformKey ? 'yes' : 'no'}`);
    
    // For Stripe Connect accounts
    if (tenant.stripeConnectedAccountId && platformKey) {
      try {
        const stripe = new Stripe(platformKey, {
          apiVersion: '2025-09-30.clover',
          typescript: true,
        });
        console.log(`[Stripe] Fetching charges for connected account: ${tenant.stripeConnectedAccountId}`);
        const charges = await stripe.charges.list(
          { limit },
          { stripeAccount: tenant.stripeConnectedAccountId }
        );
        console.log(`[Stripe] Successfully fetched ${charges.data.length} charges`);
        return { charges: charges.data };
      } catch (err: any) {
        console.error(`[Stripe] Error fetching transactions for connected account:`, err.message);
        return { charges: null, error: err.message || 'Failed to fetch Stripe transactions' };
      }
    }
    
    // For tenants with their own Stripe key
    const stripe = this.getStripeClient(tenant);
    if (!stripe) {
      console.log(`[Stripe] No Stripe client available for tenant ${tenant.subdomain}`);
      return { charges: null, error: 'No Stripe client configured' };
    }
    
    try {
      const charges = await stripe.charges.list({ limit });
      console.log(`[Stripe] Successfully fetched ${charges.data.length} charges using tenant key`);
      return { charges: charges.data };
    } catch (err: any) {
      console.error(`[Stripe] Error fetching transactions with tenant key:`, err.message);
      return { charges: null, error: err.message || 'Failed to fetch Stripe transactions' };
    }
  }
  /**
   * Create a Stripe Customer Portal session so a VIP donor can update their
   * payment method or cancel their subscription self-serve.
   *
   * VIP subscriptions are created either via Stripe Connect destination charges
   * (using the platform key) or directly with the tenant's own key. In both
   * cases the Customer object that owns the subscription lives on whichever
   * account created the checkout session, so we mirror that selection here.
   */
  async createDonorBillingPortalSession(
    tenant: Tenant,
    params: {
      customerId: string;
      returnUrl: string;
    }
  ): Promise<Stripe.BillingPortal.Session> {
    let stripe: Stripe;
    const platformKey = getPlatformStripeKey();
    const tenantHasOwnStripeKey = tenant.stripeEnabled && tenant.stripeSecretKeyEncrypted;
    const useStripeConnect = Boolean(tenant.stripeConnectedAccountId && platformKey);

    if (useStripeConnect && platformKey) {
      stripe = new Stripe(platformKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
    } else if (tenantHasOwnStripeKey) {
      const tenantStripe = this.getStripeClient(tenant);
      if (!tenantStripe) {
        throw new Error('Failed to initialize tenant Stripe client');
      }
      stripe = tenantStripe;
    } else {
      throw new Error('Stripe is not configured for this rescue organization');
    }

    return await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
  }

  async getCheckoutSessions(tenant: Tenant, limit: number = 100): Promise<{ sessions: Stripe.Checkout.Session[] | null; error?: string }> {
    const platformKey = getPlatformStripeKey();
    
    if (tenant.stripeConnectedAccountId && platformKey) {
      try {
        const stripe = new Stripe(platformKey, {
          apiVersion: '2025-09-30.clover',
          typescript: true,
        });
        const sessions = await stripe.checkout.sessions.list(
          { limit, expand: ['data.payment_intent'] },
        );
        const tenantSessions = sessions.data.filter(s => s.metadata?.tenantId === tenant.id);
        return { sessions: tenantSessions };
      } catch (err: any) {
        console.error(`[Stripe] Error fetching checkout sessions:`, err.message);
        return { sessions: null, error: err.message };
      }
    }
    
    const stripe = this.getStripeClient(tenant);
    if (!stripe) {
      return { sessions: null, error: 'No Stripe client configured' };
    }
    
    try {
      const sessions = await stripe.checkout.sessions.list(
        { limit, expand: ['data.payment_intent'] }
      );
      return { sessions: sessions.data };
    } catch (err: any) {
      return { sessions: null, error: err.message };
    }
  }
}

export const stripeService = new StripeService();
