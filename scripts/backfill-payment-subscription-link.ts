/**
 * Backfill payments.subscription_id for old recurring payment rows.
 *
 * Why this exists (Task #111):
 *   Task #104 fixed the double-counting bug for NEW recurring donations by
 *   stamping `payments.subscription_id` on the optimistic row created in
 *   `checkout.session.completed`, so the subsequent `invoice.payment_succeeded`
 *   webhook can find that row (via `subscription_id` + `stripe_invoice_id IS NULL`)
 *   and dedup instead of double-crediting. However, payment rows created BEFORE
 *   that shipped still have `subscription_id = NULL`, so the dedup branch can't
 *   match them. For renewal invoices on those old subs the dedup branch would
 *   never fire anyway (renewals are supposed to bump totals), but the missing
 *   link is messy: subscription-scoped revenue queries (e.g. VIP per-tier
 *   revenue in /api/vip-club/members, scripts/backfill-vip-tiers analytics) all
 *   group by `payments.subscription_id` and silently drop these rows.
 *
 *   This one-shot script walks every payments row where `is_recurring = true`
 *   and `subscription_id IS NULL` and tries to link it to the matching
 *   subscriptions row by:
 *     1. Looking up the linked Stripe invoice (`stripe_invoice_id`) and reading
 *        its `subscription` field, OR
 *     2. Looking up the linked Stripe Checkout session (`stripe_checkout_session_id`)
 *        and reading its `subscription` field.
 *   The resolved Stripe subscription id is matched against
 *   `subscriptions.stripe_subscription_id` (scoped to the same tenant) and the
 *   payment row is stamped with `subscription_id`. Donor totals and any other
 *   columns are NOT touched — this is purely a foreign-key cleanup.
 *
 * Idempotent + safe to re-run. Only updates rows that are currently NULL.
 *
 * Usage:
 *   npx tsx scripts/backfill-payment-subscription-link.ts [--dry-run] [--tenant=<uuid>] [--limit=<n>]
 */
import Stripe from "stripe";
import { db } from "../server/db";
import { payments, subscriptions, tenants } from "@shared/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { decrypt } from "../server/lib/encryption";
import { getPlatformStripeSecretKey } from "../server/config/platform";

const DRY_RUN = process.argv.includes("--dry-run");
function flagValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}
const ONLY_TENANT = flagValue("tenant");
const LIMIT_RAW = flagValue("limit");
const LIMIT = LIMIT_RAW ? Math.max(0, parseInt(LIMIT_RAW, 10) || 0) : 0;

const STRIPE_API_VERSION = "2025-09-30.clover" as const;

type TenantRow = typeof tenants.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

function getStripeClientForTenant(tenant: TenantRow): Stripe | null {
  if (tenant.stripeEnabled && tenant.stripeSecretKeyEncrypted) {
    try {
      const secretKey = decrypt(tenant.stripeSecretKeyEncrypted);
      return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, typescript: true });
    } catch (err) {
      console.error(`  [stripe] Failed to decrypt key for tenant ${tenant.id}: ${(err as Error).message}`);
      return null;
    }
  }
  // Fallback: Stripe Connect — payments flow through the platform key, with the
  // tenant's connected account stamped on each request via { stripeAccount: ... }.
  // Only use this fallback when the tenant actually has a connected account;
  // otherwise we'd issue noisy lookups against the platform's own account that
  // can never resolve the tenant's invoices/sessions.
  if (!tenant.stripeConnectedAccountId) return null;
  const platformKey = getPlatformStripeSecretKey();
  if (platformKey) {
    return new Stripe(platformKey, { apiVersion: STRIPE_API_VERSION, typescript: true });
  }
  return null;
}

function stripeRequestOpts(tenant: TenantRow): Stripe.RequestOptions | undefined {
  // When the tenant uses their own Stripe key (not Connect), no stripeAccount header.
  if (tenant.stripeEnabled && tenant.stripeSecretKeyEncrypted) return undefined;
  if (tenant.stripeConnectedAccountId) {
    return { stripeAccount: tenant.stripeConnectedAccountId };
  }
  return undefined;
}

