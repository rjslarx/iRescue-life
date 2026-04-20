/**
 * One-shot send job for the retroactive VIP welcome email.
 *
 * Targets active monthly subscriptions that:
 *   - Were created BEFORE --created-before (defaults to today's date — the
 *     idea being "donors who pre-existed the VIP rollout"). Pass an explicit
 *     ISO cutoff (e.g. 2026-04-20) for repeatable runs.
 *   - Have vipTierIdSnapshot populated (i.e. the backfill in Task #58 — or a
 *     future tenant's first backfill — has tagged them).
 *   - Have NOT already received this email (backfillWelcomeSentAt IS NULL).
 *
 * The backfillWelcomeSentAt column acts as the sent-flag so this script can
 * never double-send, even across re-runs and even across new tenants whose
 * pre-VIP donors get backfilled later.
 *
 * Usage:
 *   # Dry-run preview of who would receive it
 *   npx tsx scripts/send-vip-backfill-welcome.ts --dry-run
 *
 *   # Send a single test to yourself before the real run
 *   npx tsx scripts/send-vip-backfill-welcome.ts --test-to=admin@example.org \
 *     --tenant=<tenantId>
 *
 *   # Real send, optionally scoped to one tenant or capped to a small batch
 *   npx tsx scripts/send-vip-backfill-welcome.ts \
 *     --created-before=2026-04-20 [--tenant=<tenantId>] [--limit=10]
 */
import { db } from "../server/db";
import { subscriptions, tenants, donors } from "@shared/schema";
import { and, asc, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { sendVipBackfillWelcomeEmail, type VipEmailTenant } from "../server/services/vip-emails";

function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (arg) return arg.slice(prefix.length);
  // Support `--flag value` as well
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return undefined;
}

const DRY_RUN = process.argv.includes("--dry-run");
const TENANT_ID = getFlag("tenant");
const TEST_TO = getFlag("test-to");
const LIMIT = (() => {
  const raw = getFlag("limit");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
})();
const CREATED_BEFORE = (() => {
  const raw = getFlag("created-before");
  if (!raw) return new Date(); // default: now
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    console.error(`Invalid --created-before: ${raw} (expected ISO date like 2026-04-20)`);
    process.exit(1);
  }
  return d;
})();

const FALLBACK_ORIGIN = process.env.PUBLIC_BASE_URL || "https://app.irescue.org";

