import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import express from "express";
import { pool, db } from "../server/db";
import { tenants } from "../shared/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "../server/lib/encryption";
import { rescueResaleSchemaSql } from "../server/lib/rescue-resale-schema";
import { hashResale } from "../server/services/rescue-resale";
import { stripeService } from "../server/lib/stripe-service";
import router from "../server/routes/rescueResale";

test("resale tenant isolation, phone ownership, approval, single-item holds and exact private prices", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const tid = randomUUID(), disabled = randomUUID(), image = `/objects/resale-test-${randomUUID()}`;
  const original = stripeService.getPlatformStripeClient;
  const sessions = new Map<string, any>();
  const stripe: any = { checkout: { sessions: {
    create: async (params: any, opts: any) => {
      if (sessions.has(opts.idempotencyKey)) return sessions.get(opts.idempotencyKey);
      const s = { id: `cs_test_${randomUUID()}`, url: "https://checkout.stripe.com/test",
        mode: params.mode, currency: "usd", amount_total: params.line_items[0].price_data.unit_amount,
        metadata: params.metadata, status: "open", payment_status: "unpaid" };
      sessions.set(opts.idempotencyKey, s); sessions.set(s.id, s); return s;
    },
    retrieve: async (id: string) => sessions.get(id),
    expire: async (id: string) => { sessions.get(id).status = "expired"; return sessions.get(id); },
  } } };
  stripeService.getPlatformStripeClient = () => stripe;
  stripe.accounts = { retrieve: async () => ({ id: "acct_contributor", payouts_enabled: true,
    capabilities: { transfers: "active" }, external_accounts: { data: [{ object: "bank_account", currency: "usd", status: "verified" }] } }) };
  stripe.paymentIntents = { retrieve: async (id: string) => {
    const s: any = [...sessions.values()].find(s => s.payment_intent === id);
    return { id, status: "succeeded", amount: s.amount_total, currency: "usd", metadata: s.metadata,
      latest_charge: { id: "ch_fake", amount_refunded: 0, balance_transaction: { fee: 100, status: "available", available_on: 1 } } };
  } };
  let server: any;
  try {
    await pool.query(rescueResaleSchemaSql);
    await db.insert(tenants).values([
      { id: tid, name: "Resale Test", subdomain: `resale-${tid}`, twilioEnabled: true,
        twilioAccountSidEncrypted: encrypt("AC_TEST_NOT_REAL"), twilioAuthTokenEncrypted: encrypt("NOT_REAL"),
        twilioPhoneNumber: "+12025550199", stripeEnabled: true, stripeConnectedAccountId: "acct_test_not_real" },
      { id: disabled, name: "Disabled Resale Test", subdomain: `resale-${disabled}` },
    ]);
    const tokens: string[] = [];
    for (const phone of ["+12025550101","+12025550102","+12025550103"]) {
      const token = randomBytes(32).toString("hex"); tokens.push(token);
      await pool.query("INSERT INTO rescue_resale_auth(id,tenant_id,phone,code_hash,token_hash,expires_at) VALUES($1,$2,$3,'used',$4,now()+interval '1 day')",
        [randomUUID(), tid, phone, hashResale(token)]);
    }
    await pool.query("INSERT INTO rescue_resale_images(url,tenant_id,phone) VALUES($1,$2,$3)", [image, tid, "+12025550101"]);
    let testIp = "127.0.0.1";
    const app = express(); app.use(express.json());
    app.use((req: any, _res, next) => {
      Object.defineProperty(req, "ip", { value: testIp });
      req.tenant = { id: req.get("test-disabled") ? disabled : tid };
      if (req.get("test-admin")) req.user = { id: randomUUID(), tenantId: tid, roles: ["admin"], activeRole: "admin" };
      if (req.get("test-staff")) req.user = { id: randomUUID(), tenantId: tid, roles: ["staff"], activeRole: "staff" };
      next();
    });
    app.use(router);
    server = app.listen(0);
    const url = `http://127.0.0.1:${server.address().port}`;
    const call = (path: string, method = "GET", body?: any, token?: string, headers: any = {}) =>
      fetch(url + path, { method, headers: { "content-type": "application/json", ...(token ? { "X-Resale-Token": token } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await call("/config")).status, 200);
    assert.equal((await (await call("/config")).json()).allowSplit, false);
    assert.equal((await call("/admin/settings","PUT",{pickupOptions:[],allowSplit:true},undefined,{"test-staff":"1"})).status,403);
    assert.equal((await call("/admin/settings","PUT",{pickupOptions:[],allowSplit:true},undefined,{"test-admin":"1"})).status,200);
    assert.equal((await call("/admin/settings","PUT",{pickupOptions:[]},undefined,{"test-staff":"1"})).status,200);
    assert.equal((await (await call("/config")).json()).allowSplit,true,"pickup edits preserve split setting");
    assert.equal((await call("/admin/settings","PUT",{pickupOptions:[],allowSplit:false},undefined,{"test-admin":"1"})).status,200);
    assert.equal((await (await call("/config","GET",undefined,undefined,{"test-disabled":"1"})).json()).enabled, false);
    assert.equal((await call("/items","GET",undefined,undefined,{"test-disabled":"1"})).status, 403);
    assert.equal((await call("/admin")).status, 401);
    assert.equal((await call("/me")).status, 401);
    const challenge = randomUUID();
    await pool.query("INSERT INTO rescue_resale_auth(id,tenant_id,phone,code_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
      [challenge,tid,"+12025550108",hashResale(`${challenge}:123456`)]);
    assert.equal((await call("/auth/verify","POST",{challengeId:challenge,code:"000000"})).status,401);
    const verified = await call("/auth/verify","POST",{challengeId:challenge,code:"123456"});
    assert.equal(verified.status,200);
    assert.equal((await call("/auth/verify","POST",{challengeId:challenge,code:"123456"})).status,401,"code is single-use");
    const newToken = (await verified.json()).token;
    assert.equal((await call("/me","GET",undefined,newToken)).status,200);
    assert.equal((await call("/me","GET",undefined,newToken,{"test-disabled":"1"})).status,403);
    const item = { donorName: "Test donor", donorEmail: "resale@example.com", zip: "70501", title: "Test chair",
      description: "A sturdy used chair in good condition.", category: "Furniture", askingCents: 2500, minCents: 1500, photos: [image],
      fulfillment: ["shelter_meetup"], consent: true, ownership: true };
    const submitted = await call("/items", "POST", item, tokens[0]);
    assert.equal((await call("/items","POST",{...item,proceedsMode:"split_50",splitConsent:true},tokens[0])).status,403);
    assert.equal(submitted.status, 200, await submitted.clone().text());
    const id = (await submitted.json()).id;
    assert.equal((await (await call("/items")).json()).items.length, 0);
    assert.equal((await call(`/admin/items/${id}/review`, "POST", { status: "active", note: "Checked" }, undefined, { "test-admin":"1" })).status, 200);
    const listed = (await (await call("/items")).json()).items[0];
    assert.equal(listed.id, id);
    for (const privateField of ["phone","donorPhone","donorName","donorEmail","minCents"]) assert.equal(listed[privateField], undefined);
    const pickup = { id: randomUUID(), label: "Test shelter", kind: "shelter_meetup", address: "Approved test pickup",
      startsAt: new Date(Date.now()+86400000).toISOString(), endsAt: new Date(Date.now()+90000000).toISOString() };
    assert.equal((await call("/admin/settings","PUT",{pickupOptions:[pickup]},undefined,{"test-admin":"1"})).status, 200);
    const cart = { itemId: id, pickupId: pickup.id };
    assert.equal((await call("/checkout","POST",cart,tokens[0])).status, 409, "owner cannot buy own item");
    const races = await Promise.all([call("/checkout","POST",cart,tokens[1]), call("/checkout","POST",cart,tokens[2])]);
    assert.deepEqual(races.map(r=>r.status).sort(), [200,409]);
    const winner = races[0].status===200 ? 1 : 2;
    const order = (await (await call("/me","GET",undefined,tokens[winner])).json()).orders[0];
    assert.equal(order.amountCents,2500);
    assert.equal((await call(`/orders/${order.id}`,"GET",undefined,tokens[0])).status,404);
    assert.equal((await call(`/orders/${order.id}/cancel`,"POST",{},tokens[winner])).status,200);
    assert.equal((await (await call("/items")).json()).items.length,1);
    const conv = randomUUID();
    await pool.query(`INSERT INTO rescue_resale_conversations(id,tenant_id,item_id,buyer_phone,code,offer_cents,offer_status,expires_at)
      VALUES($1,$2,$3,$4,'123456',1700,'accepted',now()+interval '2 hours')`, [conv,tid,id,"+12025550102"]);
    assert.equal((await call("/checkout","POST",{...cart,conversationId:conv},tokens[2])).status,409);
    assert.equal((await call("/checkout","POST",{...cart,conversationId:conv},tokens[1])).status,200);
    const negotiated = (await (await call("/me","GET",undefined,tokens[1])).json()).orders.find((o:any)=>o.status==="checkout");
    assert.equal(negotiated.amountCents,1700);
    const cs:any = [...sessions.values()].find(s=>s.metadata.resaleOrderId===negotiated.id);
    assert.equal(cs.amount_total,1700);
    const saved = (await pool.query("SELECT data FROM rescue_resale_orders WHERE id=$1",[negotiated.id])).rows[0].data;
    assert.equal(saved.stripeParams.line_items[0].price_data.unit_amount,1700);
    assert.equal(saved.stripeParams.payment_intent_data.transfer_data.destination,"acct_test_not_real");
    assert.ok(saved.stripeParams.payment_intent_data.application_fee_amount>0);
    assert.ok(saved.stripeParams.payment_intent_data.application_fee_amount<1700,"fees deducted within price");
    assert.equal((await call(`/admin/orders/${negotiated.id}/complete`,"POST",{},undefined,{"test-admin":"1"})).status,409,"unpaid cannot complete");
    assert.equal((await call(`/orders/${negotiated.id}/cancel`,"POST",{},tokens[1])).status,200);
    const csv = await call("/admin/ledger.csv","GET",undefined,undefined,{"test-admin":"1"});
    assert.equal(csv.status,200);
    assert.match(await csv.text(),/17.00/);
    // New split listings require explicit admin permission and a verified payout account.
    testIp = "127.0.0.2";
    await call("/admin/settings","PUT",{pickupOptions:[pickup],allowSplit:true},undefined,{"test-admin":"1"});
    assert.equal((await call("/items","POST",{...item,proceedsMode:"split_50",splitConsent:true},tokens[0])).status,409);
    await pool.query("INSERT INTO rescue_resale_payout_accounts(id,tenant_id,phone,stripe_account_id) VALUES($1,$2,$3,'acct_contributor')", [randomUUID(),tid,"+12025550101"]);
    const splitResponse = await call("/items","POST",{...item,proceedsMode:"split_50",splitConsent:true},tokens[0]);
    assert.equal(splitResponse.status,200);
    const splitId = (await splitResponse.json()).id;
    assert.equal((await call(`/admin/items/${splitId}/review`,"POST",{status:"active"},undefined,{"test-admin":"1"})).status,200);
    await call("/admin/settings","PUT",{pickupOptions:[pickup],allowSplit:false},undefined,{"test-admin":"1"});
    assert.equal((await call("/checkout","POST",{itemId:splitId,pickupId:pickup.id},tokens[1])).status,409);
    await call("/admin/settings","PUT",{pickupOptions:[pickup],allowSplit:true},undefined,{"test-admin":"1"});
    assert.equal((await call("/checkout","POST",{itemId:splitId,pickupId:pickup.id},tokens[1])).status,200);
    const splitOrder = (await pool.query("SELECT * FROM rescue_resale_orders WHERE item_id=$1",[splitId])).rows[0];
    assert.equal(splitOrder.data.stripeParams.payment_intent_data.transfer_data,undefined);
    assert.equal(splitOrder.data.stripeParams.payment_intent_data.application_fee_amount,undefined);
    assert.equal(splitOrder.data.contributorAccountId,"acct_contributor");
    const splitSession = sessions.get(splitOrder.session_id);
    splitSession.status="complete"; splitSession.payment_status="paid"; splitSession.payment_intent="pi_split_fake";
    // Prevent test-only notification side effects while verifying real paid-state logic.
    await pool.query(`UPDATE rescue_resale_orders SET data=data || '{"buyerNotice":"sent","donorNotice":"sent"}'::jsonb WHERE id=$1`,[splitOrder.id]);
    const buyerView = await call(`/orders/${splitOrder.id}`,"GET",undefined,tokens[1]);
    assert.equal(buyerView.status,200,await buyerView.clone().text());
    const code=(await buyerView.json()).pickupCode;
    assert.match(code,/^[a-f0-9]{12}$/);
    const sellerView=(await (await call("/me","GET",undefined,tokens[0])).json()).sales[0];
    assert.equal(sellerView.pickupCode,undefined);
    assert.equal((await call(`/orders/${splitOrder.id}/confirm-pickup`,"POST",{code},tokens[2])).status,404);
    assert.equal((await call(`/orders/${splitOrder.id}/confirm-pickup`,"POST",{code:"000000000000"},tokens[0])).status,409);
    // Disabling new splits does not strand an existing paid sale.
    await call("/admin/settings","PUT",{pickupOptions:[pickup],allowSplit:false},undefined,{"test-admin":"1"});
    assert.equal((await call(`/orders/${splitOrder.id}/confirm-pickup`,"POST",{code},tokens[0])).status,200);
    const confirmed=(await pool.query("SELECT * FROM rescue_resale_orders WHERE id=$1",[splitOrder.id])).rows[0];
    assert.equal(confirmed.status,"completed");
    assert.ok(confirmed.data.pickupConfirmedAt);
    assert.equal(confirmed.data.split.status,"awaiting_deployment","workspace must never transfer real funds");
  } finally {
    stripeService.getPlatformStripeClient = original;
    server?.close();
    await db.delete(tenants).where(eq(tenants.id,tid));
    await db.delete(tenants).where(eq(tenants.id,disabled));
    await pool.end();
  }
});
