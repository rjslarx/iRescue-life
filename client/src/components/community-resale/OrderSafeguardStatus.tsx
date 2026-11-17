import { date, human, money } from "./CommunityUI";
import "./safeguards.css";

export function pickupBlocked(order: any) {
  return order.issue?.status === "open" || !!order.disputed || order.refundedCents > 0 ||
    order.finance?.pendingRefundCents > 0 ||
    !!order.refunds?.some((refund: any) => !["failed", "canceled"].includes(refund.status));
}

export function OrderSafeguardStatus({ order, financial = false }: { order: any; financial?: boolean }) {
  const finance = order.finance;
  const entries: [string, number | null | undefined][] = [
    ["Buyer actually refunded", finance?.buyerRefundedCents],
    ["Refund requests pending", finance?.pendingRefundCents],
    ["Transfers reversed", finance?.transferReversedCents],
    ["Application fee refunded", finance?.applicationFeeRefundedCents],
    ["Processing cost retained", finance?.retainedProcessingCents],
    ["Unrecovered funds", finance?.unrecoveredCents],
    ["Platform exposure", finance?.platformExposureCents],
  ];
  return <div className="cr-safeguards">
    {order.issue && <div className="cr-note"><strong>Buyer issue · {human(order.issue.status)}</strong><p className="cr-safeguard-description">{order.issue.description}</p><p className="cr-muted">Reported {date(order.issue.createdAt)}{order.issue.resolvedAt ? ` · Resolved ${date(order.issue.resolvedAt)}` : ""}</p></div>}
    {order.pickupHelp && <div className="cr-note"><strong>Pickup assistance · {human(order.pickupHelp.status)}</strong><p className="cr-safeguard-description">{order.pickupHelp.description}</p><p className="cr-muted">Requested {date(order.pickupHelp.createdAt)}</p></div>}
    {pickupBlocked(order) && !order.pickupConfirmedAt && <p className="cr-note">Normal pickup-code confirmation is unavailable while an issue is open, a refund is pending or completed, or the payment is disputed. Failed or canceled refund attempts alone do not block pickup.</p>}
    {!!order.refunds?.length && <details><summary>Refund requests ({order.refunds.length})</summary>{order.refunds.map((refund: any) => <div className="cr-safeguard-record" key={refund.id}><strong>Requested: {money(refund.amountCents)}</strong><p>Status: {human(refund.status)} · {date(refund.createdAt)}</p>{financial && <><p className="cr-safeguard-description">Reason: {refund.reason}</p><p>Recovery: {human(refund.recoveryStatus)}</p><p>Stripe refund: {refund.refundId || "Not reported"}</p></>}</div>)}<p className="cr-muted">A request is not a completed refund. Recovery from recipients can fail separately from the buyer refund.</p></details>}
    {financial && <details open><summary>Reconciled refund & recovery amounts</summary>{!finance && <p className="cr-muted">Not yet reconciled. Unknown amounts are not zero. Sync with Stripe for current information.</p>}<dl>{entries.map(([label, value]) => <div className="cr-finance-row" key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl><p>Recovery status: {human(finance?.recoveryStatus)}</p></details>}
    {order.notificationStatus && <details><summary>Pickup & proceeds notification status</summary><p>Buyer pickup: {human(order.notificationStatus.pickupBuyer)}</p><p>Seller pickup: {human(order.notificationStatus.pickupSeller)}</p><p>Proceeds: {human(order.notificationStatus.proceeds)}</p><p className="cr-muted">Provider acceptance is not proof of email delivery.</p></details>}
  </div>;
}
