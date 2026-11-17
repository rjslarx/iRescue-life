import { useEffect, useRef, useState } from "react";
import { useCommunityAction } from "@/hooks/use-community-actions";
import { communityRequest, useRefreshCommunity } from "@/hooks/use-community-resale";
import { Check, date, ErrorBox, Feedback, Field, human, money } from "./CommunityUI";
import { OrderSafeguardStatus, pickupBlocked } from "./OrderSafeguardStatus";
import { savedRefundReference, settledRefund } from "@shared/community-refund-recovery";

type Scope = "tenant" | "platform";
type RefundRequest = {
  requestId: string;
  amountCents: number;
  expectedRefundedCents: number;
  reason: string;
  rejectionStatus?: number;
};

function refundNeedsReview(order: any) {
  return order.finance?.pendingRefundCents > 0 || order.refunds?.some((refund: any) =>
    !["succeeded", "failed", "canceled"].includes(refund.status) ||
    (refund.status === "succeeded" && !["recovered", "split_reconciliation"].includes(refund.recoveryStatus)));
}

function matchingRefund(order: any, request: RefundRequest) {
  // The server stores the submitted requestId as the refund record's id.
  return order?.refunds?.find((refund: any) => refund.id === request.requestId || refund.requestId === request.requestId);
}

function safeRefundSnapshot(order: any) {
  return order && Array.isArray(order.refunds) && Number.isSafeInteger(order.amountCents) &&
    Number.isSafeInteger(order.refundedCents) &&
    ["paid", "completed", "partially_refunded"].includes(order.status) &&
    !order.disputed && !refundNeedsReview(order);
}

