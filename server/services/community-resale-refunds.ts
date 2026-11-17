import { randomUUID } from "node:crypto";
import { stripeService } from "../lib/stripe-service";
import { withCommunityOrderLock } from "./community-resale-lock";

const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };
const ref = (v: any): string | undefined => typeof v === "string" ? v : v?.id;
async function all(list: any) {
  const rows = await list.autoPagingToArray({ limit: 1000 });
  if (rows.length >= 1000) fail("Provider history is too large for automatic recovery. Platform review required.");
  return rows;
}
async function save(c: any, o: any) {
  await c.query("UPDATE community_resale_orders SET data=jsonb_set(data,'{refunds}',$2::jsonb) WHERE id=$1",
    [o.id, JSON.stringify(o.data.refunds || [])]);
}
export async function verifiedCommunityCharge(stripe: any, o: any) {
  if (!o.payment_intent_id) fail("No verified payment is available.");
  const pi = await stripe.paymentIntents.retrieve(o.payment_intent_id, { expand: ["latest_charge.balance_transaction"] });
  if (pi.status !== "succeeded" || pi.amount !== o.data.amountCents || pi.currency !== "usd" ||
      pi.metadata?.type !== "community_resale" || pi.metadata?.resaleOrderId !== o.id || pi.metadata?.tenantId !== o.tenant_id)
    fail("Payment verification failed.");
  const charge = pi.latest_charge;
  if (!charge || typeof charge !== "object" || !charge.id) fail("Charge details are not yet available.");
  return charge;
}

/** A durable intent is saved BEFORE each external mutation. Unknown results are
 * recovered by metadata, never by minting a replacement request. */
async function step(c: any, o: any, op: any, key: string, find: () => Promise<any>, create: () => Promise<any>) {
  const prior = op[key];
  if (prior?.id) return prior;
  if (prior?.attemptedAt) {
    const found = await find();
    if (!found) { op.recoveryStatus = "needs_review"; await save(c, o); return null; }
    op[key] = { ...prior, id: found.id, amount: found.amount, status: found.status || "succeeded" };
    await save(c, o); return op[key];
  }
  op[key] = { attemptedAt: new Date().toISOString() };
  await save(c, o);
  try {
    const result = await create();
    op[key] = { ...op[key], id: result.id, amount: result.amount, status: result.status || "succeeded" };
    await save(c, o); return op[key];
  } catch {
    op.recoveryStatus = "needs_review";
    await save(c, o);
    return null;
  }
}

/** Caller holds the shared order lock. This also provides read-only recovery in
 * workspaces; mutations only run in deployment or with an explicitly injected fake. */
