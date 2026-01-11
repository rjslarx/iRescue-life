/**
 * Paw Pay - Platform Payment Processing Service
 * 
 * This service implements the "Free vs. Hosted" payment model for iRescue.life.
 * It handles Stripe Connect integration to route platform fees appropriately.
 * 
 * BUSINESS MODEL:
 * 
 * 1. Self-Hosted (Free): A mandatory platform fee (default 1.5%) is applied
 *    to all payments and routed to the iRescue.life platform. This fee helps
 *    fund continued open-source development.
 * 
 * 2. Managed Hosting (Paid): Platform fees are determined by the tenant's
 *    subscription tier. Premium tiers (Enterprise) get zero platform fees.
 * 
 * STRIPE CONNECT ARCHITECTURE:
 * 
 * For full platform fee collection, this requires Stripe Connect setup:
 * 
 * Option A: Destination Charges (Recommended)
 * - Platform uses its own Stripe key (PLATFORM_STRIPE_SECRET_KEY)
 * - Tenant is a "Connected Account" to the platform
 * - Payment is created on platform account with transfer_data to tenant
 * - application_fee_amount specifies the platform's cut
 * 
 * Option B: Direct Charges with Application Fees
 * - Tenant uses their own Stripe key with platform as partner
 * - Tenant creates charge with application_fee_amount
 * - Requires tenant to be connected to platform
 * 
 * CURRENT IMPLEMENTATION:
 * This module provides fee calculation and payment intent creation helpers.
 * For existing tenants with their own Stripe accounts (not connected to platform),
 * fees are calculated and logged for transparency. Full fee collection requires
 * tenants to be onboarded as Stripe Connected Accounts.
 */

import Stripe from 'stripe';
import { db } from '../db';
import { tenants, type Tenant } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '../lib/encryption';
import {
  getPlatformConfig,
  getPlatformFeePercent,
  calculatePlatformFee,
  getStripeConnectPlatformAccountId,
  isStripeConnectConfigured,
  getPlatformStripeSecretKey,
  shouldBlockPaymentWithoutFees,
  isHostedPlatform,
  calculateDonorCoversFees,
  STRIPE_PROCESSING_FEE_PERCENT,
  STRIPE_PROCESSING_FEE_FIXED_CENTS,
} from '../config/platform';

export interface PaymentProcessingResult {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  platformFeeAmount: number;
  platformFeePercent: number;
  platformFeeCollected: boolean;
  donorCoveredFees: boolean;
  feesCoveredAmount: number;
  chargeAmount: number; // Actual amount charged (may include covered fees)
  baseAmount: number; // Original donation/payment amount
  error?: string;
}

export interface DonationPaymentParams {
  tenantId: string;
  amount: number; // Amount in cents (base donation amount)
  currency?: string;
  donorEmail?: string;
  donorName?: string;
  isRecurring?: boolean;
  interval?: 'month' | 'year';
  donorCoversFees?: boolean; // If true, calculate and add fees to charge amount
  metadata?: Record<string, string>;
}

export interface AdoptionFeeParams {
  tenantId: string;
  amount: number; // Amount in cents
  currency?: string;
  adopterEmail?: string;
  adopterName?: string;
  animalName?: string;
  animalId?: string;
  sessionId?: string;
  donorCoversFees?: boolean; // If true, calculate and add fees to charge amount
  metadata?: Record<string, string>;
}

/**
 * Get the platform's Stripe client
 * Used for Stripe Connect destination charges
 */
function getPlatformStripeClient(): Stripe | null {
  const secretKey = getPlatformStripeSecretKey();
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, {
    apiVersion: '2025-09-30.clover',
    typescript: true,
  });
}

/**
 * Get Stripe client for a tenant (fallback for non-Connect payments)
 */
async function getTenantStripeClient(tenant: Tenant): Promise<Stripe | null> {
  if (!tenant.stripeEnabled || !tenant.stripeSecretKeyEncrypted) {
    return null;
  }

  try {
    const secretKey = decrypt(tenant.stripeSecretKeyEncrypted);
    return new Stripe(secretKey, {
      apiVersion: '2025-09-30.clover',
      typescript: true,
    });
  } catch (error) {
    console.error('Failed to initialize tenant Stripe client:', error);
    return null;
  }
}

