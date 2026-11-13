import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyResaleOffer, parseResaleCommand } from "../server/services/resale-offers";
import { pool, db } from "../server/db";
import { tenants } from "../shared/schema";
import { eq } from "drizzle-orm";
import { rescueResaleSchemaSql } from "../server/lib/rescue-resale-schema";

test("SMS offer commands require exact intent and valid dollar amounts", () => {
  for (const text of ["YES", " accept "]) assert.deepEqual(parseResaleCommand(text), { action: "accept" });
  for (const text of ["no", "DECLINE"]) assert.deepEqual(parseResaleCommand(text), { action: "decline" });
  assert.deepEqual(parseResaleCommand("counter $20.5"), { action: "counter", amountCents: 2050 });
  assert.deepEqual(parseResaleCommand("COUNTER 5000"), { action: "counter", amountCents: 500000 });
  for (const text of ["COUNTER", "COUNTER $0", "COUNTER -20", "COUNTER $5001", "COUNTER $20.001", "YES please"]) {
    assert.ok(parseResaleCommand(text)?.error, text);
  }
  assert.equal(parseResaleCommand("Is this still available?"), null);
});

test("SMS transitions are role-scoped, tenant-scoped, atomic and replay safe", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const tid = randomUUID(), iid = randomUUID(), cid = randomUUID();
  const donor = "+12025550101", buyer = "+12025550102";
  try {
    await pool.query(rescueResaleSchemaSql);
    await db.insert(tenants).values({ id: tid, name: "SMS offer test", subdomain: `sms-offer-${tid}` });
    await pool.query("INSERT INTO rescue_resale_items(id,tenant_id,phone,data,status) VALUES($1,$2,$3,'{}','active')", [iid, tid, donor]);
    await pool.query(`INSERT INTO rescue_resale_conversations(id,tenant_id,item_id,buyer_phone,code,offer_cents,offer_status,expires_at)
      VALUES($1,$2,$3,$4,'123456',1500,'pending',now()+interval '2 hours')`, [cid, tid, iid, buyer]);
    const reset = () => pool.query("UPDATE rescue_resale_conversations SET offer_status='pending',expires_at=now()+interval '2 hours' WHERE id=$1", [cid]);
    await assert.rejects(applyResaleOffer(randomUUID(), cid, donor, { action: "accept" }));
    await assert.rejects(applyResaleOffer(tid, cid, "+12025550103", { action: "accept" }));
    assert.ok((await applyResaleOffer(tid, cid, buyer, { action: "accept" }, `SM${randomUUID()}`)).error);
    const counter = await applyResaleOffer(tid, cid, donor, { action: "counter", amountCents: 2050 }, `SM${randomUUID()}`);
    assert.equal(counter.status, "countered");
    assert.equal(counter.amountCents, 2050);
    assert.ok((await applyResaleOffer(tid, cid, donor, { action: "accept" })).error);
    const sid = `SM${randomUUID()}`;
    assert.equal((await applyResaleOffer(tid, cid, buyer, { action: "accept" }, sid)).status, "accepted");
    await reset();
    assert.equal((await applyResaleOffer(tid, cid, donor, { action: "accept" }, sid)).duplicate, true);
    assert.equal((await pool.query("SELECT offer_status FROM rescue_resale_conversations WHERE id=$1", [cid])).rows[0].offer_status, "pending");
    const concurrent = await Promise.all([
      applyResaleOffer(tid, cid, donor, { action: "accept" }, `SM${randomUUID()}`),
      applyResaleOffer(tid, cid, donor, { action: "decline" }, `SM${randomUUID()}`),
    ]);
    assert.equal(concurrent.filter(x => x.status).length, 1);
    await reset();
    await pool.query("UPDATE rescue_resale_conversations SET expires_at=now()-interval '1 minute' WHERE id=$1", [cid]);
    const rejectedSid = `SM${randomUUID()}`;
    assert.ok((await applyResaleOffer(tid, cid, donor, { action: "accept" }, rejectedSid)).error);
    await reset();
    assert.equal((await applyResaleOffer(tid, cid, donor, { action: "accept" }, rejectedSid)).duplicate, true);
    await pool.query("UPDATE rescue_resale_items SET status='reserved' WHERE id=$1", [iid]);
    assert.ok((await applyResaleOffer(tid, cid, donor, { action: "accept" })).error);
    await pool.query("UPDATE rescue_resale_items SET status='active' WHERE id=$1", [iid]);
    assert.equal((await applyResaleOffer(tid, cid, donor, { action: "decline" })).status, "declined");
  } finally {
    await db.delete(tenants).where(eq(tenants.id, tid));
  }
});
