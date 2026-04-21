/**
 * Backfill VIP tiers for existing monthly subscriptions.
 *
 * What it does (idempotent, safe to re-run):
 *   1. Seeds the three default tiers (Friend of the Pack / Guardian / Hero of Hope) on any
 *      active tenant that has no monthly_giving_tiers rows yet.
 *   2. For every active subscription with vipTierIdSnapshot IS NULL, picks the
 *      best matching tier on that tenant and stamps both snapshot fields.
 *   3. Optionally deletes the leftover dev test sub on the iRescue Platform
 *      tenant (sub_test_1776661337361) when --cleanup-platform-test is passed.
 *
 * Usage:
 *   npx tsx scripts/backfill-vip-tiers.ts [--dry-run] [--cleanup-platform-test]
 */
import { db } from "../server/db";
import { tenants, subscriptions, monthlyGivingTiers, donors } from "@shared/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { pickVipTierForAmount } from "../server/lib/vip-tiers";

const DRY_RUN = process.argv.includes("--dry-run");
const CLEANUP_PLATFORM_TEST = process.argv.includes("--cleanup-platform-test");
function flagValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}
const ONLY_TENANT = flagValue("tenant");
const LIMIT_RAW = flagValue("limit");
const LIMIT = LIMIT_RAW ? Math.max(0, parseInt(LIMIT_RAW, 10) || 0) : 0;

const DEFAULT_TIERS = [
  { tierName: "Friend of the Pack", amount: 1000, tangibleImpact: "Helps cover food, beds, and basic care for one foster animal each month.", iconName: "paw" },
  { tierName: "Guardian", amount: 2500, tangibleImpact: "Sponsors monthly vaccinations, parasite prevention, and routine vet care for one animal.", iconName: "shield" },
  { tierName: "Hero of Hope", amount: 5000, tangibleImpact: "Underwrites a complete medical journey — spay/neuter, dental, and emergency care.", iconName: "heart" },
];

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function seedDefaultTiers() {
  console.log(`\n=== Step 1: Default-tier seeding ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
  const activeTenants = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.isActive, true));
  for (const t of activeTenants) {
    const existing = await db.select({ id: monthlyGivingTiers.id }).from(monthlyGivingTiers).where(eq(monthlyGivingTiers.tenantId, t.id));
    if (existing.length > 0) {
      console.log(`  [skip] ${t.name} — already has ${existing.length} tier(s)`);
      continue;
    }
    console.log(`  [seed] ${t.name} — inserting ${DEFAULT_TIERS.length} default tiers`);
    if (!DRY_RUN) {
      await db.insert(monthlyGivingTiers).values(
        DEFAULT_TIERS.map((tier, idx) => ({
          tenantId: t.id,
          tierName: tier.tierName,
          amount: tier.amount,
          tangibleImpact: tier.tangibleImpact,
          iconName: tier.iconName,
          displayOrder: idx,
          isActive: true,
        })),
      );
    }
  }
}

async function backfillSubs() {
  console.log(`\n=== Step 2: Backfilling untagged active subs ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
  const conditions = [
    eq(subscriptions.status, "active"),
    eq(subscriptions.interval, "month"),
    isNull(subscriptions.vipTierIdSnapshot),
  ];
  if (ONLY_TENANT) {
    conditions.push(eq(subscriptions.tenantId, ONLY_TENANT));
    console.log(`  Filtering to tenant=${ONLY_TENANT}`);
  }
  let q = db
    .select({
      id: subscriptions.id,
      tenantId: subscriptions.tenantId,
      tenantName: tenants.name,
      donorName: donors.name,
      donorEmail: donors.email,
      amount: subscriptions.amount,
    })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .innerJoin(donors, eq(donors.id, subscriptions.donorId))
    .where(and(...conditions))
    .$dynamic();
  if (LIMIT > 0) {
    q = q.limit(LIMIT);
    console.log(`  Capping at limit=${LIMIT}`);
  }
  const rows = await q;

  if (rows.length === 0) {
    console.log("  No untagged active subs found.");
    return;
  }

  let updated = 0;
  let unmatched = 0;
  for (const r of rows) {
    const tier = await pickVipTierForAmount(r.tenantId, r.amount);
    if (!tier) {
      console.log(`  [unmatched] ${r.tenantName} — ${r.donorName} <${r.donorEmail}> ${fmt(r.amount)} (no tiers)`);
      unmatched++;
      continue;
    }
    console.log(`  [match] ${r.tenantName} — ${r.donorName} <${r.donorEmail}> ${fmt(r.amount)} → ${tier.name} (${fmt(tier.amount)})`);
    if (!DRY_RUN) {
      await db
        .update(subscriptions)
        .set({ vipTierIdSnapshot: tier.id, vipTierNameSnapshot: tier.name })
        .where(eq(subscriptions.id, r.id));
    }
    updated++;
  }
  console.log(`\n  Summary: ${updated} updated, ${unmatched} unmatched, ${rows.length} total`);
}

async function cleanupPlatformTestSub() {
  if (!CLEANUP_PLATFORM_TEST) {
    console.log(`\n=== Step 3: Platform test-sub cleanup — skipped (pass --cleanup-platform-test to enable) ===`);
    return;
  }
  console.log(`\n=== Step 3: Cleaning up platform test sub ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
  const targets = await db
    .select({ id: subscriptions.id, donorId: subscriptions.donorId, stripeId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .where(and(
      eq(tenants.name, "iRescue Platform"),
      eq(subscriptions.stripeSubscriptionId, "sub_test_1776661337361"),
    ));

  if (targets.length === 0) {
    console.log("  No platform test subs found.");
    return;
  }
  for (const t of targets) {
    console.log(`  [delete] sub ${t.id} (${t.stripeId})`);
    if (!DRY_RUN) {
      await db.delete(subscriptions).where(eq(subscriptions.id, t.id));
      // Also remove the synthetic donor row if it has no other subs/donations
      const remaining = await db.execute(sql`SELECT (SELECT COUNT(*) FROM subscriptions WHERE donor_id = ${t.donorId})::int AS sub_count, (SELECT COUNT(*) FROM donations WHERE donor_id = ${t.donorId})::int AS don_count`);
      const row = (remaining.rows[0] as { sub_count: number; don_count: number });
      if (row.sub_count === 0 && row.don_count === 0) {
        console.log(`           also removing orphan donor ${t.donorId}`);
        await db.delete(donors).where(eq(donors.id, t.donorId));
      }
    }
  }
}

async function main() {
  console.log(`Backfill VIP tiers — flags: dryRun=${DRY_RUN}, cleanupPlatformTest=${CLEANUP_PLATFORM_TEST}`);
  await seedDefaultTiers();
  await backfillSubs();
  await cleanupPlatformTestSub();
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