function readRequest(key: string): { request: RefundRequest | null; error: Error | null } {
  try {
    const value = sessionStorage.getItem(key);
    if (value === null) return { request: null, error: null };
    const request = JSON.parse(value);
    if (!request || typeof request !== "object" || Array.isArray(request) ||
      typeof request.requestId !== "string" || !request.requestId.trim() ||
      !Number.isSafeInteger(request.amountCents) || request.amountCents <= 0 ||
      !Number.isSafeInteger(request.expectedRefundedCents) || request.expectedRefundedCents < 0 ||
      typeof request.reason !== "string" || request.reason.trim().length < 10 || request.reason.trim().length > 2000 ||
      (request.rejectionStatus !== undefined && ![400, 403, 409, 503].includes(request.rejectionStatus))) {
      throw new Error("Invalid saved refund request");
    }
    return { request, error: null };
  } catch {
    return { request: null, error: new Error("The saved refund request cannot be read safely. Do not start a replacement refund. Sync with Stripe and contact support to reconcile the saved request before trying again.") };
  }
}
function centsFromInput(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [dollars, cents = ""] = value.split(".");
  const amount = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function AdminRefund({ order, scope, canManage }: { order: any; scope: Scope; canManage: boolean }) {
  const action = useCommunityAction(scope);
  const refresh = useRefreshCommunity();
  const key = `community-refund-request:${scope}:${order.id}`;
  const [saved, setSaved] = useState(() => readRequest(key));
  const [request, setRequest] = useState<RefundRequest | null>(saved.request);
  const requestInFlight = useRef(false);
  const [amount, setAmount] = useState(() => request ? (request.amountCents / 100).toFixed(2) : "");
  const [reason, setReason] = useState(() => request?.reason || "");
  const [confirmed, setConfirmed] = useState(false);
  const [syncedOrder, setSyncedOrder] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitMessage, setSubmitMessage] = useState("");
  const [storageError, setStorageError] = useState<unknown>(null);
  const reportedRefunded = order.refundedCents;
  const knownBalance = Number.isSafeInteger(order.amountCents) && Number.isSafeInteger(reportedRefunded);
  const remaining = knownBalance ? order.amountCents - reportedRefunded : null;
  const cents = centsFromInput(amount);
  const pending = refundNeedsReview(order);
  const eligible = ["paid", "completed", "partially_refunded"].includes(order.status) && !order.disputed;
  const valid = cents != null && remaining != null && cents <= remaining && reason.trim().length >= 10 && reason.trim().length <= 2000;
  const absentAfterSync = request && syncedOrder?.id === order.id && Array.isArray(syncedOrder.refunds) && !matchingRefund(syncedOrder, request);
  const canCorrect = !!(request?.rejectionStatus && absentAfterSync && safeRefundSnapshot(syncedOrder));
  const canRetry = !!(request && absentAfterSync && safeRefundSnapshot(syncedOrder) &&
    syncedOrder.refundedCents === request.expectedRefundedCents &&
    Number.isSafeInteger(request.amountCents) && request.amountCents > 0 &&
    request.reason.trim().length >= 10 && request.reason.trim().length <= 2000 &&
    request.amountCents <= syncedOrder.amountCents - syncedOrder.refundedCents);
  const busy = action.busy || submitting;
  // Neither another request nor a balance increase proves this request finished.
  // Unlock only the exact request ID with a terminal refund and settled recovery.
  useEffect(() => {
    if (!request || !syncedOrder) return;
    const own = matchingRefund(syncedOrder, request);
    if (own && ["succeeded", "failed", "canceled"].includes(own.status) &&
      (own.status !== "succeeded" || ["recovered", "split_reconciliation"].includes(own.recoveryStatus))) {
      try { sessionStorage.removeItem(key); setRequest(null); setSyncedOrder(null); }
      catch { setStorageError(new Error("The reconciled refund request could not be cleared from browser storage. Do not start a replacement refund. Restore browser storage access, then Sync with Stripe again.")); }
    }
  }, [request, syncedOrder, key]);

  async function sync() {
    setSyncedOrder(null);
    const result = await action.run(`/orders/${encodeURIComponent(order.id)}/sync`, "POST", {}, "Stripe sync completed. Review the recorded refund and recovery status; this does not itself confirm a refund.");
    const fresh = result?.order || result;
    if (fresh?.id === order.id) { setSyncedOrder(fresh); return fresh; }
    return null;
  }
  async function recover() {
    if (!canManage || !saved.error || busy || requestInFlight.current) return;
    if (!window.confirm("Reconcile the damaged saved request with server and Stripe history? It will be retired only if its original reference has a verified terminal result. The evidence will be kept in the staff audit. This does not send a refund.")) return;
    requestInFlight.current = true; setSubmitting(true); setStorageError(null); setSubmitError(null); setSubmitMessage("");
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) throw new Error("The saved evidence changed. Reload and contact support before proceeding.");
      const result = await communityRequest(`/orders/${encodeURIComponent(order.id)}/recover-refund-intent`, "POST", { savedIntent: raw }, scope);
      if (result?.retired !== true || result.orderId !== order.id || !result.auditId ||
        !savedRefundReference(raw) || result.requestId !== savedRefundReference(raw) || !settledRefund(result))
        throw new Error("Recovery was not verified. Keep the saved evidence and contact support.");
      // Refresh must succeed before unlocking, and a concurrent local change
      // must never be removed on the strength of an older recovery response.
      await refresh();
      if (sessionStorage.getItem(key) !== raw) throw new Error("The saved evidence changed during recovery. Reload and contact support.");
      sessionStorage.removeItem(key);
      setSaved({ request: null, error: null }); setSyncedOrder(null); setConfirmed(false);
      setSubmitMessage(`Saved request retired after verified ${result.status} outcome. Original evidence is preserved in the staff audit. No new refund was sent.`);
    } catch (err) {
      setSubmitError(err);
      setStorageError(new Error("Recovery did not retire the saved request. Keep the evidence; restore browser storage or contact support, then retry reconciliation. Do not start a replacement refund."));
    } finally { requestInFlight.current = false; setSubmitting(false); }
  }
  async function send(next: RefundRequest, unchangedRetry = false) {
    if (busy || requestInFlight.current || !canManage || saved.error) return;
    requestInFlight.current = true; setSubmitting(true); setStorageError(null); setSubmitError(null); setSubmitMessage("");
    try {
      if (request) {
        // Recheck absence and current eligibility immediately before any retry.
        const fresh = await sync();
        if (!fresh) return;
        if (matchingRefund(fresh, request)) {
          setSubmitError(new Error("This request already has a server record. Review its status; do not resubmit.")); return;
        }
        if (!safeRefundSnapshot(fresh)) {
          setSubmitError(new Error("The current order is not safe for a refund retry. Resolve pending recovery or dispute conditions first.")); return;
        }
        if (unchangedRetry) {
          if (fresh.refundedCents !== request.expectedRefundedCents || request.amountCents > fresh.amountCents - fresh.refundedCents) {
            setSubmitError(new Error("The refundable balance changed. The unchanged request cannot be retried safely.")); return;
          }
          next = { ...request };
        } else {
          if (!request.rejectionStatus) {
            setSubmitError(new Error("The outcome is unknown. Only an unchanged retry with the original request ID is allowed after sync.")); return;
          }
          next = { ...next, requestId: request.requestId, expectedRefundedCents: fresh.refundedCents };
          if (next.amountCents > fresh.amountCents - fresh.refundedCents) {
            setSubmitError(new Error("The amount exceeds the newly synchronized remaining balance.")); return;
          }
        }
      }
      delete next.rejectionStatus;
      if (!Number.isSafeInteger(next.amountCents) || next.amountCents <= 0 ||
        next.reason.trim().length < 10 || next.reason.trim().length > 2000) {
        setSubmitError(new Error("Enter a valid positive refund amount and a reason of 10–2,000 characters.")); return;
      }
      // Persist before initiating the operation. Storage failure prevents sending.
      sessionStorage.setItem(key, JSON.stringify(next)); setRequest(next); setSyncedOrder(null);
      try {
        const result = await communityRequest(`/orders/${encodeURIComponent(order.id)}/refund`, "POST", { requestId: next.requestId, amountCents: next.amountCents, expectedRefundedCents: next.expectedRefundedCents, reason: next.reason }, scope);
        setSyncedOrder(result?.order || result);
        setSubmitMessage("Refund request recorded. Review its actual status and recovery separately.");
      } catch (err) {
        const status = (err as { status?: number })?.status;
        // Status alone is not proof of no mutation: edits remain blocked until a
        // successful sync also confirms this exact request has no server record.
        if (status != null && [400, 403, 409, 503].includes(status)) {
          const rejected = { ...next, rejectionStatus: status };
          sessionStorage.setItem(key, JSON.stringify(rejected)); setRequest(rejected);
        }
        setSubmitError(err);
      }
      setConfirmed(false);
      try { await refresh(); } catch (err) { setSubmitError(err); }
    } catch { setStorageError(new Error("The refund request could not be saved safely in browser storage. Restore browser storage access before trying again. If a request was already sent, Sync with Stripe and keep its original request reference; do not start a replacement refund.")); }
    finally { requestInFlight.current = false; setSubmitting(false); }
  }
  return <div className="cr-safeguards"><button className="cr-btn secondary" disabled={busy} onClick={() => void sync()}>{busy ? "Working…" : "Sync with Stripe"}</button>
    {saved.error && <div className="cr-note"><p>A missing record never proves a refund was not sent. Recovery requires the original reference and a verified terminal refund, with any required recovery reconciled. Unreadable references require support review; there is no clear-without-verification option.</p>
      {canManage && <button className="cr-btn secondary" disabled={busy} onClick={() => void recover()}>Reconcile damaged saved request</button>}
    </div>}
    {request && <div className="cr-note" role="status"><strong>Refund request awaiting reconciliation</strong><p>Requested {money(request.amountCents)}. Do not start a replacement request for an unknown result. Sync with Stripe to check this request.</p><p className="cr-muted">Request reference: {request.requestId}</p>{syncedOrder && <p>Only a terminal result with this exact request ID can complete it. Another refund or balance change does not confirm this request.</p>}{canCorrect && <p>The server rejected this request and sync found no matching record. You may correct the form and submit using the same request ID. Eligibility is checked again before sending.</p>}{canRetry && canManage && <button className="cr-btn secondary" disabled={busy} onClick={() => {
      if (window.confirm(`Retry the exact same ${money(request.amountCents)} request with its original ID and unchanged details? The current Stripe state will be checked again before sending.`)) void send(request, true);
    }}>Recheck & retry unchanged request</button>}</div>}
    {!canManage ? <p className="cr-muted">Financial actions require an authorized owner or administrator.</p> : <details><summary>Full or partial buyer refund</summary>
      <p>Original purchase: {money(order.amountCents)}<br />Actually refunded: {money(reportedRefunded)}<br />Remaining before pending requests: {money(remaining)}</p>
      {!knownBalance && <p className="cr-note">The current refunded amount is unknown. Sync with Stripe before requesting a refund.</p>}
      {pending && <p className="cr-note">A refund is pending or needs review. Reconcile it before creating another request.</p>}
      {!eligible && <p className="cr-note">This payment is not eligible for a new refund here. Disputed payments require separate review.</p>}
      <form onSubmit={async e => {
        e.preventDefault();
        if (!canManage || saved.error || !eligible || !valid || !confirmed || (request && !canCorrect) || pending || busy || requestInFlight.current) return;
        if (!window.confirm(`Request a buyer refund of ${money(cents)}? Refund and transfer recovery can fail separately. The application-fee refund is proportional; original processing costs can remain. Check the recorded outcome after submitting.`)) return;
        await send({ requestId: request?.requestId || crypto.randomUUID(), amountCents: cents!, expectedRefundedCents: reportedRefunded, reason: reason.trim() });
      }}><fieldset disabled={!!saved.error || busy || (!!request && !canCorrect) || !!pending || !knownBalance || !eligible}>
        <Field label="Refund amount (USD)"><input required type="text" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setConfirmed(false); }} placeholder="0.00" /></Field>
        <button type="button" className="cr-btn secondary" disabled={remaining == null || remaining <= 0} onClick={() => { if (remaining != null) setAmount((remaining / 100).toFixed(2)); setConfirmed(false); }}>Use full remaining amount</button>
        {amount && !valid && <p className="cr-muted">Enter a positive amount with at most two decimal places, no more than the remaining balance, and a reason of 10–2,000 characters.</p>}
        <Field label="Reason for refund (10–2,000 characters)"><textarea required minLength={10} maxLength={2000} value={reason} onChange={e => { setReason(e.target.value); setConfirmed(false); }} /></Field>
        <Check checked={confirmed} onChange={setConfirmed}>I understand the buyer refund and recovery from recipients can fail separately. The application fee is refunded proportionally; the original processing cost may remain. A submitted request is not proof of a successful refund.</Check>
        <button className="cr-btn danger" disabled={!valid || !confirmed || busy || (!!request && !canCorrect) || !!pending}>{busy ? "Submitting…" : `Request ${cents == null ? "buyer" : money(cents)} refund${request ? " with same ID" : ""}`}</button>
      </fieldset></form>
    </details>}<ErrorBox error={saved.error} /><ErrorBox error={storageError} /><ErrorBox error={submitError} />{submitMessage && <p className="cr-note" role="status">{submitMessage}</p>}<Feedback action={action} />
  </div>;
}

