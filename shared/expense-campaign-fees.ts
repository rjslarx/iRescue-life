import { z } from "zod";

// Estimated US card pricing, not an assertion about an account's negotiated rate.
export function expenseCampaignCharge(amountCents: number, coverFees: boolean) {
  const totalCents = coverFees ? Math.ceil((amountCents + 30) * 1000 / 971) : amountCents;
  return { totalCents, feeContributionCents: totalCents - amountCents };
}

export const expenseCampaignCheckoutSchema = z.object({
  amountCents: z.number().int().min(100).max(99_999_999),
  coverFees: z.boolean().default(false),
}).refine(({ amountCents, coverFees }) =>
  expenseCampaignCharge(amountCents, coverFees).totalCents <= 99_999_999,
{ message: "Please lower the donation amount; the total exceeds the payment limit." });
