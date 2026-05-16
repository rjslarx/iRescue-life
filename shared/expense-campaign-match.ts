/**
 * Task #213 — Pure match-pool arithmetic for expense-campaign donations.
 *
 * Kept in `shared/` so both the server (Stripe webhook) and the unit-test
 * harness can call it without spinning up Drizzle. The function is
 * intentionally pure: it takes a snapshot of the pool + the incoming gift
 * and returns the matched amount in cents. The transactional FOR UPDATE
 * dance lives at the call site.
 */

export interface MatchPoolSnapshot {
  status: "active" | "exhausted" | "ended";
  pledgedCapCents: number;
  totalMatchedCents: number;
  ratioNumerator: number;
  ratioDenominator: number;
  perGiftCapCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface MatchResult {
  /** Cents that the sponsor owes for this single gift. */
  matchedCents: number;
  /** True if this gift drains the pool to zero. */
  poolExhausted: boolean;
  /** Human-readable reason when matchedCents is 0. */
  reason: "matched" | "pool_exhausted" | "window_closed" | "pool_disabled" | "zero_ratio";
}

export function calculateMatch(
  giftCents: number,
  pool: MatchPoolSnapshot,
  now: Date = new Date(),
): MatchResult {
  if (pool.status !== "active") {
    return { matchedCents: 0, poolExhausted: pool.status === "exhausted", reason: "pool_disabled" };
  }
  if (pool.startsAt && now < pool.startsAt) {
    return { matchedCents: 0, poolExhausted: false, reason: "window_closed" };
  }
  if (pool.endsAt && now > pool.endsAt) {
    return { matchedCents: 0, poolExhausted: false, reason: "window_closed" };
  }
  if (pool.ratioNumerator <= 0 || pool.ratioDenominator <= 0) {
    return { matchedCents: 0, poolExhausted: false, reason: "zero_ratio" };
  }
  const remaining = Math.max(0, pool.pledgedCapCents - pool.totalMatchedCents);
  if (remaining <= 0) {
    return { matchedCents: 0, poolExhausted: true, reason: "pool_exhausted" };
  }
  // Raw match using the configured ratio. Floored so we never round the
  // sponsor into owing fractional pennies.
  const rawMatch = Math.floor((giftCents * pool.ratioNumerator) / pool.ratioDenominator);
  const capped = pool.perGiftCapCents != null ? Math.min(rawMatch, pool.perGiftCapCents) : rawMatch;
  const matched = Math.max(0, Math.min(capped, remaining));
  return {
    matchedCents: matched,
    poolExhausted: matched >= remaining,
    reason: "matched",
  };
}

/**
 * Public banner copy used on the landing page + donor receipt. Resolves the
 * "anonymous donor" label when public name is blank or visibility is off.
 */
export function publicSponsorLabel(
  publicName: string | null | undefined,
  showSponsorPublicly: boolean,
): string {
  if (!showSponsorPublicly) return "an anonymous donor";
  const trimmed = (publicName ?? "").trim();
  return trimmed.length > 0 ? trimmed : "an anonymous donor";
}

/**
 * Effective public match status: collapses the persisted `status` column with
 * the time-window check. We compute this server-side so the public landing
 * page renders the correct banner immediately after the window opens/closes
 * without waiting for a cron to flip the stored status.
 *
 * - "pending"   — start time is in the future
 * - "active"    — within the window AND pool not exhausted
 * - "exhausted" — pool drained (persisted) OR cap fully matched
 * - "ended"     — window closed OR persisted status === "ended"
 */
export function computeEffectiveMatchStatus(
  pool: Pick<MatchPoolSnapshot, "status" | "startsAt" | "endsAt" | "pledgedCapCents" | "totalMatchedCents">,
  now: Date = new Date(),
): "pending" | "active" | "exhausted" | "ended" {
  const remaining = Math.max(0, pool.pledgedCapCents - pool.totalMatchedCents);
  if (pool.status === "exhausted" || remaining <= 0) return "exhausted";
  if (pool.status === "ended") return "ended";
  if (pool.endsAt && now > pool.endsAt) return "ended";
  if (pool.startsAt && now < pool.startsAt) return "pending";
  return "active";
}