/**
 * Fetch tenant by ID
 */
async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  
  return tenant || null;
}

/**
 * Process a donation payment with platform fee logic
 * 
 * This function handles the payment flow with platform fees:
 * 1. If Stripe Connect is configured: Use platform key with destination charge
 * 2. If not configured: Use tenant's Stripe key, log calculated fee
 * 
 * Platform fees are ALWAYS calculated and reported for transparency,
 * even if Stripe Connect is not configured for actual collection.
 * 
 * Donor Covers Fees: If params.donorCoversFees is true, the charge amount
 * is grossed-up to include both Stripe processing fees and platform fees,
 * so the rescue receives 100% of the intended donation amount.
 */
export async function processDonationPayment(
  params: DonationPaymentParams
): Promise<PaymentProcessingResult> {
  const defaultResult = {
    donorCoveredFees: false,
    feesCoveredAmount: 0,
    chargeAmount: params.amount,
    baseAmount: params.amount,
  };

  try {
    const tenant = await getTenantById(params.tenantId);
    if (!tenant) {
      return { 
        success: false, 
        error: 'Organization not found',
        platformFeeAmount: 0,
        platformFeePercent: 0,
        platformFeeCollected: false,
        ...defaultResult,
      };
    }

    // Calculate base platform fee info
    const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier);
    
    // Handle "Donor Covers Fees" calculation
    let chargeAmount = params.amount;
    let feesCoveredAmount = 0;
    const donorCoversFees = params.donorCoversFees === true;
    
    if (donorCoversFees) {
      // Gross up the amount so rescue receives the full base amount
      const feeCalc = calculateDonorCoversFees(params.amount, tenant.subscriptionTier);
      chargeAmount = feeCalc.totalAmount;
      feesCoveredAmount = feeCalc.feesCovered;
    }
    
    // Calculate platform fee on the actual charge amount
    const platformFeeAmount = calculatePlatformFee(chargeAmount, tenant.subscriptionTier);

    // Check if payments should be blocked due to missing fee configuration
    if (shouldBlockPaymentWithoutFees(tenant)) {
      const errorMessage = isHostedPlatform()
        ? 'Payment processing requires Stripe Connect onboarding. Please complete your organization setup.'
        : 'Payment processing requires Stripe Connect configuration. Please set PLATFORM_STRIPE_SECRET_KEY and STRIPE_CONNECT_PLATFORM_ID environment variables.';
      console.error(`[Paw Pay] Payment blocked: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        platformFeeAmount,
        platformFeePercent,
        platformFeeCollected: false,
        donorCoveredFees,
        feesCoveredAmount,
        chargeAmount,
        baseAmount: params.amount,
      };
    }

    // Check if Stripe Connect is configured for fee collection
    const stripeConnectConfigured = isStripeConnectConfigured();
    const platformStripe = getPlatformStripeClient();
    
    // Determine which Stripe client to use
    let stripe: Stripe | null = null;
    let useStripeConnect = false;
    let tenantConnectedAccountId: string | undefined;

    if (stripeConnectConfigured && platformStripe && tenant.stripeConnectedAccountId) {
      // Full Stripe Connect flow: use platform key, destination to tenant
      stripe = platformStripe;
      useStripeConnect = true;
      tenantConnectedAccountId = tenant.stripeConnectedAccountId;
    } else {
      // Fallback: use tenant's own Stripe (fees logged but not collected)
      stripe = await getTenantStripeClient(tenant);
    }

    if (!stripe) {
      return { 
        success: false, 
        error: 'Stripe is not configured for this organization',
        platformFeeAmount,
        platformFeePercent,
        platformFeeCollected: false,
        donorCoveredFees,
        feesCoveredAmount,
        chargeAmount,
        baseAmount: params.amount,
      };
    }

    // Build PaymentIntent parameters
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: chargeAmount, // Use grossed-up amount if donor covers fees
      currency: params.currency || 'usd',
      description: `Donation to ${tenant.name}`,
      receipt_email: params.donorEmail,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        tenantId: params.tenantId,
        type: 'donation',
        donorName: params.donorName || '',
        baseAmount: params.amount.toString(),
        chargeAmount: chargeAmount.toString(),
        donorCoveredFees: donorCoversFees.toString(),
        feesCoveredAmount: feesCoveredAmount.toString(),
        platformFeePercent: platformFeePercent.toString(),
        platformFeeAmount: platformFeeAmount.toString(),
        platformFeeCollected: useStripeConnect.toString(),
        ...params.metadata,
      },
    };

    // Apply Stripe Connect parameters if configured
    if (useStripeConnect && tenantConnectedAccountId && platformFeeAmount > 0) {
      // Destination charge: funds go to tenant's connected account
      // minus the application fee which stays with platform
      paymentIntentParams.application_fee_amount = platformFeeAmount;
      paymentIntentParams.transfer_data = {
        destination: tenantConnectedAccountId,
      };
    } else if (!useStripeConnect && platformFeeAmount > 0) {
      // Log that fees are calculated but not collected
      console.log(`[Paw Pay] Donation to ${tenant.name}: $${(params.amount / 100).toFixed(2)}`);
      console.log(`[Paw Pay] Platform fee: $${(platformFeeAmount / 100).toFixed(2)} (${platformFeePercent}%) - NOT COLLECTED (Stripe Connect not configured)`);
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      platformFeeAmount,
      platformFeePercent,
      platformFeeCollected: useStripeConnect,
      donorCoveredFees,
      feesCoveredAmount,
      chargeAmount,
      baseAmount: params.amount,
    };
  } catch (error) {
    console.error('Error processing donation payment:', error);
    const platformFeePercent = getPlatformFeePercent();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment processing failed',
      platformFeeAmount: 0,
      platformFeePercent,
      platformFeeCollected: false,
      ...defaultResult,
    };
  }
}

/**
 * Process an adoption fee payment with platform fee logic
 * 
 * Similar to donation payments, but specifically for adoption fees.
 * Supports "adopter covers fees" option.
 */
export async function processAdoptionFeePayment(
  params: AdoptionFeeParams
): Promise<PaymentProcessingResult> {
  const defaultResult = {
    donorCoveredFees: false,
    feesCoveredAmount: 0,
    chargeAmount: params.amount,
    baseAmount: params.amount,
  };

  try {
    const tenant = await getTenantById(params.tenantId);
    if (!tenant) {
      return { 
        success: false, 
        error: 'Organization not found',
        platformFeeAmount: 0,
        platformFeePercent: 0,
        platformFeeCollected: false,
        ...defaultResult,
      };
    }

    // Calculate base platform fee info
    const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier);
    
    // Handle "Adopter Covers Fees" calculation
    let chargeAmount = params.amount;
    let feesCoveredAmount = 0;
    const donorCoversFees = params.donorCoversFees === true;
    
    if (donorCoversFees) {
      const feeCalc = calculateDonorCoversFees(params.amount, tenant.subscriptionTier);
      chargeAmount = feeCalc.totalAmount;
      feesCoveredAmount = feeCalc.feesCovered;
    }
    
    // Calculate platform fee on the actual charge amount
    const platformFeeAmount = calculatePlatformFee(chargeAmount, tenant.subscriptionTier);

    // Check if payments should be blocked due to missing fee configuration
    if (shouldBlockPaymentWithoutFees(tenant)) {
      const errorMessage = isHostedPlatform()
        ? 'Payment processing requires Stripe Connect onboarding. Please complete your organization setup.'
        : 'Payment processing requires Stripe Connect configuration. Please set PLATFORM_STRIPE_SECRET_KEY and STRIPE_CONNECT_PLATFORM_ID environment variables.';
      console.error(`[Paw Pay] Payment blocked: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        platformFeeAmount,
        platformFeePercent,
        platformFeeCollected: false,
        donorCoveredFees,
        feesCoveredAmount,
        chargeAmount,
        baseAmount: params.amount,
      };
    }

    // Check Stripe Connect configuration
    const stripeConnectConfigured = isStripeConnectConfigured();
    const platformStripe = getPlatformStripeClient();
    
    let stripe: Stripe | null = null;
    let useStripeConnect = false;
    let tenantConnectedAccountId: string | undefined;

    if (stripeConnectConfigured && platformStripe && tenant.stripeConnectedAccountId) {
      stripe = platformStripe;
      useStripeConnect = true;
      tenantConnectedAccountId = tenant.stripeConnectedAccountId;
    } else {
      stripe = await getTenantStripeClient(tenant);
    }

    if (!stripe) {
      return { 
        success: false, 
        error: 'Stripe is not configured for this organization',
        platformFeeAmount,
        platformFeePercent,
        platformFeeCollected: false,
        donorCoveredFees,
        feesCoveredAmount,
        chargeAmount,
        baseAmount: params.amount,
      };
    }

    const description = params.animalName 
      ? `Adoption fee for ${params.animalName} - ${tenant.name}`
      : `Adoption fee - ${tenant.name}`;

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: chargeAmount,
      currency: params.currency || 'usd',
      description,
      receipt_email: params.adopterEmail,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        tenantId: params.tenantId,
        type: 'adoption_fee',
        animalId: params.animalId || '',
        sessionId: params.sessionId || '',
        baseAmount: params.amount.toString(),
        chargeAmount: chargeAmount.toString(),
        donorCoveredFees: donorCoversFees.toString(),
        feesCoveredAmount: feesCoveredAmount.toString(),
        platformFeePercent: platformFeePercent.toString(),
        platformFeeAmount: platformFeeAmount.toString(),
        platformFeeCollected: useStripeConnect.toString(),
        ...params.metadata,
      },
    };

    if (useStripeConnect && tenantConnectedAccountId && platformFeeAmount > 0) {
      paymentIntentParams.application_fee_amount = platformFeeAmount;
      paymentIntentParams.transfer_data = {
        destination: tenantConnectedAccountId,
      };
    } else if (!useStripeConnect && platformFeeAmount > 0) {
      console.log(`[Paw Pay] Adoption fee for ${tenant.name}: $${(params.amount / 100).toFixed(2)}`);
      console.log(`[Paw Pay] Platform fee: $${(platformFeeAmount / 100).toFixed(2)} (${platformFeePercent}%) - NOT COLLECTED (Stripe Connect not configured)`);
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      platformFeeAmount,
      platformFeePercent,
      platformFeeCollected: useStripeConnect,
      donorCoveredFees,
      feesCoveredAmount,
      chargeAmount,
      baseAmount: params.amount,
    };
  } catch (error) {
    console.error('Error processing adoption fee payment:', error);
    const platformFeePercent = getPlatformFeePercent();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment processing failed',
      platformFeeAmount: 0,
      platformFeePercent,
      platformFeeCollected: false,
      ...defaultResult,
    };
  }
}

