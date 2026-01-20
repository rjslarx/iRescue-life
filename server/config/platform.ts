/**
 * Platform Configuration
 * 
 * This file contains configuration for the iRescue.life platform's
 * "Free vs. Hosted" business model using a feature flag approach.
 * 
 * Self-Hosted (Free): Users download and run the app themselves.
 *   - IS_HOSTED_PLATFORM = false (default)
 *   - A mandatory platform fee (1.5% default) is applied to all payments
 *   - This helps fund continued development of the open-source project
 * 
 * Managed Hosting (Paid): Users sign up for our cloud-hosted version.
 *   - IS_HOSTED_PLATFORM = true
 *   - Platform fees are reduced or eliminated based on subscription tier
 * 
 * STRIPE CONNECT ARCHITECTURE:
 * For platform fees to work, tenants must be onboarded as Stripe Connected Accounts.
 * The flow works as follows:
 * 1. Platform has a master Stripe Connect account (STRIPE_CONNECT_PLATFORM_ID)
 * 2. Each tenant connects their Stripe account to the platform
 * 3. Payments are processed through the platform's Stripe key
 * 4. Funds are transferred to the tenant's connected account minus the application fee
 */

export interface PlatformConfig {
  isHostedPlatform: boolean;
  stripeConnectPlatformAccountId: string;
  defaultPlatformFeePercent: number;
  platformFeesByTier: Record<string, number>;
}

/**
 * Check if the app is running on the hosted platform
 * Self-hosted versions default to false
 */
export function isHostedPlatform(): boolean {
  return process.env.IS_HOSTED_PLATFORM === 'true';
}

/**
 * Get the Stripe Connect platform account ID
 * This is the iRescue.life platform's Stripe Connect account
 * that receives platform fees from all installations
 * 
 * For self-hosted installations, this MUST be configured for
 * platform fees to work. The default placeholder ensures the
 * code references the platform account even if not configured.
 */
export function getStripeConnectPlatformAccountId(): string {
  return process.env.STRIPE_CONNECT_PLATFORM_ID || 'acct_irescue_platform_default';
}

/**
 * Check if Stripe test mode is enabled
 * When STRIPE_TEST_MODE=true, use testing keys for development/testing
 */
export function isStripeTestMode(): boolean {
  return process.env.STRIPE_TEST_MODE === 'true';
}

/**
 * Get the platform's Stripe secret key
 * This is used for Stripe Connect payment processing
 * Required for the platform fee routing to work properly
 * 
 * When STRIPE_TEST_MODE=true, uses TESTING_STRIPE_SECRET_KEY if available
 */
export function getPlatformStripeSecretKey(): string | undefined {
  if (isStripeTestMode()) {
    return process.env.TESTING_STRIPE_SECRET_KEY || process.env.PLATFORM_STRIPE_SECRET_KEY;
  }
  return process.env.PLATFORM_STRIPE_SECRET_KEY;
}

/**
 * Default platform fee percentage for free/trial tenants and self-hosted installations
 * This fee helps fund the open-source project's development
 * 
 * Business Model: "SaaS + 0%"
 * - Free/Trial tenants: Pay platform fee (default 5%)
 * - Paid tenants: 0% platform fee (included in subscription)
 * - Self-hosted: Pay platform fee (same as free tenants)
 * 
 * Can be overridden via PLATFORM_FEE_PERCENT environment variable
 */
export const DEFAULT_PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '5');

/**
 * Stripe's processing fee for nonprofits
 * Used for "Donor Covers Fees" calculations
 */
export const STRIPE_PROCESSING_FEE_PERCENT = 2.2;
export const STRIPE_PROCESSING_FEE_FIXED_CENTS = 30; // $0.30

/**
 * Platform fee percentages by subscription tier (for hosted platform)
 * 
 * Two-tier model:
 * - Free: 5% platform fee (default, configurable via PLATFORM_FEE_PERCENT)
 * - Professional: 0% platform fee (included in subscription)
 * 
 * KEY INSIGHT: Paid tier pays 0% platform fee
 * This makes upgrading a "no-brainer" for rescues:
 * - If a rescue raises $5,000/month on Free (5% fee): They lose $250
 * - If they upgrade to Professional ($50/mo, 0% fee): They save $200/month
 * 
 * Professional tier includes:
 * - 0% platform fees on all transactions
 * - Optional custom domain integration
 * - Optional Google Workspace integration
 */
export const PLATFORM_FEES_BY_TIER: Record<string, number> = {
  free: DEFAULT_PLATFORM_FEE_PERCENT,   // Free plan: configurable % (default 5%)
  professional: 0,  // Professional plan: 0% platform fee (included in subscription)
};

/**
 * Get the complete platform configuration
 */
export function getPlatformConfig(): PlatformConfig {
  return {
    isHostedPlatform: isHostedPlatform(),
    stripeConnectPlatformAccountId: getStripeConnectPlatformAccountId(),
    defaultPlatformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
    platformFeesByTier: PLATFORM_FEES_BY_TIER,
  };
}

