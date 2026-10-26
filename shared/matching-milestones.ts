import { z } from "zod";

export const matchingTierSchema = z.object({
  id: z.string().uuid(),
  internalSponsorName: z.string().trim().min(1).max(200),
  internalSponsorEmail: z.union([z.string().trim().email().max(200), z.literal("")]),
  publicSponsorName: z.string().trim().max(200).nullable().optional(),
  showSponsorPublicly: z.boolean().default(true),
  pledgedCapCents: z.number().int().min(100).max(2_000_000_000),
});

export const matchingTiersSchema = z.array(matchingTierSchema).min(1).max(20)
  .refine((tiers) => new Set(tiers.map((tier) => tier.id)).size === tiers.length, "Milestone IDs must be unique")
  .refine((tiers) => tiers.reduce((sum, tier) => sum + tier.pledgedCapCents, 0) <= 2_000_000_000,
    "Combined matching pledge is too large");

export type MatchingTier = z.infer<typeof matchingTierSchema>;
export interface MatchAllocation {
  tierId: string;
  sponsorLabel: string;
  matchedCents: number;
}

export function tierSponsorLabel(tier: MatchingTier): string {
  return tier.showSponsorPublicly && tier.publicSponsorName?.trim()
    ? tier.publicSponsorName.trim() : "an anonymous donor";
}

// Milestones are dollar-for-dollar and consume sponsor commitments in order.
// Deriving balances from the locked aggregate prevents counters from drifting.
export function matchingTierProgress(tiers: MatchingTier[], totalMatchedCents: number) {
  let consumed = Math.max(0, totalMatchedCents);
  let communityStartCents = 0;
  return tiers.map((tier) => {
    const totalMatchedCents = Math.min(tier.pledgedCapCents, consumed);
    consumed -= totalMatchedCents;
    const progress = {
      ...tier,
      sponsorLabel: tierSponsorLabel(tier),
      totalMatchedCents,
      remainingCents: tier.pledgedCapCents - totalMatchedCents,
      communityStartCents,
      communityEndCents: communityStartCents + tier.pledgedCapCents,
    };
    communityStartCents += tier.pledgedCapCents;
    return progress;
  });
}

export function allocateMilestoneMatch(
  tiers: MatchingTier[],
  totalMatchedCents: number,
  newMatchedCents: number,
): MatchAllocation[] {
  let remaining = Math.max(0, Math.floor(newMatchedCents));
  const allocations: MatchAllocation[] = [];
  for (const tier of matchingTierProgress(tiers, totalMatchedCents)) {
    const matchedCents = Math.min(tier.remainingCents, remaining);
    if (matchedCents > 0) {
      allocations.push({ tierId: tier.id, sponsorLabel: tier.sponsorLabel, matchedCents });
      remaining -= matchedCents;
    }
  }
  return allocations;
}
