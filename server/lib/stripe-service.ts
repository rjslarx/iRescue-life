import Stripe from 'stripe';
import { decrypt } from './encryption';
import type { Tenant } from '@shared/schema';
import { getPlatformStripeSecretKey } from '../config/platform';

// Re-export for convenience
export { isStripeTestMode } from '../config/platform';

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
      interval?: 'month' | 'year';
      successUrl: string;
      cancelUrl: string;
      metadata?: Record<string, string>;
      platformFeeAmount?: number;
      connectedAccountId?: string;
    }
  ): Promise<Stripe.Checkout.Session | null> {
    // Determine which Stripe client to use
    let stripe: Stripe;
    const platformKey = getPlatformStripeKey();
    
    // Check if tenant has their own Stripe key configured
    const tenantHasOwnStripeKey = tenant.stripeEnabled && tenant.stripeSecretKeyEncrypted;
    
    // Use Stripe Connect when:
    // 1. Tenant has a connected account AND
    // 2. Platform Stripe key is available (required for Connect flows)
    const useStripeConnect = Boolean(params.connectedAccountId && platformKey);
    
    // Platform fee is collected only when Connect is used AND fee amount > 0
    const collectPlatformFee = useStripeConnect && params.platformFeeAmount && params.platformFeeAmount > 0;
    
    if (useStripeConnect && platformKey) {
      // Use platform Stripe key for Connect payments (destination charges)
      stripe = new Stripe(platformKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
    } else if (tenantHasOwnStripeKey) {
      // Fallback: use tenant's own Stripe key (direct processing, no platform fees)
      const tenantStripe = this.getStripeClient(tenant);
      if (!tenantStripe) {
        throw new Error('Failed to initialize tenant Stripe client');
      }
      stripe = tenantStripe;
    } else if (params.connectedAccountId && !platformKey) {
      // Connect tenant but platform key not configured - provide actionable error
      throw new Error(
        'This organization uses Stripe Connect but the platform Stripe key is not configured. ' +
        'Please set PLATFORM_STRIPE_SECRET_KEY environment variable to enable donations.'
      );
    } else {
      throw new Error('Stripe is not configured for this rescue. Please complete Stripe setup in Settings.');
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: params.isRecurring ? 'subscription' : 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      metadata: {
        tenantId: tenant.id,
        ...params.metadata,
      },
      payment_method_types: params.isRecurring 
        ? ['card'] 
        : ['card', 'us_bank_account'],
    };

    if (params.isRecurring) {
      const price = await stripe.prices.create({
        unit_amount: params.amount,
        currency: params.currency,
        recurring: {
          interval: params.interval || 'month',
        },
        product_data: {
          name: `Monthly Donation to ${tenant.name}`,
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
              name: `Donation to ${tenant.name}`,
            },
          },
          quantity: 1,
        },
      ];

      // For Stripe Connect one-time payments, route to tenant with optional platform fee
      if (useStripeConnect && params.connectedAccountId) {
        sessionParams.payment_intent_data = {
          transfer_data: {
            destination: params.connectedAccountId,
          },
          // Only add application fee if there is one (free tier has fee, pro tier has 0)
          ...(collectPlatformFee && params.platformFeeAmount ? {
            application_fee_amount: params.platformFeeAmount,
          } : {}),
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
    
    // Use Stripe Connect when:
    // 1. Tenant has a connected account AND
    // 2. Platform Stripe key is available (required for Connect flows)
    const useStripeConnect = Boolean(params.connectedAccountId && platformKey);
    
    // Platform fee is collected only when Connect is used AND fee amount > 0
    const collectPlatformFee = useStripeConnect && params.platformFeeAmount && params.platformFeeAmount > 0;
    
    if (useStripeConnect && platformKey) {
      // Use platform Stripe key for Connect payments (destination charges)
      stripe = new Stripe(platformKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
    } else if (tenantHasOwnStripeKey) {
      // Fallback: use tenant's own Stripe key (direct processing, no platform fees)
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
}

export const stripeService = new StripeService();
