/**
 * ACH (US bank account direct debit) eligibility rules.
 *
 * Stripe ACH costs 0.8% capped at $5 vs ~2.9% + 30¢ on cards, so it's a big
 * win on large gifts and recurring monthly subs. The trade-off is a 4–5 business
 * day settlement window that adds friction on small donations and breaks
 * "instant confirmation" UX (votes, ticket sales).
 *
 * This module is the single source of truth for which surfaces and amounts
 * should offer ACH. The same helper is consumed by:
 *   - the backend Stripe Checkout session creation (so we only request
 *     `us_bank_account` from Stripe when truly eligible)
 *   - frontend "save fees by paying via bank transfer" nudge copy (so the
 *     hint shown to the donor matches what Stripe will actually offer)
 *
 * Diverging logic between the two would either show donors an option that
 * errors out at Stripe, or hide an option Stripe would have accepted.
 */

export const ACH_THRESHOLDS = {
  /** Minimum amount (in cents) for ACH on one-time gifts. $250.00 */
  ONE_TIME_CENTS: 25_000,
  /** Minimum monthly amount (in cents) for ACH on recurring subs. $50.00 */
  MONTHLY_CENTS: 5_000,
} as const;

/**
 * The "surface" a donor is checking out from. Different surfaces have
 * different ACH suitability — votes need to be instant, fundraiser tickets
 * have pickup logistics that benefit from instant confirmation, etc.
 */
export type AchSurface =
  | 'donation'         // public donation form
  | 'vip'              // VIP Club monthly tier subscription
  | 'p2p'              // peer-to-peer campaign donation/pledge
  | 'emergency_fund'   // legacy emergency fund campaign
  | 'ticket'           // fundraiser/event ticket (instant conf preferred)
  | 'voting'           // voting contest (instant vote preferred)
  | 'shop'             // shop / supply registry order (instant ship preferred)
  | 'adoption';        // adoption fee (handled via Payment Elements separately)

const ELIGIBLE_SURFACES = new Set<AchSurface>([
  'donation',
  'vip',
  'p2p',
  'emergency_fund',
]);

export interface AchEligibilityInput {
  /** Total charge amount in cents. */
  amountCents: number;
  /** True for monthly subscriptions, false for one-time payments. */
  isRecurring: boolean;
  /** Where the checkout is being initiated from. */
  surface: AchSurface;
}

/**
 * Should ACH be offered as a payment method for this checkout?
 *
 * Returns true only when both the surface is eligible AND the amount meets
 * the relevant threshold (recurring vs one-time).
 */
export function isAchEligible({
  amountCents,
  isRecurring,
  surface,
}: AchEligibilityInput): boolean {
  if (!ELIGIBLE_SURFACES.has(surface)) return false;
  if (!Number.isFinite(amountCents) || amountCents <= 0) return false;
  if (isRecurring) return amountCents >= ACH_THRESHOLDS.MONTHLY_CENTS;
  return amountCents >= ACH_THRESHOLDS.ONE_TIME_CENTS;
}

/**
 * The opt-in nudge copy shown to donors at qualifying amounts. Tone is
 * gentle / informational — never coercive — because card is still a fine
 * choice and we don't want to make the donor feel guilty for using one.
 */
export function achNudgeCopy(surface: AchSurface, isRecurring: boolean = false): string {
  if (isRecurring) {
    return 'Pay by bank transfer instead and save us about 3% in card fees — more of every monthly gift goes directly to the animals.';
  }
  if (surface === 'p2p' || surface === 'emergency_fund') {
    return 'Pay by bank transfer to save us about 3% in card fees — more of your gift reaches this campaign.';
  }
  return 'Pay by bank transfer to save us about 3% in card fees — more of your gift reaches the animals.';
}

/**
 * Friendly threshold label for use in nudge UI (e.g. "$250+ donations").
 */
export function achThresholdLabel(isRecurring: boolean): string {
  const cents = isRecurring ? ACH_THRESHOLDS.MONTHLY_CENTS : ACH_THRESHOLDS.ONE_TIME_CENTS;
  const dollars = Math.round(cents / 100);
  return isRecurring ? `$${dollars}+/month` : `$${dollars}+`;
}
