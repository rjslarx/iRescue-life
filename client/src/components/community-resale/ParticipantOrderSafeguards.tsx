import { useState } from "react";
import { useCommunityAction } from "@/hooks/use-community-actions";
import { useRefreshCommunity } from "@/hooks/use-community-resale";
import { date, ErrorBox, Feedback, Field, human, money } from "./CommunityUI";
import { OrderSafeguardStatus, pickupBlocked } from "./OrderSafeguardStatus";

// Pass the page's private-token-aware orderRequest, extended to accept a JSON body.
export type PrivateOrderRequest = (id: string, method?: string, suffix?: string, body?: any) => Promise<any>;

export function BuyerOrderSafeguards({ order, orderRequest }: { order: any; orderRequest: PrivateOrderRequest }) {
  const refresh = useRefreshCommunity();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitted, setSubmitted] = useState(false);
  const canReport = !!order.pickupConfirmedAt || ["paid", "completed", "partially_refunded", "refunded"].includes(order.status);
  return <div className="cr-safeguards"><OrderSafeguardStatus order={order} />
    {canReport && order.issue?.status !== "open" && <details><summary>Report a problem with this purchase</summary><p className="cr-muted">Tell the rescue what happened, including any pickup or item concern. Reports are accepted after handover too. Review does not guarantee a refund or recovery of funds already transferred. Do not include your pickup code, private link, or bank details.</p>
      {submitted ? <p className="cr-note" role="status">Your report was submitted for rescue review. Refresh the order to follow its status.</p> : <form onSubmit={async e => {
        e.preventDefault(); if (busy || description.trim().length < 10 || description.trim().length > 2000) return;
        setBusy(true); setError(null);
        try { await orderRequest(order.id, "POST", "/issue", { description: description.trim() }); setSubmitted(true); await refresh(); }
        catch (err) { setError(err); } finally { setBusy(false); }
      }}><fieldset disabled={busy}><Field label="What happened? (10–2,000 characters)"><textarea required minLength={10} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></Field><button className="cr-btn" disabled={busy || description.trim().length < 10 || description.trim().length > 2000}>{busy ? "Submitting report…" : "Send issue to rescue"}</button></fieldset><ErrorBox error={error} /></form>}
    </details>}
  </div>;
}

export function SellerPickupHelp({ order }: { order: any }) {
  const action = useCommunityAction();
  const [description, setDescription] = useState("");
  if (order.status !== "paid" || order.pickupConfirmedAt || order.pickupHelp?.status === "open") return null;
  return <details className="cr-safeguards"><summary>Need help confirming a real pickup?</summary><p className="cr-muted">If you cannot use the pickup code, explain the actual handover and what staff can verify. Staff reviews pickup evidence; elapsed time never releases proceeds. Assistance does not guarantee an immediate bank payout.</p><form onSubmit={async e => {
    e.preventDefault(); if (action.busy || description.trim().length < 10 || description.trim().length > 2000) return;
    const result = await action.run(`/orders/${encodeURIComponent(order.id)}/pickup-help`, "POST", { description: description.trim() }, "Pickup assistance requested. The rescue will review the handover.");
    if (result) setDescription("");
  }}><fieldset disabled={action.busy}><Field label="Pickup details and why you need assistance (10–2,000 characters)"><textarea required minLength={10} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></Field><button className="cr-btn secondary" disabled={action.busy || description.trim().length < 10 || description.trim().length > 2000}>{action.busy ? "Requesting assistance…" : "Request rescue assistance"}</button></fieldset><Feedback action={action} /></form></details>;
}

export function SafeguardedSale({ order }: { order: any }) {
  const action = useCommunityAction();
  const [code, setCode] = useState("");
  // /me contains both roles. A buyer must recover the private order, never use seller controls.
  if (order.isBuyer) return <article className="cr-panel cr-safeguards"><span className="cr-kicker">Your purchase</span><h3>{order.itemTitle}</h3><p>{money(order.amountCents)} · {human(order.status)}</p><OrderSafeguardStatus order={order} /><a className="cr-btn secondary" href={`/resale/order/${encodeURIComponent(order.id)}`}>Open / recover my private order</a><p className="cr-muted" style={{ marginTop: 12 }}>Use the buyer email if private access needs to be recovered.</p></article>;
  return <article className="cr-panel cr-safeguards"><div className="cr-row"><h3>{order.itemTitle}</h3><span className="cr-pill">{human(order.status)}</span><strong>{money(order.amountCents)}</strong></div><p className="cr-muted">{date(order.createdAt)} · Order {order.id}</p><p>Pickup: {order.pickupConfirmedAt ? date(order.pickupConfirmedAt) : "Not yet confirmed"} · Settlement: {human(order.split?.status || order.settlementStatus || "awaiting information")}</p><p className="cr-muted">Rescue proceeds: {money(order.rescueProceedsCents)} · Contributor share: {money(order.contributorShareCents ?? order.split?.contributorCents)}</p><OrderSafeguardStatus order={order} />
    {order.status === "paid" && !order.pickupConfirmedAt && <form onSubmit={async e => {
      e.preventDefault(); if (pickupBlocked(order) || action.busy || !/^[a-f0-9]{12}$/i.test(code.trim())) return;
      const result = await action.run(`/orders/${encodeURIComponent(order.id)}/confirm-pickup`, "POST", { code: code.trim() }, "Pickup recorded. Settlement still requires available funds; bank payout is not immediate.");
      if (result) setCode("");
    }}><fieldset disabled={action.busy || pickupBlocked(order)}><Field label="Buyer's private pickup code (12 hexadecimal characters; only enter at handover)"><input required pattern="[a-fA-F0-9]{12}" minLength={12} maxLength={12} value={code} onChange={e => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} /></Field><button className="cr-btn" disabled={action.busy || pickupBlocked(order) || !/^[a-f0-9]{12}$/i.test(code.trim())}>{action.busy ? "Confirming…" : "Confirm safe handover"}</button></fieldset></form>}
    <Feedback action={action} /><SellerPickupHelp order={order} />
  </article>;
}
