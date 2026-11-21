import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { customerCoversFundraisingFees, type FundraisingFeePolicy } from "@shared/fundraising-fee-policy";
import { calculateDonorCoversFees, calculatePlatformFee, estimateStripeProcessingFee, getPlatformFeePercent } from "../config/platform";

/** Fetch full settings: req.tenant is not the authoritative source for fee overrides. */
export async function fundraisingFeeQuote(
  tenantId: string, baseAmountCents: number, policy: FundraisingFeePolicy, optedIn: boolean,
) {
  if (!Number.isSafeInteger(baseAmountCents) || baseAmountCents < 1 || baseAmountCents > 99_999_999) {
    throw new Error("Enter a positive amount below the payment limit.");
  }
  const [tenant] = await db.select({
    tier: tenants.subscriptionTier,
    platformFeePercent: tenants.platformFeePercent,
  }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Rescue not found");
  const rate = getPlatformFeePercent(tenant.tier, tenant.platformFeePercent);
  if (!Number.isFinite(rate) || rate < 0 || rate >= 90) throw new Error("Invalid platform fee configuration");
  const covered = customerCoversFundraisingFees(policy, optedIn);
  const totalCents = covered
    ? calculateDonorCoversFees(baseAmountCents, tenant.tier, tenant.platformFeePercent).totalAmount
    : baseAmountCents;
  if (totalCents > 99_999_999) throw new Error("Please lower the amount; the total exceeds the payment limit.");
  const platformFeeCents = calculatePlatformFee(totalCents, tenant.tier, tenant.platformFeePercent);
  const estimatedProcessingCents = estimateStripeProcessingFee(totalCents, "card");
  return {
    policy, covered, baseAmountCents, totalCents,
    feeContributionCents: totalCents - baseAmountCents,
    platformFeeCents, estimatedProcessingCents,
    estimatedRescueProceedsCents: totalCents - platformFeeCents - estimatedProcessingCents,
  };
}
