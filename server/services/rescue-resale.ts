import { randomUUID, createHash } from "node:crypto";
import { pool } from "../db";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isTwilioEnabled } from "../lib/twilio-service";
import { stripeService } from "../lib/stripe-service";
import { getAppBaseUrl } from "../lib/app-base-url";
import { resaleMessageAllowed } from "@shared/rescue-resale";
import { settleResaleSplit } from "./resale-split-settlement";
import { applyResaleOffer, parseResaleCommand } from "./resale-offers";
import { sendResaleSms } from "./resale-delivery";

export const hashResale = (s: string) => createHash("sha256").update(s).digest("hex");
export async function resaleTenant(id: string) {
  return (await db.select().from(tenants).where(eq(tenants.id, id)).limit(1))[0];
}
export function resaleBase(t: any) {
  if ((process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production") && t.customDomain && t.customDomainVerified) return `https://${t.customDomain}`;
  return `${getAppBaseUrl().replace(/\/$/, "")}/${t.subdomain}`;
}
export function resalePublicItem(r: any) {
  const d = r.data;
  return { id: r.id, title: d.title, description: d.description, category: d.category, zip: d.zip,
    askingCents: d.askingCents, photos: d.photos, fulfillment: d.fulfillment, status: r.status, createdAt: r.created_at,
    proceedsMode: d.proceedsMode || "donate_all" };
}
export function resaleOrder(r: any, admin = false, buyer = false) {
  return { id: r.id, itemTitle: r.data.itemTitle, amountCents: r.data.amountCents,
    status: r.status, pickup: r.data.pickup, createdAt: r.created_at,
    proceedsMode: r.data.proceedsMode || "donate_all", split: r.data.split || null,
    pickupConfirmedAt: r.data.pickupConfirmedAt || null,
    ...(buyer && ["paid","completed"].includes(r.status) && r.data.proceedsMode === "split_50" ? { pickupCode: r.data.pickupCode } : {}),
    notificationStatus: { buyer: r.data.buyerNotice || "pending", donor: r.data.donorNotice || "pending" },
    ...(admin ? { buyerPhone: r.buyer_phone, stripeSessionId: r.session_id, stripePaymentIntentId: r.payment_intent_id,
      stripeFeeCents: r.stripe_fee_cents, platformFeeCents: r.platform_fee_cents,
      rescueProceedsCents: r.rescue_proceeds_cents, refundedCents: r.refunded_cents } : {}) };
}
export async function resaleSettings(tenantId: string) {
  const { rows } = await pool.query("SELECT data FROM rescue_resale_settings WHERE tenant_id=$1", [tenantId]);
  return { pickupOptions: [], allowSplit: false, ...rows[0]?.data };
}
export async function resaleConversation(id: string, tenantId: string) {
  return (await pool.query(`SELECT c.*, i.phone AS donor_phone,i.data->>'title' AS item_title,i.status AS item_status
    FROM rescue_resale_conversations c JOIN rescue_resale_items i ON i.id=c.item_id
    WHERE c.id=$1 AND c.tenant_id=$2`, [id, tenantId])).rows[0];
}
export async function sendResaleMessage(tenantId: string, conversationId: string, sender: string, body: string, inboundSid?: string, replyTo?: string) {
  const c = await resaleConversation(conversationId, tenantId);
  if (!c) throw new Error("Conversation not found");
  const blocked = sender !== "system" && !resaleMessageAllowed(body);
  const id = randomUUID();
  const client = await pool.connect();
  let admitted = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    if (sender !== "system") {
      // Cross-process serialization for this sender only. Count in a separate
      // statement after the lock so it sees the previous admission's commit.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify(["resale-message-admission", tenantId, c.id, sender])]);
      const recent = (await client.query("SELECT count(*)::int n FROM rescue_resale_messages WHERE conversation_id=$1 AND sender=$2 AND created_at>now()-interval '1 hour'", [c.id, sender])).rows[0].n;
      if (recent >= 30) throw new Error("Too many messages in this conversation. Please try again later.");
    }
    const { rows } = await client.query(`INSERT INTO rescue_resale_messages(id,conversation_id,sender,body,status,inbound_sid)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(inbound_sid) DO NOTHING RETURNING id`,
    [id, c.id, sender, blocked ? "[Blocked: contact details, external payment request, or message length]" : body,
      blocked ? "blocked" : "sending", inboundSid || null]);
    admitted = rows.length > 0;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (!admitted) return;
  if (blocked) throw new Error("Please remove contact details, links, addresses, and outside payment instructions. Use up to 1,000 characters.");
  const recipients = replyTo ? [replyTo] : sender === "system" ? [c.buyer_phone, c.donor_phone] :
    [sender === "buyer" ? c.donor_phone : c.buyer_phone];
  let failed = false;
  for (const number of recipients) {
    const status = await sendResaleSms({ tenantId, messageId: id,
      recipient: number === c.buyer_phone ? "buyer" : "donor", number,
      body: `Resale R${c.code}: ${body}\nReply R${c.code} followed by your message. Do not share contact details. Reply STOP to unsubscribe.`,
      bypassQuietHours: sender !== "system" || !!replyTo });
    if (status !== "accepted") failed = true;
  }
  await pool.query("UPDATE rescue_resale_messages SET status=$2 WHERE id=$1", [id, "tracked"]);
  if (failed) throw new Error("Saved, but one or more texts failed or have an unknown outcome. Do not resend; check My activity or contact the rescue.");
}

/** Called only after existing Twilio signature validation; explicit R prefix avoids stealing foster replies. */
export async function handleResaleSms(from: string, to: string, body: string, sid: string) {
  const match = body.match(/^\s*R(\d{6})\s+([\s\S]+)$/i);
  if (!match) return false;
  const t = (await db.select().from(tenants).where(eq(tenants.twilioPhoneNumber, to)).limit(1))[0];
  if (!t || !await isTwilioEnabled(t.id)) return false;
  const c = (await pool.query(`SELECT c.*,i.phone AS donor_phone FROM rescue_resale_conversations c
    JOIN rescue_resale_items i ON i.id=c.item_id WHERE c.tenant_id=$1 AND c.code=$2
    AND (c.buyer_phone=$3 OR i.phone=$3) AND i.status IN ('active','reserved','paid','completed')`,
  [t.id, match[1], from])).rows[0];
  if (!c) return true;
  try {
    const command = parseResaleCommand(match[2]);
    if (command) {
      if ("error" in command) {
        // Deduplicate malformed commands too, without relaying them to the other party.
        const inserted = await pool.query(`INSERT INTO rescue_resale_messages
          (id,conversation_id,sender,body,status,inbound_sid) VALUES($1,$2,$3,'Invalid SMS offer command','rejected',$4)
          ON CONFLICT(inbound_sid) DO NOTHING RETURNING id`,
        [randomUUID(), c.id, from === c.buyer_phone ? "buyer" : "donor", sid]);
        if (inserted.rows.length) await sendResaleMessage(t.id, c.id, "system", `${command.error} Prefix your reply with R${c.code}.`, undefined, from);
        return true;
      }
      const result = await applyResaleOffer(t.id, c.id, from, command, sid);
      if (result.duplicate) return true;
      if (result.error) {
        await sendResaleMessage(t.id, c.id, "system", `${result.error} ${resaleBase(t)}/rescue-resale .`, undefined, from);
        return true;
      }
      await sendResaleMessage(t.id, c.id, "system",
        `Offer ${result.status} at $${(result.amountCents! / 100).toFixed(2)}. ${result.status === "countered" ? `Buyer: reply R${c.code} ACCEPT or R${c.code} NO. ` : ""}Review My activity: ${resaleBase(t)}/rescue-resale . Acceptance is not payment or a reservation. Choose pickup and pay through checkout within two hours, subject to availability.`);
      return true;
    }
    await sendResaleMessage(t.id, c.id, from === c.buyer_phone ? "buyer" : "donor", match[2].trim(), sid);
  } catch (error) {
    // Do not relay a blocked message. Existing audit shows failures; avoid webhook retry spam.
    console.warn("[Resale] Inbound relay not delivered");
  }
  return true;
}

/** Every entry point verifies the actual Stripe session before changing sale state. */
export async function syncResaleOrder(id: string, tenantId: string) {
  let r = (await pool.query("SELECT * FROM rescue_resale_orders WHERE id=$1 AND tenant_id=$2", [id, tenantId])).rows[0];
  if (!r) throw new Error("Order not found");
  const stripe = stripeService.getPlatformStripeClient();
  if (!stripe) throw new Error("Stripe is unavailable");
  if (!r.session_id) {
    if (Date.now() - new Date(r.created_at).getTime() > 31 * 60000) {
      // Never recreate an old request after Stripe's idempotency retention window.
      const created = Math.floor(new Date(r.created_at).getTime() / 1000);
      const matches = await stripe.checkout.sessions.list({ created: { gte: created - 5, lte: created + 32 * 60 }, limit: 100 }).autoPagingToArray({ limit: 1000 });
      const recovered = matches.find(s => s.metadata?.resaleOrderId === r.id && s.metadata?.tenantId === tenantId);
      if (recovered) {
        await pool.query("UPDATE rescue_resale_orders SET session_id=$2 WHERE id=$1", [id, recovered.id]);
        r.session_id = recovered.id;
      } else {
        if (matches.length >= 1000) throw new Error("Checkout recovery needs staff review");
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const released = await client.query("UPDATE rescue_resale_orders SET status='expired' WHERE id=$1 AND session_id IS NULL AND status='checkout' RETURNING item_id", [id]);
          if (released.rows.length) await client.query("UPDATE rescue_resale_items SET status='active' WHERE id=$1 AND status='reserved'", [r.item_id]);
          await client.query("COMMIT");
        } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
        return (await pool.query("SELECT * FROM rescue_resale_orders WHERE id=$1", [id])).rows[0];
      }
    }
  }
  if (!r.session_id) {
    // Persisted immutable request + idempotency key repairs a lost Stripe response.
    const session = await stripe.checkout.sessions.create(r.data.stripeParams, { idempotencyKey: `resale-${r.id}` });
    await pool.query("UPDATE rescue_resale_orders SET session_id=$2 WHERE id=$1", [id, session.id]);
    r.session_id = session.id;
  }
  const session = await stripe.checkout.sessions.retrieve(r.session_id);
  if (session.metadata?.type !== "rescue_resale" || session.metadata?.resaleOrderId !== r.id ||
    session.metadata?.tenantId !== tenantId || session.amount_total !== r.data.amountCents ||
    session.currency !== "usd" || session.mode !== "payment") throw new Error("Sale verification failed");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = (await client.query("SELECT * FROM rescue_resale_orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (session.payment_status === "paid") {
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      await client.query("UPDATE rescue_resale_orders SET status=CASE WHEN status='checkout' THEN 'paid' ELSE status END,payment_intent_id=$2 WHERE id=$1", [id, pi]);
      await client.query("UPDATE rescue_resale_items SET status=CASE WHEN status='completed' THEN status ELSE 'paid' END WHERE id=$1 AND status IN ('active','reserved','paid','completed')", [r.item_id]);
      if (r.data.conversationId) await client.query("UPDATE rescue_resale_conversations SET offer_status='paid' WHERE id=$1", [r.data.conversationId]);
    } else if (session.status === "expired" && current.status === "checkout") {
      await client.query("UPDATE rescue_resale_orders SET status='expired' WHERE id=$1", [id]);
      await client.query("UPDATE rescue_resale_items SET status='active' WHERE id=$1 AND status='reserved'", [r.item_id]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  if (session.payment_status === "paid" && session.payment_intent) {
    const pi = await stripe.paymentIntents.retrieve(typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id, { expand: ["latest_charge.balance_transaction"] });
    const charge = pi.latest_charge as any;
    const balance = charge?.balance_transaction;
    if (charge && balance && typeof balance === "object") {
      const refunded = charge.amount_refunded || 0;
      // Amount returned to rescue can differ after manual reversals; do not invent a net figure.
      const transfer = charge.transfer ? await stripe.transfers.retrieve(typeof charge.transfer === "string" ? charge.transfer : charge.transfer.id) : null;
      const applicationFee = charge.application_fee ? await stripe.applicationFees.retrieve(typeof charge.application_fee === "string" ? charge.application_fee : charge.application_fee.id) : null;
      const feeRemaining = applicationFee ? applicationFee.amount - applicationFee.amount_refunded : 0;
      // Dispute adjustments can use separate transfers. Let the treasurer reconcile
      // those in Stripe rather than mislabel the original transfer as current net.
      const actualRescue = transfer && !charge.disputed ? transfer.amount - transfer.amount_reversed - feeRemaining : null;
      await pool.query(`UPDATE rescue_resale_orders SET stripe_fee_cents=$2,platform_fee_cents=$3,rescue_proceeds_cents=$4,
        refunded_cents=$5,status=CASE WHEN $5>=($6::int) THEN 'refunded' WHEN $5>0 THEN 'partially_refunded' ELSE status END WHERE id=$1`,
      [id, balance.fee, Number(pi.metadata.iRescueRevenueCents || 0), actualRescue, refunded, r.data.amountCents]);
    }
  }
  if (session.payment_status === "paid") {
    const t = await resaleTenant(tenantId);
    const donor = (await pool.query("SELECT phone FROM rescue_resale_items WHERE id=$1", [r.item_id])).rows[0];
    if (t && donor && await isTwilioEnabled(tenantId)) {
      const pickup = r.data.pickup;
      for (const [key, number] of [["buyerNotice", r.buyer_phone], ["donorNotice", donor.phone]]) {
        const claim = await pool.query(`UPDATE rescue_resale_orders SET data=jsonb_set(data,ARRAY[$2],'"sending"'::jsonb)
          WHERE id=$1 AND COALESCE(data->>$2,'pending') IN ('pending','not_sent') AND status IN ('paid','completed') RETURNING id`, [id, key]);
        if (!claim.rows.length) continue;
        try {
          const time = new Date(pickup.startsAt).toLocaleString("en-US", { timeZone: t.timezone || "America/Chicago", timeZoneName: "short" });
          const status = await sendResaleSms({ tenantId, orderId: id, recipient: key === "buyerNotice" ? "buyer" : "donor", number,
            body: `Rescue Resale payment confirmed for ${r.data.itemTitle}. Pickup: ${pickup.label}, ${pickup.address}, ${time}. Keep the item until the scheduled handoff. Details: ${resaleBase(t)}/rescue-resale . Reply STOP to unsubscribe.` });
          await pool.query("UPDATE rescue_resale_orders SET data=jsonb_set(data,ARRAY[$2],to_jsonb($3::text)) WHERE id=$1 AND data->>$2='sending'", [id, key, status]);
        } catch {
          // Unknown provider outcome: leave 'sending' for staff review, not an automatic duplicate send.
          console.warn("[Resale] Pickup notification outcome needs review");
        }
      }
    }
  }
  if (r.data.proceedsMode === "split_50" && session.payment_status === "paid") {
    await settleResaleSplit(id, tenantId);
  }
  return (await pool.query("SELECT * FROM rescue_resale_orders WHERE id=$1", [id])).rows[0];
}

export async function reconcileResaleOrders() {
  const { rows } = await pool.query(`SELECT id,tenant_id FROM rescue_resale_orders
    WHERE (status='checkout' AND created_at<now()-interval '32 minutes')
      OR status IN ('paid','partially_refunded','completed')
      OR (status='refunded' AND data->>'proceedsMode'='split_50' AND COALESCE(data->'split'->>'status','')<>'refunded')
    ORDER BY reconciled_at ASC NULLS FIRST LIMIT 50`);
  for (const r of rows) {
    try { await syncResaleOrder(r.id, r.tenant_id); }
    catch { console.warn("[Resale] Sale reconciliation will retry on the next run"); }
    finally { await pool.query("UPDATE rescue_resale_orders SET reconciled_at=now() WHERE id=$1", [r.id]); }
  }
}
