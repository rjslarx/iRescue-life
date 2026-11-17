import { test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db";
import { recoverCommunityRefundIntent, requestCommunityRefund } from "../server/services/community-resale-refunds";

test("damaged intent recovery verifies exact provider history and preserves evidence without money mutations", async () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  const raw = JSON.stringify({ requestId, amountCents: "damaged" });
  const original = pool.connect;
  let order: any, provider: any, split: any, transfers: any[], audit: any[], unavailable = false, auditFails = false;
  const charge = { id: "charge", amount: 10000, amount_refunded: 2500, disputed: false };
  const stripe = {
    transfers: {
      list: () => ({ autoPagingToArray: async () => transfers }),
      retrieve: async (id: string) => transfers.find(t => t.id === id),
      createReversal: () => { assert.fail("Recovery must not reverse money"); },
    },
    paymentIntents: { retrieve: async () => ({ status: "succeeded", amount: 10000, currency: "usd",
      metadata: { type: "community_resale", resaleOrderId: "order", tenantId: "tenant" }, latest_charge: charge }) },
    refunds: {
      retrieve: async () => { if (unavailable) throw new Error("Stripe unavailable"); return provider; },
      list: () => ({ autoPagingToArray: async () => provider ? [provider] : [] }),
      create: () => { assert.fail("Recovery must not send money"); },
    },
  };
  (pool as any).connect = async () => ({
    query: async (sql: string, params: any[]) => {
      if (sql.startsWith("SELECT data,status")) return { rows: split ? [split] : [] };
      if (sql.startsWith("SELECT *")) return { rows: params[1] === "tenant" ? [order] : [] };
      if (sql.startsWith("INSERT")) {
        if (auditFails) throw new Error("Audit unavailable");
        audit.push(params[3]);
      }
      return { rows: [] };
    },
    release() {},
  });
  const reset = (status = "succeeded") => {
    unavailable = auditFails = false; audit = []; charge.disputed = false;
    order = { id: "order", tenant_id: "tenant", payment_intent_id: "pi", data: {
      amountCents: 10000, proceedsMode: "split_50",
      rescueAccountId: "rescue-account", contributorAccountId: "contributor-account",
      refunds: [{ id: requestId, amountCents: 2500, refund: { id: "refund" }, status, recoveryStatus: "pending" }],
    } };
    provider = { id: "refund", charge: "charge", amount: 2500, status,
      metadata: { communityRefundId: requestId, resaleOrderId: "order", tenantId: "tenant" } };
    split = { status: "needs_review", data: {} };
    transfers = ["rescue", "contributor"].map(role => {
      split.data[role] = { amount: 4000, destination: `${role}-account`, transferId: `transfer-${role}`, attemptedAt: "2026-11-17" };
      return { id: `transfer-${role}`, amount: 4000, amount_reversed: 4000, currency: "usd",
        source_transaction: "charge", destination: `${role}-account`,
        metadata: { resaleOrderId: "order", tenantId: "tenant", resaleLeg: role } };
    });
  };
  const recover = (value = raw, tenant = "tenant") => recoverCommunityRefundIntent("order", tenant, "admin", value, stripe);
  try {
    for (const status of ["succeeded", "failed", "canceled"]) {
      reset(status);
      const result = await recover();
      assert.equal(result.retired, true); assert.equal(result.status, status);
      assert.equal(result.requestId, requestId);
      assert.equal(audit![0].savedIntent, raw);
    }
    for (const value of ["", "{", "null", "[]", '{"requestId":"not-a-uuid"}']) {
      reset(); await assert.rejects(recover(value), /reference cannot be recovered/);
      assert.equal(audit!.length, 0);
    }
    reset(); order.data.refunds = [];
    await assert.rejects(recover(), /Absence is not proof/);
    reset(); order.data.refunds[0].id = "another";
    await assert.rejects(recover(), /No unique matching/);
    for (const state of ["recovering", "retry_pending"]) {
      reset(); split.status = state;
      await assert.rejects(recover(), /Split refund recovery is still unresolved/);
      assert.equal(audit!.length, 0);
    }
    reset(); transfers![0].amount_reversed = 0;
    await assert.rejects(recover(), /Split refund recovery is still unresolved/);
    await assert.rejects(requestCommunityRefund("order", "tenant", "admin", {
      requestId: "22222222-2222-4222-8222-222222222222", amountCents: 100,
      expectedRefundedCents: 2500, reason: "Another refund request",
    }, stripe), /Split refund recovery is still unresolved/);
    reset(); transfers![1].amount_reversed = 1000;
    await assert.rejects(recover(), /Split refund recovery is still unresolved/);
    reset(); delete split.data.rescue.transferId; transfers = transfers!.slice(1);
    await assert.rejects(recover(), /Split refund recovery is still unresolved/);
    reset(); split = null;
    await assert.rejects(recover(), /Split refund recovery is still unresolved/);
    reset(); split.status = "refunded";
    assert.equal((await recover()).recoveryStatus, "recovered");
    reset("pending"); await assert.rejects(recover(), /still unresolved/);
    reset(); order.data.proceedsMode = "donate_all"; // No transfer: recovery cannot be verified.
    await assert.rejects(recover(), /still unresolved/);
    reset(); provider.metadata.communityRefundId = "another";
    await assert.rejects(recover(), /could not be verified/);
    reset(); provider.charge = "another";
    await assert.rejects(recover(), /verification mismatch/);
    reset(); charge.disputed = true;
    await assert.rejects(recover(), /still unresolved/);
    reset(); unavailable = true; await assert.rejects(recover(), /Stripe unavailable/);
    reset(); auditFails = true; await assert.rejects(recover(), /Audit unavailable/);
    reset(); await assert.rejects(recover(raw, "other-tenant"), /Order not found/);
    assert.equal(audit!.length, 0);
  } finally { pool.connect = original; }
});
