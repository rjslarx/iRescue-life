/** One notification per request and recipient, not one per scheduler run. */
export function communityAttentionEvents(order: any, now = Date.now()) {
  const data = order.data || {};
  const events: { key: string; label: string; since: string }[] = [];
  for (const [field, label] of [["issue", "Buyer issue"], ["pickupHelp", "Pickup assistance"]] as const) {
    const request = data[field];
    if (request?.status === "open")
      events.push({ key: `${field}:${request.id}`, label, since: request.createdAt });
  }
  for (const refund of data.refunds || []) {
    if (["failed", "canceled"].includes(refund.status)) continue;
    const recovered = refund.recoveryStatus === "recovered" ||
      (refund.recoveryStatus === "split_reconciliation" && data.finance?.recoveryStatus === "recovered");
    if (recovered && refund.status === "succeeded") continue;
    if (now - Date.parse(refund.createdAt) >= 24 * 60 * 60 * 1000)
      events.push({ key: `refund:${refund.id}`, label: "Refund recovery unresolved for 24+ hours", since: refund.createdAt });
  }
  // Refunds created directly in Stripe have no local request id. Prior local
  // refunds must not hide a later external recovery gap. Avoid a second alert
  // for the same recovery while an aged local request already explains it.
  if (!events.some(event => event.key.startsWith("refund:")) && order.refunded_cents > 0 &&
      data.finance?.recoveryStatus === "needs_review" && data.refundRecoverySince &&
      now - Date.parse(data.refundRecoverySince) >= 24 * 60 * 60 * 1000)
    events.push({ key: `recovery:${data.refundRecoverySince}`, label: "Refund recovery unresolved for 24+ hours", since: data.refundRecoverySince });
  return events;
}
