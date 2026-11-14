import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, db } from "../server/db";
import { tenants } from "../shared/schema";
import { eq } from "drizzle-orm";
import { rescueResaleSchemaSql } from "../server/lib/rescue-resale-schema";
import { splitNetProceeds, settleResaleSplit } from "../server/services/resale-split-settlement";
import { bankAccountReady } from "../server/services/resale-payout-accounts";
import { resaleItemSchema, resaleSettingsSchema, resalePlatformFee } from "../shared/rescue-resale";
import { resaleOrder } from "../server/services/rescue-resale";

test("split defaults, fee math, rounding, and bank verification are conservative", () => {
  assert.equal(resalePlatformFee(10000), 500);
  assert.equal(resalePlatformFee(1700), 85);
  assert.equal(resalePlatformFee(999), 50);
  assert.throws(() => resalePlatformFee(-100));
  assert.equal(resaleSettingsSchema.parse({ pickupOptions: [] }).allowSplit, undefined);
  const item = { donorName: "Test Person", donorEmail: "test@example.com", zip: "70501", title: "Chair",
    description: "A sturdy wooden chair.", category: "Furniture", askingCents: 5000, photos: ["/objects/test"],
    fulfillment: ["shelter_meetup"], consent: true, ownership: true };
  assert.equal(resaleItemSchema.parse(item).proceedsMode, "donate_all");
  assert.equal(resaleItemSchema.safeParse({ ...item, proceedsMode: "split_50" }).success, false);
  assert.equal(resaleItemSchema.safeParse({ ...item, proceedsMode: "split_50", splitConsent: true }).success, true);
  assert.deepEqual(splitNetProceeds(10000, 321, 500), { contributorCents: 4589, rescueCents: 4590 });
  assert.throws(() => splitNetProceeds(100, 1.5, 0));
  assert.equal(bankAccountReady({ capabilities: { transfers: "active" }, payouts_enabled: true,
    external_accounts: { data: [{ object: "card", currency: "usd" }] } }), false);
  const order = { id: "order", status: "paid", data: { proceedsMode: "split_50", pickupCode: "abcdef123456" } };
  assert.equal(resaleOrder(order).pickupCode, undefined);
  assert.equal(resaleOrder(order, true).pickupCode, undefined);
  assert.equal(resaleOrder(order, false, true).pickupCode, "abcdef123456");
});

test("split settlement waits for pickup and funds; prevents duplicate transfers and recovers refunds", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const tid = randomUUID(), iid = randomUUID(), oid = randomUUID();
  const transfers = new Map<string, any>(), keys = new Map<string, any>();
  let failAfterCreate = true, creates = 0, ready = true;
  const balance = { fee: 321, status: "available", available_on: 1 };
  const charge: any = { id: "ch_fake", amount_refunded: 0, disputed: false, balance_transaction: balance };
  const stripe: any = {
    paymentIntents: { retrieve: async () => ({ id: "pi_fake", status: "succeeded", amount: 10000, currency: "usd",
      metadata: { tenantId: tid, resaleOrderId: oid }, latest_charge: charge }) },
    charges: { retrieve: async () => charge },
    accounts: { retrieve: async () => ({ payouts_enabled: ready, capabilities: { transfers: "active" },
      external_accounts: { data: [{ object: "bank_account", currency: "usd", status: "verified" }] } }) },
    transfers: {
      list: () => ({ autoPagingToArray: async () => [...transfers.values()] }),
      retrieve: async (id: string) => transfers.get(id),
      create: async (params: any, opts: any) => {
        if (keys.has(opts.idempotencyKey)) return keys.get(opts.idempotencyKey);
        const t = { ...params, id: `tr_${randomUUID()}`, amount_reversed: 0 };
        creates++; transfers.set(t.id, t); keys.set(opts.idempotencyKey, t);
        if (failAfterCreate) { failAfterCreate = false; throw new Error("lost response"); }
        return t;
      },
      createReversal: async (id: string, params: any, opts: any) => {
        if (!keys.has(opts.idempotencyKey)) {
          transfers.get(id).amount_reversed += params.amount;
          keys.set(opts.idempotencyKey, { id: "reversal" });
        }
        return keys.get(opts.idempotencyKey);
      },
    },
  };
  try {
    await pool.query(rescueResaleSchemaSql);
    await db.insert(tenants).values({ id: tid, name: "Split test", subdomain: `split-${tid}` });
    await pool.query("INSERT INTO rescue_resale_items(id,tenant_id,phone,data,status) VALUES($1,$2,'+12025550101','{}','paid')", [iid, tid]);
    await pool.query(`INSERT INTO rescue_resale_orders(id,tenant_id,item_id,buyer_phone,data,status,payment_intent_id)
      VALUES($1,$2,$3,'+12025550102',$4,'paid','pi_fake')`, [oid, tid, iid,
      { proceedsMode: "split_50", amountCents: 10000, platformRevenueCents: 500, contributorAccountId: "acct_contributor", rescueAccountId: "acct_rescue" }]);
    const status = async () => (await pool.query("SELECT data FROM rescue_resale_splits WHERE order_id=$1", [oid])).rows[0].data;
    await settleResaleSplit(oid, tid, stripe);
    assert.equal((await status()).status, "awaiting_pickup"); assert.equal(creates, 0);
    await settleResaleSplit(oid, randomUUID(), stripe);
    assert.equal(creates, 0, "wrong tenant cannot settle");
    await pool.query(`UPDATE rescue_resale_orders SET data=data || '{"pickupConfirmedAt":"2026-01-01"}'::jsonb WHERE id=$1`, [oid]);
    balance.status = "pending";
    await settleResaleSplit(oid, tid, stripe);
    assert.equal((await status()).status, "awaiting_funds");
    balance.status = "available"; ready = false;
    await settleResaleSplit(oid, tid, stripe);
    assert.equal((await status()).status, "setup_required");
    ready = true;
    await assert.rejects(settleResaleSplit(oid, tid, stripe), /lost response/);
    assert.equal(creates, 1);
    await Promise.all([settleResaleSplit(oid, tid, stripe), settleResaleSplit(oid, tid, stripe)]);
    assert.equal(creates, 2, "lost response plus concurrent retry must produce only two shares");
    const done = await status();
    assert.equal(done.status, "transferred"); assert.equal(done.contributor.amount, 4589); assert.equal(done.rescue.amount, 4590);
    charge.amount_refunded = 10000;
    await settleResaleSplit(oid, tid, stripe);
    await settleResaleSplit(oid, tid, stripe);
    assert.equal((await status()).status, "refunded");
    for (const t of transfers.values()) assert.equal(t.amount_reversed, t.amount);
    assert.equal(creates, 2);
    const record = (await pool.query("SELECT * FROM rescue_resale_orders WHERE id=$1", [oid])).rows[0];
    assert.equal(record.rescue_proceeds_cents, 0);
    assert.equal(record.data.split.contributorTransferredCents, 0);
    charge.amount_refunded = 0;
    await settleResaleSplit(oid, tid, stripe);
    assert.equal((await status()).status, "needs_review", "old recovery cannot automatically re-pay");
    assert.equal(creates, 2);
  } finally {
    await db.delete(tenants).where(eq(tenants.id, tid));
  }
});
