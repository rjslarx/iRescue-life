/**
 * RUN_RESALE_DB_TEST=1 scripts/run-tests.sh tests/resale-sms-webhook-concurrency.test.ts
 *
 * Real PostgreSQL locks, transactions, receipts and relay persistence. Each case
 * owns a random schema, removed in finally; no application tables are modified.
 * The shared harness runs production signed HTTP handlers and services while
 * keeping tenant configuration, encryption, Stripe and ALL outbound SMS mocked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { rescueResaleSchemaSql } from "../server/lib/rescue-resale-schema";
import { compileWebhook, withWebhook, tenants, buyer, donor } from "./helpers/resale-webhook-harness";

// Promise.all alone can pass with effectively sequential handlers. Hold both
// requests immediately before the relevant SQL so they race at the real DB.
function rendezvous() {
  let arrivals = 0;
  let release!: () => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, fail) => { release = resolve; reject = fail; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    get arrivals() { return arrivals; },
    async wait() {
      arrivals++;
      if (arrivals === 1) timer = setTimeout(() => reject(new Error("Concurrent webhook did not reach SQL barrier")), 5000);
      if (arrivals === 2) { clearTimeout(timer); release(); }
      await ready;
    },
    close() { clearTimeout(timer); },
  };
}

for (const scenario of [
  { body: "ACCEPT", status: "accepted", cents: 1500, sends: [buyer, donor], transitions: 1, receipt: "command" },
  { body: "COUNTER $20", status: "countered", cents: 2000, sends: [buyer, donor], transitions: 1, receipt: "command" },
  { body: "DECLINE", status: "declined", cents: 1500, sends: [buyer, donor], transitions: 1, receipt: "command" },
  { body: "YES please", status: "pending", cents: 1500, sends: [donor], transitions: 0, receipt: "rejected" },
  { body: "Is it available?", status: "pending", cents: 1500, sends: [buyer], transitions: 0, receipt: "tracked" },
]) {
  test(`simultaneous signed MessageSid retries persist and notify once: ${scenario.body}`,
    { skip: process.env.RUN_RESALE_DB_TEST !== "1", timeout: 30000 }, async () => {
      assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the opted-in database regression");
      const schema = `resale_sms_${randomUUID().replaceAll("-", "")}`;
      const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL, max: 5,
        options: `-c search_path=${schema} -c statement_timeout=10000`,
      });
      const gate = rendezvous();
      const errors: unknown[] = [];
      const tid = randomUUID(), iid = randomUUID(), cid = randomUUID(), sid = `SM${randomUUID()}`;
      const records = [{ ...tenants[0], id: tid }];
      async function query(target: any, sql: string, params?: any[]) {
        try {
          if (scenario.transitions
            ? sql.includes("FOR UPDATE OF i")
            : sql.includes("INSERT INTO rescue_resale_messages") && params?.includes(sid)) await gate.wait();
          return await target.query(sql, params);
        } catch (error) { errors.push(error); throw error; }
      }
      const persistence = {
        tenants: records,
        pool: {
          query: (sql: string, params?: any[]) => query(pool, sql, params),
          async connect() {
            const client = await pool.connect();
            return { query: (sql: string, params?: any[]) => query(client, sql, params), release: () => client.release() };
          },
        },
      };
      try {
        await admin.query(`CREATE SCHEMA ${schema}`);
        await pool.query("CREATE TABLE tenants (id uuid PRIMARY KEY)");
        await pool.query(rescueResaleSchemaSql);
        // Count committed updates, not just the final state (which could hide
        // two identical transitions). This trigger exists only in this schema.
        await pool.query(`
          CREATE TABLE transitions (conversation_id uuid, status text);
          CREATE FUNCTION record_transition() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            INSERT INTO transitions VALUES (NEW.id, NEW.offer_status);
            RETURN NEW;
          END $$;
          CREATE TRIGGER audit_transition AFTER UPDATE ON rescue_resale_conversations
          FOR EACH ROW EXECUTE FUNCTION record_transition();
        `);
        await pool.query("INSERT INTO tenants VALUES ($1)", [tid]);
        await pool.query("INSERT INTO rescue_resale_items(id,tenant_id,phone,data,status) VALUES($1,$2,$3,'{}','active')", [iid, tid, donor]);
        await pool.query(`INSERT INTO rescue_resale_conversations
          (id,tenant_id,item_id,buyer_phone,code,offer_cents,offer_status,expires_at)
          VALUES($1,$2,$3,$4,'123456',1500,'pending',now()+interval '2 hours')`, [cid, tid, iid, buyer]);
        const code = await compileWebhook();
        await withWebhook(code, async (h, post) => {
          const responses = await Promise.all([0, 1].map(() =>
            post(`R123456 ${scenario.body}`, { params: { MessageSid: sid } })));
          for (const response of responses) {
            assert.equal(response.status, 200);
            assert.match(response.type, /text\/xml/);
            assert.match(response.text, /<Response\s*\/>|<Response><\/Response>/);
          }
          assert.equal(gate.arrivals, 2, "both requests reached the SQL race");
          assert.deepEqual(errors, [], "caught relay errors must not hide failures");
          const receipts = (await pool.query("SELECT * FROM rescue_resale_messages WHERE inbound_sid=$1", [sid])).rows;
          assert.equal(receipts.length, 1);
          assert.equal(receipts[0].conversation_id, cid);
          assert.equal(receipts[0].status, scenario.receipt);
          const changes = (await pool.query("SELECT * FROM transitions")).rows;
          assert.equal(changes.length, scenario.transitions, "exactly one committed offer transition");
          if (changes.length) assert.equal(changes[0].status, scenario.status);
          const [conversation] = (await pool.query("SELECT * FROM rescue_resale_conversations WHERE id=$1", [cid])).rows;
          assert.equal(conversation.offer_status, scenario.status);
          assert.equal(conversation.offer_cents, scenario.cents);
          const messages = (await pool.query("SELECT * FROM rescue_resale_messages")).rows;
          assert.equal(messages.length, scenario.receipt === "tracked" ? 1 : 2, "one receipt plus at most one system relay");
          const deliveries = (await pool.query("SELECT * FROM rescue_resale_deliveries")).rows;
          assert.equal(deliveries.length, scenario.sends.length);
          for (const delivery of deliveries) {
            assert.equal(delivery.tenant_id, tid);
            assert.equal(delivery.status, "accepted");
            assert.ok(messages.some(m => m.id === delivery.message_id && m.status === "tracked"));
          }
          assert.deepEqual(h.sent.map(s => s[1]), scenario.sends, "each intended participant notified exactly once");
          for (const send of h.sent) {
            assert.equal(send[0], tid);
            assert.match(send[2], /Resale R123456:/);
          }
          assert.equal(h.fallback.length, 0);
        }, persistence);
      } finally {
        gate.close();
        await pool.end();
        try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
        finally { await admin.end(); }
      }
    });
}
