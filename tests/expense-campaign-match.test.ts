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
