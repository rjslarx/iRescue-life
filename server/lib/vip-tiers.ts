import { db } from "../db";
import { monthlyGivingTiers } from "@shared/schema";
import { and, eq, asc } from "drizzle-orm";

export interface PickedVipTier {
  id: string;
  name: string;
  amount: number;
}

/**
 * Pick the appropriate VIP tier for a given monthly amount on a tenant.
 *
 * Strategy: highest active tier whose price is ≤ requested amount. If no tier
 * qualifies (amount lower than the cheapest tier), fall back to the cheapest
 * tier. If the tenant has no active tiers at all, return null.
 *
 * Used when stamping a tier onto a new monthly subscription that did not come
 * through the dedicated VIP checkout (regular donation form, fundraiser, etc.)
 * and by the backfill script for historical subs that pre-date the VIP club.
 */
export async function pickVipTierForAmount(
  tenantId: string,
  amountInCents: number,
): Promise<PickedVipTier | null> {
  if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
    return null;
  }
  const tiers = await db
    .select({
      id: monthlyGivingTiers.id,
      name: monthlyGivingTiers.tierName,
      amount: monthlyGivingTiers.amount,
    })
    .from(monthlyGivingTiers)
    .where(and(eq(monthlyGivingTiers.tenantId, tenantId), eq(monthlyGivingTiers.isActive, true)))
    .orderBy(asc(monthlyGivingTiers.amount));

  if (tiers.length === 0) {
    return null;
  }

  let picked = tiers[0];
  for (const tier of tiers) {
    if (tier.amount <= amountInCents) {
      picked = tier;
    } else {
      break;
    }
  }
  return picked;
}