function AdminHandoffReview({ order, scope, canManage }: { order: any; scope: Scope; canManage: boolean }) {
  const action = useCommunityAction(scope);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [mode, setMode] = useState(order.issue?.status === "open" ? "resolve" : "handoff");
  const openIssue = order.issue?.status === "open";
  const canConfirm = order.pickupHelp?.status === "open" && order.status === "paid" && !order.pickupConfirmedAt && !pickupBlocked(order);
  if (!canManage || (!openIssue && order.pickupHelp?.status !== "open")) return null;
  const validReview = reason.trim().length >= 10 && reason.trim().length <= 2000 &&
    evidence.trim().length >= 10 && evidence.trim().length <= 3000;
  return <details className="cr-safeguards"><summary>Staff issue & handoff review</summary><p className="cr-muted">Record the actual evidence reviewed. Issue resolution does not refund the buyer. Manual handoff confirmation requires open pickup assistance, no unresolved issue, no pending or completed refund, and no dispute. Failed or canceled refund attempts alone do not block pickup. Time alone never releases proceeds, and confirmation does not guarantee an immediate bank payout.</p><form onSubmit={async e => {
    e.preventDefault(); const resolve = mode === "resolve";
    if (action.busy || !validReview || (resolve ? !openIssue : !canConfirm)) return;
    if (!window.confirm(resolve ? "Resolve this buyer issue with the recorded reason and evidence? This does not issue a refund." : "Confirm the actual handover based on this evidence? Settlement may follow when funds are available; this is not an immediate bank payout.")) return;
    const result = await action.run(`/orders/${encodeURIComponent(order.id)}/${resolve ? "resolve-issue" : "confirm-handoff"}`, "POST", { ...(resolve ? { issueId: order.issue.id } : { requestId: order.pickupHelp.id }), reason: reason.trim(), evidence: evidence.trim() }, resolve ? "Issue resolution recorded. No refund was initiated by this action." : "Handoff review recorded. Check settlement and available-funds status.");
    if (result) { setReason(""); setEvidence(""); }
  }}><fieldset disabled={action.busy}><Field label="Review action"><select value={mode} onChange={e => setMode(e.target.value)}><option value="resolve" disabled={!openIssue}>Resolve buyer issue</option><option value="handoff" disabled={!canConfirm}>Confirm verified handoff</option></select></Field>
    {order.pickupHelp?.status === "open" && !canConfirm && <p className="cr-note">Manual handoff confirmation is blocked until payment eligibility, issue, refund, and dispute checks are clear.</p>}
    <Field label="Decision reason (10–2,000 characters; staff only)"><textarea required minLength={10} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field><Field label="Evidence reviewed (10–3,000 characters; staff only)"><textarea required minLength={10} maxLength={3000} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Describe the pickup evidence and how it was verified. Do not record pickup codes or bank details." /></Field>
    <button className="cr-btn" disabled={action.busy || !validReview || (mode === "resolve" ? !openIssue : !canConfirm)}>{action.busy ? "Recording review…" : mode === "resolve" ? "Resolve issue" : "Confirm actual handoff"}</button></fieldset><Feedback action={action} /></form></details>;
}

