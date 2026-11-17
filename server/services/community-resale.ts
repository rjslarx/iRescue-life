import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { stripeService } from "../lib/stripe-service";
import { EmailService } from "../lib/email-service";
import { getAppBaseUrl } from "../lib/app-base-url";
import { decrypt } from "../lib/encryption";
import { resaleTenant } from "./rescue-resale";
import { settleResaleSplit } from "./resale-split-settlement";
import { withCommunityOrderLock, communityReleaseBlocked } from "./community-resale-lock";
import { reconcileCommunityRefunds } from "./community-resale-refunds";
import { communityFinanceSnapshot } from "./community-resale-finance";

export const communityBase = () => getAppBaseUrl().replace(/\/$/, "");
export function failCommunity(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export const htmlEscape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export async function communityPartner(tenantId: string, accepting = false) {
  const t = await resaleTenant(tenantId);
  if (!t) failCommunity("Rescue not found", 404);
  const row = (await pool.query("SELECT * FROM community_resale_partners WHERE tenant_id=$1", [tenantId])).rows[0];
  const d = row?.data || {};
  const partner = { tenantId, name: d.publicName || t.name, logoUrl: t.logoUrl, city: d.city || "",
    publicEin: d.publicEin || "", approved: row?.approved === true, optedIn: row?.opted_in === true,
    nonprofitReviewed: d.nonprofitReviewed === true, note: d.note || "",
    allowSplit: d.allowSplit === true, splitMinimumCents: d.splitMinimumCents || 5000 };
  if (accepting && (!partner.approved || !partner.optedIn || !t.stripeEnabled || !t.stripeConnectedAccountId))
    failCommunity("This rescue is not accepting new resale business.", 409);
  return { partner, tenant: t };
}
export async function readyCommunityPartner(tenantId: string) {
  const result = await communityPartner(tenantId, true);
  const stripe = stripeService.getPlatformStripeClient();
  if (!stripe) failCommunity("Payment service is unavailable", 503);
  const account = await stripe.accounts.retrieve(result.tenant.stripeConnectedAccountId!);
  if (account.deleted || !account.charges_enabled || !account.payouts_enabled || account.capabilities?.transfers !== "active")
    failCommunity("The rescue must complete Stripe verification before accepting sales.", 409);
  return result;
}
export async function sendCommunityEmail(tenantId: string, to: string, subject: string, text: string) {
  const service = await EmailService.forTenant(tenantId);
  if (!service) return { success: false, error: "Email is unavailable for this rescue." };
  const html = htmlEscape(text).replace(/https:\/\/[^\s<]+/g, url => `<a href="${url}">${url}</a>`);
  return service.send({ to, subject, text, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${html}</div>` });
}
export async function communityAudit(client: any, tenantId: string, actor: string, action: string, data: any) {
  await client.query("INSERT INTO community_resale_audit(id,tenant_id,actor_id,action,data) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), tenantId, actor, action, data]);
}
export function communityOrderView(r: any, buyer = false, admin = false) {
  const d = r.data, net = r.stripe_fee_cents == null || r.platform_fee_cents == null ? null
    : Math.max(0, d.amountCents - r.stripe_fee_cents - r.platform_fee_cents);
  return { id: r.id, tenantId: r.tenant_id, itemId: r.item_id, itemTitle: d.itemTitle, facebookContactUrl: d.facebookContactUrl, amountCents: d.amountCents,
    status: r.status, createdAt: r.created_at, proceedsMode: d.proceedsMode, disputed: !!d.disputed,
    pickupConfirmedAt: d.pickupConfirmedAt || null, split: d.split || null,
    issue: d.issue || null, pickupHelp: d.pickupHelp || null, finance: d.finance || null,
    refunds: (d.refunds || []).map((f: any) => ({ id: f.id, amountCents: f.amountCents,
      ...(admin ? { reason: f.reason, actor: f.actor } : {}),
      status: f.status, refundId: f.refundId, recoveryStatus: f.recoveryStatus, createdAt: f.createdAt })),
    ...(buyer && ["paid", "completed"].includes(r.status) && !communityReleaseBlocked(r) ? { pickupCode: d.pickupCode } : {}),
    notificationStatus: { buyer: d.buyerNotice || "pending", donor: d.donorNotice || "pending",
      pickupBuyer: d.pickupBuyerNotice || "pending", pickupSeller: d.pickupSellerNotice || "pending",
      proceeds: d.proceedsNotice || "pending" },
    stripeFeeCents: r.stripe_fee_cents, platformFeeCents: r.platform_fee_cents,
    rescueProceedsCents: d.finance?.rescueProceedsCents ?? r.rescue_proceeds_cents, refundedCents: r.refunded_cents,
    netCents: net, contributorShareCents: d.proceedsMode === "split_50" ? d.split?.contributorCents ?? null : 0,
    rescueShareCents: d.proceedsMode === "split_50" ? d.split?.rescueCents ?? null : net,
    ...(admin ? { buyerEmail: r.buyer_email, stripeSessionId: r.session_id, stripePaymentIntentId: r.payment_intent_id,
      rescueTransferId: r.rescue_transfer_id || d.rescueTransferId || null, contributorTransferId: r.contributor_transfer_id || null } : {}) };
}
/** Claim before sending. A crash/unknown provider outcome is never automatically resent. */
export async function notifyCommunityOrder(id: string) {
  const row = (await pool.query(`SELECT o.*,i.seller_email FROM community_resale_orders o
    JOIN community_resale_items i ON i.id=o.item_id WHERE o.id=$1`, [id])).rows[0];
  if (!row || !["paid", "completed"].includes(row.status)) return;
  for (const role of ["buyer", "donor"] as const) {
    const key = `${role}Notice`;
    const claimed = await pool.query(`UPDATE community_resale_orders SET data=jsonb_set(data,ARRAY[$2],'"sending"')
      WHERE id=$1 AND COALESCE(data->>$2,'pending') IN ('pending','not_sent') RETURNING id`, [id, key]);
    if (!claimed.rows.length) continue;
    try {
      const url = role === "buyer"
        ? `${communityBase()}/resale/order/${id}#token=${decrypt(row.data.encryptedOrderToken)}`
        : `${communityBase()}/resale/manage`;
      const result = await sendCommunityEmail(row.tenant_id, role === "buyer" ? row.buyer_email : row.seller_email,
        "Your Acadiana Rescue Resale payment confirmation",
        `Payment confirmed for ${row.data.itemTitle}: $${(row.data.amountCents / 100).toFixed(2)}.\nOrder reference: ${id}\n\nContinue the Messenger conversation you started before payment. Buyer: send this order reference in that conversation so the seller can identify your purchase. Seller contact: ${row.data.facebookContactUrl}\n\nCoordinate a safe public pickup in Messenger. The buyer shares the handoff code only when the item is received; the seller confirms it on the site. Do not share private order links or pickup codes in public posts.\n\nView your ${role === "buyer" ? "order" : "sale (verify your email if asked)"}:\n${url}\n\nThis is a purchase summary, not a charitable tax receipt. Platform and processing fees are deducted within the sale price. A Stripe transfer is not a confirmed bank payout. Update your Facebook post manually when sold.`);
      // The shared provider wrapper may fail after provider acceptance. Do not assume failure means not sent.
      await pool.query("UPDATE community_resale_orders SET data=jsonb_set(data,ARRAY[$2],to_jsonb($3::text)) WHERE id=$1",
        [id, key, result.success ? "accepted" : "unknown"]);
    } catch {
      await pool.query("UPDATE community_resale_orders SET data=jsonb_set(data,ARRAY[$2],'\"unknown\"') WHERE id=$1", [id, key]);
    }
  }
}
/** Authoritative Stripe reconciliation; no state transition trusts a return URL. */
export async function syncCommunityOrder(id: string, tenantId: string) {
  await withCommunityOrderLock(id, async c => {
    await syncCommunityOrderLocked(id, tenantId);
    const o = (await c.query("SELECT * FROM community_resale_orders WHERE id=$1", [id])).rows[0];
    if (o?.data.refunds?.length) {
      await reconcileCommunityRefunds(c, o, stripeService.getPlatformStripeClient(), process.env.REPLIT_DEPLOYMENT === "1");
      await syncCommunityOrderLocked(id, tenantId);
    }
  });
  const row = (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1", [id])).rows[0];
  if (row?.data.proceedsMode === "split_50") await settleResaleSplit(id, tenantId, undefined, "community");
  // Snapshot again after settlement, without nesting the shared lock.
  await withCommunityOrderLock(id, async c => {
    const o = (await c.query("SELECT * FROM community_resale_orders WHERE id=$1", [id])).rows[0];
    if (o?.payment_intent_id) {
      const stripe = stripeService.getPlatformStripeClient()!;
      const pi = await stripe.paymentIntents.retrieve(o.payment_intent_id, { expand: ["latest_charge.balance_transaction"] });
      await communityFinanceSnapshot(c, o, stripe, pi.latest_charge);
    }
  });
  await notifyCommunityOrder(id);
  await (await import("./community-resale-notifications")).notifyCommunityProceeds(id);
  return (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1", [id])).rows[0];
}
async function syncCommunityOrderLocked(id: string, tenantId: string) {
  const stripe = stripeService.getPlatformStripeClient();
  if (!stripe) failCommunity("Stripe is unavailable", 503);
  let r = (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1 AND tenant_id=$2", [id, tenantId])).rows[0];
  if (!r) failCommunity("Order not found", 404);
  if (!r.session_id) {
    if (Date.now() - new Date(r.created_at).getTime() > 31 * 60000) {
      const created = Math.floor(new Date(r.created_at).getTime() / 1000);
      const matches = await stripe.checkout.sessions.list({ created: { gte: created - 5, lte: created + 32 * 60 }, limit: 100 }).autoPagingToArray({ limit: 1000 });
      const found = matches.filter(s => s.metadata?.type === "community_resale" && s.metadata?.resaleOrderId === id && s.metadata?.tenantId === tenantId);
      if (found.length > 1 || matches.length >= 1000) failCommunity("Checkout recovery needs platform review", 409);
      if (found.length) {
        r.session_id = found[0].id;
        await pool.query("UPDATE community_resale_orders SET session_id=$2 WHERE id=$1", [id, r.session_id]);
      } else {
        // Immutable checkout expires in 31 minutes; no new session can now be created with that request.
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const expired = await c.query("UPDATE community_resale_orders SET status='expired' WHERE id=$1 AND status='checkout' AND session_id IS NULL RETURNING item_id", [id]);
          if (expired.rows.length) await c.query("UPDATE community_resale_items SET status='active' WHERE id=$1 AND status='reserved'", [r.item_id]);
          await c.query("COMMIT");
        } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
        return (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1", [id])).rows[0];
      }
    } else {
      const session = await stripe.checkout.sessions.create(r.data.stripeParams, { idempotencyKey: `community-resale-${id}` });
      r.session_id = session.id;
      await pool.query("UPDATE community_resale_orders SET session_id=$2 WHERE id=$1", [id, session.id]);
    }
  }
  const session = await stripe.checkout.sessions.retrieve(r.session_id);
  if (session.metadata?.type !== "community_resale" || session.metadata?.resaleOrderId !== id ||
      session.metadata?.tenantId !== tenantId || session.amount_total !== r.data.amountCents ||
      session.currency !== "usd" || session.mode !== "payment") failCommunity("Payment verification failed", 409);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const current = (await c.query("SELECT * FROM community_resale_orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (session.payment_status === "paid") {
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      await c.query(`UPDATE community_resale_orders SET status=CASE WHEN status='checkout' THEN 'paid' ELSE status END,
        data=CASE WHEN data->>'paidAt' IS NULL THEN jsonb_set(data,'{paidAt}',to_jsonb(now()::text)) ELSE data END,
        payment_intent_id=$2 WHERE id=$1`, [id, pi]);
      await c.query("UPDATE community_resale_items SET status='paid' WHERE id=$1 AND status IN ('active','reserved')", [r.item_id]);
    } else if (session.status === "expired" && current.status === "checkout") {
      await c.query("UPDATE community_resale_orders SET status='expired' WHERE id=$1", [id]);
      await c.query("UPDATE community_resale_items SET status='active' WHERE id=$1 AND status='reserved'", [r.item_id]);
    }
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  if (session.payment_status === "paid" && session.payment_intent) {
    const pi = await stripe.paymentIntents.retrieve(typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id,
      { expand: ["latest_charge.balance_transaction"] });
    const charge: any = pi.latest_charge;
    if (pi.status !== "succeeded" || pi.amount !== r.data.amountCents || pi.currency !== "usd" ||
        pi.metadata?.resaleOrderId !== id || pi.metadata?.tenantId !== tenantId) failCommunity("Charge verification failed", 409);
    const balance = charge?.balance_transaction;
    if (balance && typeof balance === "object") {
      const transfer = charge.transfer ? await stripe.transfers.retrieve(typeof charge.transfer === "string" ? charge.transfer : charge.transfer.id) : null;
      const fee = charge.application_fee ? await stripe.applicationFees.retrieve(typeof charge.application_fee === "string" ? charge.application_fee : charge.application_fee.id) : null;
      const net = transfer && !charge.disputed ? transfer.amount - transfer.amount_reversed - (fee ? fee.amount - fee.amount_refunded : 0) : null;
      await pool.query(`UPDATE community_resale_orders SET stripe_fee_cents=$2,platform_fee_cents=$3,rescue_proceeds_cents=$4,
        refunded_cents=$5,data=data || $7::jsonb,
        status=CASE WHEN $5>=($6::int) THEN 'refunded' WHEN $5>0 THEN 'partially_refunded' ELSE status END WHERE id=$1`,
        [id, balance.fee, r.data.platformRevenueCents, net, charge.amount_refunded || 0, r.data.amountCents,
          JSON.stringify({ disputed: !!charge.disputed, rescueTransferId: transfer?.id || null })]);
    }
  }
  return (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1", [id])).rows[0];
}
export async function reconcileCommunityOrders() {
  const rows = (await pool.query(`SELECT id,tenant_id FROM community_resale_orders
    WHERE (status='checkout' AND created_at<now()-interval '32 minutes')
    OR status IN ('paid','completed','partially_refunded')
    OR status='refunded'
    ORDER BY reconciled_at ASC NULLS FIRST LIMIT 50`)).rows;
  for (const r of rows) {
    try { await syncCommunityOrder(r.id, r.tenant_id); }
    catch { console.warn("[Community resale] Reconciliation deferred"); }
    finally { await pool.query("UPDATE community_resale_orders SET reconciled_at=now() WHERE id=$1", [r.id]); }
  }
  await (await import("./community-resale-notifications")).sendCommunityPickupReminders();
  await (await import("./community-resale-notifications")).sendCommunityStaffAlerts();
}
