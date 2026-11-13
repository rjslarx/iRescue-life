import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { pool, db } from "../server/db";
import { tenants } from "../shared/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "../server/lib/encryption";
import { getAppBaseUrl } from "../server/lib/app-base-url";
import { rescueResaleSchemaSql } from "../server/lib/rescue-resale-schema";
import { recordResaleDelivery, sendResaleSms, reconcileResaleDeliveries } from "../server/services/resale-delivery";
import { twilioDeliveryCallback } from "../server/services/twilio-delivery-callback";
import { handleResaleSms } from "../server/services/rescue-resale";

after(async () => { await pool.end(); });

test("read-only resale reconciliation isolates tenants, throttles failures, and tolerates delayed callbacks",
  { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const tid = randomUUID(), other = randomUUID();
  const account = "AC" + "7".repeat(32);
  const ids: Record<string, string> = {};
  try {
    await pool.query(rescueResaleSchemaSql);
    for (const id of [tid, other]) await db.insert(tenants).values({
      id, name: "Delivery reconciliation test", subdomain: `reconcile-${id}`,
      twilioEnabled: true, twilioPhoneNumber: "+12025550120",
      twilioAccountSidEncrypted: encrypt(account),
      twilioAuthTokenEncrypted: encrypt("test-only-not-a-real-token"),
    });
    for (const [name, status, tenant, hasSid, old] of [
      ["accepted", "accepted", tid, true, true],
      ["timeout", "sent", tid, true, true],
      ["late", "unknown", tid, true, true],
      ["noSid", "unknown", tid, false, true],
      ["other", "accepted", other, true, true],
      ["fresh", "accepted", tid, true, false],
      ["terminal", "delivered", tid, true, true],
      ["mismatch", "accepted", tid, true, true],
    ] as const) {
      ids[name] = randomUUID();
      await pool.query(`INSERT INTO rescue_resale_deliveries(id,tenant_id,recipient,provider_sid,status,updated_at)
        VALUES($1,$2,'buyer',$3,$4,now()-($5::int * interval '1 minute'))`,
      [ids[name], tenant, hasSid ? `SM${ids[name].replaceAll("-", "")}` : null, status, old ? 20 : 0]);
    }
    const sidFor = (name: string) => `SM${ids[name].replaceAll("-", "")}`;
    const read = async (name: string) => (await pool.query(
      "SELECT * FROM rescue_resale_deliveries WHERE id=$1", [ids[name]])).rows[0];
    const lookups: string[] = [];
    const lookup = async (config: any, sid: string) => {
      assert.equal(config.accountSid, account);
      lookups.push(sid);
      if (sid === sidFor("timeout")) throw Object.assign(new Error("provider timeout"), { code: "ETIMEDOUT" });
      if (sid === sidFor("late")) {
        // Callback commits while a slower provider GET still reports sent.
        await recordResaleDelivery(tid, ids.late, sid, "delivered");
        return { sid, accountSid: account, status: "sent", errorCode: null };
      }
      return { sid, accountSid: sid === sidFor("mismatch") ? "AC-wrong" : account,
        status: "undelivered", errorCode: 30003 };
    };
    await reconcileResaleDeliveries(tid, lookup);
    assert.deepEqual(lookups.sort(), ["accepted", "timeout", "late", "mismatch"].map(sidFor).sort());
    assert.equal((await read("accepted")).status, "undelivered");
    assert.equal((await read("accepted")).error_code, "30003");
    assert.equal((await read("timeout")).status, "sent");
    assert.equal((await read("late")).status, "delivered");
    assert.equal((await read("mismatch")).status, "accepted");
    for (const name of ["noSid", "other", "fresh", "terminal"]) assert.equal((await read(name)).status_checked_at, null);
    await reconcileResaleDeliveries(tid, lookup);
    assert.equal(lookups.length, 4, "failed checks must also be throttled");
    // Later callbacks still repair timed-out reads and unknown sends lacking a SID.
    await recordResaleDelivery(tid, ids.timeout, sidFor("timeout"), "delivered");
    await recordResaleDelivery(tid, ids.noSid, sidFor("noSid"), "sent");
    await recordResaleDelivery(tid, ids.accepted, sidFor("accepted"), "queued");
    assert.equal((await read("timeout")).status, "delivered");
    assert.equal((await read("noSid")).provider_sid, sidFor("noSid"));
    assert.equal((await read("accepted")).status, "undelivered");
    assert.equal((await pool.query("SELECT count(*)::int n FROM rescue_resale_deliveries WHERE tenant_id IN ($1,$2)", [tid, other])).rows[0].n, 8,
      "reconciliation must not create sends");
    // Overlapping workers must not read the same batch from Twilio.
    await pool.query(`UPDATE rescue_resale_deliveries SET updated_at=now()-interval '20 minutes',
      status_checked_at=NULL WHERE id=$1`, [ids.mismatch]);
    let concurrentReads = 0;
    const concurrentLookup = async (_config: any, sid: string) => {
      concurrentReads++;
      return { sid, accountSid: account, status: "sent", errorCode: null };
    };
    await Promise.all([reconcileResaleDeliveries(tid, concurrentLookup), reconcileResaleDeliveries(tid, concurrentLookup)]);
    assert.equal(concurrentReads, 1);
  } finally {
    for (const id of [tid, other]) await db.delete(tenants).where(eq(tenants.id, id));
  }
});