/**
 * Get the platform fee percentage for a given subscription tier
 * 
 * Business Logic (in order of precedence):
 * 1. Tenant-specific override (platformFeePercent field) - always takes priority if set
 *    This allows for special cases like conflict-of-interest avoidance or partnerships
 * 2. Self-hosted: Always apply the mandatory platform fee (supports open-source project)
 * 3. Hosted platform + Free/Trial: Apply platform fee (they're not paying subscription)
 * 4. Hosted platform + Paid tiers: 0% platform fee (included in subscription)
 * 5. Hosted platform + Unknown tier: Defaults to platform fee (conservative approach)
 * 
 * @param subscriptionTier - The tenant's subscription tier
 * @param tenantPlatformFeePercent - Optional tenant-specific fee override (null means use default)
 * @returns The platform fee percentage to apply
 */
export function getPlatformFeePercent(
  subscriptionTier?: string,
  tenantPlatformFeePercent?: number | null
): number {
  // Check for tenant-specific override FIRST (highest priority)
  // A value of 0 is valid (no platform fee), so we check for null/undefined explicitly
  if (tenantPlatformFeePercent !== null && tenantPlatformFeePercent !== undefined) {
    return tenantPlatformFeePercent;
  }
  
  const config = getPlatformConfig();
  
  if (!config.isHostedPlatform) {
    // Self-hosted: ALWAYS apply the mandatory default platform fee
    // This ensures self-hosted versions contribute to the project
    // regardless of any other configuration
    return config.defaultPlatformFeePercent;
  }
  
  // Hosted platform: Look up fee by subscription tier
  // Check if it's a known tier
  if (subscriptionTier && subscriptionTier in config.platformFeesByTier) {
    return config.platformFeesByTier[subscriptionTier];
  }
  
  // For hosted platform with unknown/missing tier:
  // Default to platform fee (conservative - they need to upgrade or set tier)
  // This ensures we collect fees from free/trial users even if tier is null
  return config.defaultPlatformFeePercent;
}

/**
 * Check if a subscription tier is a paid tier (0% platform fee)
 * Only 'professional' tier is the paid tier in our two-tier model
 */
export function isPaidSubscriptionTier(subscriptionTier?: string): boolean {
  return subscriptionTier === 'professional';
}

/**
 * Calculate the platform fee amount for a given payment
 * 
 * @param amountInCents - The payment amount in cents
 * @param subscriptionTier - The tenant's subscription tier
 * @param tenantPlatformFeePercent - Optional tenant-specific fee override (null means use default)
 * @returns The platform fee in cents (rounded)
 */
export function calculatePlatformFee(
  amountInCents: number,
  subscriptionTier?: string,
  tenantPlatformFeePercent?: number | null
): number {
  const feePercent = getPlatformFeePercent(subscriptionTier, tenantPlatformFeePercent);
  return Math.round(amountInCents * (feePercent / 100));
}

/**
 * Check if Stripe Connect is properly configured for platform fees
 * Returns true only if the platform Stripe key and account ID are configured
 * 
 * For self-hosted installations without proper Stripe Connect setup,
 * this will return false, but fees will still be calculated and logged
 * for transparency. Full fee collection requires Stripe Connect onboarding.
 */
export function isStripeConnectConfigured(): boolean {
  const platformKey = getPlatformStripeSecretKey();
  const platformAccountId = process.env.STRIPE_CONNECT_PLATFORM_ID;
  return !!platformKey && !!platformAccountId;
}

/**
 * Check if platform fees should be skipped (development/testing only)
 * 
 * By default, platform fees are MANDATORY in self-hosted mode.
 * Set SKIP_PLATFORM_FEES=true ONLY for development/testing purposes.
 * 
 * This flag allows payments to proceed without fee collection when
 * Stripe Connect is not configured. In production self-hosted deployments,
 * this should NEVER be set to true.
 */
export function shouldSkipPlatformFees(): boolean {
  return process.env.SKIP_PLATFORM_FEES === 'true';
}

/**
 * Check if payment should be blocked due to missing platform fee configuration
 * 
 * Self-hosted installations:
 * - Default: Block payments if Stripe Connect is not configured OR tenant lacks connected account
 * - With SKIP_PLATFORM_FEES=true: Allow payments without fee collection (dev only)
 * 
 * Hosted platform:
 * - Block payments for any tenant without stripeConnectedAccountId
 * - This ensures platform fees are always collected per tier
 * 
 * The key principle: In BOTH modes, if platform fees apply (no SKIP_PLATFORM_FEES),
 * the tenant MUST have a stripeConnectedAccountId to process payments.
 * This prevents the fallback to tenant's own Stripe key which would bypass fees.
 */