export function AdminOrderSafeguards({ order, scope, canManageFinancialActions = false }: { order: any; scope: Scope; canManageFinancialActions?: boolean }) {
  const notificationAction = useCommunityAction(scope);
  const canManage = canManageFinancialActions === true && order.canManageFinancialActions !== false;
  return <div className="cr-safeguards"><OrderSafeguardStatus order={order} financial /><AdminRefund key={`${scope}:${order.id}`} order={order} scope={scope} canManage={canManage} /><AdminHandoffReview order={order} scope={scope} canManage={canManage} />
    <details><summary>Notification audit & manual retry</summary><p>Buyer: {human(order.notificationStatus?.buyer)}</p><p>Seller: {human(order.notificationStatus?.donor)}</p><p className="cr-muted">Provider acceptance is not proof of delivery. Manual retry may duplicate email.</p><div className="cr-row">{(["buyer", "donor"] as const).map(recipient => <button key={recipient} className="cr-btn secondary" disabled={notificationAction.busy || !canManage} onClick={() => {
      if (window.confirm(`Retry ${recipient === "donor" ? "seller" : "buyer"} email? Check recorded status first to avoid duplicates.`)) void notificationAction.run(`/orders/${encodeURIComponent(order.id)}/retry-email`, "POST", { recipient }, "Email retry requested. Review the returned notification status.");
    }}>Retry {recipient === "donor" ? "seller" : "buyer"} email</button>)}</div><Feedback action={notificationAction} /></details>
    <details><summary>Staff decision audit</summary>{order.audit?.length ? order.audit.map((entry: any, index: number) => <div className="cr-safeguard-record" key={`${entry.createdAt}:${index}`}><strong>{human(entry.action)}</strong><p>{human(entry.actor)} · {date(entry.createdAt)}</p><pre className="cr-safeguard-audit">{JSON.stringify(entry.data, null, 2)}</pre></div>) : <p className="cr-muted">No staff decision audit entries reported.</p>}</details>
  </div>;
}