async function main() {
  console.log(
    `VIP backfill welcome — flags: dryRun=${DRY_RUN}, tenant=${TENANT_ID || "<all>"}, ` +
      `testTo=${TEST_TO || "<none>"}, createdBefore=${CREATED_BEFORE.toISOString()}, limit=${LIMIT ?? "<none>"}`,
  );

  const conditions = [
    eq(subscriptions.status, "active"),
    eq(subscriptions.interval, "month"),
    isNotNull(subscriptions.vipTierIdSnapshot),
    isNull(subscriptions.backfillWelcomeSentAt),
    lt(subscriptions.createdAt, CREATED_BEFORE),
  ];
  if (TENANT_ID) conditions.push(eq(subscriptions.tenantId, TENANT_ID));

  const rows = await db
    .select({
      subId: subscriptions.id,
      tenantId: subscriptions.tenantId,
      vipTierIdSnapshot: subscriptions.vipTierIdSnapshot,
      vipTierNameSnapshot: subscriptions.vipTierNameSnapshot,
      amount: subscriptions.amount,
      currency: subscriptions.currency,
      memberSince: subscriptions.createdAt,
      donorEmail: donors.email,
      donorName: donors.name,
      tenant: {
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
        customDomain: tenants.customDomain,
        orgTaxEin: tenants.orgTaxEin,
        orgLegalName: tenants.orgLegalName,
        transparencyVault: tenants.transparencyVault,
        impactLoopEnabled: tenants.impactLoopEnabled,
        contactEmail: tenants.contactEmail,
      },
    })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .innerJoin(donors, eq(donors.id, subscriptions.donorId))
    .where(and(...conditions))
    // Deterministic order so phased/batched runs (--limit) are predictable
    // across re-invocations.
    .orderBy(asc(subscriptions.createdAt), asc(subscriptions.id));

  const eligible = rows.filter((r) => !!r.donorEmail);
  const skippedNoEmail = rows.length - eligible.length;
  const targets = LIMIT ? eligible.slice(0, LIMIT) : eligible;

  console.log(
    `\nFound ${rows.length} eligible subs (${skippedNoEmail} skipped — no donor email). ` +
      `Will process ${targets.length}.\n`,
  );

  if (targets.length === 0 && !TEST_TO) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  // --test-to: send a single sample using the first eligible row's data,
  // without stamping the sent-flag on that row. If nothing is eligible,
  // we abort rather than guessing a synthetic payload — pass --tenant to
  // scope down if needed, or run after Task #58's backfill has tagged at
  // least one sub.
  if (TEST_TO) {
    const sample = targets[0] || eligible[0];
    if (!sample) {
      console.error("No eligible donor data available to render a test from. Aborting test send.");
      process.exit(1);
    }
    if (!TENANT_ID) {
      console.warn("[warn] --test-to without --tenant uses the first eligible donor's tenant. Pass --tenant to be explicit.");
    }
    console.log(
      `[test] Sending sample to ${TEST_TO} using data from sub ${sample.subId} ` +
        `(tenant=${sample.tenant.name}, tier=${sample.vipTierNameSnapshot}, amount=${sample.amount})`,
    );
    if (DRY_RUN) {
      console.log("[test] (dry-run) — not actually sending.");
      process.exit(0);
    }
    const result = await sendVipBackfillWelcomeEmail({
      tenant: sample.tenant as VipEmailTenant,
      donorEmail: TEST_TO,
      donorName: sample.donorName || "Friend",
      tierId: sample.vipTierIdSnapshot,
      tierName: sample.vipTierNameSnapshot,
      monthlyAmountCents: sample.amount,
      currency: sample.currency,
      memberSince: sample.memberSince,
      fallbackOrigin: FALLBACK_ORIGIN,
    });
    if (result.success) {
      console.log(`[test] ✓ delivered to ${TEST_TO}`);
      process.exit(0);
    }
    console.error(`[test] ✗ failed: ${result.error}`);
    process.exit(1);
  }

  let sent = 0;
  let failed = 0;
  for (const r of targets) {
    const memberSince = r.memberSince ?? new Date();
    const label = `${r.tenant.name} — ${r.donorName} <${r.donorEmail}> [${r.vipTierNameSnapshot}]`;
    if (DRY_RUN) {
      console.log(`  [dry-run] would send → ${label}`);
      continue;
    }
    const result = await sendVipBackfillWelcomeEmail({
      tenant: r.tenant as VipEmailTenant,
      donorEmail: r.donorEmail!,
      donorName: r.donorName || "Friend",
      tierId: r.vipTierIdSnapshot,
      tierName: r.vipTierNameSnapshot,
      monthlyAmountCents: r.amount,
      currency: r.currency,
      memberSince,
      fallbackOrigin: FALLBACK_ORIGIN,
    });
    if (result.success) {
      // Stamp the sent-flag transactionally-immediately so a later crash
      // can never re-deliver to this donor.
      await db
        .update(subscriptions)
        .set({ backfillWelcomeSentAt: new Date() })
        .where(eq(subscriptions.id, r.subId));
      console.log(`  ✓ ${label}`);
      sent++;
    } else {
      console.error(`  ✗ ${label} — ${result.error}`);
      failed++;
    }
  }

  console.log(
    `\nDone. sent=${sent}, failed=${failed}, dryRun=${DRY_RUN ? targets.length : 0}, total=${targets.length}`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("send-vip-backfill-welcome failed:", err);
  process.exit(1);
});