export function shouldBlockPaymentWithoutFees(tenant?: { stripeConnectedAccountId?: string | null }): boolean {
  // Development/testing bypass
  if (shouldSkipPlatformFees()) {
    return false; // Allow payments without fees (dev mode only)
  }
  
  // Platform Stripe Connect must be configured
  const connectConfigured = isStripeConnectConfigured();
  if (!connectConfigured) {
    return true; // Block: platform cannot collect fees
  }
  
  // Tenant must have connected account for fee routing
  // This applies in BOTH self-hosted and hosted modes
  if (!tenant?.stripeConnectedAccountId) {
    return true; // Block: tenant not onboarded to Stripe Connect
  }
  
  return false; // All checks passed, allow payment
}

/**
 * Calculate the "Donor Covers Fees" amount
 * 
 * When a donor wants to cover processing fees, we need to calculate the
 * gross amount they should pay so the rescue receives exactly the intended amount.
 * 
 * Math: We need to "gross up" the amount to account for:
 * 1. Stripe processing fee (2.2% + $0.30 for nonprofits)
 * 2. Platform fee (if applicable based on subscription tier)
 * 
 * Formula: grossAmount = (netAmount + fixedFee) / (1 - percentageFees)
 * 
 * @param baseAmountCents - The intended donation amount in cents
 * @param subscriptionTier - The tenant's subscription tier (affects platform fee)
 * @param tenantPlatformFeePercent - Optional tenant-specific fee override (null means use default)
 * @returns Object with breakdown of fees and total charge amount
 */
export function calculateDonorCoversFees(
  baseAmountCents: number,
  subscriptionTier?: string,
  tenantPlatformFeePercent?: number | null
): {
  baseAmount: number;
  stripeFee: number;
  platformFee: number;
  totalAmount: number;
  feesCovered: number;
} {
  const platformFeePercent = getPlatformFeePercent(subscriptionTier, tenantPlatformFeePercent);
  const totalPercentFee = (STRIPE_PROCESSING_FEE_PERCENT + platformFeePercent) / 100;
  
  // Gross-up formula: total = (base + fixed) / (1 - percentFees)
  const grossAmount = Math.ceil(
    (baseAmountCents + STRIPE_PROCESSING_FEE_FIXED_CENTS) / (1 - totalPercentFee)
  );
  
  // Calculate individual fee components from the gross amount
  const stripeFee = Math.round(grossAmount * (STRIPE_PROCESSING_FEE_PERCENT / 100)) + STRIPE_PROCESSING_FEE_FIXED_CENTS;
  const platformFee = Math.round(grossAmount * (platformFeePercent / 100));
  
  return {
    baseAmount: baseAmountCents,
    stripeFee,
    platformFee,
    totalAmount: grossAmount,
    feesCovered: grossAmount - baseAmountCents,
  };
}

/**
 * Get a human-readable fee breakdown for display
 * 
 * @param baseAmountCents - The intended donation amount in cents
 * @param subscriptionTier - The tenant's subscription tier
 * @param tenantPlatformFeePercent - Optional tenant-specific fee override (null means use default)
 * @returns Formatted fee information for UI display
 */
export function getFeeBreakdownDisplay(
  baseAmountCents: number,
  subscriptionTier?: string,
  tenantPlatformFeePercent?: number | null
): {
  baseAmountFormatted: string;
  feesFormatted: string;
  totalFormatted: string;
  platformFeePercent: number;
  hasPlatformFee: boolean;
} {
  const fees = calculateDonorCoversFees(baseAmountCents, subscriptionTier, tenantPlatformFeePercent);
  const platformFeePercent = getPlatformFeePercent(subscriptionTier, tenantPlatformFeePercent);
  
  return {
    baseAmountFormatted: `$${(fees.baseAmount / 100).toFixed(2)}`,
    feesFormatted: `$${(fees.feesCovered / 100).toFixed(2)}`,
    totalFormatted: `$${(fees.totalAmount / 100).toFixed(2)}`,
    platformFeePercent,
    hasPlatformFee: platformFeePercent > 0,
  };
}

/**
 * Validate platform configuration at startup
 * Logs warnings for missing configuration but does not block startup
 */
export function validatePlatformConfig(): void {
  const config = getPlatformConfig();
  
  console.log('🔧 Platform Configuration:');
  console.log(`   Mode: ${config.isHostedPlatform ? 'Hosted Platform' : 'Self-Hosted'}`);
  console.log(`   Default Platform Fee: ${config.defaultPlatformFeePercent}%`);
  
  if (!config.isHostedPlatform) {
    console.log('   ℹ️  Self-hosted mode: Platform fees support open-source development');
    
    if (!process.env.STRIPE_CONNECT_PLATFORM_ID) {
      console.warn('   ⚠️  STRIPE_CONNECT_PLATFORM_ID not configured');
      console.warn('   ⚠️  Platform fees will be calculated but not collected until Stripe Connect is set up');
    }
    
    if (!process.env.PLATFORM_STRIPE_SECRET_KEY) {
      console.warn('   ⚠️  PLATFORM_STRIPE_SECRET_KEY not configured');
      console.warn('   ⚠️  Stripe Connect fee collection requires the platform Stripe key');
    }
  }
}
