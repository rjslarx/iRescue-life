import { useEffect, useState } from "react";
import { PackageOpen } from "lucide-react";
import { CheckoutForm, MessageForm, PhoneVerification, ResaleError } from "@/components/resale/ResaleForms";
import { resaleCents, resaleMoney, type ResaleClient, type ResaleConversation, type ResaleOrder } from "@/hooks/use-rescue-resale";

export function PickupSummary({ order }: { order: ResaleOrder }) {
  return <><div className="resale-row"><strong>{order.itemTitle}</strong><span className="resale-pill">{order.status.replaceAll("_", " ")}</span><span>{resaleMoney(order.amountCents)}</span></div>
    <p className="resale-muted mt-2">Order {order.id}</p>
    {order.pickup && <p className="mt-2"><strong>{order.pickup.label}</strong> · {order.pickup.address}<br />{new Date(order.pickup.startsAt).toLocaleString()} – {new Date(order.pickup.endsAt).toLocaleString()}</p>}
    <p className="resale-muted mt-2">Only a confirmed payment reserves a purchase. Follow the order status above; a checkout redirect alone is not payment confirmation.</p>
  </>;
}
export function OrderActions({ order, api }: { order: ResaleOrder; api: ResaleClient }) {
  const [error, setError] = useState<unknown>(null);
  if (order.status !== "checkout") return null;
  return <div className="mt-4"><p className="resale-muted mb-3">An open checkout may hold this item. To change your pickup or release the hold, safely cancel the unpaid checkout first. A paid order cannot be cancelled here.</p>
    <button className="resale-btn secondary" disabled={api.cancelOrder.isPending} onClick={async () => {
      if (!window.confirm("Cancel this unpaid Stripe checkout and release the item hold? You can choose a new pickup and start again if the item remains available.")) return;
      setError(null);
      try { await api.cancelOrder.mutateAsync(order.id); } catch (err) { setError(err); }
    }}>{api.cancelOrder.isPending ? "Releasing checkout hold…" : "Cancel unpaid checkout / release hold"}</button><ResaleError error={error} />
  </div>;
}
function Conversation({ conversation: c, api }: { conversation: ResaleConversation; api: ResaleClient }) {
  const [error, setError] = useState<unknown>(null);
  const [counter, setCounter] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const expired = c.offerStatus === "expired" || (!!c.expiresAt && Date.parse(c.expiresAt) <= now && ["pending", "accepted", "countered"].includes(c.offerStatus));
  const canRespond = !expired && ((c.role === "donor" && c.offerStatus === "pending") || (c.role === "buyer" && c.offerStatus === "countered"));
  const item = api.items.data?.items.find(i => i.id === c.itemId);
  const action = async (type: "accept" | "decline" | "counter") => {
    setError(null);
    try { await api.offer.mutateAsync({ id: c.id, action: type, ...(type === "counter" ? { amountCents: resaleCents(counter) } : {}) }); setCounter(""); }
    catch (err) { setError(err); }
  };
  return <article className="resale-panel">
    <div className="resale-row"><h3 className="!mb-0">{c.itemTitle}</h3><span className="resale-pill">You: {c.role}</span></div>
    <p className="resale-muted mt-2">Conversation {c.code} · updated {new Date(c.updatedAt).toLocaleString()}</p>
    {c.offerStatus !== "none" && <div className="resale-status"><strong>{c.offerCents != null && resaleMoney(c.offerCents)} offer · {expired ? "expired" : c.offerStatus}</strong>
      {c.expiresAt && <p>Offer deadline: {new Date(c.expiresAt).toLocaleString()}. An accepted offer is valid for two hours; pay before it expires.</p>}
    </div>}
    {canRespond && <div className="mt-4">
      <div className="resale-row"><button className="resale-btn" disabled={api.offer.isPending} onClick={() => void action("accept")}>Accept offer</button><button className="resale-btn secondary" disabled={api.offer.isPending} onClick={() => void action("decline")}>Decline offer</button></div>
      {c.role === "donor" && <form className="resale-row mt-3" onSubmit={event => { event.preventDefault(); void action("counter"); }}><div className="flex-1"><label htmlFor={`counter-${c.id}`}>Counteroffer (USD)</label><input id={`counter-${c.id}`} inputMode="decimal" required value={counter} onChange={e => setCounter(e.target.value)} /></div><button className="resale-btn secondary self-end" disabled={api.offer.isPending}>Send counteroffer</button></form>}
    </div>}
    <ResaleError error={error} />
    {c.role === "buyer" && c.offerStatus === "accepted" && !expired && c.offerCents != null && <CheckoutForm api={api} item={item || { id: c.itemId }} conversationId={c.id} amountCents={c.offerCents} />}
    <details className="resale-details"><summary>Messages ({c.messages.length})</summary>
      {!c.messages.length && <p className="resale-muted">No messages yet.</p>}
      {c.messages.map((message, index) => <div className="resale-message" key={`${message.createdAt}-${index}`}><p className="resale-muted">{message.sender} · {new Date(message.createdAt).toLocaleString()} · {message.status}</p><p>{message.body}</p></div>)}
    </details>
    <MessageForm api={api} conversationId={c.id} />
  </article>;
}
export default function ResaleActivity({ api }: { api: ResaleClient }) {
  const [error, setError] = useState<unknown>(null);
  if (!api.token) return <PhoneVerification api={api} />;
  return <section>
    <div className="resale-toolbar"><div><h2>My activity</h2><p className="resale-muted">Your listings, neighbor conversations, and purchases.</p></div><button className="resale-btn secondary" onClick={() => void api.me.refetch()} disabled={api.me.isFetching}>{api.me.isFetching ? "Refreshing…" : "Refresh activity"}</button></div>
    <PhoneVerification api={api} />
    {api.me.isLoading && <div className="resale-skeleton mt-5" aria-label="Loading your activity" />}
    {api.me.isError && <><ResaleError error={api.me.error} /><button className="resale-btn secondary" onClick={() => void api.me.refetch()}>Retry activity</button></>}
    <ResaleError error={error} />
    {api.me.data && <>
      <h2 className="mt-8">Your donated items</h2>
      {!api.me.data.items.length && <div className="resale-empty"><PackageOpen size={30} /><h3>Your next good deed could be in a cupboard.</h3><p className="resale-muted">Use Donate an item to submit something for rescue review.</p></div>}
      {api.me.data.items.map(item => <article className="resale-panel" key={item.id}>
        <div className="resale-row"><h3 className="!mb-0">{item.title}</h3><span className="resale-pill">{item.status.replaceAll("_", " ")}</span><strong>{resaleMoney(item.askingCents)}</strong></div>
        {["pending", "pending_review"].includes(item.status) && <p className="resale-muted mt-3">Awaiting manual rescue review. Keep the item at home until the arranged pickup.</p>}
        {item.reviewNote && <p className="resale-status"><strong>Rescue review note:</strong> {item.reviewNote}</p>}
        {["pending", "pending_review", "active", "rejected"].includes(item.status) && <button className="resale-btn danger mt-4" disabled={api.withdraw.isPending} onClick={async () => {
          if (!window.confirm(`Withdraw “${item.title}” from Rescue Resale?`)) return;
          setError(null); try { await api.withdraw.mutateAsync(item.id); } catch (err) { setError(err); }
        }}>Withdraw listing</button>}
      </article>)}
      <h2 className="mt-8">Conversations & offers</h2>
      {!api.me.data.conversations.length && <div className="resale-empty"><h3>No conversations yet.</h3><p className="resale-muted">Ask about an item in the shop. Replies and offers will appear here.</p></div>}
      {api.me.data.conversations.map(c => <Conversation key={c.id} conversation={c} api={api} />)}
      <h2 className="mt-8">Your purchases</h2>
      {!api.me.data.orders.length && <div className="resale-empty"><h3>A useful find. A little more rescue support.</h3><p className="resale-muted">Your purchase history and pickup details will appear here.</p></div>}
      {api.me.data.orders.map(order => <article className="resale-panel" key={order.id}><PickupSummary order={order} /><OrderActions order={order} api={api} /></article>)}
    </>}
  </section>;
}
