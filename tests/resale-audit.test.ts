import { test } from "node:test";
import assert from "node:assert/strict";
import { resaleAuditFilter, resaleAuditQuery } from "../server/services/resale-audit";

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
    const read = async (status: string, tenant = "a") => (await client.query(resaleAuditQuery, [tenant, status])).rows;
    assert.equal((await read("all")).length, 100);
    for (const filter of ["attention", "undelivered", "failed", "not_sent", "unknown"]) {
      const rows = await read(filter);
      assert.deepEqual(rows.map(r => r.id), ["old"]);
      assert.equal(rows[0].delivery_summary.length, 5);
      assert.ok(rows[0].delivery_summary.every((s: any) => s.count === 1));
      assert.ok(rows[0].delivery_summary.some((s: any) => s.recipient === "unknown" && s.status === "failed"));
    }
    assert.equal((await read("undelivered", "b")).length, 0);
    assert.equal((await read("unknown", "b"))[0].id, "foreign");
    await client.query("UPDATE rescue_resale_deliveries SET status='delivered' WHERE tenant_id='a' AND status='undelivered'");
    assert.equal((await read("undelivered")).length, 0);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
