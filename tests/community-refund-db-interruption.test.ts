/**
 * RUN_RESALE_DB_TEST=1 scripts/run-tests.sh tests/community-refund-db-interruption.test.ts
 * Real PostgreSQL, disposable schemas, and fake Stripe only. Termination is
 * restricted to a live client owned by the fixture, never application sessions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, gate, blocked } from "./helpers/community-refund-db-harness";

const options = { skip: process.env.RUN_RESALE_DB_TEST !== "1", timeout: 25000 };

for (const outcome of ["unknown", "eventually visible"] as const) {
  test(`terminated refund worker preserves evidence when provider outcome is ${outcome}`, options, async () => {
    const f = await fixture();
    const barrier = gate();
    let worker: Promise<PromiseSettledResult<any>[]> | undefined;
    let waiter: Promise<PromiseSettledResult<any>[]> | undefined;
    try {
      const requestId = randomUUID();
      const input = { requestId, amountCents: 100, expectedRefundedCents: 2500, reason: "Interrupted refund" };
      const request = () => f.api.requestCommunityRefund(f.order, f.tenant, "staff", input, f.stripe);
      let providerResult: any;
      f.state.afterRefundCreate = async (result, opts) => {
        assert.equal(opts.idempotencyKey, `community-refund-${requestId}`);
        providerResult = result;
        await barrier.hold();
        throw Error("Provider response lost");
      };
      worker = Promise.allSettled([request()]);
      await Promise.race([barrier.entered, new Promise((_, reject) =>
        setTimeout(() => reject(Error("Refund did not reach provider barrier")), 5000).unref())]);

      // This separate connection can see the committed reservation AND the
      // mutation intent while the first worker still holds the session lock.
      const read = async (c = f.pool) =>
        (await c.query("SELECT data FROM community_resale_orders WHERE id=$1", [f.order])).rows[0].data.refunds;
      const before = await read();
      const evidence = before.find((r: any) => r.id === requestId);
      assert.equal(evidence.amountCents, 100);
      assert.equal(evidence.actor, "staff");
      assert.equal(evidence.reason, input.reason);
      assert.ok(Number.isFinite(Date.parse(evidence.refund.attemptedAt)));
      assert.equal(evidence.refund.id, undefined, "provider response has not been saved");
      const auditBefore = await f.audit();
      assert.equal(auditBefore.length, 1);
      assert.equal(auditBefore[0].action, "refund_requested");
      assert.equal(auditBefore[0].data.id, requestId);

      waiter = Promise.allSettled([f.api.withCommunityOrderLock(f.order, async (c: any) => ({
        pid: (await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
        refunds: await read(c),
      }))]);
      const pids = await blocked(f);
      await f.terminateOwnedSession(pids.holder);
      // Do not release the provider barrier yet: only backend termination can
      // have released the lock, not the worker's normal finally cleanup.
      const acquired = (await waiter)[0];
      assert.equal(acquired.status, "fulfilled");
      if (acquired.status !== "fulfilled") throw acquired.reason;
      assert.equal(acquired.value.pid, pids.waiter);
      assert.notEqual(acquired.value.pid, pids.holder);
      assert.deepEqual(acquired.value.refunds, before, "committed evidence survives session death");
      assert.deepEqual(await f.audit(), auditBefore);

      barrier.release();
      assert.equal((await worker)[0].status, "rejected", "dead worker cannot claim success");
      assert.deepEqual(await read(), before, "failed persistence must not erase the intent");

      // Empty provider history is ambiguous, not permission to create again.
      for (let retry = 0; retry < 2; retry++) {
        await request();
        await assert.rejects(f.api.requestCommunityRefund(f.order, f.tenant, "staff", {
          ...input, requestId: randomUUID(),
        }, f.stripe), /existing refund.*needs review/);
      }
      const unresolved = (await read()).find((r: any) => r.id === requestId);
      assert.equal(unresolved.status, "needs_review");
      assert.equal(unresolved.recoveryStatus, "needs_review");
      assert.equal(unresolved.refund.attemptedAt, evidence.refund.attemptedAt);

      if (outcome === "eventually visible") {
        f.state.refundList = () => [f.refund, providerResult];
        await request();
        await request();
        const recovered = (await read()).find((r: any) => r.id === requestId);
        assert.equal(recovered.refundId, providerResult.id);
        assert.equal(recovered.status, "pending");
        assert.equal(recovered.refund.attemptedAt, evidence.refund.attemptedAt);
      }
      assert.deepEqual([f.calls.creates, f.calls.reversals, f.calls.feeRefunds], [1, 0, 0],
        "retries and reconciliation must not repeat any provider mutation");
      assert.equal((await read()).length, 2, "only the original and interrupted reservations exist");
      assert.deepEqual(await f.audit(), auditBefore, "reservation audit remains intact and unique");
      const locks = await f.admin.query(`SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
        WHERE a.application_name=$1 AND l.locktype='advisory'`, [f.schema]);
      assert.equal(locks.rows.length, 0);
    } finally {
      barrier.release();
      await Promise.all([worker, waiter]);
      await f.close();
    }
  });
}
