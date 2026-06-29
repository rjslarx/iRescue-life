/**
 * Reconciles donors who have an active recurring donation row but no matching
 * `subscriptions` row. This happens when Stripe's `checkout.session.completed`
 * webhook is delivered with `session.subscription` not yet populated (a known
 * occasional Stripe race) — the donation gets recorded but the subscription
 * insert is skipped, leaving the donor invisible to the VIP roster and the
 * Wall of Heroes even though they're being charged monthly.
 *
 * The reconciler queries Stripe for each affected donor's customer, finds any
 * active subscription, and inserts the missing local row using the same VIP
 * auto-tagging rules as the webhook. It is safe to re-run (the insert uses
 * onConflictDoNothing on tenantId+stripeSubscriptionId).
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  donations,
  donors as donorsTable,
  subscriptions,
  tenants as tenantsTable,
  type Tenant,
} from "@shared/schema";
import Stripe from "stripe";
import { StripeService, getPlatformStripeKey } from "./stripe-service";
import { pickVipTierForAmount } from "./vip-tiers";

interface ReconcileResult {
  scanned: number;
  created: number;
  skippedNoStripe: number;
  skippedNoCustomer: number;
  skippedNoActiveSub: number;
  errors: string[];
}

const stripeService = new StripeService();

/**
 * Returns a Stripe client + per-call request options for the tenant.
 * Supports both paths used by this app:
 *  - Tenant has its own secret key (legacy direct API key flow)
 *  - Tenant uses Stripe Connect Standard (we act on behalf of their account
 *    via the platform key + `stripeAccount` request option)
 */
/**
 * Builds the list of Stripe contexts to try when looking up a tenant's
 * customer/subscription. Order matters — we try the most-specific context
 * first (tenant's own key, then their connected account), then fall back
 * to the platform account direct (some legacy/monthly subs were created
 * with the platform key without a `stripeAccount` header and live there).
 */
function getTenantStripeContexts(
  tenant: Pick<Tenant, "id" | "stripeEnabled" | "stripeSecretKeyEncrypted" | "stripeConnectedAccountId">,
): Array<{ stripe: Stripe; reqOpts: Stripe.RequestOptions; label: string }> {
  // Delegate to the shared resolver in stripe-service so the account-selection
  // order (tenant-key -> connect -> platform) stays in lockstep across the
  // reconciler and the VIP cancel/refund handlers.
  return stripeService
    .getStripeContextsForTenant(tenant)
    .map((c) => ({ stripe: c.stripe, reqOpts: c.stripeArgs, label: c.label }));
}

