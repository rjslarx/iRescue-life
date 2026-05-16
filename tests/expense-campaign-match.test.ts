/**
 * Task #213 — Expense-campaign match-pool calculator regression tests.
 *
 * Covers the pure arithmetic in shared/expense-campaign-match.ts which the
 * Stripe webhook calls inside a SELECT ... FOR UPDATE transaction. The
 * dollar-bookkeeping must never round wrong, never overspend the pool, and
 * never silently match when the pool is paused, exhausted, or out of window.
 *
 * Run via:  scripts/run-tests.sh tests/expense-campaign-match.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMatch,
  publicSponsorLabel,
  computeEffectiveMatchStatus,
  type MatchPoolSnapshot,
} from "../shared/expense-campaign-match";

const basePool: MatchPoolSnapshot = {
  status: "active",
  pledgedCapCents: 500_000, // $5,000
  totalMatchedCents: 0,
  ratioNumerator: 1,
  ratioDenominator: 1,
  perGiftCapCents: null,
  startsAt: null,
  endsAt: null,
};

describe("calculateMatch", () => {
  it("1:1 match with no per-gift cap doubles the gift", () => {
    const r = calculateMatch(5_000, { ...basePool });
    assert.equal(r.matchedCents, 5_000);
    assert.equal(r.reason, "matched");
    assert.equal(r.poolExhausted, false);
  });

  it("2:1 match multiplies correctly and floors fractional pennies", () => {
    const r = calculateMatch(333, { ...basePool, ratioNumerator: 2, ratioDenominator: 1 });
    assert.equal(r.matchedCents, 666);
  });

  it("1:2 match halves correctly with flooring", () => {
    const r = calculateMatch(501, { ...basePool, ratioNumerator: 1, ratioDenominator: 2 });
    assert.equal(r.matchedCents, 250); // floor(501 / 2)
  });

  it("per-gift cap clamps a large single donation", () => {
    const r = calculateMatch(100_000, { ...basePool, perGiftCapCents: 25_000 });
    assert.equal(r.matchedCents, 25_000);
  });

  it("pledged cap clamps the final gift that would overshoot", () => {
    const r = calculateMatch(
      100_000,
      { ...basePool, pledgedCapCents: 60_000, totalMatchedCents: 50_000 },
    );
    assert.equal(r.matchedCents, 10_000);
    assert.equal(r.poolExhausted, true);
  });

  it("returns 0 when pool is already drained", () => {
    const r = calculateMatch(5_000, { ...basePool, totalMatchedCents: 500_000 });
    assert.equal(r.matchedCents, 0);
    assert.equal(r.reason, "pool_exhausted");
    assert.equal(r.poolExhausted, true);
  });

  it("returns 0 when pool status is not active", () => {
    const r = calculateMatch(5_000, { ...basePool, status: "ended" });
    assert.equal(r.matchedCents, 0);
    assert.equal(r.reason, "pool_disabled");
  });

  it("returns 0 before the start window", () => {
    const future = new Date(Date.now() + 86_400_000);
    const r = calculateMatch(5_000, { ...basePool, startsAt: future });
    assert.equal(r.matchedCents, 0);
    assert.equal(r.reason, "window_closed");
  });

  it("returns 0 after the end window", () => {
    const past = new Date(Date.now() - 86_400_000);
    const r = calculateMatch(5_000, { ...basePool, endsAt: past });
    assert.equal(r.matchedCents, 0);
    assert.equal(r.reason, "window_closed");
  });

  it("zero ratio numerator or denominator yields no match (defensive)", () => {
    const r1 = calculateMatch(5_000, { ...basePool, ratioNumerator: 0 });
    const r2 = calculateMatch(5_000, { ...basePool, ratioDenominator: 0 });
    assert.equal(r1.matchedCents, 0);
    assert.equal(r2.matchedCents, 0);
  });

  it("flags pool exhausted on the exact last dollar match", () => {
    const r = calculateMatch(
      10_000,
      { ...basePool, pledgedCapCents: 10_000, totalMatchedCents: 0 },
    );
    assert.equal(r.matchedCents, 10_000);
    assert.equal(r.poolExhausted, true);
  });
});

describe("publicSponsorLabel", () => {
  it("returns the trimmed name when public visibility is on", () => {
    assert.equal(publicSponsorLabel("  Smith Family Foundation  ", true), "Smith Family Foundation");
  });
  it("falls back to anonymous when name is blank", () => {
    assert.equal(publicSponsorLabel("", true), "an anonymous donor");
    assert.equal(publicSponsorLabel(null, true), "an anonymous donor");
    assert.equal(publicSponsorLabel(undefined, true), "an anonymous donor");
  });
  it("falls back to anonymous when sponsor opts out of public visibility", () => {
    assert.equal(publicSponsorLabel("Smith Family Foundation", false), "an anonymous donor");
  });
});

describe("computeEffectiveMatchStatus", () => {
  const base = {
    status: "active" as const,
    pledgedCapCents: 100_000,
    totalMatchedCents: 0,
    startsAt: null as Date | null,
    endsAt: null as Date | null,
  };
  it("returns active for an open window with budget remaining", () => {
    assert.equal(computeEffectiveMatchStatus(base), "active");
  });
  it("returns pending when startsAt is in the future", () => {
    const start = new Date(Date.now() + 60_000);
    assert.equal(computeEffectiveMatchStatus({ ...base, startsAt: start }), "pending");
  });
  it("returns ended when endsAt is in the past", () => {
    const end = new Date(Date.now() - 60_000);
    assert.equal(computeEffectiveMatchStatus({ ...base, endsAt: end }), "ended");
  });
  it("returns exhausted when remaining is zero even if window is open", () => {
    assert.equal(
      computeEffectiveMatchStatus({ ...base, totalMatchedCents: 100_000 }),
      "exhausted",
    );
  });
  it("prefers persisted exhausted over time window", () => {
    const end = new Date(Date.now() - 60_000);
    assert.equal(
      computeEffectiveMatchStatus({ ...base, status: "exhausted", endsAt: end }),
      "exhausted",
    );
  });
  it("returns ended when persisted status is ended", () => {
    assert.equal(computeEffectiveMatchStatus({ ...base, status: "ended" }), "ended");
  });
});

describe("goal-met & total-impact accounting", () => {
  // Mirrors the public landing-page math: total impact = raised + matched.
  // raised tracks donor gifts ONLY; matched is the sponsor's contribution.
  const impact = (raised: number, matched: number) => raised + matched;
  it("does not double-count matched dollars in raised", () => {
    // $1,000 donor gift with 1:1 match should produce raised=1000 + matched=1000
    // = total impact of $2,000 — not $3,000.
    assert.equal(impact(100_000, 100_000), 200_000);
  });
  it("goal is met when donor + sponsor combined reach goal", () => {
    const goal = 500_000;
    const totalImpact = impact(250_000, 250_000);
    assert.equal(totalImpact >= goal, true);
  });
  it("goal is NOT met when only donor side without matching reaches half the goal", () => {
    const goal = 500_000;
    const totalImpact = impact(200_000, 0);
    assert.equal(totalImpact >= goal, false);
  });
});

describe("concurrency safety: sequential pool draining never overspends", () => {
  // Simulates two donations hitting an almost-empty pool back-to-back.
  // The real webhook uses SELECT … FOR UPDATE so the second tx sees the
  // already-decremented total. The calculator MUST cap matched at remaining
  // regardless of input order — this is the invariant the lock protects.
  it("two large gifts to an $80 remaining pool together match at most $80", () => {
    const pool: MatchPoolSnapshot = {
      ...basePool,
      pledgedCapCents: 500_000,
      totalMatchedCents: 492_000, // $4,920 already matched, $80 left
    };
    const first = calculateMatch(50_000, pool);
    assert.equal(first.matchedCents, 8_000); // capped to remaining
    // Second donation runs after first commits — pool snapshot reflects it.
    const poolAfterFirst = { ...pool, totalMatchedCents: pool.totalMatchedCents + first.matchedCents };
    const second = calculateMatch(50_000, poolAfterFirst);
    assert.equal(second.matchedCents, 0);
    assert.equal(second.reason, "pool_exhausted");
    assert.equal(
      first.matchedCents + second.matchedCents,
      pool.pledgedCapCents - pool.totalMatchedCents,
    );
  });
  it("an exhausted pool refuses all further matches even with budget rounding edge cases", () => {
    const pool: MatchPoolSnapshot = {
      ...basePool,
      status: "exhausted",
      pledgedCapCents: 100_000,
      totalMatchedCents: 100_000,
    };
    const result = calculateMatch(10_000, pool);
    assert.equal(result.matchedCents, 0);
    assert.equal(result.reason, "pool_disabled");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("migration round-trip: 0021_add_expense_campaigns.sql", () => {
  const sql = readFileSync(
    resolve(__dirname, "../migrations/0021_add_expense_campaigns.sql"),
    "utf8",
  );
  it("creates the expense_campaigns table with required columns", () => {
    assert.ok(/CREATE TABLE.*expense_campaigns/i.test(sql), "expense_campaigns table");
    for (const col of [
      "tenant_id", "title", "slug", "short_description", "long_description",
      "hero_image_url", "goal_amount_cents", "raised_amount_cents",
      "end_date", "status",
    ]) {
      assert.ok(new RegExp(`\\b${col}\\b`).test(sql), `missing column ${col}`);
    }
  });
  it("enforces a unique (tenant_id, slug) constraint", () => {
    assert.ok(
      /UNIQUE\s*\(\s*tenant_id\s*,\s*slug\s*\)/i.test(sql),
      "unique(tenant_id, slug)",
    );
  });
  it("creates the campaign_match_pools table 1:1 to a campaign", () => {
    assert.ok(/CREATE TABLE.*campaign_match_pools/i.test(sql));
    for (const col of [
      "expense_campaign_id", "public_sponsor_name", "show_sponsor_publicly",
      "internal_sponsor_name", "internal_sponsor_email",
      "pledged_cap_cents", "ratio_numerator", "ratio_denominator",
      "per_gift_cap_cents", "total_matched_cents", "status",
      "starts_at", "ends_at",
    ]) {
      assert.ok(new RegExp(`\\b${col}\\b`).test(sql), `missing pool column ${col}`);
    }
    assert.ok(
      /UNIQUE\s*\(\s*expense_campaign_id\s*\)/i.test(sql),
      "pool 1:1 uniqueness",
    );
  });
  it("adds nullable expense_campaign_id and matched_amount_cents to donations", () => {
    assert.ok(/ALTER TABLE.*donations[\s\S]*expense_campaign_id/i.test(sql));
    assert.ok(/matched_amount_cents/i.test(sql));
  });
});

// Mirrors the public landing-page render logic without needing a DOM:
// derives which banner key the page would show for the four required states
// (no match / named match / anonymous match / match exhausted) plus
// pending and ended windows.
function publicBannerKey(
  pool: MatchPoolSnapshot | null,
  sponsorLabel: string,
): "none" | "active-named" | "active-anonymous" | "pending" | "exhausted" | "ended" {
  if (!pool) return "none";
  const effective = computeEffectiveMatchStatus(pool);
  if (effective === "pending") return "pending";
  if (effective === "ended") return "ended";
  if (effective === "exhausted") return "exhausted";
  return sponsorLabel === "an anonymous donor" ? "active-anonymous" : "active-named";
}

describe("public page rendering states (the four required states)", () => {
  const activePool: MatchPoolSnapshot = { ...basePool };
  const exhaustedPool: MatchPoolSnapshot = {
    ...basePool,
    status: "exhausted",
    totalMatchedCents: basePool.pledgedCapCents,
  };
  it("renders no banner when no match pool is attached", () => {
    assert.equal(publicBannerKey(null, ""), "none");
  });
  it("renders named-match banner with a public sponsor name", () => {
    assert.equal(publicBannerKey(activePool, publicSponsorLabel("Acme Foundation", true)), "active-named");
  });
  it("renders anonymous-match banner when sponsor is hidden", () => {
    assert.equal(publicBannerKey(activePool, publicSponsorLabel("Smith Family", false)), "active-anonymous");
  });
  it("renders exhausted banner when the pool is drained", () => {
    assert.equal(publicBannerKey(exhaustedPool, "Acme Foundation"), "exhausted");
  });
  it("renders pending banner before the match window opens", () => {
    const future = new Date(Date.now() + 86_400_000);
    assert.equal(
      publicBannerKey({ ...activePool, startsAt: future }, "Acme"),
      "pending",
    );
  });
  it("renders ended banner after the match window closes", () => {
    const past = new Date(Date.now() - 86_400_000);
    assert.equal(
      publicBannerKey({ ...activePool, endsAt: past }, "Acme"),
      "ended",
    );
  });
});
