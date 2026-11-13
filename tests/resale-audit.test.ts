import { test } from "node:test";
import assert from "node:assert/strict";
import { resaleAuditFilter, resaleAuditQuery, resaleAuditOffset, resaleMessageAuditQuery } from "../server/services/resale-audit";

test("audit offsets reject malformed, negative, fractional, array and oversized input", () => {
  for (const value of ["0", "100", "300"]) assert.equal(resaleAuditOffset.parse(value), Number(value));
  for (const value of ["-1", "1.5", "1e2", "", "01", "2147483648", ["100"], {}, "0; DROP TABLE x"]) {
    assert.equal(resaleAuditOffset.safeParse(value).success, false);
  }
});

test("audit filter accepts only supported scalar values", () => {
  for (const status of ["all", "attention", "undelivered", "failed", "not_sent", "unknown"]) {
    assert.equal(resaleAuditFilter.parse(status), status);
  }
  for (const value of ["delivered", "", "' OR true", ["failed"], {}]) {
    assert.equal(resaleAuditFilter.safeParse(value).success, false);
  }
});

test("audit searches complete histories before limits, isolates tenants and summarizes masked outcomes", async () => {
  const { pool } = await import("../server/db");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Connection-local temporary fixtures never touch application records.
    await client.query(`
      CREATE TEMP TABLE rescue_resale_items(id text,tenant_id text,data jsonb) ON COMMIT DROP;
      CREATE TEMP TABLE rescue_resale_conversations(id text,tenant_id text,item_id text,updated_at timestamp) ON COMMIT DROP;
      CREATE TEMP TABLE rescue_resale_messages(id text,conversation_id text,status text) ON COMMIT DROP;
      CREATE TEMP TABLE rescue_resale_deliveries(message_id text,tenant_id text,recipient text,status text) ON COMMIT DROP;
      INSERT INTO rescue_resale_items VALUES ('i','a','{"title":"Test item"}'),('j','b','{}');
      INSERT INTO rescue_resale_conversations SELECT 'c'||n,'a','i',now() FROM generate_series(1,101) n;
      INSERT INTO rescue_resale_conversations VALUES ('old','a','i','2000-01-01'),('foreign','b','j',now());
      INSERT INTO rescue_resale_messages SELECT 'm'||n,'old','tracked' FROM generate_series(1,301) n;
      INSERT INTO rescue_resale_messages VALUES ('legacy','old','failed'),('foreign','foreign','unknown');
      INSERT INTO rescue_resale_deliveries VALUES
        ('m301','a','buyer','undelivered'),('m301','a','donor','delivered'),
        ('m300','a','donor','not_sent'),('m299','a','buyer','unknown'),
        ('m298','a','buyer','failed'),('m297','b','buyer','failed');`);
    const read = async (status: string, tenant = "a", offset = 0) => (await client.query(resaleAuditQuery, [tenant, status, offset])).rows;
    assert.equal((await read("all")).length, 101); // Includes one lookahead row.
    const first = (await read("all")).slice(0, 100);
    const second = await read("all", "a", 100);
    assert.equal(second.length, 2);
    assert.equal(new Set([...first, ...second].map(r => r.id)).size, 102);
    assert.equal(second[1].id, "old");
    assert.equal((await read("all", "a", 200)).length, 0);
    for (const filter of ["attention", "undelivered", "failed", "not_sent", "unknown"]) {
      const rows = await read(filter);
      assert.deepEqual(rows.map(r => r.id), ["old"]);
      assert.equal(rows[0].delivery_summary.length, 5);
      assert.ok(rows[0].delivery_summary.every((s: any) => s.count === 1));
      assert.ok(rows[0].delivery_summary.some((s: any) => s.recipient === "unknown" && s.status === "failed"));
    }
    assert.equal((await read("undelivered", "b")).length, 0);
    assert.equal((await read("unknown", "b"))[0].id, "foreign");
    await client.query(`
      INSERT INTO rescue_resale_messages SELECT 'fail'||n,'c'||n,'failed' FROM generate_series(1,101) n;
      ALTER TABLE rescue_resale_messages ADD COLUMN body text DEFAULT 'Filtered text';
      ALTER TABLE rescue_resale_messages ADD COLUMN sender text DEFAULT 'buyer';
      ALTER TABLE rescue_resale_messages ADD COLUMN created_at timestamp DEFAULT '2026-01-01';
      ALTER TABLE rescue_resale_deliveries ADD COLUMN id text DEFAULT 'delivery';
      ALTER TABLE rescue_resale_deliveries ADD COLUMN error_code text;
      ALTER TABLE rescue_resale_deliveries ADD COLUMN updated_at timestamp DEFAULT now();
      ALTER TABLE rescue_resale_deliveries ADD COLUMN created_at timestamp DEFAULT now();`);
    assert.equal((await read("failed")).length, 101);
    assert.deepEqual((await read("failed", "a", 100)).map(r => r.id), second.map(r => r.id));
    const messages = async (tenant: string, offset: number) =>
      (await client.query(resaleMessageAuditQuery, ["old", tenant, offset])).rows;
    const pageOne = await messages("a", 0);
    const pageTwo = await messages("a", 300);
    assert.equal(pageOne.length, 301);
    assert.equal(pageTwo.length, 2);
    assert.deepEqual(pageOne[300], pageTwo[0]);
    assert.equal((await messages("a", 600)).length, 0);
    assert.equal((await messages("b", 0)).length, 0);
    assert.equal((await messages("b", 300)).length, 0);
    assert.deepEqual(Object.keys(pageTwo[0]).sort(), ["body", "createdAt", "deliveries", "sender", "status"]);
    await client.query("UPDATE rescue_resale_deliveries SET status='delivered' WHERE tenant_id='a' AND status='undelivered'");
    assert.equal((await read("undelivered")).length, 0);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
