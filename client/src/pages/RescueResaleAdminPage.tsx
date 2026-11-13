import { useState } from "react";
import { ResaleDeliveryStatus, deliveryLabel } from "@/components/resale/ResaleDeliveryStatus";
import { CalendarDays, ExternalLink, FileDown, MessageSquare, PackageOpen, Plus, ReceiptText, Trash2 } from "lucide-react";
import type { ResalePickup } from "@shared/rescue-resale";
import { resaleSettingsSchema } from "@shared/rescue-resale";
import DashboardLayout from "@/components/DashboardLayout";
import { useTenant } from "@/contexts/TenantContext";
import { useRescueResale, useResaleAuditMessages, resaleMoney, type ResaleConversation, type ResaleClient, type ResaleItem } from "@/hooks/use-rescue-resale";
import { ResaleError } from "@/components/resale/ResaleForms";
import "@/components/resale/resale.css";

function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function PickupSettings({ api, initial }: { api: ResaleClient; initial: ResalePickup[] }) {
  const [pickups, setPickups] = useState(initial.map(p => ({ ...p, startsAt: localDate(p.startsAt), endsAt: localDate(p.endsAt) })));
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const patch = (id: string, changes: Partial<ResalePickup>) => { setSaved(false); setPickups(current => current.map(p => p.id === id ? { ...p, ...changes } : p)); };
  return <section className="resale-panel">
    <div className="resale-toolbar !mt-0"><div><h2>Pickup windows</h2><p className="resale-muted">A real place and a future time. Buyers must select a compatible window before paying.</p></div><button className="resale-btn secondary" type="button" disabled={pickups.length >= 50 || api.settings.isPending} onClick={() => { setSaved(false); setPickups(current => [...current, { id: crypto.randomUUID(), label: "", kind: "shelter_meetup", address: "", startsAt: "", endsAt: "" }]); }}><Plus size={16} />Add window</button></div>
    <p className="resale-muted mb-5">Use a shelter, scheduled rescue event, or public location—not a donor’s home. Buyers can only check out with windows starting more than 35 minutes ahead. Times are entered in your local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Remove expired windows before saving. There is no courier service.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setError(null); setSaved(false);
      try {
        const data = resaleSettingsSchema.parse({ pickupOptions: pickups.map(p => ({ ...p, startsAt: new Date(p.startsAt).toISOString(), endsAt: new Date(p.endsAt).toISOString() })) });
        if (data.pickupOptions.some(p => Date.parse(p.startsAt) <= Date.now())) throw new Error("Every pickup window must start in the future. Remove or update expired windows.");
        await api.settings.mutateAsync(data); setSaved(true);
      } catch (err) { setError(err); }
    }}>
      {!pickups.length && <div className="resale-empty mb-5"><CalendarDays size={30} /><h3>No pickup windows yet.</h3><p className="resale-muted">Add a place and time to make checkout available for compatible items.</p></div>}
      {pickups.map((p, index) => <fieldset className="resale-note mb-5" key={p.id}>
        <legend className="px-2 font-semibold">Pickup window {index + 1}</legend>
        <div className="resale-two">
          <div className="resale-field"><label htmlFor={`label-${p.id}`}>Window name</label><input id={`label-${p.id}`} value={p.label} minLength={2} maxLength={100} required onChange={e => patch(p.id, { label: e.target.value })} placeholder="Saturday adoption event" /></div>
          <div className="resale-field"><label htmlFor={`kind-${p.id}`}>Location type</label><select id={`kind-${p.id}`} value={p.kind} onChange={e => patch(p.id, { kind: e.target.value as ResalePickup["kind"] })}><option value="shelter_meetup">Shelter / rescue event meetup</option><option value="public_meetup">Public-location meetup</option></select></div>
        </div>
        <div className="resale-field"><label htmlFor={`address-${p.id}`}>Public pickup address</label><input id={`address-${p.id}`} value={p.address} minLength={5} maxLength={250} required onChange={e => patch(p.id, { address: e.target.value })} /></div>
        <div className="resale-two"><div className="resale-field"><label htmlFor={`start-${p.id}`}>Starts (local time)</label><input id={`start-${p.id}`} type="datetime-local" value={p.startsAt} required onChange={e => patch(p.id, { startsAt: e.target.value })} /></div><div className="resale-field"><label htmlFor={`end-${p.id}`}>Ends (local time)</label><input id={`end-${p.id}`} type="datetime-local" value={p.endsAt} required onChange={e => patch(p.id, { endsAt: e.target.value })} /></div></div>
        <button type="button" className="resale-btn danger" disabled={api.settings.isPending} onClick={() => {
          if (!window.confirm(`Remove pickup window ${p.label || index + 1}? Existing orders should still use their confirmed pickup details.`)) return;
          setSaved(false); setPickups(current => current.filter(window => window.id !== p.id));
        }}><Trash2 size={15} />Remove window</button>
      </fieldset>)}
      <ResaleError error={error} />{saved && <p className="resale-status" role="status">Pickup settings saved. Future checkouts will use these windows.</p>}
      <button className="resale-btn" disabled={api.settings.isPending}>{api.settings.isPending ? "Saving pickup windows…" : "Save pickup windows"}</button>
    </form>
  </section>;
}
function ReviewListing({ item, api }: { item: ResaleItem; api: ResaleClient }) {
  const [note, setNote] = useState(item.reviewNote || "");
  const [error, setError] = useState<unknown>(null);
  const review = async (status: "active" | "rejected") => {
    setError(null);
    if (status === "rejected" && !note.trim()) { setError(new Error("Give the donor a clear reason before rejecting this listing.")); return; }
    if (!window.confirm(`${status === "active" ? "Approve and publish" : "Reject"} “${item.title}”?`)) return;
    try { await api.review.mutateAsync({ id: item.id, status, note: note.trim() }); } catch (err) { setError(err); }
  };
  return <article className="resale-panel">
    <div className="resale-row justify-between"><div className="resale-row"><h3 className="!mb-0">{item.title}</h3><span className="resale-pill">{item.status.replaceAll("_", " ")}</span></div><strong className="resale-price">{resaleMoney(item.askingCents)}</strong></div>
    <p className="resale-muted mt-2">{item.category} · ZIP {item.zip} · submitted {new Date(item.createdAt).toLocaleString()}</p>
    <div className="resale-gallery">{item.photos.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`${item.title}, photo ${index + 1} — open full size`} loading="lazy" /></a>)}</div>
    <p className="whitespace-pre-wrap break-words">{item.description}</p>
    <p className="resale-muted mt-3">Pickup: {item.fulfillment.map(kind => kind === "shelter_meetup" ? "shelter / rescue event" : "public location").join(", ")}</p>
    <details className="resale-details"><summary>Donor details (staff only)</summary><p className="break-words">{item.donorName}<br />{item.donorEmail}<br />{item.donorPhone}</p><p className="resale-muted mt-2">Private coordination details. Do not copy donor contact information into public messages.</p></details>
    {["pending", "pending_review", "active", "rejected"].includes(item.status) ? <div className="mt-4"><label htmlFor={`review-${item.id}`}>Review note (required for rejection, visible to donor)</label><textarea id={`review-${item.id}`} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="Explain any changes needed. Do not include personal information." /><ResaleError error={error} /><div className="resale-row mt-4"><button className="resale-btn" disabled={api.review.isPending} onClick={() => void review("active")}>{item.status === "active" ? "Save review note" : "Approve listing"}</button>{item.status !== "rejected" && <button className="resale-btn danger" disabled={api.review.isPending} onClick={() => void review("rejected")}>Reject with note</button>}</div></div> :
      item.reviewNote && <p className="resale-status"><strong>Review note:</strong> {item.reviewNote}</p>}
  </article>;
}
function SalesLedger({ api }: { api: ResaleClient }) {
  const [error, setError] = useState<unknown>(null);
  const orders = api.adminData.data?.orders || [];
  const run = async (id: string, type: "sync" | "complete") => {
    setError(null);
    if (type === "complete" && !window.confirm("Confirm this paid item has been handed over at the arranged pickup?")) return;
    try { await (type === "sync" ? api.sync : api.complete).mutateAsync(id); } catch (err) { setError(err); }
  };
  const fee = (value: number | null | undefined) => value == null ? "Not settled" : resaleMoney(value);
  return <section className="resale-panel">
    <div className="resale-toolbar !mt-0"><div><h2>Sales ledger</h2><p className="resale-muted">All statuses, including checkout, expired, paid, completed, partially refunded, and refunded. These are purchase records, not cash charitable gifts. Original platform revenue and actual rescue net proceeds are distinct amounts. Sync refreshes Stripe settlement and retries only pickup texts confirmed not sent. Provider acceptance is not proof of delivery. Unknown outcomes and delivery failures need staff review, not automatic resending.</p></div><button className="resale-btn secondary" disabled={api.ledger.isPending} onClick={async () => { setError(null); try { await api.ledger.mutateAsync(); } catch (err) { setError(err); } }}><FileDown size={17} />{api.ledger.isPending ? "Preparing export…" : "Download CSV"}</button></div>
    <ResaleError error={error} />
    {!orders.length ? <div className="resale-empty"><ReceiptText size={32} /><h3>No sales recorded yet.</h3><p className="resale-muted">Orders and verified Stripe settlement details will appear here after checkout.</p></div> :
      <div className="resale-table-wrap"><table className="resale-table"><caption className="text-left resale-muted pb-4">Amounts in USD. Unavailable fees are not treated as zero. Net proceeds are server-reported, not estimates.</caption><thead><tr><th scope="col">Order / pickup</th><th scope="col">Payment</th><th scope="col">Fees & proceeds</th><th scope="col">Actions</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}>
        <td className="min-w-[220px]"><strong>{order.itemTitle}</strong><p className="resale-muted">{new Date(order.createdAt).toLocaleString()}</p><p className="break-all text-xs mt-2">{order.id}</p>{order.pickup && <p className="mt-3"><strong>{order.pickup.label}</strong><br />{order.pickup.address}<br />{new Date(order.pickup.startsAt).toLocaleString()} – {new Date(order.pickup.endsAt).toLocaleString()}</p>}<details className="mt-3"><summary className="cursor-pointer font-semibold">Buyer phone (staff only)</summary><p>{order.buyerPhone || "Not available"}</p></details></td>
        <td className="min-w-[190px]"><span className="resale-pill">{order.status.replaceAll("_", " ")}</span><p className="font-semibold mt-2">{resaleMoney(order.amountCents)}</p>{order.notificationStatus && <div className="mt-3 resale-muted"><p>Buyer notification: {deliveryLabel(order.notificationStatus.buyer)}</p><p>Donor notification: {deliveryLabel(order.notificationStatus.donor)}</p></div>}<details className="mt-3"><summary className="cursor-pointer">Stripe references</summary><p className="break-all mt-2">Session: {order.stripeSessionId || "Not available"}</p><p className="break-all mt-2">Payment intent: {order.stripePaymentIntentId || "Not available"}</p></details></td>
        <td className="min-w-[185px]"><p>Stripe fee: {fee(order.stripeFeeCents)}</p><p>Original platform revenue: {fee(order.platformFeeCents)}</p><p className="font-semibold mt-2">Actual rescue net proceeds: {fee(order.rescueProceedsCents)}</p><p className="mt-2">Refunded: {order.refundedCents == null ? "Not available" : resaleMoney(order.refundedCents)}</p></td>
        <td className="min-w-[170px]"><button className="resale-btn secondary" disabled={api.sync.isPending || api.complete.isPending} onClick={() => void run(order.id, "sync")}>Sync with Stripe</button>{order.status === "paid" && <button className="resale-btn mt-3" disabled={api.complete.isPending || api.sync.isPending} onClick={() => void run(order.id, "complete")}>Mark picked up</button>}</td>
      </tr>)}</tbody></table></div>}
  </section>;
}
function MessageAudit({ conversation: c }: { conversation: ResaleConversation }) {
  const [offset, setOffset] = useState(0);
  const query = useResaleAuditMessages(c.id, offset);
  const messages = offset === 0 ? c.messages : query.data?.messages;
  const hasMore = offset === 0 ? c.messagesHasMore : query.data?.hasMore;
  return <details className="resale-details"><summary>Filtered message audit</summary>
    {offset > 0 && query.isLoading ? <p role="status">Loading messages…</p> :
      offset > 0 && query.isError ? <><ResaleError error={query.error} /><button className="resale-btn secondary" onClick={() => void query.refetch()}>Retry messages</button></> :
      <><p className="resale-muted" role="status">{messages?.length ? `Messages ${offset + 1}–${offset + messages.length}` : "No messages on this page."}</p>
        {messages?.map((message, index) => <div className="resale-message" key={`${offset}-${index}`}><p className="resale-muted">{message.sender} · {new Date(message.createdAt).toLocaleString()} · <ResaleDeliveryStatus message={message} /></p><p>{message.body}</p></div>)}</>}
    <div className="resale-row mt-3">
      <button className="resale-btn secondary" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(n => Math.max(0, n - 300))}>Previous messages</button>
      <button className="resale-btn secondary" disabled={!hasMore || query.isFetching} onClick={() => setOffset(n => n + 300)}>Next messages</button>
    </div>
  </details>;
}
export default function RescueResaleAdminPage() {
  const { tenantId, basePath } = useTenant();
  return <ResaleAdminWorkspace key={`${tenantId}:${basePath}`} />;
}
function ResaleAdminWorkspace() {
  const { basePath } = useTenant();
  const [deliveryStatus, setDeliveryStatus] = useState("all");
  const [conversationOffset, setConversationOffset] = useState(0);
  const api = useRescueResale({ admin: true, deliveryStatus, conversationOffset });
  const [tab, setTab] = useState<"listings" | "pickups" | "conversations" | "sales">("listings");
  const [pendingOnly, setPendingOnly] = useState(true);
  const data = api.adminData.data;
  const pending = data?.items.filter(i => ["pending", "pending_review"].includes(i.status)).length || 0;
  const listings = data?.items.filter(i => !pendingOnly || ["pending", "pending_review"].includes(i.status)) || [];
  return <DashboardLayout title="Rescue Resale" description="A neighborhood fundraiser, thoughtfully managed.">
    <div className="resale rounded-xl !min-h-0"><main className="resale-wrap !w-auto !mx-0 !px-4 md:!px-7">
      <div className="resale-toolbar !mt-0"><div><span className="resale-kicker">Community giving · Finance workspace</span><h1 className="!text-4xl !mb-2">Good things, doing good.</h1><p className="resale-muted">Manual listing review. Arranged local pickup. All net proceeds for rescue.</p></div><a className="resale-btn secondary" href={`${basePath}/rescue-resale`} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />View storefront</a></div>
      <nav className="resale-tabs" aria-label="Resale management">{([
        { id: "listings", label: `Listings${pending ? ` (${pending} pending)` : ""}`, icon: PackageOpen },
        { id: "pickups", label: "Pickup settings", icon: CalendarDays },
        { id: "conversations", label: "Conversation logs", icon: MessageSquare },
        { id: "sales", label: "Sales ledger", icon: ReceiptText },
      ] as const).map(t => <button className={`resale-btn ${tab === t.id ? "" : "secondary"}`} key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}><t.icon size={16} aria-hidden="true" />{t.label}</button>)}</nav>
      {api.adminData.isLoading ? <div className="resale-skeleton" aria-label="Loading resale workspace" /> : api.adminData.isError ? <><ResaleError error={api.adminData.error} /><button className="resale-btn" onClick={() => void api.adminData.refetch()}>Retry workspace</button></> : data && <>
        {tab === "pickups" && <PickupSettings api={api} initial={data.settings.pickupOptions} />}
        {tab === "sales" && <SalesLedger api={api} />}
        {tab === "listings" && <><div className="resale-toolbar"><div><h2>Listing review</h2><p className="resale-muted">Review photos, safety, condition, and pickup compatibility before publishing. No automated triage.</p></div><div className="resale-row"><button className={`resale-btn ${pendingOnly ? "" : "secondary"}`} aria-pressed={pendingOnly} onClick={() => setPendingOnly(true)}>Pending review</button><button className={`resale-btn ${!pendingOnly ? "" : "secondary"}`} aria-pressed={!pendingOnly} onClick={() => setPendingOnly(false)}>All listings</button><button className="resale-btn secondary" disabled={api.adminData.isFetching} onClick={() => void api.adminData.refetch()}>Refresh</button></div></div>
          {!listings.length ? <div className="resale-empty"><PackageOpen size={32} /><h3>{pendingOnly ? "The review queue is clear." : "No listings yet."}</h3><p className="resale-muted">{pendingOnly ? "New donor submissions will appear here for your review." : "Share the storefront with your community to invite the first donated items."}</p></div> : listings.map(item => <ReviewListing key={item.id} item={item} api={api} />)}
        </>}
        {tab === "conversations" && <section className="resale-panel"><h2>Masked conversation logs</h2><p className="resale-muted mb-5">Audit the filtered message bodies, delivery statuses, and offers relayed between masked participants. Blocked attempts appear as a generic marker. Contact-pattern filtering is not a guarantee of privacy; participants should never share personal contact details in messages.</p>
          <div className="resale-row mb-4"><label htmlFor="resale-delivery-filter">Recipient delivery status</label><select id="resale-delivery-filter" value={deliveryStatus} onChange={e => { setDeliveryStatus(e.target.value); setConversationOffset(0); }}>
            <option value="all">All conversations</option><option value="attention">Needs attention</option><option value="undelivered">Undelivered</option><option value="failed">Failed</option><option value="not_sent">Not sent</option><option value="unknown">Unknown outcome</option>
          </select><button className="resale-btn secondary" disabled={api.adminData.isFetching} onClick={() => void api.adminData.refetch()}>Refresh</button></div>
          <p className="resale-muted mb-4" role="status">Showing {data.conversations.length ? `${conversationOffset + 1}–${conversationOffset + data.conversations.length}` : "0"} matching conversations, most recently updated first. Filters and summaries cover the entire message history. Use Previous and Next to browse conversations and message entries. Results may shift as new activity arrives. Needs attention includes undelivered, failed, not-sent, and unknown outcomes. Unknown recipients are legacy records without recipient tracking. Historical failures may have been accepted by the provider. Review outcomes manually; this view never resends texts.</p>
          <div className="resale-row mb-4">
            <button className="resale-btn secondary" disabled={conversationOffset === 0 || api.adminData.isFetching} onClick={() => setConversationOffset(n => Math.max(0, n - 100))}>Previous conversations</button>
            <button className="resale-btn secondary" disabled={!data.conversationsHasMore || api.adminData.isFetching} onClick={() => setConversationOffset(n => n + 100)}>Next conversations</button>
          </div>
          {deliveryStatus !== "all" && !data.conversations.length && <p role="status">No conversations match this delivery status.</p>}
          {!data.conversations.length && deliveryStatus === "all" && <div className="resale-empty"><MessageSquare size={30} /><h3>No conversations yet.</h3><p className="resale-muted">Filtered messages, delivery metadata, and offer states will appear here.</p></div>}
          {data.conversations.map(c => <article className="resale-note mb-4" key={c.id}>
            <div className="resale-row"><h3 className="!mb-0">{c.itemTitle}</h3><span className="resale-pill">{c.offerStatus}</span></div>
            <p className="resale-muted mt-2">Conversation {c.code} · updated {new Date(c.updatedAt).toLocaleString()}</p>
            <ul className="mt-3" aria-label="Delivery outcomes needing attention">{c.deliverySummary?.length ? c.deliverySummary.map(d =>
              <li key={`${d.recipient}-${d.status}`}>To {d.recipient}: {deliveryLabel(d.status)} · {d.count} recipient outcome{d.count === 1 ? "" : "s"}</li>
            ) : <li>No attention outcomes recorded.</li>}</ul>
            {c.offerCents != null && <p className="mt-2">Offer: {resaleMoney(c.offerCents)}{c.expiresAt && ` · deadline ${new Date(c.expiresAt).toLocaleString()}`}</p>}
            <MessageAudit conversation={c} key={`${deliveryStatus}:${conversationOffset}:${c.id}`} />
          </article>)}
        </section>}
      </>}
    </main></div>
  </DashboardLayout>;
}
