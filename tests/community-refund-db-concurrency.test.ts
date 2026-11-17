/**
 * RUN_RESALE_DB_TEST=1 scripts/run-tests.sh tests/community-refund-db-concurrency.test.ts
 * Each test uses a disposable schema and real separate PostgreSQL sessions.
 * Only Stripe is simulated; no application rows or external money are touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, race, type Fixture } from "./helpers/community-refund-db-harness";

const options = { skip: process.env.RUN_RESALE_DB_TEST !== "1", timeout: 25000 };
function succeeded(result: PromiseSettledResult<any>) {
  assert.equal(result.status, "fulfilled", result.status === "rejected" ? String(result.reason) : "");
  return (result as PromiseFulfilledResult<any>).value;
}
function rejected(result: PromiseSettledResult<any>, pattern: RegExp) {
  assert.equal(result.status, "rejected");
  assert.match(String((result as PromiseRejectedResult).reason), pattern);
}
async function noMoney(f: Fixture) {
  assert.deepEqual([f.calls.creates, f.calls.reversals, f.calls.feeRefunds], [0, 0, 0]);
}

for (const competitor of ["request", "settle"] as const) {
  for (const recoveryFirst of [true, false]) {
    test(`real order lock serializes recovery ${recoveryFirst ? "before" : "after"} ${competitor}`, options, async () => {
      const f = await fixture();
      try {
        const actions = recoveryFirst ? [f.recover, f[competitor]] : [f[competitor], f.recover];
        const results = await race(f, actions[0], actions[1], async () => {
          assert.equal((await f.audit()).length, 0, "waiter cannot authorize retirement before lock release");
        });
        results.forEach(succeeded);
        const recovered = succeeded(results[recoveryFirst ? 0 : 1]);
        assert.equal(recovered.retired, true);
        const audit = await f.audit();
        assert.equal(audit.length, 1);
        assert.equal(audit[0].action, "refund_intent_recovered");
        assert.equal(audit[0].data.savedIntent, f.raw);
        assert.equal(audit[0].data.requestId, f.requestId);
        assert.equal(audit[0].tenant_id, f.tenant);
        assert.equal(audit[0].id, recovered.auditId);
        const row = (await f.pool.query("SELECT data FROM community_resale_orders WHERE id=$1", [f.order])).rows[0];
        assert.equal(row.data.refunds.length, 1, "retry cannot reserve another refund");
        assert.equal(row.data.refunds[0].refundId, f.refund.id);
        await noMoney(f);
      } finally { await f.close(); }
    });
  }
}

for (const operation of ["recover", "request"] as const) {
  test(`concurrent wrong-tenant ${operation} cannot read provider or alter another rescue`, options, async () => {
    const f = await fixture();
    try {
      let readsAtRelease = 0;
      const results = await race(f, f.recover, () => f[operation](f.otherTenant), async () => {
        readsAtRelease = f.calls.reads;
        assert.equal(readsAtRelease, 1);
      });
      succeeded(results[0]);
      rejected(results[1], /Order not found/);
      // Successful recovery: two charge reads and two refund reads, no reads by rejected tenant.
      assert.equal(f.calls.reads, readsAtRelease + 3);
      const audit = await f.audit();
      assert.equal(audit.length, 1);
      assert.equal(audit[0].tenant_id, f.tenant);
      await noMoney(f);
    } finally { await f.close(); }
  });
}

for (const scenario of ["pending", "missing", "changed", "wrong identity", "provider unavailable", "partial reversal"] as const) {
  test(`competing recovery never retires ${scenario} provider evidence`, options, async () => {
    const f = await fixture();
    try {
      if (scenario === "pending") f.refund.status = "pending";
      if (scenario === "missing") {
        await f.pool.query(`UPDATE community_resale_orders SET data=jsonb_set(data,'{refunds,0,refund}',$2)
          WHERE id=$1`, [f.order, JSON.stringify({ attemptedAt: "2026-01-01" })]);
        f.state.refundList = () => [];
      }
      if (scenario === "wrong identity") f.refund.metadata.tenantId = f.otherTenant;
      if (scenario === "partial reversal") f.transfers[0].amount_reversed = 1000;
      if (scenario === "provider unavailable") f.state.refundRead = () => { throw Error("Provider unavailable"); };
      if (scenario === "changed") {
        let reads = 0;
        f.state.refundRead = () => ({ ...f.refund, status: ++reads % 2 === 1 ? "succeeded" : "pending" });
      }
      const results = await race(f, f.recover, f.recover);
      results.forEach(r => rejected(r, /unresolved|could not be verified|Provider unavailable/));
      assert.equal((await f.audit()).length, 0, "neither caller receives durable retirement authorization");
      await noMoney(f);
      // Both exception paths must release their session locks.
      const locks = await f.admin.query(`SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
        WHERE a.application_name=$1 AND l.locktype='advisory'`, [f.schema]);
      assert.equal(locks.rows.length, 0);
    } finally { await f.close(); }
  });
}

test("waiting new refund rechecks unresolved state saved by recovery", options, async () => {
  const f = await fixture();
  try {
    const results = await race(f, f.recover, () => f.api.requestCommunityRefund(f.order, f.tenant, "other-staff", {
      requestId: randomUUID(), amountCents: 100, expectedRefundedCents: 2500, reason: "New request",
    }, f.stripe), async () => { f.refund.status = "pending"; });
    results.forEach(r => rejected(r, /unresolved|needs review/));
    assert.equal((await f.audit()).length, 0);
    const row = (await f.pool.query("SELECT data FROM community_resale_orders WHERE id=$1", [f.order])).rows[0];
    assert.equal(row.data.refunds.length, 1);
    assert.equal(row.data.refunds[0].status, "pending");
    await noMoney(f);
  } finally { await f.close(); }
});

test("new refund queued behind recovery reserves once and retry preserves its provider identity", options, async () => {
  const f = await fixture();
  try {
    const nextId = randomUUID();
    const request = () => f.api.requestCommunityRefund(f.order, f.tenant, "second-staff", {
      requestId: nextId, amountCents: 100, expectedRefundedCents: 2500, reason: "Additional refund",
    }, f.stripe);
    const results = await race(f, f.recover, request);
    assert.equal(succeeded(results[0]).retired, true);
    const refunds = succeeded(results[1]);
    assert.equal(refunds.length, 2);
    assert.equal(refunds[1].id, nextId);
    assert.equal(refunds[1].status, "pending");
    await request();
    assert.deepEqual([f.calls.creates, f.calls.reversals, f.calls.feeRefunds], [1, 0, 0]);
    const audit = await f.audit();
    assert.deepEqual(audit.map(a => a.action), ["refund_intent_recovered", "refund_requested"]);
    assert.equal(audit[1].data.id, nextId);
    const row = (await f.pool.query("SELECT data FROM community_resale_orders WHERE id=$1", [f.order])).rows[0];
    assert.equal(row.data.refunds.length, 2);
    assert.equal(row.data.refunds[1].refundId, "re_new");
  } finally { await f.close(); }
});

test("queued new refund rejects a provider balance changed during recovery", options, async () => {
  const f = await fixture();
  try {
    const results = await race(f, f.recover, () => f.api.requestCommunityRefund(f.order, f.tenant, "staff", {
      requestId: randomUUID(), amountCents: 100, expectedRefundedCents: 2500, reason: "Stale balance",
    }, f.stripe), async () => { f.charge.amount_refunded = 3000; });
    succeeded(results[0]);
    rejected(results[1], /Refund balance changed/);
    assert.deepEqual((await f.audit()).map(a => a.action), ["refund_intent_recovered"]);
    await noMoney(f);
  } finally { await f.close(); }
});

test("waiting recovery reads settlement's committed reversal failure, not stale completed state", options, async () => {
  const f = await fixture();
  try {
    const results = await race(f, f.settle, f.recover, async () => { f.transfers[0].amount_reversed = 0; });
    rejected(results[0], /Unexpected reversal/);
    rejected(results[1], /Split refund recovery is still unresolved/);
    const split = (await f.pool.query("SELECT status FROM community_resale_splits WHERE order_id=$1", [f.order])).rows[0];
    assert.equal(split.status, "retry_pending");
    assert.equal((await f.audit()).length, 0);
    assert.equal(f.calls.reversals, 1, "only settlement attempts reversal; recovery never retries it");
    assert.equal(f.calls.creates, 0);
    assert.equal(f.calls.feeRefunds, 0);
  } finally { await f.close(); }
});
