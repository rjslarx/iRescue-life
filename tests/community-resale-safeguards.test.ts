import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import express from "express";
import { pool, db } from "../server/db";
import { tenants } from "../shared/schema";
import { eq } from "drizzle-orm";
import { communityResaleSchemaSql } from "../server/lib/community-resale-schema";
import { stripeService } from "../server/lib/stripe-service";
import { EmailService } from "../server/lib/email-service";
import { encrypt } from "../server/lib/encryption";
import { hashResale } from "../server/services/rescue-resale";
import { communityCaption } from "../shared/community-resale";
import { requestCommunityRefund, reconcileCommunityRefunds } from "../server/services/community-resale-refunds";
import { updateCommunityPickup } from "../server/services/community-resale-pickup";
import { withCommunityOrderLock } from "../server/services/community-resale-lock";
import { settleResaleSplit } from "../server/services/resale-split-settlement";
import { communityFinanceSnapshot } from "../server/services/community-resale-finance";
import { sendCommunityPickupReminders, notifyCommunityProceeds } from "../server/services/community-resale-notifications";
import { communityOrderView, syncCommunityOrder } from "../server/services/community-resale";
import router from "../server/routes/communityResale";
import { tenantCommunityRouter } from "../server/routes/communityResaleAdmin";

test("link-free caption preserves fee disclosures and excludes the checkout URL", () => {
  const item = { title: "Chair", description: "Wooden chair", askingCents: 5000, zip: "70501" };
  const caption = communityCaption(item, "Rescue", "https://example.com/resale/item/test", true);
  assert.ok(!caption.includes("https://")); assert.match(caption, /5% platform fee/);
  assert.match(caption, /Message me/);
  assert.match(communityCaption(item, "Rescue", "https://example.com/x"), /https:\/\/example.com\/x/);
});

