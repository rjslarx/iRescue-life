import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Copy, HeartHandshake, MapPin, ShieldCheck, Upload } from "lucide-react";
import { communityCategories, communityCaption, communityItemSchema } from "@shared/community-resale";
import { communityRequest, communityToken, saveCommunityToken, useCommunityQuery, useRefreshCommunity } from "@/hooks/use-community-resale";
import { useCommunityAction } from "@/hooks/use-community-actions";
import { Check, date, Empty, ErrorBox, Feedback, Field, GroundRules, human, money, QueryState, SellerContact, Shell, Verification } from "@/components/community-resale/CommunityUI";

function PartnerSelect({ partners, value, onChange }: { partners: any[]; value: string; onChange: (id: string) => void }) {
  return <Field label="Rescue partner"><select required value={value} onChange={e => onChange(e.target.value)}><option value="">Choose a local rescue</option>{partners.map(p => <option key={p.tenantId} value={p.tenantId}>{p.name}{p.city ? ` · ${p.city}` : ""}</option>)}</select></Field>;
}
function PartnerIdentity({ partner }: { partner: any }) {
  return <>{partner.logoUrl ? <img src={partner.logoUrl} alt={`${partner.name} logo`} /> : <span className="cr-initials">{partner.name?.slice(0, 2).toUpperCase()}</span>}<div><strong>{partner.name}</strong><p className="cr-muted">{partner.city}{partner.publicEin && ` · EIN ${partner.publicEin}`}</p></div></>;
}
export default function CommunityResalePage() {
  const partners = useCommunityQuery("/partners");
  const [tenantId, setTenantId] = useState(new URLSearchParams(window.location.search).get("tenantId") || "");
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("");
  const items = useCommunityQuery(`/items${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`);
  const visible = (items.data?.items || []).filter((i: any) => (!category || i.category === category) && `${i.title} ${i.description} ${i.rescueName}`.toLowerCase().includes(search.toLowerCase()));
  return <Shell><section className="cr-hero"><div><span className="cr-kicker">The Acadiana community marketplace</span><h1>A second home.<br />A second chance.</h1><p className="cr-lede">The chair you no longer need. The rescue that needs a hand. Buy and sell with your neighbors, and put your everyday belongings to work for local animals.</p><div className="cr-row"><a className="cr-btn" href="#finds">Explore local finds <ArrowRight size={17} /></a><a href="/resale/create">Give something a new purpose</a></div></div><aside className="cr-aside"><HeartHandshake size={66} strokeWidth={1} /><span className="cr-kicker">Keep the good going</span><span className="cr-number">Local goods.<br />Lasting good.</span><p className="cr-muted" style={{ marginTop: 20 }}>You choose the rescue.<br />Your neighbor gets a great find.<br />Net proceeds make a difference.</p></aside></section>
    <section id="finds"><div className="cr-toolbar"><div><span className="cr-kicker">Pass it along</span><h2>Find your next good thing.</h2></div><span className="cr-muted">Local pickup · Secure online payment</span></div><div className="cr-filters"><Field label="Search the neighborhood"><input placeholder="A reading chair, a winter coat…" value={search} onChange={e => setSearch(e.target.value)} type="search" /></Field><Field label="Supporting"><select value={tenantId} onChange={e => setTenantId(e.target.value)}><option value="">All rescue partners</option>{partners.data?.partners?.map((p: any) => <option value={p.tenantId} key={p.tenantId}>{p.name}</option>)}</select></Field><Field label="Category"><select value={category} onChange={e => setCategory(e.target.value)}><option value="">All belongings</option>{communityCategories.map(c => <option key={c}>{c}</option>)}</select></Field></div>
    {partners.isError && <><ErrorBox error={partners.error} /><button className="cr-btn secondary" onClick={() => void partners.refetch()}>Retry rescue partners</button></>}
    <QueryState query={items}>{visible.length ? <div className="cr-grid">{visible.map((i: any) => <article className="cr-card" key={i.id}><a href={`/resale/item/${i.id}`}><div className="cr-image">{i.photos?.[0] ? <img src={i.photos[0]} alt={i.title} loading="lazy" /> : <HeartHandshake size={40} />}</div><div className="cr-card-body"><span className="cr-kicker">{i.category}</span><h3>{i.title}</h3><div className="cr-row" style={{ justifyContent: "space-between" }}><span className="cr-price">{money(i.askingCents)}</span><span className="cr-muted">ZIP {i.zip}</span></div><p className="cr-muted" style={{ marginTop: 12 }}>For {i.rescueName || "a local rescue"}</p><span className="cr-pill">{i.proceedsMode === "split_50" ? "50/50 net split" : "All net proceeds donated"}</span>{i.status !== "active" && <span className="cr-pill">{human(i.status)}</span>}</div></a></article>)}</div> : <Empty title={search || category || tenantId ? "Nothing here just yet." : "The next good find could be yours."}>{search || category || tenantId ? "Try another search or rescue partner. New listings appear after rescue review." : "Be among the first neighbors to turn something you no longer need into help for a local rescue."}<br /><a href="/resale/create">List something for a rescue</a></Empty>}</QueryState></section>
    <section id="how-it-works" className="cr-steps"><div><span className="cr-kicker">01 / For the neighbor with something to give</span><h2>Less in your closet.<br />More care in your community.</h2><p>Choose an approved rescue, verify your email, and upload up to three honest photos. Once the rescue approves your listing, copy the caption and share it to Facebook yourself.</p><a href="/resale/create">Start a listing <ArrowUpRight size={15} style={{ display: "inline" }} /></a></div><div><span className="cr-kicker">02 / For the neighbor who spots a keeper</span><h2>Find it. Talk it over.<br />Meet somewhere safe.</h2><p>Negotiate with the seller in Messenger. The seller updates the listing to your agreed price before you pay securely here. Arrange a public pickup and share your private pickup code only at handover.</p><p className="cr-muted">No bidding bots. No shipping promises. Just people helping nearby rescues.</p></div></section>
    <section id="partners" className="cr-partners"><span className="cr-kicker">Rooted right here</span><h2>Meet the rescues behind the good.</h2><QueryState query={partners} label="Loading rescue partners">{partners.data?.partners?.length ? partners.data.partners.map((p: any) => <article className="cr-partner" key={p.tenantId}><PartnerIdentity partner={p} /><a className="cr-btn secondary" href={`/resale/create?tenantId=${p.tenantId}`}>Sell for this rescue <ArrowUpRight size={15} /></a></article>) : <Empty title="Making room for our rescue partners.">Approved participating rescues will appear here. Check back soon to find a cause close to home.</Empty>}</QueryState></section><GroundRules /></Shell>;
}

