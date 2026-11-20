import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fundraiserConfirmationSql } from "../server/lib/fundraiser-confirmation-schema";

test("all payment paths share the durable transition and staff retry is scoped", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.equal((routes.match(/await reconcileFundraiserConfirmation\(/g) || []).length, 3);
  const legacy = routes.slice(routes.indexOf("app.post('/api/fundraiser-orders/verify-payment'"));
  assert.match(legacy, /session.metadata\?\.tenantId === tenantId/);
  const retry = routes.slice(routes.indexOf("app.post('/api/fundraiser-orders/:id/retry-confirmation'"));
  assert.match(retry, /requireTenant, requireAuth, requireRoleOrPageAccess/);
  assert.match(retry, /tenant_id = \$2 AND status = 'failed'/);
});

test("database failures in email preflight are safely retryable", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const { EmailService } = await import("../server/lib/email-service");
  const options = { to: "buyer@example.test", subject: "Test", html: "<p>Test</p>" };
  let sends = 0;
  const gmail = Object.create(EmailService.prototype);
  gmail.filterSuppressedEmails = async () => ({ filtered: [options.to], suppressed: [] });
  gmail.gmailService = { sendEmail: async () => { sends++; return { success: true }; } };
  gmail.checkGmailQuota = async () => { throw new Error("Database unavailable"); };
  assert.equal((await gmail.sendDurable(options)).retrySafe, true);
  assert.equal(sends, 0);
  const resend = Object.create(EmailService.prototype);
  resend.filterSuppressedEmails = gmail.filterSuppressedEmails;
  resend.checkQuota = async () => { throw new Error("Database unavailable"); };
  assert.equal((await resend.sendDurable(options)).retrySafe, true);
  gmail.filterSuppressedEmails = async () => { throw new Error("Database unavailable"); };
  assert.equal((await gmail.sendDurable(options)).retrySafe, true);
  assert.equal(sends, 0);
});

test("durable delivery races, failures, retries and uncertain outcomes", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const { pool: appPool } = await import("../server/db");
  const { createFundraiserConfirmationService } = await import("../server/services/fundraiser-confirmation");
  const { default: pg } = await import("pg");
  const schema = `fundraiser_delivery_test_${Date.now()}`;
  const pool = new pg.Pool({ ...appPool.options, options: `-c search_path=${schema}` });
  const tenant = randomUUID();
  let sends = 0;
  let factoryFails = false;
  const payloads: any[] = [];
  let outcome: any = { success: true, messageId: "test-message" };
  const { reconcileFundraiserConfirmation: reconcile, dispatchFundraiserConfirmation: dispatch, retryFundraiserConfirmations: sweep } =
    createFundraiserConfirmationService(pool, async () => {
      if (factoryFails) throw new Error("Temporary database failure during setup");
      return {
        sendDurable: async (payload: any) => { sends++; payloads.push(payload); return outcome; },
      } as any;
    });
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE tenants (id uuid PRIMARY KEY);
      CREATE TABLE fundraiser_events (id uuid PRIMARY KEY, tenant_id uuid);
      CREATE TABLE fundraiser_orders (id uuid PRIMARY KEY, event_id uuid, stripe_session_id text,
        payment_status text DEFAULT 'pending', order_number integer DEFAULT 1001,
        customer_email text DEFAULT 'buyer@example.test', quantity integer DEFAULT 2, pickup_time text);
    `);
    await pool.query(fundraiserConfirmationSql);
    await pool.query(fundraiserConfirmationSql);
    const eventId = randomUUID();
    await pool.query("INSERT INTO tenants VALUES ($1)", [tenant]);
    await pool.query("INSERT INTO fundraiser_events VALUES ($1,$2)", [eventId, tenant]);
    const makeOrder = async () => {
      const id = randomUUID();
      await pool.query("INSERT INTO fundraiser_orders (id,event_id,stripe_session_id) VALUES ($1,$2,$3)", [id, eventId, `cs_${id}`]);
      return id;
    };
    const state = async (id: string) => (await pool.query("SELECT * FROM fundraiser_confirmation_deliveries WHERE order_id=$1", [id])).rows[0];
    const confirm = (id: string, tenantId = tenant) => reconcile(id, `cs_${id}`, tenantId, "<Event>", 2500);
    const id = await makeOrder();
    await confirm(id, randomUUID());
    assert.equal(await state(id), undefined);
    await Promise.all(Array.from({ length: 8 }, () => confirm(id)));
    assert.equal(sends, 1);
    assert.equal((await state(id)).status, "sent");
    assert.match((await state(id)).html, /&lt;Event&gt;/);
    await confirm(id);
    await dispatch(id, tenant);
    assert.equal(sends, 1);
    assert.equal((await pool.query("SELECT order_number FROM fundraiser_orders WHERE id=$1", [id])).rows[0].order_number, 1001);

    outcome = { success: false, error: "Provider rejected", retrySafe: true };
    const failed = await makeOrder();
    await confirm(failed);
    assert.equal((await state(failed)).status, "failed");
    await confirm(failed); // backoff respected even by public return
    assert.equal(sends, 2);
    outcome = { success: true, messageId: "retry-message" };
    await pool.query("UPDATE fundraiser_confirmation_deliveries SET next_attempt_at=now() WHERE order_id=$1", [failed]);
    await Promise.all([dispatch(failed, tenant), dispatch(failed, tenant), sweep()]);
    assert.equal(sends, 3);
    assert.equal((await state(failed)).status, "sent");

    outcome = { success: false, error: "Network timeout" };
    const uncertain = await makeOrder();
    await confirm(uncertain);
    assert.equal((await state(uncertain)).status, "review");
    await sweep();
    await confirm(uncertain);
    assert.equal(sends, 4);
    await pool.query("UPDATE fundraiser_confirmation_deliveries SET status='sending', started_at=now()-interval '1 hour' WHERE order_id=$1", [uncertain]);
    await sweep();
    assert.equal((await state(uncertain)).status, "review");
    assert.equal(sends, 4);

    const historical = await makeOrder();
    await pool.query("UPDATE fundraiser_orders SET payment_status='paid' WHERE id=$1", [historical]);
    await confirm(historical);
    assert.equal(await state(historical), undefined);
    assert.equal(sends, 4);

    // An outbox insert failure must roll back the paid transition.
    const rollback = await makeOrder();
    await pool.query("ALTER TABLE fundraiser_confirmation_deliveries ADD CONSTRAINT test_reject CHECK (subject <> 'Order F-1001 confirmed - reject')");
    await assert.rejects(reconcile(rollback, `cs_${rollback}`, tenant, "reject", 2500));
    assert.equal((await pool.query("SELECT payment_status FROM fundraiser_orders WHERE id=$1", [rollback])).rows[0].payment_status, "pending");

    factoryFails = true;
    const setupFailure = await makeOrder();
    await confirm(setupFailure);
    const stored = await state(setupFailure);
    assert.equal(stored.status, "failed");
    assert.equal(sends, 4, "initialization failure must not reach a provider");
    factoryFails = false;
    outcome = { success: true, messageId: "recovered-setup" };
    await pool.query("UPDATE fundraiser_confirmation_deliveries SET next_attempt_at=now() WHERE order_id=$1", [setupFailure]);
    await Promise.all([sweep(), sweep()]);
    assert.equal(sends, 5);
    assert.equal((await state(setupFailure)).status, "sent");
    assert.deepEqual(payloads.at(-1), { to: stored.recipient, subject: stored.subject, html: stored.html });
    await confirm(setupFailure);
    assert.equal(sends, 5);
  } finally {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
    await appPool.end();
  }
});
