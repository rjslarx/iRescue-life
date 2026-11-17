/**
 * RUN_RESALE_DB_TEST=1 scripts/run-tests.sh tests/community-refund-db-transaction.test.ts
 * Real PostgreSQL failures in disposable schemas; all provider calls are fake.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, type Fixture } from "./helpers/community-refund-db-harness";

const options = { skip: process.env.RUN_RESALE_DB_TEST !== "1", timeout: 25000 };

async function snapshot(f: Fixture) {
  return {
    orders: (await f.pool.query("SELECT * FROM community_resale_orders ORDER BY id")).rows,
    splits: (await f.pool.query("SELECT * FROM community_resale_splits ORDER BY order_id")).rows,
    audit: await f.audit(),
  };
}

for (const boundary of ["audit insert", "commit"] as const) {
  test(`refund reservation rolls back on ${boundary} failure and retries exactly once`, options, async () => {
    const f = await fixture();
    try {
      const requestId = randomUUID();
      const input = { requestId, amountCents: 100, expectedRefundedCents: 2500, reason: "Additional refund" };
      const request = () => f.api.requestCommunityRefund(f.order, f.tenant, "second-staff", input, f.stripe);
      const before = await snapshot(f);

      // A deferred constraint trigger raises inside PostgreSQL's actual COMMIT,
      // not a mocked query rejection before COMMIT is sent. The immediate case
      // fails the INSERT after the order UPDATE has run in the same transaction.
      await f.pool.query(`
        CREATE FUNCTION reject_refund_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM community_resale_orders o,
              jsonb_array_elements(o.data->'refunds') op
            WHERE o.id::text = NEW.data->>'orderId' AND op->>'id' = NEW.data->>'id'
          ) THEN
            RAISE EXCEPTION 'Fault did not reach updated reservation';
          END IF;
          ${boundary === "commit" ? `
          IF NOT EXISTS (SELECT 1 FROM community_resale_audit WHERE id = NEW.id) THEN
            RAISE EXCEPTION 'Deferred fault did not reach inserted audit';
          END IF;` : ""}
          RAISE EXCEPTION USING ERRCODE = 'P0001',
            MESSAGE = 'Injected refund reservation ${boundary} failure';
        END $$;
        ${boundary === "commit"
          ? "CREATE CONSTRAINT TRIGGER reject_refund_reservation AFTER INSERT ON community_resale_audit DEFERRABLE INITIALLY DEFERRED"
          : "CREATE TRIGGER reject_refund_reservation BEFORE INSERT ON community_resale_audit"}
        FOR EACH ROW WHEN (NEW.action = 'refund_requested')
        EXECUTE FUNCTION reject_refund_reservation();
      `);

      await assert.rejects(request(), (error: any) => {
        assert.equal(error.code, "P0001", "must be a real PostgreSQL error");
        assert.equal(error.message, `Injected refund reservation ${boundary} failure`);
        return true;
      });
      assert.ok(f.calls.reads > 0, "request reached provider verification");
      assert.deepEqual([f.calls.creates, f.calls.reversals, f.calls.feeRefunds], [0, 0, 0],
        "failed reservation must never mutate the provider");
      assert.deepEqual(await snapshot(f), before,
        "rollback must preserve existing refunds, split state and audit without any partial intent");
      const locks = await f.admin.query(`SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
        WHERE a.application_name=$1 AND l.locktype='advisory'`, [f.schema]);
      assert.equal(locks.rowCount, 0, "failure releases the order lock");

      await f.pool.query("DROP TRIGGER reject_refund_reservation ON community_resale_audit");
      const create = f.stripe.refunds.create;
      let durableChecks = 0;
      f.stripe.refunds.create = async (params: any) => {
        // pool.query uses a separate session while the service holds its client.
        // An uncommitted order or audit record cannot satisfy these assertions.
        const durable = await snapshot(f);
        const order = durable.orders.find(o => o.id === f.order)!;
        const ops = order.data.refunds.filter((op: any) => op.id === requestId);
        assert.equal(ops.length, 1);
        assert.equal(ops[0].amountCents, input.amountCents);
        assert.ok(ops[0].refund.attemptedAt, "mutation attempt must also be durable");
        assert.equal(durable.audit.length, 1);
        assert.equal(durable.audit[0].action, "refund_requested");
        assert.equal(durable.audit[0].tenant_id, f.tenant);
        assert.equal(durable.audit[0].actor_id, "second-staff");
        assert.equal(durable.audit[0].data.id, requestId);
        assert.equal(durable.audit[0].data.orderId, f.order);
        assert.equal(durable.audit[0].data.amountCents, input.amountCents);
        assert.equal(durable.audit[0].data.reason, input.reason);
        durableChecks++;
        return create(params);
      };

      await request();
      assert.equal(durableChecks, 1, "retry sends only after a committed reservation and audit");
      const after = await snapshot(f);
      const refunds = after.orders.find(o => o.id === f.order)!.data.refunds;
      assert.equal(refunds.length, 2);
      assert.deepEqual(refunds[0], {
        ...before.orders[0].data.refunds[0],
        refundId: f.refund.id,
        refund: { id: f.refund.id, amount: 2500, status: "succeeded" },
      }, "successful reconciliation only enriches the existing refund's provider details");
      assert.equal(refunds[1].id, requestId);
      assert.equal(refunds[1].refundId, "re_new");
      assert.equal(refunds[1].status, "pending");
      assert.deepEqual(after.splits, before.splits);

      await request();
      assert.deepEqual(await snapshot(f), after, "replaying the same request preserves its saved identity");
      assert.equal(durableChecks, 1);
      assert.deepEqual([f.calls.creates, f.calls.reversals, f.calls.feeRefunds], [1, 0, 0],
        "safe retry and replay create exactly one refund and no other money movement");
    } finally {
      await f.close();
    }
  });
}
