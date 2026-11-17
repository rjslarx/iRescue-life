/** Cash-flow snapshot, not a claim about bank payout or charitable deductions. */
export async function communityFinanceSnapshot(c: any, o: any, stripe: any, charge: any) {
  if (!charge?.id || !charge.balance_transaction || typeof charge.balance_transaction !== "object") return null;
  const gross = o.data.amountCents, processing = charge.balance_transaction.fee;
  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 }).autoPagingToArray({ limit: 1000 });
  if (refunds.length >= 1000) throw new Error("Refund history requires review");
  const pendingRefundCents = refunds.filter((r: any) => !["succeeded", "failed", "canceled"].includes(r.status))
    .reduce((n: number, r: any) => n + r.amount, 0);
  let reversed = 0, outstanding = 0, feeRefunded = 0, retainedApplicationFee = 0;
  let recoveryStatus = "not_needed", unrecovered = 0;
  const idOf = (v: any) => typeof v === "string" ? v : v?.id;
  if (o.data.proceedsMode === "donate_all" && charge.transfer) {
    const transfer = await stripe.transfers.retrieve(idOf(charge.transfer));
    const transfers = await stripe.transfers.list({ destination: idOf(transfer.destination),
      created: { gte: transfer.created || 0 }, limit: 100 }).autoPagingToArray({ limit: 1000 });
    if (transfers.length >= 1000) throw new Error("Transfer history requires review");
    const all = [transfer, ...transfers.filter((t: any) => t.metadata?.originalTransferId === transfer.id &&
      t.metadata?.iRescueDisputeAction === "won_restoration")];
    for (const t of all) { reversed += t.amount_reversed; outstanding += t.amount - t.amount_reversed; }
    if (charge.application_fee) {
      const fee = await stripe.applicationFees.retrieve(idOf(charge.application_fee));
      feeRefunded = fee.amount_refunded; retainedApplicationFee = fee.amount - feeRefunded;
    }
    const ops = o.data.refunds || [];
    unrecovered = ops.reduce((n: number, r: any) => n + (r.status === "succeeded" ? r.unrecoveredCents ?? r.amountCents : 0), 0);
    if (ops.length) recoveryStatus = ops.some((r: any) => r.recoveryStatus === "needs_review") ? "needs_review"
      : ops.every((r: any) => ["failed", "canceled"].includes(r.status) || r.recoveryStatus === "recovered") ? "recovered" : "pending";
    // A dashboard-issued refund may omit transfer recovery. Surface the gap too.
    unrecovered = Math.max(unrecovered, Math.max(0, charge.amount_refunded - reversed));
    if (unrecovered > 0) recoveryStatus = "needs_review";
  } else if (o.data.proceedsMode === "split_50") {
    const state = (await c.query("SELECT data,status FROM community_resale_splits WHERE order_id=$1", [o.id])).rows[0];
    for (const leg of [state?.data?.rescue, state?.data?.contributor]) {
      if (!leg?.transferId) continue;
      const t = await stripe.transfers.retrieve(leg.transferId);
      reversed += t.amount_reversed; outstanding += t.amount - t.amount_reversed;
    }
    if (charge.amount_refunded || charge.disputed) {
      unrecovered = outstanding;
      recoveryStatus = outstanding ? "needs_review" : "recovered";
    } else recoveryStatus = state?.status || "awaiting_pickup";
  }
  const result = {
    buyerRefundedCents: charge.amount_refunded, pendingRefundCents,
    transferReversedCents: reversed, applicationFeeRefundedCents: feeRefunded,
    retainedProcessingCents: processing,
    unrecoveredCents: unrecovered,
    // Principal/processing cashflow exposure only: dispute fees and withdrawals
    // require manual review and are deliberately not estimated here.
    platformExposureCents: charge.disputed ? null :
      Math.max(0, charge.amount_refunded + processing + outstanding - retainedApplicationFee - gross),
    recoveryStatus: charge.disputed ? "disputed" : recoveryStatus,
    rescueProceedsCents: o.data.proceedsMode === "donate_all" && charge.transfer
      ? outstanding - retainedApplicationFee : o.rescue_proceeds_cents,
  };
  await c.query("UPDATE community_resale_orders SET data=jsonb_set(data,'{finance}',$2::jsonb) WHERE id=$1", [o.id, JSON.stringify(result)]);
  return result;
}
