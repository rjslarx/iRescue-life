import { pool } from "../db";
import { stripeService } from "../lib/stripe-service";
import { bankAccountReady } from "./resale-payout-accounts";
import { communityReleaseBlocked } from "./community-resale-lock";

export function splitNetProceeds(gross: number, processing: number, platform: number) {
  if (![gross, processing, platform].every(n => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Invalid split amounts");
  const net = Math.max(0, gross - processing - platform);
  const contributorCents = Math.floor(net / 2);
  return { contributorCents, rescueCents: net - contributorCents };
}

/** Funds move only in deployment. Tests inject a fake Stripe client explicitly.
 * Session advisory lock serializes replicas without rolling back durable provider
 * intents on network errors. Each external request is recorded before it is sent.
 */
export async function settleResaleSplit(orderId: string, tenantId: string, testStripe?: any, workflow: "legacy" | "community" = "legacy") {
  // Closed enum only: callers cannot supply SQL identifiers.
  const orders = workflow === "community" ? "community_resale_orders" : "rescue_resale_orders";
  const splits = workflow === "community" ? "community_resale_splits" : "rescue_resale_splits";
  const stripe: any = testStripe || stripeService.getPlatformStripeClient();
  if (!stripe) throw new Error("Stripe unavailable");
  const execute = !!testStripe || process.env.REPLIT_DEPLOYMENT === "1";
  const client = await pool.connect();
  const lock = `resale-split:${orderId}`;
  let state: any, order: any;
  const save = async (status: string, error?: string) => {
    state.status = status; state.error = error || null;
    await client.query(`UPDATE ${splits} SET status=$2,data=$3,updated_at=now() WHERE order_id=$1`, [orderId, status, state]);
    const contributorActual = state.contributor?.transferId ? state.contributor.amount - (state.contributor.reversed || 0) : 0;
    const rescueActual = state.rescue?.transferId ? state.rescue.amount - (state.rescue.reversed || 0) : 0;
    await client.query(`UPDATE ${orders} SET data=jsonb_set(data,'{split}',$2::jsonb),
      rescue_proceeds_cents=$3 WHERE id=$1 AND tenant_id=$4`,
    [orderId, JSON.stringify({ status, contributorCents: state.contributor?.amount ?? null,
      rescueCents: state.rescue?.amount ?? null, contributorTransferredCents: contributorActual,
      rescueTransferredCents: rescueActual, error: error || null }), rescueActual, tenantId]);
  };
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lock]);
    order = (await client.query(`SELECT * FROM ${orders} WHERE id=$1 AND tenant_id=$2`, [orderId, tenantId])).rows[0];
    if (!order || order.data.proceedsMode !== "split_50" || !order.payment_intent_id) return;
    await client.query(`INSERT INTO ${splits}(order_id,tenant_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [orderId, tenantId]);
    state = (await client.query(`SELECT data FROM ${splits} WHERE order_id=$1`, [orderId])).rows[0].data;
    const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id, { expand: ["latest_charge.balance_transaction"] });
    const charge = pi.latest_charge;
    if (pi.status !== "succeeded" || pi.metadata?.resaleOrderId !== orderId || pi.metadata?.tenantId !== tenantId ||
        pi.amount !== order.data.amountCents || pi.currency !== "usd" || !charge || typeof charge !== "object" ||
        charge.transfer || charge.application_fee) throw new Error("Split payment verification failed");
    const balance = charge.balance_transaction;
    if (!balance || typeof balance !== "object") { await save("awaiting_funds"); return; }
    const amounts = splitNetProceeds(order.data.amountCents, balance.fee, order.data.platformRevenueCents);
    const badPayment = !!charge.disputed || charge.amount_refunded > 0;
    // Recover previously attempted requests BEFORE checking refunds or eligibility.
    // Never create a new transfer when an old result is ambiguous.
    for (const role of ["contributor", "rescue"]) {
      const leg = state[role];
      if (!leg?.attemptedAt) continue;
      if (!leg.transferId) {
        const found = await stripe.transfers.list({ transfer_group: `resale_${orderId}`, limit: 100 }).autoPagingToArray({ limit: 1000 });
        const matches = found.filter((t: any) => t.metadata?.resaleLeg === role && t.metadata?.resaleOrderId === orderId);
        if (matches.length > 1 || found.length >= 1000) { await save("needs_review", "Transfer recovery needs platform review."); return; }
        if (matches[0]) {
          if (matches[0].amount !== leg.amount || matches[0].destination !== leg.destination) throw new Error("Transfer recovery mismatch");
          leg.transferId = matches[0].id;
          await save("transferring");
        } else if (badPayment || Date.now() - Date.parse(leg.attemptedAt) > 23 * 3600000) {
          await save("needs_review", "An earlier transfer outcome is uncertain; automatic retry is paused."); return;
        }
      }
      if (leg.transferId) {
        const transfer = await stripe.transfers.retrieve(leg.transferId);
        leg.reversed = transfer.amount_reversed || 0;
      }
    }
    if (badPayment) {
      // Conservatively recover both shares, even for a partial refund. Releasing
      // any remaining proceeds then requires review, not an optimistic re-payout.
      for (const role of ["contributor", "rescue"]) {
        const leg = state[role];
        if (!leg?.transferId || leg.reversed >= leg.amount) continue;
        if (!execute) { await save("needs_review", "Refund recovery runs only on the published app."); return; }
        if (leg.reversalAttemptedAt && Date.now() - Date.parse(leg.reversalAttemptedAt) > 23 * 3600000) {
          await save("needs_review", "Transfer reversal needs platform review."); return;
        }
        if (!leg.reversalAttemptedAt) {
          leg.reversalAttemptedAt = new Date().toISOString();
          leg.reversalAmount = leg.amount - (leg.reversed || 0);
          await save("recovering");
        }
        await stripe.transfers.createReversal(leg.transferId, { amount: leg.reversalAmount,
          metadata: { resaleOrderId: orderId, reason: "refund_or_dispute" } },
        { idempotencyKey: `resale-reverse-${orderId}-${role}` });
        const transfer = await stripe.transfers.retrieve(leg.transferId);
        leg.reversed = transfer.amount_reversed;
        await save("recovering");
      }
      await save(charge.amount_refunded >= order.data.amountCents ? "refunded" : "needs_review",
        charge.amount_refunded >= order.data.amountCents ? undefined : "Refund or dispute paused this split. Review before releasing any remaining proceeds.");
      return;
    }
    if (state.status === "needs_review" || state.status === "refunded" ||
        [state.contributor, state.rescue].some(l => l?.reversed > 0)) {
      await save("needs_review", "A prior recovery or uncertain transfer requires platform review."); return;
    }
    if (workflow === "community") {
      const pending = await stripe.refunds.list({ charge: charge.id, limit: 100 }).autoPagingToArray({ limit: 1000 });
      if (communityReleaseBlocked(order) || pending.length >= 1000 ||
          pending.some((r: any) => !["failed", "canceled"].includes(r.status))) {
        await save("on_hold", "An issue or refund blocks release. Resolve it before settlement."); return;
      }
    }
    if (!order.data.pickupConfirmedAt) { await save("awaiting_pickup"); return; }
    if (balance.status !== "available" || balance.available_on * 1000 > Date.now()) { await save("awaiting_funds"); return; }
    if (!execute) { await save("awaiting_deployment", "Automatic transfers run only on the published app."); return; }
    const contributor = await stripe.accounts.retrieve(order.data.contributorAccountId);
    const rescue = await stripe.accounts.retrieve(order.data.rescueAccountId);
    if (!bankAccountReady(contributor) || rescue.deleted || rescue.capabilities?.transfers !== "active" || !rescue.payouts_enabled) {
      await save("setup_required", "A recipient must finish Stripe payout verification."); return;
    }
    for (const role of ["contributor", "rescue"] as const) {
      if (!state[role]) state[role] = { amount: amounts[`${role}Cents`], destination: order.data[role === "contributor" ? "contributorAccountId" : "rescueAccountId"] };
      const leg = state[role];
      if (leg.transferId || leg.amount === 0) continue;
      // Recheck the charge immediately before each outgoing share.
      const current = await stripe.charges.retrieve(charge.id);
      if (current.disputed || current.amount_refunded > 0) { await save("recovering", "Refund or dispute detected; recovery queued."); return; }
      if (workflow === "community") {
        const pending = await stripe.refunds.list({ charge: charge.id, limit: 100 }).autoPagingToArray({ limit: 1000 });
        if (pending.length >= 1000 || pending.some((r: any) => !["failed", "canceled"].includes(r.status))) {
          await save("on_hold", "A refund blocks release."); return;
        }
      }
      leg.attemptedAt ||= new Date().toISOString();
      await save("transferring");
      const transfer = await stripe.transfers.create({ amount: leg.amount, currency: "usd", destination: leg.destination,
        source_transaction: charge.id, transfer_group: `resale_${orderId}`,
        metadata: { type: "resale_split", tenantId, resaleOrderId: orderId, resaleLeg: role } },
      { idempotencyKey: `resale-split-${orderId}-${role}` });
      leg.transferId = transfer.id;
      await save("transferring");
    }
    await save("transferred");
  } catch (e) {
    if (state) await save("retry_pending", "Settlement could not finish. The system will reconcile before retrying.");
    throw e;
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lock]); } finally { client.release(); }
  }
}