export async function reconcileCommunityRefunds(c: any, o: any, stripe: any, execute: boolean) {
  const ops = o.data.refunds || [];
  if (!ops.length || !o.payment_intent_id) return;
  let charge = await verifiedCommunityCharge(stripe, o);
  for (const op of ops) {
    const findRefund = async () => (await all(stripe.refunds.list({ charge: charge.id, limit: 100 })))
      .find((r: any) => r.metadata?.communityRefundId === op.id);
    let result: any;
    if (op.refund?.id) result = await stripe.refunds.retrieve(op.refund.id);
    else if (op.refund?.attemptedAt) result = await findRefund();
    else if (execute) {
      // Reservation checked again immediately before the mutation.
      charge = await verifiedCommunityCharge(stripe, o);
      const pending = (await all(stripe.refunds.list({ charge: charge.id, limit: 100 })))
        .filter((r: any) => !["failed", "canceled", "succeeded"].includes(r.status))
        .reduce((n: number, r: any) => n + r.amount, 0);
      if (charge.disputed || op.amountCents > charge.amount - charge.amount_refunded - pending) {
        op.status = "needs_review"; op.recoveryStatus = "needs_review"; await save(c, o); continue;
      }
      const stepResult = await step(c, o, op, "refund", findRefund, () => stripe.refunds.create({
        charge: charge.id, amount: op.amountCents,
        // Deliberately separate buyer refund from fund recovery. An insolvent
        // recipient must not be reported as a successful reversal.
        metadata: { communityRefundId: op.id, resaleOrderId: o.id, tenantId: o.tenant_id },
      }, { idempotencyKey: `community-refund-${op.id}` }));
      if (stepResult?.id) result = await stripe.refunds.retrieve(stepResult.id);
    }
    if (!result) { op.status = "needs_review"; op.recoveryStatus = "needs_review"; await save(c, o); continue; }
    if (result.amount !== op.amountCents || ref(result.charge) !== charge.id) fail("Refund verification mismatch.");
    op.refund = { ...op.refund, id: result.id, amount: result.amount, status: result.status };
    op.refundId = result.id; op.status = result.status || "pending";
    await save(c, o);
    if (op.status !== "succeeded") continue;
    if (o.data.proceedsMode === "split_50") {
      op.recoveryStatus = "split_reconciliation";
      await save(c, o); continue; // Existing split engine alone owns both reversals.
    }
    charge = await verifiedCommunityCharge(stripe, o);
    const transferId = ref(charge.transfer), feeId = ref(charge.application_fee);
    if (!transferId) { op.recoveryStatus = "needs_review"; await save(c, o); continue; }
    const transfer = await stripe.transfers.retrieve(transferId);
    // Original plus any restorations after a won dispute are separate cashflows.
    const restored = (await all(stripe.transfers.list({ destination: ref(transfer.destination),
      created: { gte: transfer.created || 0 }, limit: 100 })))
      .filter((t: any) => t.metadata?.originalTransferId === transferId && t.metadata?.iRescueDisputeAction === "won_restoration");
    let remaining = op.amountCents;
    for (const original of [transfer, ...restored]) {
      const key = `reversal_${original.id}`;
      const find = async () => (await all(stripe.transfers.listReversals(original.id, { limit: 100 })))
        .find((v: any) => v.metadata?.communityRefundId === op.id);
      let recovered = op[key]?.id ? await find() : undefined;
      if (!recovered && op[key]?.attemptedAt) recovered = await find();
      if (recovered) {
        op[key] = { ...op[key], id: recovered.id, amount: recovered.amount };
        remaining -= recovered.amount; await save(c, o); continue;
      }
      if (remaining <= 0) break;
      const current = await stripe.transfers.retrieve(original.id);
      const amount = Math.min(remaining, current.amount - current.amount_reversed);
      if (amount <= 0) continue;
      if (!execute) continue;
      const done = await step(c, o, op, key, find, () => stripe.transfers.createReversal(original.id, {
        amount, metadata: { communityRefundId: op.id, resaleOrderId: o.id },
      }, { idempotencyKey: `community-reversal-${op.id}-${original.id}` }));
      if (done) remaining -= done.amount;
      else break; // Ambiguous original reversal must not be duplicated on another transfer.
    }
    op.unrecoveredCents = Math.max(0, remaining);
    // Return the proportional application fee (including its processing-recovery
    // component). Original Stripe processing costs can still remain on platform.
    if (feeId && remaining <= 0) {
      const fee = await stripe.applicationFees.retrieve(feeId);
      const target = Math.round(fee.amount * Math.min(charge.amount_refunded, charge.amount) / charge.amount);
      const amount = Math.max(0, target - fee.amount_refunded);
      if (amount > 0 || op.fee?.attemptedAt) {
        const find = async () => (await all(stripe.applicationFees.listRefunds(feeId, { limit: 100 })))
          .find((f: any) => f.metadata?.communityRefundId === op.id);
        if (execute || op.fee?.attemptedAt)
          await step(c, o, op, "fee", find, () => stripe.applicationFees.createRefund(feeId, {
            amount, metadata: { communityRefundId: op.id },
          }, { idempotencyKey: `community-fee-refund-${op.id}` }));
      }
      const actual = await stripe.applicationFees.retrieve(feeId);
      op.recoveryStatus = remaining <= 0 && actual.amount_refunded >= target ? "recovered" : "needs_review";
    } else op.recoveryStatus = remaining <= 0 ? "recovered" : "needs_review";
    await save(c, o);
  }
}

export async function requestCommunityRefund(id: string, tenantId: string, actor: string,
  input: { requestId: string; amountCents: number; expectedRefundedCents: number; reason: string }, testStripe?: any) {
  const stripe = testStripe || stripeService.getPlatformStripeClient();
  if (!stripe) fail("Stripe is unavailable.", 503);
  if (!testStripe && process.env.REPLIT_DEPLOYMENT !== "1") fail("Refunds can only be issued from the published app.", 409);
  return withCommunityOrderLock(id, async c => {
    const o = (await c.query("SELECT * FROM community_resale_orders WHERE id=$1 AND tenant_id=$2", [id, tenantId])).rows[0];
    if (!o) fail("Order not found.", 404);
    o.data.refunds ||= [];
    const prior = o.data.refunds.find((r: any) => r.id === input.requestId);
    if (prior && (prior.amountCents !== input.amountCents || prior.reason !== input.reason))
      fail("This refund request was already used with different details.");
    if (!prior) {
      const charge = await verifiedCommunityCharge(stripe, o);
      const pending = (await all(stripe.refunds.list({ charge: charge.id, limit: 100 })))
        .some((r: any) => !["failed", "canceled", "succeeded"].includes(r.status));
      if (charge.disputed || pending || o.data.refunds.some((r: any) => !["succeeded", "failed", "canceled"].includes(r.status) ||
          (r.status === "succeeded" && !["recovered", "split_reconciliation"].includes(r.recoveryStatus))))
        fail("An existing refund, recovery or dispute needs review before another refund.");
      if (input.expectedRefundedCents !== charge.amount_refunded) fail("Refund balance changed. Sync before requesting a refund.");
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > charge.amount - charge.amount_refunded)
        fail("Refund exceeds the remaining refundable balance.", 400);
      const op = { id: input.requestId, amountCents: input.amountCents, reason: input.reason,
        actor, status: "pending", recoveryStatus: "pending", createdAt: new Date().toISOString() };
      o.data.refunds.push(op);
      await c.query("BEGIN");
      try {
        await save(c, o);
        await c.query("INSERT INTO community_resale_audit(id,tenant_id,actor_id,action,data) VALUES($1,$2,$3,'refund_requested',$4)",
          [randomUUID(), tenantId, actor, { orderId: id, ...op }]);
        await c.query("COMMIT");
      } catch (e) { await c.query("ROLLBACK"); throw e; }
    }
    await reconcileCommunityRefunds(c, o, stripe, true);
    return o.data.refunds;
  });
}
