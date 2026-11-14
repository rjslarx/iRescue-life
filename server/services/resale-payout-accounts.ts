import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { stripeService } from "../lib/stripe-service";

export function bankAccountReady(account: any): boolean {
  return !account.deleted && account.capabilities?.transfers === "active" &&
    account.payouts_enabled === true && !account.requirements?.disabled_reason &&
    account.external_accounts?.data?.some((a: any) => a.object === "bank_account" && a.currency === "usd" &&
      a.default_for_currency !== false && !["errored", "verification_failed"].includes(a.status));
}
export async function payoutAccount(tenantId: string, phone: string) {
  return (await pool.query("SELECT * FROM rescue_resale_payout_accounts WHERE tenant_id=$1 AND phone=$2", [tenantId, phone])).rows[0];
}
export async function requirePayoutAccount(tenantId: string, phone: string) {
  const row = await payoutAccount(tenantId, phone);
  const stripe = stripeService.getPlatformStripeClient();
  if (!stripe || !row?.stripe_account_id) throw Object.assign(new Error("Complete Stripe bank payout setup before using 50/50."), { status: 409 });
  const account = await stripe.accounts.retrieve(row.stripe_account_id);
  if (!bankAccountReady(account)) throw Object.assign(new Error("Finish Stripe verification and add a USD bank account before using 50/50."), { status: 409 });
  return row.stripe_account_id as string;
}

export async function createPayoutAccount(tenantId: string, phone: string) {
  const stripe = stripeService.getPlatformStripeClient();
  if (!stripe) throw new Error("Stripe unavailable");
  await pool.query(`INSERT INTO rescue_resale_payout_accounts(id,tenant_id,phone) VALUES($1,$2,$3)
    ON CONFLICT(tenant_id,phone) DO NOTHING`, [randomUUID(), tenantId, phone]);
  const row = await payoutAccount(tenantId, phone);
  if (row.stripe_account_id) return row.stripe_account_id as string;
  // Never risk creating a duplicate connected account after Stripe's key expires.
  if (Date.now() - new Date(row.created_at).getTime() > 23 * 3600000)
    throw Object.assign(new Error("Bank setup needs platform support to recover an unfinished Stripe connection."), { status: 409 });
  const account = await stripe.accounts.create({
    type: "express", country: "US", business_type: "individual",
    capabilities: { transfers: { requested: true } },
    business_profile: { product_description: "Sale of personally owned secondhand goods through Rescue Resale." },
    settings: { payouts: { schedule: { interval: "daily" } } },
    metadata: { type: "resale_contributor", tenantId, resalePayoutAccountId: row.id },
  }, { idempotencyKey: `resale-account-${row.id}` });
  await pool.query("UPDATE rescue_resale_payout_accounts SET stripe_account_id=$2 WHERE id=$1 AND stripe_account_id IS NULL", [row.id, account.id]);
  return account.id;
}

export async function payoutAccountView(tenantId: string, phone: string) {
  const row = await payoutAccount(tenantId, phone);
  if (!row?.stripe_account_id) return { exists: false, ready: false, status: "not_started", requirements: [], bankPayouts: [] };
  const stripe = stripeService.getPlatformStripeClient();
  if (!stripe) throw new Error("Stripe unavailable");
  const account = await stripe.accounts.retrieve(row.stripe_account_id);
  const payouts = await stripe.payouts.list({ limit: 10 }, { stripeAccount: row.stripe_account_id });
  return { exists: true, ready: bankAccountReady(account), status: bankAccountReady(account) ? "ready" : "setup_required",
    requirements: account.requirements?.currently_due || [],
    bankPayouts: payouts.data.map(p => ({ id: p.id, status: p.status, amountCents: p.amount, arrivalDate: p.arrival_date })) };
}