function extractSubscriptionId(
  sub: string | Stripe.Subscription | null | undefined,
): string | null {
  if (!sub) return null;
  if (typeof sub === "string") return sub;
  return sub.id ?? null;
}

async function resolveStripeSubscriptionId(
  stripeClient: Stripe,
  reqOpts: Stripe.RequestOptions | undefined,
  payment: PaymentRow,
): Promise<{ stripeSubId: string | null; via: string; error?: string }> {
  const errors: string[] = [];

  if (payment.stripeInvoiceId) {
    try {
      const invoice = await stripeClient.invoices.retrieve(payment.stripeInvoiceId, reqOpts);
      const subId = extractSubscriptionId(invoice.subscription);
      if (subId) return { stripeSubId: subId, via: "invoice" };
      errors.push("invoice has no subscription field");
    } catch (err) {
      errors.push(`invoice retrieve failed: ${(err as Error).message}`);
    }
  }
  // Fall through to session lookup when the invoice path didn't yield a sub
  // (no invoice id on the row, invoice retrieve failed, or invoice had no
  // subscription field). The session path can rescue rows that the invoice
  // path can't, which is common for the optimistic checkout-seeded rows.
  if (payment.stripeCheckoutSessionId) {
    try {
      const session = await stripeClient.checkout.sessions.retrieve(payment.stripeCheckoutSessionId, reqOpts);
      const subId = extractSubscriptionId(session.subscription);
      if (subId) return { stripeSubId: subId, via: "session" };
      errors.push("session has no subscription field");
    } catch (err) {
      errors.push(`session retrieve failed: ${(err as Error).message}`);
    }
  }
  if (errors.length === 0) {
    return { stripeSubId: null, via: "none", error: "no stripe_invoice_id or stripe_checkout_session_id on row" };
  }
  return { stripeSubId: null, via: "invoice+session", error: errors.join("; ") };
}

async function processTenant(tenant: TenantRow): Promise<{ matched: number; skipped: number; errors: number; total: number }> {
  const conditions = [
    eq(payments.tenantId, tenant.id),
    eq(payments.isRecurring, true),
    isNull(payments.subscriptionId),
  ];

  let q = db
    .select()
    .from(payments)
    .where(and(...conditions))
    .$dynamic();
  if (LIMIT > 0) q = q.limit(LIMIT);
  const rows = await q;

  if (rows.length === 0) {
    return { matched: 0, skipped: 0, errors: 0, total: 0 };
  }

  console.log(`\n--- Tenant: ${tenant.name} (${tenant.id}) — ${rows.length} candidate payment row(s) ---`);

  const stripeClient = getStripeClientForTenant(tenant);
  if (!stripeClient) {
    console.log(`  [skip-tenant] No usable Stripe credentials (stripeEnabled=${tenant.stripeEnabled}, hasKey=${!!tenant.stripeSecretKeyEncrypted}, platformKey=${!!getPlatformStripeSecretKey()})`);
    return { matched: 0, skipped: rows.length, errors: 0, total: rows.length };
  }
  const reqOpts = stripeRequestOpts(tenant);

  // Cache stripeSubId → { dbSubId, donorId } per tenant so multiple payments
  // that map to the same Stripe sub only hit the DB once. We additionally
  // enforce donor agreement at match time (see findDbSubId callers): the
  // payment row's donor_id must equal the subscription row's donor_id, so we
  // never link a payment to a sub belonging to a different donor (defensive
  // check against any historical data corruption).
  const subInfoCache = new Map<string, { dbSubId: string; donorId: string } | null>();
  async function lookupDbSub(stripeSubId: string): Promise<{ dbSubId: string; donorId: string } | null> {
    if (subInfoCache.has(stripeSubId)) return subInfoCache.get(stripeSubId)!;
    const row = await db
      .select({ id: subscriptions.id, donorId: subscriptions.donorId })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.tenantId, tenant.id),
        eq(subscriptions.stripeSubscriptionId, stripeSubId),
      ))
      .limit(1)
      .then((r) => r[0]);
    const result = row ? { dbSubId: row.id, donorId: row.donorId } : null;
    subInfoCache.set(stripeSubId, result);
    return result;
  }

  let matched = 0;
  let skipped = 0;
  let errors = 0;

  for (const payment of rows) {
    const { stripeSubId, via, error } = await resolveStripeSubscriptionId(stripeClient, reqOpts, payment);
    if (!stripeSubId) {
      console.log(`  [skip] payment ${payment.id} (via=${via}): ${error}`);
      skipped++;
      continue;
    }
    const dbSub = await lookupDbSub(stripeSubId);
    if (!dbSub) {
      console.log(`  [skip] payment ${payment.id} (via=${via}): no DB subscription matches stripe_subscription_id=${stripeSubId}`);
      skipped++;
      continue;
    }
    // Donor scoping: only link when the payment row's donor matches the
    // subscription row's donor. payments.donor_id can be NULL (FK has
    // onDelete: 'set null'); in that case we accept the link because there
    // is no donor to compare against.
    if (payment.donorId && payment.donorId !== dbSub.donorId) {
      console.log(`  [skip] payment ${payment.id} (via=${via}): donor mismatch — payment.donor=${payment.donorId} vs subscription.donor=${dbSub.donorId} (sub ${dbSub.dbSubId})`);
      skipped++;
      continue;
    }
    console.log(`  [match] payment ${payment.id} (via=${via}) → subscription ${dbSub.dbSubId} (${stripeSubId})`);
    if (!DRY_RUN) {
      try {
        await db
          .update(payments)
          .set({ subscriptionId: dbSub.dbSubId })
          .where(eq(payments.id, payment.id));
      } catch (err) {
        console.error(`  [error] failed to update payment ${payment.id}: ${(err as Error).message}`);
        errors++;
        continue;
      }
    }
    matched++;
  }

  console.log(`  Tenant summary: ${matched} linked, ${skipped} skipped, ${errors} errors (of ${rows.length})`);
  return { matched, skipped, errors, total: rows.length };
}