test("resale delivery callbacks, send uncertainty and command receipts", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const tid = randomUUID(), iid = randomUUID(), cid = randomUUID(), mid = randomUUID();
  const account = "AC" + "1".repeat(32), token = "resale-test-token-not-a-real-credential";
  const donor = "+12025550101", buyer = "+12025550102", from = "+12025550103";
  try {
    await pool.query(rescueResaleSchemaSql);
    await db.insert(tenants).values({ id: tid, name: "Resale delivery test", subdomain: `delivery-${tid}`,
      twilioEnabled: true, commsPaused: true, twilioPhoneNumber: from,
      twilioAccountSidEncrypted: encrypt(account), twilioAuthTokenEncrypted: encrypt(token) });
    await pool.query("INSERT INTO rescue_resale_items(id,tenant_id,phone,data,status) VALUES($1,$2,$3,'{}','active')", [iid, tid, donor]);
    await pool.query(`INSERT INTO rescue_resale_conversations(id,tenant_id,item_id,buyer_phone,code,offer_cents,offer_status,expires_at)
      VALUES($1,$2,$3,$4,'654321',1500,'pending',now()+interval '2 hours')`, [cid, tid, iid, buyer]);
    await pool.query("INSERT INTO rescue_resale_messages(id,conversation_id,sender,body) VALUES($1,$2,'system','test')", [mid, cid]);
    const input = { tenantId: tid, messageId: mid, recipient: "buyer", number: buyer, body: "test" };
    let deliveryId = "", sid = "SM" + "2".repeat(32), calls = 0;
    const callback = async (status: string, signingToken = token, overrides = {}) => {
      const path = `/api/webhooks/twilio/status?resaleDelivery=${deliveryId}`;
      const body = { MessageSid: sid, MessageStatus: status, AccountSid: account, ErrorCode: "30003", ...overrides };
      let code = 200;
      const req: any = { body, query: { resaleDelivery: deliveryId }, originalUrl: path,
        get: () => twilio.getExpectedTwilioSignature(signingToken, new URL(path, getAppBaseUrl()).toString(), body) };
      const res: any = { status(n: number) { code = n; return this; }, sendStatus(n: number) { code = n; return this; },
        type() { return this; }, send() { return this; } };
      await twilioDeliveryCallback(req, res);
      return code;
    };
    // Callback arrives while the API request is still awaiting its response.
    assert.equal(await sendResaleSms(input, async (_t, number, _b, _type, context) => {
      calls++;
      deliveryId = new URL(context!.statusCallbackUrl!).searchParams.get("resaleDelivery")!;
      assert.equal(await callback("delivered", "wrong-token"), 403);
      assert.equal(await callback("delivered", token, { AccountSid: "AC-wrong" }), 403);
      assert.equal(await callback("delivered"), 200);
      return { number, status: "sent", sid };
    }), "accepted");
    const read = async () => (await pool.query("SELECT * FROM rescue_resale_deliveries WHERE id=$1", [deliveryId])).rows[0];
    assert.equal((await read()).status, "delivered");
    await callback("queued"); await callback("undelivered"); await callback("delivered");
    assert.equal((await read()).status, "delivered");
    await recordResaleDelivery(randomUUID(), deliveryId, sid, "read");
    await recordResaleDelivery(tid, deliveryId, "SM-other", "read");
    assert.equal((await read()).status, "delivered");
    assert.equal(calls, 1);
    assert.equal(await sendResaleSms({ ...input, recipient: "donor" }, async (_t, number) =>
      ({ number, status: "failed", uncertain: true })), "unknown");
    assert.equal(await sendResaleSms(input, async () => { throw new Error("lost response"); }), "unknown");
    assert.equal(await sendResaleSms(input), "not_sent"); // paused: no real SMS
    const statuses = (await pool.query("SELECT status FROM rescue_resale_deliveries WHERE message_id=$1", [mid])).rows.map(r => r.status);
    assert.deepEqual(statuses.sort(), ["delivered", "not_sent", "unknown", "unknown"]);

    // A failed command-result notification must not repeat an already committed offer action.
    const inbound = "SM" + randomUUID();
    await handleResaleSms(donor, from, "R654321 YES", inbound);
    assert.equal((await pool.query("SELECT offer_status FROM rescue_resale_conversations WHERE id=$1", [cid])).rows[0].offer_status, "accepted");
    const before = (await pool.query("SELECT count(*)::int n FROM rescue_resale_deliveries WHERE tenant_id=$1", [tid])).rows[0].n;
    await pool.query("UPDATE rescue_resale_conversations SET offer_status='pending' WHERE id=$1", [cid]);
    await handleResaleSms(donor, from, "R654321 YES", inbound);
    assert.equal((await pool.query("SELECT offer_status FROM rescue_resale_conversations WHERE id=$1", [cid])).rows[0].offer_status, "pending");
    assert.equal((await pool.query("SELECT count(*)::int n FROM rescue_resale_deliveries WHERE tenant_id=$1", [tid])).rows[0].n, before);
    await handleResaleSms(donor, from, "R654321 COUNTER nope", "SM" + randomUUID());
    await handleResaleSms(buyer, from, "R654321 YES", "SM" + randomUUID());
    const failures = (await pool.query(`SELECT d.status FROM rescue_resale_deliveries d JOIN rescue_resale_messages m ON m.id=d.message_id
      WHERE d.tenant_id=$1 AND m.id<>$2`, [tid, mid])).rows;
    assert.equal(failures.length, 4);
    assert.ok(failures.every(r => r.status === "not_sent"));

    const orderId = randomUUID(), orderDelivery = randomUUID();
    await pool.query("INSERT INTO rescue_resale_orders(id,tenant_id,item_id,buyer_phone,data) VALUES($1,$2,$3,$4,'{}')", [orderId, tid, iid, buyer]);
    await pool.query(`INSERT INTO rescue_resale_deliveries(id,tenant_id,order_id,recipient) VALUES($1,$2,$3,'buyer')`, [orderDelivery, tid, orderId]);
    deliveryId = orderDelivery;
    sid = "SM" + "3".repeat(32);
    await recordResaleDelivery(tid, orderDelivery, sid, "sent");
    await pool.query("UPDATE rescue_resale_deliveries SET updated_at=now()-interval '20 minutes' WHERE id=$1", [orderDelivery]);
    await reconcileResaleDeliveries(tid, async (_config, fetchedSid) =>
      ({ sid: fetchedSid, accountSid: account, status: "undelivered", errorCode: 30003 }));
    assert.equal((await pool.query("SELECT status FROM rescue_resale_orders WHERE id=$1", [orderId])).rows[0].status, "checkout");
    assert.equal((await pool.query("SELECT offer_status FROM rescue_resale_conversations WHERE id=$1", [cid])).rows[0].offer_status, "pending");
    assert.equal(await callback("undelivered"), 200);
    await callback("sent");
    assert.equal((await read()).status, "undelivered");
    assert.equal((await read()).error_code, "30003");
    assert.equal((await pool.query("SELECT data->>'buyerNotice' notice FROM rescue_resale_orders WHERE id=$1", [orderId])).rows[0].notice, "undelivered");
  } finally { await db.delete(tenants).where(eq(tenants.id, tid)); }
});