function ItemEditor({ partner, initial, onSaved }: { partner: any; initial?: any; onSaved: (id: string) => void }) {
  const action = useCommunityAction();
  const [title, setTitle] = useState(initial?.title || "");
  const [donorName, setDonorName] = useState(initial?.donorName || initial?.sellerFirstName || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "Home");
  const [zip, setZip] = useState(initial?.zip || "");
  const [facebookContactUrl, setFacebookContactUrl] = useState(initial?.facebookContactUrl || "");
  const [price, setPrice] = useState(initial ? (initial.askingCents / 100).toFixed(2) : "");
  const [photos, setPhotos] = useState<string[]>(initial?.photos || []);
  const [mode, setMode] = useState(initial?.proceedsMode || "donate_all");
  const [ownership, setOwnership] = useState(false); const [goodsOnly, setGoodsOnly] = useState(false);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const account = useCommunityQuery(`/payout-account?tenantId=${encodeURIComponent(partner.tenantId)}`, "public", !!partner.allowSplit);
  const eligibleSplit = partner.allowSplit && account.data?.ready && Number(price) * 100 >= Math.max(5000, partner.splitMinimumCents || 5000);
  return <form className="cr-panel" onSubmit={async e => {
    e.preventDefault();
    try {
      const data = communityItemSchema.parse({ tenantId: partner.tenantId, donorName, facebookContactUrl, title, description, category, zip, askingCents: Math.round(Number(price) * 100), photos, proceedsMode: mode, ownership, goodsOnly, splitConsent: consent });
      if (mode === "split_50" && !eligibleSplit) throw new Error("The rescue must enable splits, the minimum price must be met, and your payout account must be ready.");
      const result = await action.run(initial ? `/items/${initial.id}` : "/items", initial ? "PUT" : "POST", initial ? { ...data, version: initial.version } : data, "Sent to the rescue for review.");
      if (result) onSaved(initial?.id || result.id);
    } catch (err) { action.setError(err); }
  }}><span className="cr-kicker">{initial ? "Edit your listing" : "Your listing · Rescue review comes next"}</span><h2>{initial ? "A few thoughtful changes." : "Tell its next chapter."}</h2>
    <div className="cr-two"><Field label="Your name (only your first name is public)"><input required minLength={2} maxLength={100} value={donorName} onChange={e => setDonorName(e.target.value)} autoComplete="name" /></Field><Field label="Item title"><input required minLength={3} maxLength={100} value={title} onChange={e => setTitle(e.target.value)} placeholder="Oak side table, ready for a new home" /></Field></div>
    <Field label="Description & condition"><textarea required minLength={15} maxLength={3000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Measurements, wear, what is included, and anything your neighbor should know. Keep private contact details out." /></Field>
    <Field label="Public Facebook or Messenger contact link"><input required type="url" maxLength={400} value={facebookContactUrl} onChange={e => setFacebookContactUrl(e.target.value)} placeholder="https://m.me/your.profile" /><p className="cr-muted">This link will be public and reviewed by the rescue. Use a profile or post where buyers can message you. It can reveal your Facebook identity. Buyers should message you before paying and keep that conversation for pickup.</p></Field>
    <div className="cr-filters"><Field label="Category"><select value={category} onChange={e => setCategory(e.target.value)}>{communityCategories.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Pickup ZIP code"><input required pattern="[0-9]{5}" inputMode="numeric" value={zip} onChange={e => setZip(e.target.value)} maxLength={5} /></Field><Field label="Asking price (USD)"><input required type="number" min="1" max="5000" step=".01" value={price} onChange={e => setPrice(e.target.value)} /></Field></div>
    <Field label="Original photos · 1–3 images"><input type="file" accept="image/*" disabled={uploading || photos.length >= 3 || action.busy} onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return; setUploading(true); action.setError(null);
      try { const body = new FormData(); body.append("file", file); body.append("tenantId", partner.tenantId); const result = await communityRequest("/images", "POST", body); setPhotos(p => [...p, result.imageUrl].slice(0, 3)); }
      catch (err) { action.setError(err); } finally { setUploading(false); e.target.value = ""; }
    }} /></Field>{uploading && <p role="status"><Upload size={15} style={{ display: "inline" }} /> Uploading original photo…</p>}<div className="cr-photos">{photos.map((url, i) => <div key={url}><a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Listing photo ${i + 1}`} /></a><button type="button" onClick={() => setPhotos(p => p.filter((_, n) => n !== i))}>Remove photo {i + 1}</button></div>)}</div>
    <div className="cr-note"><strong>Proceeds for {partner.name}</strong><p>5% of the gross sale price and processing fees come out of the price. Full donation is always the default.</p></div>
    <Field label="Where should net proceeds go?"><select value={mode} onChange={e => { setMode(e.target.value); setConsent(false); }}><option value="donate_all">All net proceeds to {partner.name}</option>{partner.allowSplit && <option value="split_50" disabled={!eligibleSplit}>50/50 net split · Rescue and seller</option>}</select></Field>
    {partner.allowSplit && <><p className="cr-muted">Optional split minimum: {money(Math.max(5000, partner.splitMinimumCents || 5000))}. Complete payout setup before choosing a split. Fees come out first; the remaining net is split equally. Pickup confirmation and available funds are required before transfers. Refunds, disputes, payout fees, and tax reporting may apply.</p><QueryState query={account} label="Checking payout readiness"><p className="cr-muted">Payout account: {account.data?.ready ? "Ready for splits" : human(account.data?.status || "Setup required")}</p>{account.data?.requirements && <details><summary>Account requirements</summary><p>{human(account.data.requirements)}</p></details>}<button className="cr-btn secondary" type="button" disabled={action.busy} onClick={async () => { const r = await action.run(account.data?.exists ? "/payout-account/dashboard" : "/payout-account/onboard", "POST", { tenantId: partner.tenantId }, "Opening payout account…"); if (r?.url) window.location.assign(r.url); }}>Manage payout account <ArrowUpRight size={14} /></button>{!account.data?.ready && account.data?.exists && <button type="button" className="cr-btn secondary" disabled={action.busy} onClick={async () => { const r = await action.run("/payout-account/onboard", "POST", { tenantId: partner.tenantId }); if (r?.url) window.location.assign(r.url); }}>Finish payout setup</button>}<button type="button" className="cr-btn secondary" onClick={() => void account.refetch()}>Recheck readiness</button></QueryState></>}
    {mode === "split_50" && <Check checked={consent} onChange={setConsent}>I agree that half of net proceeds after fees goes to the rescue and half to my payout account. This is not a 50/50 split of the gross sale price.</Check>}
    <Check checked={ownership} onChange={setOwnership}>I own this item and have the right to sell it.</Check><Check checked={goodsOnly} onChange={setGoodsOnly}>This listing is for physical belongings, not animals, rehoming, or services.</Check><Feedback action={action} /><button className="cr-btn" disabled={action.busy || uploading || !photos.length || !ownership || !goodsOnly}>{action.busy ? "Sending to rescue…" : initial ? "Save changes for review" : "Submit for rescue review"} <ArrowRight size={16} /></button><p className="cr-muted" style={{ marginTop: 12 }}>Your listing is not public until the rescue approves it.</p>
  </form>;
}

export function CommunityCreatePage() {
  const partners = useCommunityQuery("/partners");
  const [tenantId, setTenantId] = useState(new URLSearchParams(window.location.search).get("tenantId") || "");
  const [verified, setVerified] = useState(!!communityToken()); const [saved, setSaved] = useState("");
  const partner = partners.data?.partners?.find((p: any) => p.tenantId === tenantId);
  return <Shell><span className="cr-kicker">Give your belongings a bigger purpose</span><h1>Make room.<br />Make a difference.</h1><p className="cr-lede">A simple listing. A local handoff. Real support for the rescue you choose.</p><QueryState query={partners} label="Loading rescue partners">{!partners.data?.partners?.length ? <Empty title="No participating rescue yet.">A rescue must be approved and participating before you can submit a listing.</Empty> : <><div style={{ maxWidth: 600 }}><PartnerSelect partners={partners.data.partners} value={tenantId} onChange={id => { setTenantId(id); setSaved(""); }} /></div>{partner && <>{!verified ? <Verification tenantId={tenantId} onVerified={() => setVerified(true)} /> : saved ? <section className="cr-panel"><ShieldCheck size={34} /><h2>Off to the rescue.</h2><p>Your item is waiting for review. You can check the status and any review notes in your activity.</p><div className="cr-row"><a href="/resale/manage" className="cr-btn">View my activity</a><button className="cr-btn secondary" onClick={() => setSaved("")}>List another item</button></div></section> : <><p className="cr-muted">Verified seller session. <button onClick={() => { saveCommunityToken(""); setVerified(false); }} style={{ textDecoration: "underline" }}>Use another email</button></p><ItemEditor key={tenantId} partner={partner} onSaved={setSaved} /></>}</>}</>}</QueryState><GroundRules /></Shell>;
}

function ShareListing({ item, rescueName }: { item: any; rescueName: string }) {
  const [fallback, setFallback] = useState(""); const [copied, setCopied] = useState(""); const [error, setError] = useState<unknown>(null);
  const url = `${window.location.origin}/resale/item/${item.id}`;
  const caption = communityCaption(item, rescueName, url);
  async function copy(text: string, label: string) {
    setError(null); setCopied(""); setFallback(text);
    try { await navigator.clipboard.writeText(text); setCopied(label); } catch { setError(new Error("Clipboard access is unavailable. Select and copy the text below.")); }
  }
  return <section className="cr-panel"><span className="cr-kicker">Word of mouth, made easier</span><h3>Share a little good.</h3><p className="cr-muted">Copy the ready-to-share caption, save the photos, then create your own Facebook post. Talk price and pickup in Messenger. We never post or update Facebook for you.</p><div className="cr-row"><button className="cr-btn secondary" onClick={() => void copy(caption, "Caption copied. Paste it into your own Facebook post.")}><Copy size={15} />Copy Facebook caption</button><button className="cr-btn secondary" onClick={() => void copy(url, "Clean listing link copied.")}>Copy item link</button><a className="cr-btn secondary" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Open Facebook share <ArrowUpRight size={14} /></a></div><ErrorBox error={error} />{copied && <p className="cr-success" role="status">{copied}</p>}{fallback && <Field label="Copyable text (contains no private order tokens)"><textarea readOnly value={fallback} onFocus={e => e.target.select()} /></Field>}<details><summary>Save original photos for your post</summary><p className="cr-muted">Open a photo below. On mobile, touch and hold the original and choose Save Image. On a computer, right-click and save. Return here to copy the caption.</p><div className="cr-row">{item.photos?.map((src: string, n: number) => <a key={src} href={src} target="_blank" rel="noopener noreferrer">Open original photo {n + 1}</a>)}</div></details></section>;
}
export function CommunityItemPage() {
  const { id } = useParams<{ id: string }>(); const query = useCommunityQuery(`/items/${id}`);
  const action = useCommunityAction(); const [email, setEmail] = useState(""); const [accepted, setAccepted] = useState(false);
  const item = query.data?.item; const partner = query.data?.partner;
  return <Shell><a href="/resale">← Back to local finds</a><QueryState query={query} label="Loading item">{item && <><div className="cr-detail"><div>{item.photos?.[0] && <a href={item.photos[0]} target="_blank" rel="noopener noreferrer"><img className="cr-detail-photo" src={item.photos[0]} alt={item.title} /></a>}<div className="cr-photos">{item.photos?.slice(1).map((url: string, i: number) => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`${item.title} photo ${i + 2}`} /></a>)}</div></div><div><span className="cr-kicker">{item.category} · Acadiana local pickup</span><h1>{item.title}</h1><div className="cr-row"><span className="cr-price">{money(item.askingCents)}</span><span className="cr-pill">{human(item.status)}</span></div><p className="cr-muted" style={{ marginTop: 13 }}><MapPin size={14} style={{ display: "inline" }} /> ZIP {item.zip} · Listed by {item.sellerFirstName}</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.description}</p><div className="cr-note"><strong>Supporting {partner?.name || "a local rescue"}</strong><p>{item.proceedsMode === "split_50" ? "Half of net proceeds supports the rescue; half goes to the seller." : "All net proceeds support the rescue."} A 5% gross platform fee and payment processing fees are deducted within the price.</p>{partner?.city && <p>{partner.city}{partner.publicEin ? ` · EIN ${partner.publicEin}` : ""}</p>}</div>
    <SellerContact url={item.facebookContactUrl} />
    {item.status === "active" && partner?.approved && partner?.optedIn ? <form onSubmit={async e => {
    e.preventDefault(); const r = await action.run("/checkout", "POST", { itemId: item.id, version: item.version, email: email.trim() }, "Opening secure checkout…");
    if (r?.url && r.orderId && r.token) { sessionStorage.setItem(`community-order-${r.orderId}`, r.token); window.location.assign(r.url); }
  }}><h3>Ready to make it yours?</h3><p className="cr-muted">First agree on price and a safe public pickup in Messenger. Ask the seller to update the listing before checkout if the price changes. This page does not send messages.</p><Field label="Your email for checkout & pickup details"><input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></Field><Check checked={accepted} onChange={setAccepted}>I have coordinated with the seller and will meet safely in public. I understand this is a purchase, not a cash charitable donation.</Check><Feedback action={action} /><button className="cr-btn" disabled={action.busy || !accepted}>Pay {money(item.askingCents)} securely <ArrowUpRight size={15} /></button></form> : <div className="cr-note"><strong>{["sold", "paid", "completed"].includes(item.status) ? "This find has a new home." : "This item is not available for checkout."}</strong><p>Availability is shown here, not synced to Facebook. <a href="/resale">Find another good thing.</a></p></div>}</div></div><ShareListing item={item} rescueName={partner?.name || "the rescue"} /><GroundRules /></>}</QueryState></Shell>;
}

function SellerItem({ item, partners }: { item: any; partners: any[] }) {
  const action = useCommunityAction(); const [editing, setEditing] = useState(false); const [price, setPrice] = useState((item.askingCents / 100).toFixed(2));
  const partner = partners.find(p => p.tenantId === item.tenantId) || { tenantId: item.tenantId, name: item.rescueName || "your rescue", allowSplit: item.proceedsMode === "split_50", splitMinimumCents: 5000 };
  const editable = ["pending", "pending_review", "active", "rejected"].includes(item.status);
  return <article className="cr-panel"><div className="cr-toolbar" style={{ marginTop: 0 }}><div><span className="cr-pill">{human(item.status)}</span><h3 style={{ marginTop: 13 }}>{item.title}</h3><p className="cr-muted">{money(item.askingCents)} · {item.proceedsMode === "split_50" ? "50/50 net split" : "All net proceeds donated"}</p></div><a href={`/resale/item/${item.id}`} className="cr-btn secondary">View / share listing</a></div>{item.reviewNote && <div className="cr-note"><strong>Rescue review note</strong><p>{item.reviewNote}</p></div>}{editable && <><div className="cr-row"><button className="cr-btn secondary" onClick={() => setEditing(v => !v)}>{editing ? "Close editor" : "Edit listing"}</button><button className="cr-btn danger" disabled={action.busy} onClick={() => { if (window.confirm("Withdraw this listing? It will no longer be available to buyers. Update any Facebook posts yourself.")) void action.run(`/items/${item.id}/withdraw`, "POST", {}, "Listing withdrawn. Update your Facebook posts manually."); }}>Withdraw listing</button></div>{editing ? <ItemEditor key={item.version} partner={partner} initial={item} onSaved={() => setEditing(false)} /> : <form className="cr-note" onSubmit={async e => { e.preventDefault(); await action.run(`/items/${item.id}/price`, "POST", { askingCents: Math.round(Number(price) * 100), version: item.version }, "Price updated. Remember to update your Facebook post."); }}><Field label="Agreed price (USD) · update before buyer checks out"><input type="number" min="1" max="5000" step=".01" required value={price} onChange={e => setPrice(e.target.value)} /></Field><button className="cr-btn secondary" disabled={action.busy}>Update price</button></form>}</>}<Feedback action={action} /></article>;
}
function SellerSale({ order }: { order: any }) {
  const action = useCommunityAction(); const [code, setCode] = useState("");
  return <article className="cr-panel"><div className="cr-row"><h3>{order.itemTitle}</h3><span className="cr-pill">{human(order.status)}</span><strong>{money(order.amountCents)}</strong></div><p className="cr-muted">{date(order.createdAt)} · Order {order.id}</p><p>Pickup: {order.pickupConfirmedAt ? date(order.pickupConfirmedAt) : "Not yet confirmed"} · Settlement: {human(order.split?.status || order.settlementStatus || "awaiting information")}</p><p className="cr-muted">Rescue proceeds: {money(order.rescueProceedsCents)} · Contributor share: {money(order.contributorShareCents ?? order.split?.contributorCents)}</p>{order.status === "paid" && !order.pickupConfirmedAt && <form onSubmit={async e => { e.preventDefault(); const r = await action.run(`/orders/${order.id}/confirm-pickup`, "POST", { code }, "Pickup confirmed. Settlement proceeds when funds are available."); if (r) setCode(""); }}><Field label="Buyer's private pickup code (only enter at handover)"><input required value={code} onChange={e => setCode(e.target.value)} autoComplete="off" /></Field><button className="cr-btn" disabled={action.busy}>Confirm safe handover</button></form>}<Feedback action={action} /></article>;
}
function SellerPayouts({ partners }: { partners: any[] }) {
  const [tenantId, setTenantId] = useState("");
  const query = useCommunityQuery(`/payout-account?tenantId=${encodeURIComponent(tenantId)}`, "public", !!tenantId);
  const action = useCommunityAction();
  const bankPayouts = query.data?.bankPayouts;
  return <section className="cr-panel"><span className="cr-kicker">Contributor account</span><h2>Follow your half of the good.</h2><p className="cr-muted">For optional split listings, the net is divided only after processing and the 5% gross platform fee. A verified pickup and available funds are required before settlement. A transfer to your connected account is not the same as a payout to your bank.</p><PartnerSelect partners={partners} value={tenantId} onChange={setTenantId} />{tenantId && <QueryState query={query} label="Loading contributor payout details">{query.data && <><div className="cr-note"><strong>{query.data.ready ? "Your account is ready for eligible splits." : "Your payout account needs attention."}</strong><p>Status: {human(query.data.status)} · Account: {query.data.exists ? "Connected" : "Not set up"}</p></div>{query.data.requirements && <details><summary>Current account requirements</summary><p style={{ overflowWrap: "anywhere" }}>{human(query.data.requirements)}</p></details>}<div className="cr-row"><button className="cr-btn" disabled={action.busy} onClick={async () => { const r = await action.run("/payout-account/onboard", "POST", { tenantId }, "Opening secure payout setup…"); if (r?.url) window.location.assign(r.url); }}>{query.data.exists ? "Update / complete payout setup" : "Set up contributor payouts"} <ArrowUpRight size={14} /></button>{query.data.exists && <button className="cr-btn secondary" disabled={action.busy} onClick={async () => { const r = await action.run("/payout-account/dashboard", "POST", { tenantId }, "Opening payout dashboard…"); if (r?.url) window.location.assign(r.url); }}>Open payout dashboard</button>}<button className="cr-btn secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh account</button></div><h3 style={{ marginTop: 28 }}>Bank payouts</h3>{Array.isArray(bankPayouts) ? bankPayouts.length ? <div className="cr-table-scroll"><table><thead><tr><th>Payout</th><th>Amount</th><th>Status / arrival</th></tr></thead><tbody>{bankPayouts.map((p: any, n: number) => <tr key={p.id || n}><td style={{ overflowWrap: "anywhere" }}>{p.id || "Bank payout"}</td><td>{money(p.amountCents ?? p.amount)}</td><td>{human(p.status)}{(p.arrivalDate || p.arrival_date) && <p>{typeof (p.arrivalDate || p.arrival_date) === "number" ? new Date((p.arrivalDate || p.arrival_date) * 1000).toLocaleDateString() : date(p.arrivalDate || p.arrival_date)}</p>}</td></tr>)}</tbody></table></div> : <Empty title="No bank payouts reported yet.">Check your connected payout dashboard for available balances and payout timing. A paid sale does not guarantee an immediate bank payout.</Empty> : <p className="cr-muted">{bankPayouts == null ? "Bank payout details are not yet available. Use the secure dashboard for your bank and payout schedule." : human(bankPayouts)}</p>}</>}</QueryState>}<Feedback action={action} /></section>;
}
export function CommunityManagePage() {
  const partners = useCommunityQuery("/partners?recovery=1"); const [tenantId, setTenantId] = useState("");
  const [verified, setVerified] = useState(!!communityToken()); const me = useCommunityQuery("/me", "public", verified);
  const [tab, setTab] = useState("listings");
  return <Shell>
    <span className="cr-kicker">Your corner of the neighborhood</span><h1>Keep the good moving.</h1>
    <p className="cr-lede">Check reviews, adjust an agreed price, share your listing, and confirm a handover.</p>
    {!verified ? <>
      <QueryState query={partners}><PartnerSelect partners={partners.data?.partners || []} value={tenantId} onChange={setTenantId} /></QueryState>
      <Verification tenantId={tenantId} onVerified={() => setVerified(true)} />
    </> : <>
      <div className="cr-row"><a className="cr-btn" href="/resale/create">List another item</a>
        <button className="cr-btn secondary" onClick={() => { saveCommunityToken(""); setVerified(false); }}>Sign out / recover another email</button>
        <button className="cr-btn secondary" onClick={() => void me.refetch()}>Refresh activity</button>
      </div>
      <QueryState query={me} label="Loading your activity">
        <nav className="cr-tabs" aria-label="Seller activity">
          {[
            ["listings", `My listings (${me.data?.items?.length || 0})`],
            ["sales", `Sales & pickup (${me.data?.sales?.length || 0})`],
            ["payouts", "Contributor payouts"],
          ].map(([value, label]) => <button key={value} className={`cr-btn ${tab === value ? "" : "secondary"}`} onClick={() => setTab(value)}>{label}</button>)}
        </nav>
        {tab === "listings" && (me.data?.items?.length ? me.data.items.map((i: any) => <SellerItem key={`${i.id}:${i.version}`} item={i} partners={partners.data?.partners || []} />) : <Empty title="Your first chapter starts here.">Once you submit an item, its review and availability will appear here. <a href="/resale/create">Create a listing.</a></Empty>)}
        {tab === "sales" && (me.data?.sales?.length ? me.data.sales.map((o: any) => <SellerSale key={o.id} order={o} />) : <Empty title="No handovers just yet.">Paid sales and pickup confirmation will appear here. Sharing your approved listing can help the right neighbor find it.</Empty>)}
        {tab === "payouts" && <QueryState query={partners} label="Loading payout rescue partners"><SellerPayouts partners={partners.data?.partners || []} /></QueryState>}
      </QueryState>
      {me.isError && <><p className="cr-muted">Session expired? Recover access by verifying the same email.</p>
        <QueryState query={partners}><PartnerSelect partners={partners.data?.partners || []} value={tenantId} onChange={setTenantId} /></QueryState>
        <Verification tenantId={tenantId} onVerified={() => void me.refetch()} />
      </>}
    </>}
    <GroundRules />
  </Shell>;
}

async function orderRequest(id: string, method = "GET", suffix = "") {
  const response = await fetch(`/api/community-resale/orders/${encodeURIComponent(id)}${suffix}`, { method, credentials: "include", headers: { "X-Order-Token": sessionStorage.getItem(`community-order-${id}`) || "", "X-Community-Token": communityToken(), ...(method === "POST" ? { "Content-Type": "application/json" } : {}) }, ...(method === "POST" ? { body: "{}" } : {}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load this order. Use the private return link or verify the buyer email."); return data;
}
export function CommunityOrderPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [tokenReady] = useState(() => { const token = new URLSearchParams(window.location.hash.slice(1)).get("token"); if (token) { sessionStorage.setItem(`community-order-${id}`, token); window.history.replaceState(null, "", window.location.pathname + window.location.search); } return true; });
  const query = useQuery({ queryKey: ["community-resale", "order", id], queryFn: () => orderRequest(id), enabled: !!id && tokenReady, retry: false, refetchInterval: q => { const data: any = q.state.data; return (data?.order || data)?.status === "checkout" ? 5000 : false; } });
  const refresh = useRefreshCommunity(); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const [tenantId, setTenantId] = useState(""); const partners = useCommunityQuery("/partners?recovery=1", "public", query.isError);
  const recovery = useCommunityQuery(`/orders/${encodeURIComponent(id)}/recovery`, "public", query.isError);
  const recoveryTenantId = tenantId || recovery.data?.tenantId || "";
  const order = query.data?.order || query.data;
  return <Shell>
    <span className="cr-kicker">Private order details · Do not share this page</span><h1>A good find.<br />A little good done.</h1>
    <QueryState query={query} label="Checking secure order details">{order && <section className="cr-panel">
      <div className="cr-row"><h2>{order.itemTitle}</h2><span className="cr-pill">{human(order.status)}</span><strong className="cr-price">{money(order.amountCents)}</strong></div>
      <p className="cr-muted">Order {order.id} · {date(order.createdAt)}</p>
      <SellerContact context="order" url={order.facebookContactUrl || order.data?.facebookContactUrl} orderId={order.id} />
      {order.status === "checkout" && <div className="cr-note">Payment has not been confirmed yet. This page checks for updates automatically. Do not hand over the item until payment is confirmed. To change the agreed price, cancel this unpaid checkout first, then ask the seller to update the listing. A checkout is not released simply because time passes.</div>}
      {order.status === "paid" && <div className="cr-note"><strong>Payment received. Next: a safe public handover.</strong><p>Coordinate with the seller in Messenger. Keep your code private until you have inspected and received the item.</p></div>}
      {order.pickupCode && order.status === "paid" && !order.pickupConfirmedAt && <><p>Your private pickup code</p><div className="cr-code">{order.pickupCode}</div><p className="cr-muted">Give this code only to the seller at pickup. It confirms handover and can trigger settlement.</p></>}
      {order.pickupConfirmedAt && <p className="cr-success">Pickup confirmed {date(order.pickupConfirmedAt)}.</p>}
      <p>{order.proceedsMode === "split_50" ? "Net proceeds are split equally between the rescue and seller." : "All net proceeds support the rescue."}</p>
      <div className="cr-two"><div><p>Processing fee: {money(order.stripeFeeCents)}</p><p>Platform fee: {money(order.platformFeeCents)}</p><p>Rescue proceeds: {money(order.rescueProceedsCents)}</p><p>Refunded: {money(order.refundedCents)}</p></div>
        <div><p>Buyer notification: {human(order.notificationStatus?.buyer)}</p><p>Seller notification: {human(order.notificationStatus?.donor)}</p><p className="cr-muted">Accepted by an email provider does not mean delivered.</p><p>Settlement: {human(order.split?.status || order.settlementStatus)}</p>{order.disputed && <p className="cr-error">This payment is disputed. Contact the rescue for help.</p>}</div></div>
      <div className="cr-row"><button className="cr-btn secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh payment status</button>
        {order.status === "checkout" && <button className="cr-btn danger" disabled={busy} onClick={async () => { if (!window.confirm("Cancel this unpaid checkout? This does not refund a completed payment.")) return; setBusy(true); setError(null); try { await orderRequest(id, "POST", "/cancel"); await query.refetch(); await refresh(); } catch (err) { setError(err); } finally { setBusy(false); } }}>Cancel unpaid checkout</button>}
      </div><ErrorBox error={error} />
    </section>}</QueryState>
    {query.isError && <section className="cr-panel"><h3>Recover private buyer access</h3><p>Return using the private link in your email, or verify the same buyer email below. Paused rescue partners can still be used to recover access. This is not a public order lookup.</p>
      {recovery.data?.rescueName && <p className="cr-note">This order supports <strong>{recovery.data.rescueName}</strong>. Verify your buyer email to continue.</p>}
      {recovery.isError && <><ErrorBox error={recovery.error} /><button className="cr-btn secondary" onClick={() => void recovery.refetch()}>Retry rescue lookup</button></>}
      {!recovery.data?.tenantId && <QueryState query={partners} label="Loading recovery partners"><PartnerSelect partners={partners.data?.partners || []} value={tenantId} onChange={setTenantId} /></QueryState>}
      <Verification tenantId={recoveryTenantId} onVerified={() => void query.refetch()} />
    </section>}
    <GroundRules />
  </Shell>;
}
