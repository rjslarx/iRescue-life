/**
 * Canonical seed-tier names + amounts that the platform automatically
 * provisions for every new tenant (and that the auto-tag backfill drops in
 * for tenants who had zero tiers when the VIP module rolled out).
 *
 * Kept in sync with `DEFAULT_VIP_TIERS` in `server/routes.ts` and the
 * `DEFAULT_TIERS` array in `scripts/backfill-vip-tiers.ts`. If you change one,
 * change all three. A future enhancement could expose the seed metadata via
 * an API endpoint so the UI cannot drift from the backend.
 */
export const SEEDED_VIP_TIERS: Array<{ name: string; amountCents: number }> = [
  { name: "Friend of the Pack", amountCents: 1000 },
  { name: "Guardian", amountCents: 2500 },
  { name: "Hero of Hope", amountCents: 5000 },
];

export function isUsingSeededVipTiers(
  tiers: ReadonlyArray<{ tierName: string; amount: number }>,
): boolean {
  if (tiers.length !== SEEDED_VIP_TIERS.length) return false;
  return SEEDED_VIP_TIERS.every((seed) =>
    tiers.some(
      (t) =>
        t.tierName.trim().toLowerCase() === seed.name.toLowerCase() &&
        t.amount === seed.amountCents,
    ),
  );
}