/**
 * Process a shop/merchandise payment with platform fee logic
 * Note: Shop payments typically don't offer "cover fees" option
 */
export async function processShopPayment(
  tenantId: string,
  amount: number,
  options: {
    currency?: string;
    customerEmail?: string;
    customerName?: string;
    orderId?: string;
    metadata?: Record<string, string>;
  } = {}
): Promise<PaymentProcessingResult> {
  const defaultResult = {
    donorCoveredFees: false,
    feesCoveredAmount: 0,
    chargeAmount: amount,
    baseAmount: amount,
  };

  try {
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return { 
        success: false, 
        error: 'Organization not found',
        platformFeeAmount: 0,
        platformFeePercent: 0,
        platformFeeCollected: false,
        ...defaultResult,
      };
    }

    // Calculate platform fee
    const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier);
    const platformFeeAmount = calculatePlatformFee(amount, tenant.subscriptionTier);

    // Check if payments should be blocked due to missing fee configuration
    if (shouldBlockPaymentWithoutFees(tenant)) {
      const errorMessage = isHostedPlatform()
        ? 'Payment processing requires Stripe Connect onboarding. Please complete your organization setup.'
        : 'Payment processing requires Stripe Connect configuration. Please set PLATFORM_STRIPE_SECRET_KEY and STRIPE_CONNECT_PLATFORM_ID environment variables.';
      console.error(`[Paw Pay] Payment blocked: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        platformFeeAmount,
        platformFeePercent,
        platformFeeCollected: false,
        ...defaultResult,
      };
    }

    const stripeConnectConfigured = isStripeConnectConfigured();
    const platformStripe = getPlatformStripeClient();
    
    let stripe: Stripe | null = null;
    let useStripeConnect = false;
    let tenantConnectedAccountId: string | undefined;

    // In properly configured mode, we should always use Stripe Connect
    if (stripeConnectConfigured && platformStripe && tenant.stripeConnectedAccountId) {
      stripe = platformStripe;
      useStripeConnect = true;
      tenantConnectedAccountId = tenant.stripeConnectedAccountId;
    } else if (stripeConnectConfigured && platformStripe) {
      // Platform Connect configured but tenant not onboarded - should have been blocked above
      stripe = platformStripe;
      useStripeConnect = false;
    } else {
      // Fallback to tenant's own Stripe key (only in SKIP_PLATFORM_FEES mode)
      stripe = await getTenantStripeClient(tenant);
    }

    if (!stripe) {
      return { 
        success: false, 
        error: 'Stripe is not configured for this organization',
        platformFeeAmount,
        platformFeePercent,
        platformFeeCollected: false,
        ...defaultResult,
      };
    }

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount,
      currency: options.currency || 'usd',
      description: `Shop order - ${tenant.name}`,
      receipt_email: options.customerEmail,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        tenantId,
        type: 'shop_order',
        orderId: options.orderId || '',
        baseAmount: amount.toString(),
        chargeAmount: amount.toString(),
        platformFeePercent: platformFeePercent.toString(),
        platformFeeAmount: platformFeeAmount.toString(),
        platformFeeCollected: useStripeConnect.toString(),
        ...options.metadata,
      },
    };

    if (useStripeConnect && tenantConnectedAccountId && platformFeeAmount > 0) {
      paymentIntentParams.application_fee_amount = platformFeeAmount;
      paymentIntentParams.transfer_data = {
        destination: tenantConnectedAccountId,
      };
    } else if (!useStripeConnect && platformFeeAmount > 0) {
      console.log(`[Paw Pay] Shop order for ${tenant.name}: $${(amount / 100).toFixed(2)}`);
      console.log(`[Paw Pay] Platform fee: $${(platformFeeAmount / 100).toFixed(2)} (${platformFeePercent}%) - NOT COLLECTED (Stripe Connect not configured)`);
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      platformFeeAmount,
      platformFeePercent,
      platformFeeCollected: useStripeConnect,
      ...defaultResult,
    };
  } catch (error) {
    console.error('Error processing shop payment:', error);
    const platformFeePercent = getPlatformFeePercent();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment processing failed',
      platformFeeAmount: 0,
      platformFeePercent,
      platformFeeCollected: false,
      ...defaultResult,
    };
  }
}

/**
 * Get platform fee information for display to users
 * This can be used to show transparency about fees
 */
export function getPlatformFeeInfo(subscriptionTier?: string): {
  percent: number;
  isHosted: boolean;
  isCollected: boolean;
  description: string;
  isPaidTier: boolean;
} {
  const config = getPlatformConfig();
  const percent = getPlatformFeePercent(subscriptionTier);
  const isCollected = isStripeConnectConfigured();
  const isPaidTier = subscriptionTier === 'professional';
  
  let description: string;
  
  if (!config.isHostedPlatform) {
    // Self-hosted mode
    if (isCollected) {
      description = `A ${percent}% platform fee supports the iRescue.life open-source project.`;
    } else {
      description = `A ${percent}% platform fee applies (Stripe Connect setup required for collection).`;
    }
  } else if (percent === 0) {
    // Paid tier on hosted platform: 0% fee
    description = 'No platform fee - included with your subscription. Upgrade to save more!';
  } else {
    // Free/trial tier on hosted platform
    description = `A ${percent}% platform fee applies. Upgrade to a paid plan to eliminate this fee and keep 100% of donations!`;
  }
  
  return {
    percent,
    isHosted: config.isHostedPlatform,
    isCollected,
    description,
    isPaidTier,
  };
}

/**
 * Calculate estimated fees for a payment amount
 * Useful for displaying fee breakdown before payment
 */
export function estimateFees(
  amountInCents: number,
  subscriptionTier?: string
): {
  subtotal: number;
  platformFee: number;
  platformFeePercent: number;
  total: number;
} {
  const platformFeePercent = getPlatformFeePercent(subscriptionTier);
  const platformFee = calculatePlatformFee(amountInCents, subscriptionTier);
  
  return {
    subtotal: amountInCents,
    platformFee,
    platformFeePercent,
    total: amountInCents, // Total stays same; platform fee is deducted from tenant's portion
  };
}
