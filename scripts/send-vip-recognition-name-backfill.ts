/**
 * One-shot send job for the VIP recognition-name backfill email (Task #73).
 *
 * Targets active monthly VIP subscriptions that:
 *   - Are tagged with a VIP tier (vipTierIdSnapshot IS NOT NULL).
 *   - Have NO recognition name saved (displayName IS NULL) — these are the
 *     grandfathered donors who joined before the recognition-name field
 *     existed and currently render on the Wall of Heroes as "First L.".
 *   - Have NOT already received this email
 *     (recognitionNameRequestSentAt IS NULL).
 *
 * The recognitionNameRequestSentAt column acts as the sent-flag so the
 * script can never double-send, even across re-runs and even as new
 * tenants' grandfathered donors get backfilled later.
 *
 * Usage:
 *   # Dry-run preview of who would receive it
 *   npx tsx scripts/send-vip-recognition-name-backfill.ts --dry-run
 *
 *   # Send a single test to yourself before the real run
 *   npx tsx scripts/send-vip-recognition-name-backfill.ts \
 *     --test-to=admin@example.org --tenant=<tenantId>
 *
 *   # Real send, optionally scoped to one tenant or capped to a small batch
 *   npx tsx scripts/send-vip-recognition-name-backfill.ts \
 *     [--tenant=<tenantId>] [--limit=10]
 */
import { db } from "../server/db";
import { subscriptions, tenants, donors } from "@shared/schema";
import { and, asc, eq, isNull, isNotNull } from "drizzle-orm";
import {
  sendVipRecognitionNameRequestEmail,
  type VipEmailTenant,
} from "../server/services/vip-emails";

function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (arg) return arg.slice(prefix.length);
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
// Throttle between sends so we never blast a provider's per-second cap.
const SEND_DELAY_MS = (() => {
  const raw = getFlag("delay-ms");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 250;
})();

const FALLBACK_ORIGIN = process.env.PUBLIC_BASE_URL || "https://app.irescue.org";

/** Mirrors the public Wall of Heroes fallback in server/routes.ts. */
function firstAndLastInitial(name?: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(
    `VIP recognition-name backfill — flags: dryRun=${DRY_RUN}, ` +
      `tenant=${TENANT_ID || "<all>"}, testTo=${TEST_TO || "<none>"}, ` +
      `limit=${LIMIT ?? "<none>"}, delayMs=${SEND_DELAY_MS}`,
  );

  const conditions = [
    eq(subscriptions.status, "active"),
    eq(subscriptions.interval, "month"),
    isNotNull(subscriptions.vipTierIdSnapshot),
    // Per task scope: only donors who opted in to the public Wall of Heroes.
    // Donors who haven't opted in have no recognition name on display, so
    // there's nothing to backfill — sending them this email would be noise.
    eq(subscriptions.displayOnWallOfHeroes, true),
    isNull(subscriptions.displayName),
    isNull(subscriptions.recognitionNameRequestSentAt),
  ];
  if (TENANT_ID) conditions.push(eq(subscriptions.tenantId, TENANT_ID));

  const rows = await db
    .select({
      subId: subscriptions.id,
      tenantId: subscriptions.tenantId,
      vipTierNameSnapshot: subscriptions.vipTierNameSnapshot,
      displayOnWallOfHeroes: subscriptions.displayOnWallOfHeroes,
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
    // Deterministic order so phased/batched runs (--limit) are predictable.
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

  if (TEST_TO) {
    const sample = targets[0] || eligible[0];
    if (!sample) {
      console.error("No eligible donor data available to render a test from. Aborting test send.");
      process.exit(1);
    }
    if (!TENANT_ID) {
      console.warn("[warn] --test-to without --tenant uses the first eligible donor's tenant. Pass --tenant to be explicit.");
    }
    const fallbackWallName = firstAndLastInitial(sample.donorName) || "Anonymous";
    console.log(
      `[test] Sending sample to ${TEST_TO} using data from sub ${sample.subId} ` +
        `(tenant=${sample.tenant.name}, tier=${sample.vipTierNameSnapshot}, fallback="${fallbackWallName}")`,
    );
    if (DRY_RUN) {
      console.log("[test] (dry-run) — not actually sending.");
      process.exit(0);
    }
    const result = await sendVipRecognitionNameRequestEmail({
      tenant: sample.tenant as VipEmailTenant,
      donorEmail: TEST_TO,
      donorName: sample.donorName || "Friend",
      tierName: sample.vipTierNameSnapshot,
      fallbackWallName,
      fallbackOrigin: FALLBACK_ORIGIN,
    });
    if (result.success) {
      console.log(`[test] ✓ delivered to ${TEST_TO}`);
      process.exit(0);
    }
    console.error(`[test] ✗ failed: ${result.error}`);
    process.exit(1);
  }

  // Per-tenant tally for the summary log.
  const perTenant = new Map<string, { name: string; sent: number; failed: number; skipped: number }>();
  const bump = (tenantId: string, tenantName: string, key: "sent" | "failed" | "skipped") => {
    const cur = perTenant.get(tenantId) || { name: tenantName, sent: 0, failed: 0, skipped: 0 };
    cur[key]++;
    perTenant.set(tenantId, cur);
  };

  let sent = 0;
  let failed = 0;
  for (const r of targets) {
    const fallbackWallName = firstAndLastInitial(r.donorName) || "Anonymous";
    const label = `${r.tenant.name} — ${r.donorName} <${r.donorEmail}> [${r.vipTierNameSnapshot}] fallback="${fallbackWallName}"`;
    if (DRY_RUN) {
      console.log(`  [dry-run] would send → ${label}`);
      bump(r.tenantId, r.tenant.name, "skipped");
      continue;
    }
    const result = await sendVipRecognitionNameRequestEmail({
      tenant: r.tenant as VipEmailTenant,
      donorEmail: r.donorEmail!,
      donorName: r.donorName || "Friend",
      tierName: r.vipTierNameSnapshot,
      fallbackWallName,
      fallbackOrigin: FALLBACK_ORIGIN,
    });
    if (result.success) {
      // Stamp the sent-flag immediately so a later crash can never re-deliver.
      await db
        .update(subscriptions)
        .set({ recognitionNameRequestSentAt: new Date() })
        .where(eq(subscriptions.id, r.subId));
      console.log(`  ✓ ${label}`);
      sent++;
      bump(r.tenantId, r.tenant.name, "sent");
    } else {
      console.error(`  ✗ ${label} — ${result.error}`);
      failed++;
      bump(r.tenantId, r.tenant.name, "failed");
    }
    if (SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
  }

  console.log(
    `\nDone. sent=${sent}, failed=${failed}, dryRun=${DRY_RUN ? targets.length : 0}, total=${targets.length}`,
  );
  if (perTenant.size > 0) {
    console.log("\nPer-tenant breakdown:");
    for (const [tenantId, stats] of perTenant) {
      console.log(
        `  ${stats.name} (${tenantId}): sent=${stats.sent}, failed=${stats.failed}, dryRun=${stats.skipped}`,
      );
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("send-vip-recognition-name-backfill failed:", err);
  process.exit(1);
});
