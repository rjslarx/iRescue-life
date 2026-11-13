import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartHandshake, MapPin, PackageOpen, Search } from "lucide-react";
import type { Tenant } from "@shared/schema";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import { useRescueResale, resaleMoney, type ResaleItem } from "@/hooks/use-rescue-resale";
import { CheckoutForm, DonateItemForm, MessageForm, PhoneVerification, ResaleError } from "@/components/resale/ResaleForms";
import ResaleActivity, { OrderActions, PickupSummary } from "@/components/resale/ResaleActivity";
import "@/components/resale/resale.css";

export default function RescueResalePage() {
  const { basePath, tenantId } = useTenant();
  const params = new URLSearchParams(window.location.search);
  const orderParam = params.get("order");
  const orderId = orderParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderParam) ? orderParam : null;
  const [tab, setTab] = useState<"shop" | "donate" | "activity">("shop");
  const api = useRescueResale({ orderId, activityOpen: tab === "activity" });
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({ queryKey: ["/api/tenant", tenantId], staleTime: 300000 });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [selected, setSelected] = useState<ResaleItem | null>(null);
  const name = api.config.data?.rescueName || tenantData?.tenant.name || "our rescue";
  const items = (api.items.data?.items || []).filter(item => item.status === "active" && (category === "All categories" || item.category === category) && `${item.title} ${item.description} ${item.zip}`.toLowerCase().includes(search.toLowerCase()));
  useSEO({ title: `Rescue Resale | ${name}`, description: `Buy local secondhand finds or donate an item. All net proceeds support ${name}.`, url: `${window.location.origin}${basePath}/rescue-resale` });
  return <div className="resale">
    <PublicHeader rescueName={name} logoUrl={tenantData?.tenant.logoUrl || undefined} />
    <main className="resale-wrap">
      <section className="resale-hero">
        <div><span className="resale-kicker">Rescue Resale · Neighbors helping animals</span><h1>Good finds.<br />Fresh starts.</h1><p className="resale-lede">A second chapter for your belongings. A better next chapter for animals. Shop local, pre-loved things, with all net proceeds supporting <strong>{name}</strong>.</p></div>
        <aside className="resale-note"><HeartHandshake size={30} strokeWidth={1.4} aria-hidden="true" /><h2 className="mt-4">A neighborhood effort.</h2><ol><li><strong>Find something worth keeping.</strong><br />Ask a question or make an offer privately.</li><li><strong>Choose a pickup. Pay securely.</strong><br />Local meetups, arranged through the rescue.</li><li><strong>Make room for a little good.</strong><br />Donors keep items at home until pickup.</li></ol></aside>
      </section>
      {params.get("cancelled") === "1" && <div className="resale-status" role="status"><strong>You returned without completing checkout.</strong><p>This does not confirm payment or release an existing item hold. Verify your phone, refresh the order below, then cancel the unpaid checkout to release the hold or change pickup.</p><button className="resale-btn secondary mt-3" onClick={() => setTab("activity")}>Open My activity</button></div>}
      {orderParam && <section className="resale-panel" aria-live="polite"><h2>Your order</h2>
        {!orderId ? <p>That order reference is invalid. Open My activity to find your purchases.</p> : !api.token ? <><p className="mb-4">Verify the same phone used at checkout to securely retrieve your order. Your verification token is never included in the page link.</p><PhoneVerification api={api} /></> :
          api.order.isLoading ? <div className="resale-skeleton" aria-label="Checking your payment" /> :
            api.order.isError ? <><ResaleError error={api.order.error} /><button className="resale-btn secondary" onClick={() => void api.order.refetch()}>Retry payment check</button><div className="mt-4"><PhoneVerification api={api} /></div></> :
              api.order.data ? <><PickupSummary order={api.order.data} /><OrderActions order={api.order.data} api={api} /><button className="resale-btn secondary mt-4" disabled={api.order.isFetching} onClick={() => void api.order.refetch()}>{api.order.isFetching ? "Checking payment…" : "Refresh payment status"}</button></> : null}
      </section>}
      <nav className="resale-tabs" aria-label="Rescue Resale sections">{([{ key: "shop", label: "Shop the finds" }, { key: "donate", label: "Donate an item" }, { key: "activity", label: "My activity" }] as const).map(t => <button key={t.key} className={`resale-btn ${tab === t.key ? "" : "secondary"}`} aria-current={tab === t.key ? "page" : undefined} onClick={() => setTab(t.key)}>{t.label}</button>)}</nav>
      {api.config.isLoading ? <div className="resale-skeleton" aria-label="Loading Rescue Resale" /> : api.config.isError ? <><ResaleError error={api.config.error} /><button className="resale-btn" onClick={() => void api.config.refetch()}>Retry connection</button></> :
        tab === "activity" ? <ResaleActivity api={api} /> :
          !api.config.data?.enabled ? <div className="resale-empty"><PackageOpen size={36} /><h2>The resale board is resting.</h2><p>New listings and purchases are not available right now. Existing participants can still check My activity.</p><button className="resale-btn secondary mt-4" onClick={() => void api.config.refetch()}>Check availability</button></div> :
            tab === "donate" ? api.token ? <><DonateItemForm api={api} /><PhoneVerification api={api} /></> : <PhoneVerification api={api} /> :
              <>
                <div className="resale-toolbar"><div><h2 className="!mb-1">The neighborhood finds</h2><p className="resale-muted">One-of-a-kind things. One shared cause.</p></div><div className="resale-row"><div><label htmlFor="resale-search" className="sr-only">Search title, description, or ZIP</label><div className="relative"><Search className="absolute left-3 top-3.5" size={17} aria-hidden="true" /><input id="resale-search" style={{ paddingLeft: 38 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search finds or ZIP" type="search" /></div></div><div><label htmlFor="resale-category" className="sr-only">Filter category</label><select id="resale-category" value={category} onChange={e => setCategory(e.target.value)}>{["All categories", "Home", "Furniture", "Clothing", "Electronics", "Pet supplies", "Other"].map(c => <option key={c}>{c}</option>)}</select></div></div></div>
                {api.items.isLoading ? <div className="resale-grid" aria-label="Loading listings">{[1, 2, 3].map(n => <div className="resale-skeleton" key={n} />)}</div> : api.items.isError ? <><ResaleError error={api.items.error} /><button className="resale-btn" onClick={() => void api.items.refetch()}>Retry listings</button></> :
                  !items.length ? <div className="resale-empty"><PackageOpen size={36} /><h2>{search || category !== "All categories" ? "No finds match just yet." : "Every good thing starts with a neighbor."}</h2><p className="resale-muted">{search || category !== "All categories" ? "Try another search or reset the filters." : "Be the first to offer a useful item and support the rescue."}</p><button className="resale-btn mt-5" onClick={() => { if (search || category !== "All categories") { setSearch(""); setCategory("All categories"); } else setTab("donate"); }}>{search || category !== "All categories" ? "Clear filters" : "Donate an item"}</button></div> :
                    <div className="resale-grid">{items.map(item => <article className="resale-card" key={item.id}>
                      {item.photos[0] && <img className="resale-photo" src={item.photos[0]} alt={item.title} loading="lazy" />}
                      <div className="resale-card-body"><div className="resale-row justify-between mb-3"><span className="resale-kicker">{item.category}</span><span className="resale-price">{resaleMoney(item.askingCents)}</span></div><h3>{item.title}</h3><p className="resale-muted flex items-center gap-1"><MapPin size={14} aria-hidden="true" />ZIP {item.zip} · local pickup</p><p className="resale-muted mt-3 line-clamp-2">{item.description}</p><button className="resale-btn secondary" onClick={() => setSelected(item)}>View item & pickup</button></div>
                    </article>)}</div>}
                <div className="resale-note mt-8"><h3>Belongings stay with their donors. Support stays with the rescue.</h3><p className="resale-muted">Please don’t bring items to the shelter before an arranged pickup. There are no seller payouts, home collections, or couriers. Processing and platform fees are deducted; all net proceeds go to {name}.</p></div>
              </>}
    </main>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="resale !min-h-0 max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {selected && <><DialogHeader><span className="resale-kicker">{selected.category} · ZIP {selected.zip}</span><DialogTitle className="!text-2xl">{selected.title}</DialogTitle><DialogDescription className="!text-[#596b60]">Local pickup only. All net proceeds support {name}.</DialogDescription></DialogHeader>
          <div className="resale-gallery">{selected.photos.map((photo, index) => <a href={photo} target="_blank" rel="noopener noreferrer" key={photo}><img src={photo} alt={`${selected.title}, photo ${index + 1} — open full size`} /></a>)}</div>
          <p className="whitespace-pre-wrap break-words">{selected.description}</p><strong className="resale-price">{resaleMoney(selected.askingCents)}</strong>
          <p className="resale-muted">Pickup: {selected.fulfillment.map(f => f === "shelter_meetup" ? "arranged shelter / rescue event" : "public meetup").join(" or ")}. Items remain with their donors until arranged pickup.</p>
          {api.me.data?.items.some(i => i.id === selected.id) ? <p className="resale-status">This is your donated item. Follow offers and listing status in My activity.</p> : !api.token ? <PhoneVerification api={api} /> : <><CheckoutForm api={api} item={selected} amountCents={selected.askingCents} /><MessageForm api={api} itemId={selected.id} /></>}
        </>}
      </DialogContent>
    </Dialog>
    <PublicFooter tenant={tenantData?.tenant} basePath={basePath} />
  </div>;
}