async function main() {
  console.log(`Backfill payments.subscription_id — flags: dryRun=${DRY_RUN}${ONLY_TENANT ? `, tenant=${ONLY_TENANT}` : ""}${LIMIT > 0 ? `, limit=${LIMIT}` : ""}`);

  const tenantConds = ONLY_TENANT ? [eq(tenants.id, ONLY_TENANT)] : [];
  const tenantRows = tenantConds.length
    ? await db.select().from(tenants).where(and(...tenantConds))
    : await db.select().from(tenants);

  // Filter down to tenants that actually have at least one candidate row.
  const tenantsWithCandidates: TenantRow[] = [];
  for (const t of tenantRows) {
    const probe = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(
        eq(payments.tenantId, t.id),
        eq(payments.isRecurring, true),
        isNull(payments.subscriptionId),
      ))
      .limit(1);
    if (probe.length > 0) tenantsWithCandidates.push(t);
  }

  if (tenantsWithCandidates.length === 0) {
    console.log("\nNo tenants have any unlinked recurring payment rows. Nothing to do.");
    process.exit(0);
  }

  console.log(`\n${tenantsWithCandidates.length} tenant(s) have candidate rows.`);

  const totals = { matched: 0, skipped: 0, errors: 0, total: 0 };
  for (const t of tenantsWithCandidates) {
    const r = await processTenant(t);
    totals.matched += r.matched;
    totals.skipped += r.skipped;
    totals.errors += r.errors;
    totals.total += r.total;
  }

  // Sanity: also report the count of rows that have an invoice id but still
  // have no link, in case some tenants were skipped above (no stripe creds).
  const orphansWithInvoice = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(
      eq(payments.isRecurring, true),
      isNull(payments.subscriptionId),
      isNotNull(payments.stripeInvoiceId),
    ));

  console.log(`\n=== Done ===`);
  console.log(`  Linked:  ${totals.matched}`);
  console.log(`  Skipped: ${totals.skipped}`);
  console.log(`  Errors:  ${totals.errors}`);
  console.log(`  Total candidate rows scanned: ${totals.total}`);
  console.log(`  Remaining unlinked recurring rows with a stripe_invoice_id: ${orphansWithInvoice.length}${DRY_RUN ? " (dry run, nothing was written)" : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
