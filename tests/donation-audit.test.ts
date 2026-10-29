import { test } from "node:test";
import assert from "node:assert/strict";
import { donationRecorder, donationAuditSchemaSql } from "../server/lib/donation-audit";
import { insertDonationSchema } from "../shared/schema";
import { buildTreasurerReport, treasurerReportCsv } from "../client/src/lib/treasurer-report";
import type { Donation } from "../shared/schema";

test("attribution comes from the staff identity and snapshots the name", () => {
  assert.deepEqual(donationRecorder({id: "staff-id", fullName: " Staff Name "}), {
    recordedByUserId: "staff-id", recordedByName: "Staff Name",
  });
  assert.equal(donationRecorder({id: "staff-id", fullName: ""}).recordedByName, "Staff member");
});

test("public donation schema strips forged audit fields and creation timestamps", () => {
  const result = insertDonationSchema.omit({tenantId: true}).parse({
    donorName: "Donor", donorEmail: "", donationType: "cash", amount: 100,
    recordedByUserId: "00000000-0000-0000-0000-000000000001",
    recordedByName: "Forged Staff", createdAt: new Date("2000-01-01"),
  });
  assert.equal("recordedByUserId" in result, false);
  assert.equal("recordedByName" in result, false);
  assert.equal("createdAt" in result, false);
});

test("CSV separates gift date from entry timestamp and escapes recorder names", () => {
  const donation = {
    id: "test", donorName: "Test", donationType: "cash", amount: 100,
    date: new Date("2026-10-01"), createdAt: new Date("2026-10-15T12:34:56Z"),
    recordedByName: "=Bad formula",
  } as Donation;
  const report = buildTreasurerReport([donation], "2026-10-01", "2026-10-01");
  const csv = treasurerReportCsv(report);
  assert.ok(csv.includes('"Recorded by","Recorded on (UTC)"'));
  assert.ok(csv.includes(`"'=Bad formula","2026-10-15T12:34:56.000Z"`));
});

test("historical reconciliation uses tenant-matched, unambiguous creation evidence", async () => {
  const { pool } = await import("../server/db");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Temporary tables shadow real tables: no real records are changed.
    await client.query(`
      CREATE TEMP TABLE users (id uuid PRIMARY KEY, full_name text) ON COMMIT DROP;
      CREATE TEMP TABLE donations (
        id uuid PRIMARY KEY, tenant_id uuid, source text, created_at timestamp DEFAULT now()
      ) ON COMMIT DROP;
      CREATE TEMP TABLE activity_logs (
        tenant_id uuid, user_id uuid, entity_id text, entity_type text, action text
      ) ON COMMIT DROP;
      INSERT INTO users VALUES
        ('00000000-0000-0000-0000-000000000001','Staff One'),
        ('00000000-0000-0000-0000-000000000002','Staff Two');
      INSERT INTO donations (id,tenant_id,source)
        SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
          '10000000-0000-0000-0000-000000000001'::uuid, 'manual'
        FROM generate_series(1,4) n;
      INSERT INTO activity_logs
        SELECT tenant_id, '00000000-0000-0000-0000-000000000001'::uuid, id::text, 'Donation', 'created'
        FROM donations WHERE id::text IN (
          '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
      INSERT INTO activity_logs
        SELECT tenant_id, '00000000-0000-0000-0000-000000000002'::uuid, id::text, 'Donation', 'created'
        FROM donations WHERE id::text = '00000000-0000-0000-0000-000000000002';
      INSERT INTO activity_logs
        SELECT '20000000-0000-0000-0000-000000000001'::uuid,
          '00000000-0000-0000-0000-000000000001'::uuid, id::text, 'Donation', 'created'
        FROM donations WHERE id::text = '00000000-0000-0000-0000-000000000003';
    `);
    await client.query(donationAuditSchemaSql);
    await client.query(donationAuditSchemaSql);
    const {rows} = await client.query("SELECT recorded_by_name FROM donations ORDER BY id");
    assert.deepEqual(rows.map(r => r.recorded_by_name), ["Staff One", null, null, null]);
    await client.query("UPDATE users SET full_name = 'Renamed Staff'");
    await client.query(donationAuditSchemaSql);
    assert.equal((await client.query("SELECT recorded_by_name FROM donations ORDER BY id")).rows[0].recorded_by_name, "Staff One");
    await client.query("DELETE FROM users");
    const saved = (await client.query("SELECT recorded_by_user_id, recorded_by_name FROM donations ORDER BY id")).rows[0];
    assert.equal(saved.recorded_by_user_id, null);
    assert.equal(saved.recorded_by_name, "Staff One");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
