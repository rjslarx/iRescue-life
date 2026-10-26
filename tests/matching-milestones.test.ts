import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocateMilestoneMatch, matchingTierProgress, matchingTiersSchema, type MatchingTier } from "../shared/matching-milestones";
import { calculateMatch, type MatchPoolSnapshot } from "../shared/expense-campaign-match";

const tiers: MatchingTier[] = [200_000, 300_000, 50_000].map((pledgedCapCents, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  internalSponsorName: `Sponsor ${i + 1}`,
  internalSponsorEmail: "",
  publicSponsorName: `Angel ${i + 1}`,
  showSponsorPublicly: true,
  pledgedCapCents,
}));
const pool: MatchPoolSnapshot = {
  status: "active", pledgedCapCents: 550_000, totalMatchedCents: 0,
  ratioNumerator: 1, ratioDenominator: 1, perGiftCapCents: null, startsAt: null, endsAt: null,
};

describe("sequential matching milestones", () => {
  it("matches the first $2k, next $3k, and final $500 in order", () => {
    let total = 0;
    for (const [gift, expected] of [[200_000, 0], [300_000, 1], [50_000, 2]] as const) {
      const match = calculateMatch(gift, { ...pool, totalMatchedCents: total });
      const allocations = allocateMilestoneMatch(tiers, total, match.matchedCents);
      assert.deepEqual(allocations, [{ tierId: tiers[expected].id, sponsorLabel: `Angel ${expected + 1}`, matchedCents: gift }]);
      total += match.matchedCents;
    }
    assert.equal(total, 550_000);
    assert.equal(calculateMatch(100, { ...pool, totalMatchedCents: total }).matchedCents, 0);
  });
  it("splits one donation over a boundary without double matching", () => {
    assert.deepEqual(allocateMilestoneMatch(tiers, 195_000, 10_000).map((a) => a.matchedCents), [5_000, 5_000]);
  });
  it("splits over multiple boundaries and caps an oversized gift", () => {
    const match = calculateMatch(1_000_000, pool);
    assert.equal(match.matchedCents, 550_000);
    assert.deepEqual(allocateMilestoneMatch(tiers, 0, match.matchedCents).map((a) => a.matchedCents), [200_000, 300_000, 50_000]);
  });
  it("keeps previous sponsors exhausted and computes amounts owed and ranges", () => {
    const progress = matchingTierProgress(tiers, 205_000);
    assert.deepEqual(progress.map((t) => t.totalMatchedCents), [200_000, 5_000, 0]);
    assert.deepEqual(progress.map((t) => t.remainingCents), [0, 295_000, 50_000]);
    assert.deepEqual(progress.map((t) => [t.communityStartCents, t.communityEndCents]), [[0, 200_000], [200_000, 500_000], [500_000, 550_000]]);
  });
  it("respects closed windows and disabled pools", () => {
    for (const overrides of [
      { status: "ended" as const }, { status: "exhausted" as const },
      { startsAt: new Date("2030-01-01") }, { endsAt: new Date("2020-01-01") },
    ]) {
      const match = calculateMatch(10_000, { ...pool, ...overrides }, new Date("2026-10-26"));
      assert.deepEqual(allocateMilestoneMatch(tiers, 0, match.matchedCents), []);
    }
  });
  it("does not reveal private sponsor identity in saved allocations", () => {
    const [allocation] = allocateMilestoneMatch([{ ...tiers[0], showSponsorPublicly: false }], 0, 100);
    assert.equal(allocation.sponsorLabel, "an anonymous donor");
    assert.equal("internalSponsorEmail" in allocation, false);
    assert.equal("internalSponsorName" in allocation, false);
  });
  it("validates commitments and rejects duplicate IDs and fractional cents", () => {
    assert.equal(matchingTiersSchema.safeParse(tiers).success, true);
    for (const invalid of [[], [tiers[0], tiers[0]], [{ ...tiers[0], pledgedCapCents: 0 }],
      [{ ...tiers[0], pledgedCapCents: 100.5 }], [{ ...tiers[0], internalSponsorName: " " }],
      [{ ...tiers[0], internalSponsorEmail: "invalid" }], Array(21).fill(tiers[0])]) {
      assert.equal(matchingTiersSchema.safeParse(invalid).success, false);
    }
  });
  it("preserves cents exactly over a stream of gifts", () => {
    let total = 0;
    const perSponsor = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const gift = 137 + (i * 7919) % 3000;
      const match = calculateMatch(gift, { ...pool, totalMatchedCents: total });
      const allocations = allocateMilestoneMatch(tiers, total, match.matchedCents);
      assert.equal(allocations.reduce((sum, a) => sum + a.matchedCents, 0), match.matchedCents);
      for (const a of allocations) perSponsor.set(a.tierId, (perSponsor.get(a.tierId) ?? 0) + a.matchedCents);
      total += match.matchedCents;
    }
    assert.equal(total, 550_000);
    for (const tier of tiers) assert.equal(perSponsor.get(tier.id), tier.pledgedCapCents);
  });
});
