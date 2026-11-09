/** Game access is separate from historical giving/billing access. */
export function hasGameMembership(
  subs: Array<{ status: string; currentPeriodEnd: Date | string | null }>,
  now = Date.now(),
): boolean {
  // Trialing, past_due, incomplete, unpaid and canceled do not grant play.
  // Scheduled cancellation stays active until the paid-through period ends.
  // Missing/invalid period end fails closed instead of granting indefinite access.
  return subs.some(sub => sub.status === 'active' && sub.currentPeriodEnd != null
    && new Date(sub.currentPeriodEnd).getTime() > now);
}

export function canPlayVipGame(enabled: boolean, invited: boolean,
  subs: Parameters<typeof hasGameMembership>[0], now = Date.now()): boolean {
  return enabled && invited && hasGameMembership(subs, now);
}
