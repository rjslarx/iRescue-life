import { useState } from "react";
import { resaleError, resaleMoney, type ResaleClient, type ResaleOrder } from "@/hooks/use-rescue-resale";

export function PayoutSetup({ api }: { api: ResaleClient }) {
  const [error, setError] = useState<unknown>(null);
  const account = api.payoutAccount.data;
  if (!api.token) return null;
  const busy = api.onboardPayout.isPending || api.payoutDashboard.isPending;
  return <section className="resale-note mt-5">
    <h3>Contributor payouts</h3>
    <p className="resale-muted">Full donation is always the default. For an optional 50/50 listing, complete Stripe’s secure contributor setup first. Bank details are collected only by Stripe, never by this app.</p>
    {api.payoutAccount.isLoading && <div className="resale-skeleton mt-3" aria-label="Checking payout readiness" />}
    {api.payoutAccount.error && <p className="resale-error" role="alert">{resaleError(api.payoutAccount.error)}</p>}
    {account && <><p className="mt-3"><strong>{account.ready ? "Ready for split listings" : account.exists ? "Setup needs attention" : "Not set up"}</strong> · {account.status.replaceAll("_", " ")}</p>
      {!!account.requirements?.length && <div className="mt-2"><p>Stripe still needs:</p><ul className="list-disc pl-5">{account.requirements.map(requirement => <li key={requirement}>{requirement.replaceAll("_", " ")}</li>)}</ul></div>}
      {account.error && <p className="resale-error" role="alert">{account.error}</p>}
    </>}
    <div className="resale-row mt-4">
      {account && !account.ready && <button type="button" className="resale-btn" disabled={busy} onClick={async () => { setError(null); try { await api.onboardPayout.mutateAsync(); } catch (err) { setError(err); } }}>{api.onboardPayout.isPending ? "Opening Stripe…" : account.exists ? "Resume Stripe setup" : "Set up with Stripe"}</button>}
      {account?.exists && <button type="button" className="resale-btn secondary" disabled={busy} onClick={async () => { setError(null); try { await api.payoutDashboard.mutateAsync(); } catch (err) { setError(err); } }}>{api.payoutDashboard.isPending ? "Opening Stripe…" : "Open Stripe dashboard"}</button>}
      <button type="button" className="resale-btn secondary" disabled={api.payoutAccount.isFetching} onClick={() => void api.payoutAccount.refetch()}>{api.payoutAccount.isFetching ? "Checking readiness…" : "Refresh payout readiness"}</button>
    </div>
    {error != null && <p className="resale-error" role="alert">{resaleError(error)}</p>}
    <p className="resale-muted mt-4">Your share is half of net proceeds after Stripe processing and platform fees. Connect and payout costs may apply separately. Automatic bank payouts happen only after confirmed pickup and available funds—not instantly. Stripe may require additional verification.</p>
    {!!account?.bankPayouts?.length && <div className="mt-4"><h3>Recent bank payouts</h3>{account.bankPayouts.map(payout => <div className="resale-message" key={payout.id}><strong>{resaleMoney(payout.amountCents)}</strong> · {payout.status.replaceAll("_", " ")}<p className="resale-muted">Expected arrival: {payout.arrivalDate ? new Date(payout.arrivalDate * 1000).toLocaleDateString() : "Not available"}</p></div>)}</div>}
  </section>;
}

export function SplitSummary({ order }: { order: ResaleOrder }) {
  if (order.proceedsMode !== "split_50") return <p className="resale-muted mt-3">Full donation · all net proceeds support the rescue.</p>;
  const money = (value: number | null | undefined) => value == null ? "Not settled" : resaleMoney(value);
  return <div className="resale-status"><strong>Optional 50/50 net proceeds split</strong><p>Contributor share: {money(order.split?.contributorCents)} · Rescue share: {money(order.split?.rescueCents)}</p><p>Settlement: {order.split?.status?.replaceAll("_", " ") || "Awaiting settlement"}</p>{order.split?.error && <p role="alert">{order.split.error}</p>}<p className="resale-muted mt-2">After Stripe processing and platform fees. Connect/payout costs may apply separately. Bank payouts require confirmed pickup and available funds; they are not instant.</p></div>;
}

export function DonorSale({ order, api }: { order: ResaleOrder; api: ResaleClient }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [confirmed, setConfirmed] = useState(false);
  return <article className="resale-panel">
    <div className="resale-row"><h3 className="!mb-0">{order.itemTitle}</h3><span className="resale-pill">{order.status.replaceAll("_", " ")}</span><strong>{resaleMoney(order.amountCents)}</strong></div>
    <p className="resale-muted mt-2">Order {order.id}</p>
    {order.pickup && <p className="mt-3">{order.pickup.label} · {order.pickup.address}<br />{new Date(order.pickup.startsAt).toLocaleString()}</p>}
    <SplitSummary order={order} />
    {order.pickupConfirmedAt && <p className="resale-muted mt-3">Pickup confirmed {new Date(order.pickupConfirmedAt).toLocaleString()}.</p>}
    {order.proceedsMode === "split_50" && order.status === "paid" && !order.pickupConfirmedAt && !confirmed && <form className="mt-4" onSubmit={async event => {
      event.preventDefault(); setError(null);
      if (!/^[0-9a-f]{12}$/i.test(code.trim())) { setError(new Error("Enter the buyer’s 12-character pickup code.")); return; }
      if (!window.confirm("Confirm the buyer has received this item? This starts settlement when funds are available.")) return;
      try { await api.confirmPickup.mutateAsync({ id: order.id, code: code.trim() }); setConfirmed(true); setCode(""); } catch (err) { setError(err); }
    }}>
      <label htmlFor={`handoff-${order.id}`}>Buyer’s pickup code</label><p className="resale-muted mb-2">Ask the buyer for this code only when handing over the item. Do not request it in advance. If there is a problem, ask rescue staff for help.</p>
      <input id={`handoff-${order.id}`} value={code} onChange={event => setCode(event.target.value)} required pattern="[0-9a-fA-F]{12}" maxLength={12} autoComplete="off" spellCheck={false} />
      <button className="resale-btn mt-3" disabled={api.confirmPickup.isPending}>{api.confirmPickup.isPending ? "Confirming pickup…" : "Confirm handoff & start settlement"}</button>
    </form>}
    {confirmed && <p className="resale-status" role="status">Pickup confirmed. Settlement will continue in the background when funds are available.</p>}
    {error != null && <p className="resale-error" role="alert">{resaleError(error)}</p>}
  </article>;
}
