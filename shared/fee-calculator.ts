/**
 * Fee Calculator Utility
 * 
 * Calculates the total charge amount when a donor chooses to "cover the fees."
 * This uses the reverse calculation formula to ensure the charity receives
 * exactly the intended donation amount.
 */

/** Stripe "Safe Bet" rate (standard rate, not nonprofit discount) */
const STRIPE_PERCENT = 0.029; // 2.9%
const STRIPE_FIXED = 0.30; // $0.30

/**
 * Calculate the total charge when a donor covers processing fees.
 * 
 * Uses the reverse calculation formula:
 * Total = (Donation + FixedFee) / (1 - TotalPercentage)
 * 
 * @param donationAmount - The amount the charity should receive (in dollars)
 * @param platformFeePercent - Platform fee as a decimal (e.g., 0.02 for 2%, 0 for paid tenants)
 * @returns The total amount to charge the donor (in dollars), rounded up to nearest penny
 * 
 * @example
 * // Free tenant (2% platform fee) - donor wants charity to get $50
 * calculateTotalCharge(50, 0.02) // Returns 52.04
 * 
 * @example
 * // Paid tenant (0% platform fee) - donor wants charity to get $100
 * calculateTotalCharge(100, 0) // Returns 103.40
 */
export function calculateTotalCharge(
  donationAmount: number,
  platformFeePercent: number = 0
): number {
  const totalPercentage = STRIPE_PERCENT + platformFeePercent;
  
  // Safety: Prevent division by zero or invalid percentages
  if (totalPercentage >= 1) {
    throw new Error('Total fee percentage cannot be 100% or more');
  }
  
  // Formula: Total = (Donation + FixedFee) / (1 - TotalPercentage)
  const totalCharge = (donationAmount + STRIPE_FIXED) / (1 - totalPercentage);
  
  // Round UP to the nearest penny to ensure the charity is never short
  return Math.ceil(totalCharge * 100) / 100;
}

/**
 * Calculate the fee breakdown for transparency/display purposes.
 * 
 * @param donationAmount - The amount the charity should receive (in dollars)
 * @param platformFeePercent - Platform fee as a decimal (e.g., 0.02 for 2%)
 * @returns Object with fee breakdown
 */
export function calculateFeeBreakdown(
  donationAmount: number,
  platformFeePercent: number = 0
): {
  donationAmount: number;
  totalCharge: number;
  feesCovered: number;
  stripeFee: number;
  platformFee: number;
} {
  const totalCharge = calculateTotalCharge(donationAmount, platformFeePercent);
  const feesCovered = totalCharge - donationAmount;
  
  // Calculate individual fee components from the total charge
  const stripeFee = (totalCharge * STRIPE_PERCENT) + STRIPE_FIXED;
  const platformFee = totalCharge * platformFeePercent;
  
  return {
    donationAmount,
    totalCharge,
    feesCovered: Math.round(feesCovered * 100) / 100,
    stripeFee: Math.round(stripeFee * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
  };
}

/**
 * Calculate total charge in cents (useful for Stripe API calls)
 * 
 * @param donationAmountCents - The amount the charity should receive (in cents)
 * @param platformFeePercent - Platform fee as a decimal (e.g., 0.02 for 2%)
 * @returns The total amount to charge the donor (in cents)
 */
export function calculateTotalChargeCents(
  donationAmountCents: number,
  platformFeePercent: number = 0
): number {
  const donationDollars = donationAmountCents / 100;
  const totalDollars = calculateTotalCharge(donationDollars, platformFeePercent);
  return Math.ceil(totalDollars * 100);
}