test("refund, recovery, pickup issue serialization, reminder and summary safeguards", {
  skip: process.env.RUN_RESALE_DB_TEST !== "1",
}, async () => {
  const tid = randomUUID(), other = randomUUID(), seller = `s-${tid}@example.com`, buyer = `b-${tid}@example.com`;
  const token = randomBytes(32).toString("hex"), buyerToken = randomBytes(32).toString("hex");
  const oldStripe = stripeService.getPlatformStripeClient, oldEmail = EmailService.forTenant;
  const charges = new Map<string, any>(), intents = new Map<string, any>(), transfers = new Map<string, any>(),
    fees = new Map<string, any>(), refunds = new Map<string, any>(), reversals = new Map<string, any>(),
    feeRefunds = new Map<string, any>(), keys = new Map<string, any>(), sessions = new Map<string, any>();
  let loseRefund = false, failRefundBefore = false, failReversal = false, loseReversal = false;
  let refundCalls = 0, reversalCalls = 0, sent: { subject: string; text: string }[] = [];
  let mailSuccess = true;
  const page = (rows: any[]) => ({ autoPagingToArray: async () => rows });
  const stripe: any = {
    paymentIntents: { retrieve: async (id: string) => intents.get(id) },
    charges: { retrieve: async (id: string) => charges.get(id) },
    checkout: { sessions: { retrieve: async (id: string) => sessions.get(id) } },
    accounts: { retrieve: async (id: string) => ({ id, payouts_enabled: true, charges_enabled: true,
      capabilities: { transfers: "active" }, external_accounts: { data: [{ object: "bank_account", currency: "usd", status: "verified" }] } }) },
    refunds: {
      list: ({ charge }: any) => page([...refunds.values()].filter(r => r.charge === charge)),
      retrieve: async (id: string) => refunds.get(id),
      create: async (p: any, opts: any) => {
        if (keys.has(opts.idempotencyKey)) return keys.get(opts.idempotencyKey);
        refundCalls++;
        if (failRefundBefore) throw new Error("network before request");
        const r = { id: `re_${randomUUID()}`, ...p, status: "succeeded" };
        refunds.set(r.id, r); keys.set(opts.idempotencyKey, r);
        charges.get(p.charge).amount_refunded += p.amount;
        if (loseRefund) { loseRefund = false; throw new Error("lost response"); }
        return r;
      },
    },
    transfers: {
      retrieve: async (id: string) => transfers.get(id),
      list: (p: any) => page([...transfers.values()].filter(t =>
        p.transfer_group ? t.transfer_group === p.transfer_group : t.destination === p.destination)),
      listReversals: (id: string) => page([...reversals.values()].filter(r => r.transfer === id)),
      createReversal: async (id: string, p: any, opts: any) => {
        if (keys.has(opts.idempotencyKey)) return keys.get(opts.idempotencyKey);
        reversalCalls++;
        if (failReversal) throw new Error("insufficient balance");
        const t = transfers.get(id);
        assert.ok(p.amount <= t.amount - t.amount_reversed);
        const r = { id: `trr_${randomUUID()}`, ...p, transfer: id };
        t.amount_reversed += p.amount; reversals.set(r.id, r); keys.set(opts.idempotencyKey, r);
        if (loseReversal) { loseReversal = false; throw new Error("lost reversal response"); }
        return r;
      },
      create: async (p: any, opts: any) => {
        if (keys.has(opts.idempotencyKey)) return keys.get(opts.idempotencyKey);
        const t = { id: `tr_${randomUUID()}`, amount_reversed: 0, ...p };
        transfers.set(t.id, t); keys.set(opts.idempotencyKey, t); return t;
      },
    },
    applicationFees: {
      retrieve: async (id: string) => fees.get(id),
      listRefunds: (id: string) => page([...feeRefunds.values()].filter(f => f.fee === id)),
      createRefund: async (id: string, p: any, opts: any) => {
        if (keys.has(opts.idempotencyKey)) return keys.get(opts.idempotencyKey);
        const f = { id: `fr_${randomUUID()}`, fee: id, ...p };
        fees.get(id).amount_refunded += p.amount; feeRefunds.set(f.id, f); keys.set(opts.idempotencyKey, f); return f;
      },
    },
  };
  const send: any = async (_tid: string, _to: string, subject: string, text: string) => {
    sent.push({ subject, text }); return { success: mailSuccess };
  };
  stripeService.getPlatformStripeClient = () => stripe;
  EmailService.forTenant = async () => ({ send: async (m: any) => send(tid, m.to, m.subject, m.text) }) as any;
  let server: any;
  const row = async (id: string) => (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1", [id])).rows[0];
  const snapshot = async (id: string) => withCommunityOrderLock(id, async c => {
    const o = await row(id); return communityFinanceSnapshot(c, o, stripe, intents.get(o.payment_intent_id).latest_charge);
  });
  const reconcile = async (id: string) => withCommunityOrderLock(id, async c =>
    reconcileCommunityRefunds(c, await row(id), stripe, true));
  async function seed(split = false) {
    const id = randomUUID(), item = randomUUID(), piId = `pi_${id}`, chId = `ch_${id}`, trId = `tr_${id}`, feeId = `fee_${id}`;
    const charge = { id: chId, amount: 10000, amount_refunded: 0, disputed: false,
      balance_transaction: { fee: 320, status: "available", available_on: 0 },
      ...(split ? {} : { transfer: trId, application_fee: feeId }) };
    const metadata = { type: "community_resale", resaleOrderId: id, tenantId: tid };
    charges.set(chId, charge);
    intents.set(piId, { id: piId, amount: 10000, currency: "usd", status: "succeeded", metadata, latest_charge: charge });
    if (!split) {
      transfers.set(trId, { id: trId, amount: 10000, amount_reversed: 0, destination: "acct_rescue", created: 0 });
      fees.set(feeId, { id: feeId, amount: 820, amount_refunded: 0 });
    }
    const data = { itemTitle: "Safeguard test chair", amountCents: 10000, platformRevenueCents: 500,
      proceedsMode: split ? "split_50" : "donate_all", rescueAccountId: "acct_rescue", contributorAccountId: "acct_seller",
      pickupCode: "123456abcdef", encryptedOrderToken: encrypt(buyerToken),
      buyerNotice: "accepted", donorNotice: "accepted", paidAt: new Date(Date.now() - 25 * 3600000).toISOString() };
    await pool.query("INSERT INTO community_resale_items(id,tenant_id,seller_email,data,status) VALUES($1,$2,$3,'{}','paid')", [item, tid, seller]);
    await pool.query(`INSERT INTO community_resale_orders(id,tenant_id,item_id,buyer_email,token_hash,data,status,payment_intent_id,session_id,stripe_fee_cents,platform_fee_cents)
      VALUES($1,$2,$3,$4,$5,$6,'paid',$7,$8,320,500)`, [id, tid, item, buyer, hashResale(id + buyerToken), data, piId, `cs_${id}`]);
    sessions.set(`cs_${id}`, { metadata, amount_total: 10000, currency: "usd", mode: "payment",
      payment_status: "paid", status: "complete", payment_intent: piId });
    return id;
  }
  const refund = (id: string, amountCents: number, expectedRefundedCents = 0, requestId = randomUUID()) =>
    requestCommunityRefund(id, tid, "test-admin", { requestId, amountCents, expectedRefundedCents, reason: "Buyer could not collect item" }, stripe);
  try {
    await pool.query(communityResaleSchemaSql);
    await db.insert(tenants).values([{ id: tid, name: "Safeguard test", subdomain: `safe-${tid}` },
      { id: other, name: "Other safeguard", subdomain: `safe-${other}` }]);
    await pool.query("INSERT INTO community_resale_auth(id,email,code_hash,token_hash,expires_at) VALUES($1,$2,'used',$3,now()+interval '1 day')",
      [randomUUID(), seller, hashResale(token)]);
    const app = express(); app.use(express.json());
    app.use((req: any, _res, next) => {
      Object.defineProperty(req, "ip", { value: `127.0.0.${Math.floor(Math.random() * 200) + 1}` });
      req.tenant = { id: req.get("other") ? other : tid };
      if (req.get("admin")) req.user = { id: "test-admin", tenantId: req.tenant.id, roles: [req.get("role") || "admin"], activeRole: req.get("role") || "admin" };
      next();
    });
    app.use("/public", router); app.use("/admin", tenantCommunityRouter);
    server = app.listen(0);
    const call = (p: string, body: any, h: any = {}) => fetch(`http://127.0.0.1:${server.address().port}${p}`, {
      method: "POST", headers: { "content-type": "application/json", "X-Community-Token": token, ...h }, body: JSON.stringify(body),
    });
    const id = await seed(), requestId = randomUUID();
    await Promise.all([refund(id, 4000, 0, requestId), refund(id, 4000, 0, requestId)]);
    assert.equal(refundCalls, 1); assert.equal(reversalCalls, 1);
    let f = await snapshot(id);
    assert.equal(f.buyerRefundedCents, 4000); assert.equal(f.applicationFeeRefundedCents, 328);
    assert.equal(f.transferReversedCents, 4000); assert.equal(f.rescueProceedsCents, 5508);
    await assert.rejects(refund(id, 7000, 4000), /exceeds/);
    await assert.rejects(refund(id, 100, 0), /balance changed/);
    await refund(id, 6000, 4000); f = await snapshot(id);
    assert.equal(f.buyerRefundedCents, 10000); assert.equal(f.platformExposureCents, 320);
    assert.equal(f.rescueProceedsCents, 0);

    const lost = await seed(); loseRefund = true;
    await refund(lost, 10000); assert.equal((await row(lost)).data.refunds[0].status, "needs_review");
    const count = refundCalls;
    await reconcile(lost); await reconcile(lost);
    assert.equal(refundCalls, count); assert.equal((await row(lost)).data.refunds[0].status, "succeeded");
    const unknown = await seed(); failRefundBefore = true;
    await refund(unknown, 10000); failRefundBefore = false;
    const unknownCount = refundCalls;
    await reconcile(unknown);
    assert.equal(refundCalls, unknownCount, "unconfirmed mutation must not be repeated");
    await assert.rejects(refund(unknown, 10000), /existing refund/);

    const failedRecovery = await seed(); failReversal = true;
    await refund(failedRecovery, 10000); failReversal = false;
    f = await snapshot(failedRecovery);
    assert.equal(f.buyerRefundedCents, 10000); assert.equal(f.unrecoveredCents, 10000);
    assert.equal(f.recoveryStatus, "needs_review"); assert.ok(f.platformExposureCents > 0);
    const lostReversal = await seed(); loseReversal = true;
    await refund(lostReversal, 10000); const reversalCount = reversalCalls;
    await reconcile(lostReversal);
    assert.equal(reversalCalls, reversalCount); assert.equal((await row(lostReversal)).data.refunds[0].recoveryStatus, "recovered");

    const pickup = await seed(true);
    let r = await call(`/public/orders/${pickup}/pickup-help`, { description: "We handed over the chair but forgot the code." });
    assert.equal(r.status, 200);
    await updateCommunityPickup(pickup, tid, "buyer", "issue", { description: "The chair was not received." });
    const open = (await row(pickup)).data;
    assert.equal((await call(`/admin/orders/${pickup}/confirm-handoff`, { requestId: open.pickupHelp.id,
      reason: "Reviewed the evidence", evidence: "Seller and buyer messages" }, { admin: "1", role: "staff" })).status, 403);
    assert.equal((await call(`/admin/orders/${pickup}/resolve-issue`, { issueId: open.issue.id,
      reason: "Reviewed the evidence", evidence: "Seller and buyer messages" }, { admin: "1", other: "1" })).status, 404);
    await assert.rejects(updateCommunityPickup(pickup, tid, "staff", "staff_handoff", {
      requestId: open.pickupHelp.id, reason: "Verified the pickup", evidence: "Both participants confirmed" }), /blocked/);
    await settleResaleSplit(pickup, tid, stripe, "community");
    assert.equal((await row(pickup)).data.split.status, "on_hold");
    await updateCommunityPickup(pickup, tid, "admin", "resolve_issue", { issueId: open.issue.id,
      reason: "Buyer confirmed receipt", evidence: "Both parties confirmed via Messenger" });
    await updateCommunityPickup(pickup, tid, "admin", "staff_handoff", { requestId: open.pickupHelp.id,
      reason: "Buyer confirmed receipt", evidence: "Both parties confirmed via Messenger" });
    await settleResaleSplit(pickup, tid, stripe, "community");
    assert.equal((await row(pickup)).data.split.status, "transferred");
    await refund(pickup, 2000);
    await settleResaleSplit(pickup, tid, stripe, "community");
    f = await snapshot(pickup); assert.equal(f.unrecoveredCents, 0);
    assert.equal((await row(pickup)).data.split.status, "needs_review");
    await settleResaleSplit(pickup, tid, stripe, "community");
    assert.equal((await row(pickup)).data.split.rescueTransferredCents, 0);

    const beforePickup = await seed(true);
    await refund(beforePickup, 10000); await settleResaleSplit(beforePickup, tid, stripe, "community");
    assert.equal((await row(beforePickup)).data.split.status, "refunded");
    assert.equal((await snapshot(beforePickup)).unrecoveredCents, 0);

    const reminder = await seed(); await snapshot(reminder);
    // Isolate reminder candidates to this test's own eligible order.
    await pool.query(`UPDATE community_resale_orders SET data=data || '{"pickupBuyerNotice":"accepted","pickupSellerNotice":"accepted"}'
      WHERE tenant_id=$1 AND id<>$2`, [tid, reminder]);
    const start = sent.length;
    await Promise.all([sendCommunityPickupReminders(send, true, tid), sendCommunityPickupReminders(send, true, tid)]);
    assert.equal(sent.length - start, 2);
    assert.ok(sent.slice(start).every(s => s.text.includes("no automatic payout deadline")));
    await notifyCommunityProceeds(reminder, send); await notifyCommunityProceeds(reminder, send);
    assert.equal(sent.filter(s => s.subject === "Your resale proceeds summary").length, 1);
    assert.match(sent.at(-1)!.text, /Rescue share: \$91.80/);
    assert.match(sent.at(-1)!.text, /not a charitable tax receipt/);
    const blocked = await seed();
    await updateCommunityPickup(blocked, tid, "buyer", "issue", { description: "This is still missing" });
    const blockedStart = sent.length;
    await sendCommunityPickupReminders(send, true, tid); assert.equal(sent.length, blockedStart);
    const uncertainMail = await seed(); mailSuccess = false;
    await sendCommunityPickupReminders(send, true, tid); const uncertainCount = sent.length;
    await sendCommunityPickupReminders(send, true, tid); assert.equal(sent.length, uncertainCount);
    assert.equal((await row(uncertainMail)).data.pickupBuyerNotice, "unknown");

    // A reported problem and settlement use the same database lock.
    const race = await seed(true);
    await updateCommunityPickup(race, tid, "seller", "code_handoff", { code: "123456abcdef" });
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const hold = withCommunityOrderLock(race, async c => {
      await c.query(`UPDATE community_resale_orders SET data=jsonb_set(data,'{issue}',$2::jsonb) WHERE id=$1`,
        [race, JSON.stringify({ id: randomUUID(), status: "open", description: "Buyer reported issue" })]);
      entered(); await gate;
    });
    await ready;
    const settlement = settleResaleSplit(race, tid, stripe, "community");
    release(); await hold; await settlement;
    assert.equal((await row(race)).data.split.status, "on_hold");
    assert.equal(communityOrderView(await row(race), true).pickupCode, undefined);
    assert.equal((await call(`/admin/orders/${race}/refund`, { requestId: randomUUID(), amountCents: 100,
      expectedRefundedCents: 0, reason: "Refund requested" }, { admin: "1", role: "staff" })).status, 403);
    // End-to-end reconciliation sees known fees and preserves issue state.
    await syncCommunityOrder(race, tid);
    assert.equal((await row(race)).data.issue.status, "open");
    const waiting = await seed(true);
    await settleResaleSplit(waiting, tid, stripe, "community");
    assert.equal((await row(waiting)).data.split.status, "awaiting_pickup", "elapsed time cannot release funds");
    await updateCommunityPickup(waiting, tid, "seller", "code_handoff", { code: "123456abcdef" });
    charges.get(`ch_${waiting}`).balance_transaction.status = "pending";
    await settleResaleSplit(waiting, tid, stripe, "community");
    assert.equal((await row(waiting)).data.split.status, "awaiting_funds");
    const disputed = await seed(true);
    charges.get(`ch_${disputed}`).disputed = true;
    await assert.rejects(refund(disputed, 1000), /dispute/);
    await assert.rejects(updateCommunityPickup(disputed, tid, "seller", "code_handoff", { code: "123456abcdef" }), /dispute/);
    const externalPending = await seed(true);
    refunds.set("external_pending", { id: "external_pending", charge: `ch_${externalPending}`, status: "pending", amount: 100 });
    await assert.rejects(refund(externalPending, 1000), /existing refund/);
    await assert.rejects(updateCommunityPickup(externalPending, tid, "seller", "code_handoff", { code: "123456abcdef" }), /refund/);
    await settleResaleSplit(externalPending, tid, stripe, "community");
    assert.equal((await row(externalPending)).data.split.status, "on_hold");
    const recent = await seed();
    await pool.query(`UPDATE community_resale_orders SET data=jsonb_set(data,'{paidAt}',to_jsonb(now()::text)) WHERE id=$1`, [recent]);
    // Mark other test candidates as reminded to isolate the new-payment check.
    await pool.query(`UPDATE community_resale_orders SET data=data || '{"pickupBuyerNotice":"accepted","pickupSellerNotice":"accepted"}'
      WHERE tenant_id=$1 AND id<>$2`, [tid, recent]);
    const beforeRecent = sent.length;
    await sendCommunityPickupReminders(send, true, tid);
    assert.equal(sent.length, beforeRecent);
    if (process.env.REPLIT_DEPLOYMENT !== "1")
      await assert.rejects(requestCommunityRefund(recent, tid, "admin", { requestId: randomUUID(), amountCents: 100,
        expectedRefundedCents: 0, reason: "Testing dev guard" }), /published app/);
  } finally {
    stripeService.getPlatformStripeClient = oldStripe; EmailService.forTenant = oldEmail;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    for (const table of ["community_resale_splits", "community_resale_orders", "community_resale_items", "community_resale_audit", "community_resale_partners"])
      await pool.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`, [[tid, other]]);
    await pool.query("DELETE FROM community_resale_auth WHERE email=$1", [seller]);
    await db.delete(tenants).where(eq(tenants.id, tid)); await db.delete(tenants).where(eq(tenants.id, other));
    await pool.end();
  }
});
