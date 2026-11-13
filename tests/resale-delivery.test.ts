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
import { recordResaleDelivery, sendResaleSms } from "../server/services/resale-delivery";
import { twilioDeliveryCallback } from "../server/services/twilio-delivery-callback";
import { handleResaleSms } from "../server/services/rescue-resale";

after(async () => { await pool.end(); });

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
    assert.equal(await callback("undelivered"), 200);
    await callback("sent");
    assert.equal((await read()).status, "undelivered");
    assert.equal((await read()).error_code, "30003");
    assert.equal((await pool.query("SELECT data->>'buyerNotice' notice FROM rescue_resale_orders WHERE id=$1", [orderId])).rows[0].notice, "undelivered");
  } finally { await db.delete(tenants).where(eq(tenants.id, tid)); }
});