async function reconcileForTenant(
  tenant: Pick<Tenant, "id" | "name" | "stripeEnabled" | "stripeSecretKeyEncrypted" | "stripeConnectedAccountId">,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    scanned: 0,
    created: 0,
    skippedNoStripe: 0,
    skippedNoCustomer: 0,
    skippedNoActiveSub: 0,
    errors: [],
  };

  // Find donor IDs with an active recurring donation but NO subscription row.
  // We don't filter by amount here — the autotagger will handle tier matching.
  const orphans = await db
    .select({
      donorId: donations.donorId,
      stripeCustomerId: donorsTable.stripeCustomerId,
      donorName: donorsTable.name,
      donorEmail: donorsTable.email,
    })
    .from(donations)
    .innerJoin(donorsTable, eq(donorsTable.id, donations.donorId))
    .where(and(
      eq(donations.tenantId, tenant.id),
      eq(donations.isRecurring, true),
      eq(donations.recurringStatus, "active"),
      isNotNull(donations.donorId),
      sql`NOT EXISTS (
        SELECT 1 FROM ${subscriptions} s
        WHERE s.tenant_id = ${donations.tenantId}
          AND s.donor_id = ${donations.donorId}
      )`,
    ))
    .groupBy(donations.donorId, donorsTable.stripeCustomerId, donorsTable.name, donorsTable.email);

  result.scanned = orphans.length;
  if (orphans.length === 0) return result;

  const contexts = getTenantStripeContexts(tenant);
  if (contexts.length === 0) {
    result.skippedNoStripe = orphans.length;
    return result;
  }

  for (const orphan of orphans) {
    if (!orphan.stripeCustomerId) {
      result.skippedNoCustomer++;
      continue;
    }
    if (!orphan.donorId) continue;

    try {
      // Try each Stripe context (tenant key → connect → platform direct)
      // until we find an active subscription for this customer.
      let subList: Stripe.ApiList<Stripe.Subscription> | null = null;
      let usedCtx = contexts[0];
      for (const ctx of contexts) {
        try {
          const args: [Stripe.SubscriptionListParams, Stripe.RequestOptions?] = [
            { customer: orphan.stripeCustomerId, status: "active", limit: 5 },
          ];
          if (Object.keys(ctx.reqOpts).length > 0) args.push(ctx.reqOpts);
          const list = await ctx.stripe.subscriptions.list(...args);
          if (list.data.length > 0) {
            subList = list;
            usedCtx = ctx;
            break;
          }
        } catch {
          // Customer not on this account — try next context.
        }
      }

      if (!subList || subList.data.length === 0) {
        result.skippedNoActiveSub++;
        continue;
      }
      const { stripe, reqOpts } = usedCtx;

      for (const sub of subList.data) {
        const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
        const isMonthly = interval === "month";
        const amount = sub.items?.data?.[0]?.price?.unit_amount ?? 0;
        const currency = sub.currency || "usd";

        let vipTierId: string | null = null;
        let vipTierName: string | null = null;
        if (isMonthly && amount > 0) {
          const matched = await pickVipTierForAmount(tenant.id, amount);
          if (matched) {
            vipTierId = matched.id;
            vipTierName = matched.name;
          }
        }

        // Recover wall-of-heroes opt-in & display-name from the original
        // checkout session metadata when available. Defaults to opted-out
        // (privacy-safe) when no session is found.
        let wallOptIn = false;
        let displayName: string | null = null;
        try {
          const sessionArgs: [Stripe.Checkout.SessionListParams, Stripe.RequestOptions?] = [
            { subscription: sub.id, limit: 1 },
          ];
          if (Object.keys(reqOpts).length > 0) sessionArgs.push(reqOpts);
          const sessions = await stripe.checkout.sessions.list(...sessionArgs);
          const meta = sessions.data[0]?.metadata || {};
          wallOptIn = meta.displayOnWallOfHeroes === "true";
          // Prefer the new metadata key; fall back to the legacy alias.
          displayName = meta.displayName || meta.firstNameDisplay || null;
        } catch {
          // Non-fatal — keep defaults.
        }

        const inserted = await db
          .insert(subscriptions)
          .values({
            tenantId: tenant.id,
            donorId: orphan.donorId,
            stripeSubscriptionId: sub.id,
            amount,
            currency,
            interval: interval || "month",
            status: "active",
            vipTierIdSnapshot: vipTierId,
            vipTierNameSnapshot: vipTierName,
            displayOnWallOfHeroes: wallOptIn,
            displayName,
          })
          .onConflictDoNothing({ target: [subscriptions.tenantId, subscriptions.stripeSubscriptionId] })
          .returning({ id: subscriptions.id });

        if (inserted.length > 0) {
          result.created++;
          console.log(
            `[SubReconciler] Created subscription for ${orphan.donorName} <${orphan.donorEmail}>` +
              ` on tenant ${tenant.name}: stripeSub=${sub.id} amount=${(amount / 100).toFixed(2)} ${currency.toUpperCase()}` +
              ` interval=${interval} tier=${vipTierName ?? "—"} wall=${wallOptIn}`,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${orphan.donorEmail || orphan.donorId}: ${message}`);
    }
  }

  return result;
}

export async function reconcileMissingSubscriptions(
  options: { tenantId?: string } = {},
): Promise<{ tenantsProcessed: number; totalCreated: number; results: Array<ReconcileResult & { tenantName: string }> }> {
  const where = options.tenantId
    ? eq(tenantsTable.id, options.tenantId)
    : eq(tenantsTable.isActive, true);

  const tenantList = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      stripeEnabled: tenantsTable.stripeEnabled,
      stripeSecretKeyEncrypted: tenantsTable.stripeSecretKeyEncrypted,
      stripeConnectedAccountId: tenantsTable.stripeConnectedAccountId,
    })
    .from(tenantsTable)
    .where(where);

  let totalCreated = 0;
  const results: Array<ReconcileResult & { tenantName: string }> = [];
  for (const t of tenantList) {
    const r = await reconcileForTenant(t);
    results.push({ ...r, tenantName: t.name });
    totalCreated += r.created;
  }

  return { tenantsProcessed: tenantList.length, totalCreated, results };
}
