import { useState } from "react";
import { ShieldCheck, Upload, X } from "lucide-react";
import { resaleItemSchema, resaleMessageAllowed, resalePhone } from "@shared/rescue-resale";
import { resaleCents, resaleError, resaleMoney, type ResaleClient, type ResaleItem } from "@/hooks/use-rescue-resale";
import { PayoutSetup } from "@/components/resale/ResalePayouts";

export function ResaleError({ error }: { error: unknown }) {
  return error ? <div className="resale-error" role="alert">{resaleError(error)}</div> : null;
}
export function PhoneVerification({ api }: { api: ResaleClient }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const pending = api.requestCode.isPending || api.verifyCode.isPending;
  if (api.token) return <div className="resale-row"><ShieldCheck size={18} aria-hidden="true" /><span className="resale-muted">Phone verified for this session.</span><button className="resale-btn secondary" onClick={api.signOut}>Sign out / verify another phone</button></div>;
  return <section className="resale-panel resale-form">
    <span className="resale-kicker">A little trust goes a long way</span>
    <h2 className="mt-2">Verify your phone to continue</h2>
    <p className="resale-muted mb-5">Browse freely. To donate an item, message a neighbor, buy, or view your activity, verify the same phone you used before. No website account is needed.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setError(null);
      try {
        if (challengeId) await api.verifyCode.mutateAsync({ challengeId, code });
        else { const result = await api.requestCode.mutateAsync({ phone: resalePhone(phone), consent: true }); setChallengeId(result.challengeId); }
      } catch (err) { setError(err); }
    }}>
      {!challengeId ? <>
        <div className="resale-field"><label htmlFor="resale-phone">US mobile phone</label><input id="resale-phone" type="tel" autoComplete="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" /></div>
        <label className="resale-check"><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)} /><span>I agree to receive SMS verification and resale-related messages at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.</span></label>
      </> : <div className="resale-field"><label htmlFor="resale-code">Verification code sent to {phone}</label><input id="resale-code" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} value={code} onChange={e => setCode(e.target.value)} /></div>}
      <ResaleError error={error} />
      <div className="resale-row mt-5"><button className="resale-btn" disabled={pending || (!challengeId && !consent)}>{pending ? "Please wait…" : challengeId ? "Verify phone" : "Send verification code"}</button>
        {challengeId && <button type="button" className="resale-btn secondary" disabled={pending} onClick={() => { setChallengeId(""); setCode(""); setError(null); }}>Change phone / resend</button>}</div>
    </form>
    <p className="resale-muted mt-4">Phone numbers are masked from other participants. Free-text messages can still reveal your identity—never include phone numbers, email, addresses, payment handles, or other personal contact details.</p>
  </section>;
}

export function DonateItemForm({ api }: { api: ResaleClient }) {
  const [proceedsMode, setProceedsMode] = useState<"donate_all" | "split_50">("donate_all");
  const [splitConsent, setSplitConsent] = useState(false);
  const mode = api.config.data?.allowSplit ? proceedsMode : "donate_all";
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  if (submitted) return <section className="resale-status" role="status"><h2>Thank you for making room for rescue.</h2><p>Your listing is pending manual review. Keep the item at home; please do not drop it off at the shelter. You can follow its status and review notes in My activity.</p><button className="resale-btn secondary mt-4" onClick={() => { setSubmitted(false); setPhotos([]); setProceedsMode("donate_all"); setSplitConsent(false); }}>Donate another item</button></section>;
  return <section className="resale-panel resale-form">
    <span className="resale-kicker">Good things deserve another chapter</span><h2 className="mt-2">Donate an item, not a trip to the shelter.</h2>
    <p className="resale-muted mb-5">You keep your belongings at home until the arranged pickup. Listings are reviewed by the rescue before appearing here. Full donation of all net proceeds is the default{api.config.data?.allowSplit ? "; you may optionally choose a 50/50 net proceeds split below." : "; there is no seller payment for full-donation listings."}</p>
    <form onSubmit={async event => {
      event.preventDefault(); setError(null);
      const data = new FormData(event.currentTarget);
      try {
        if (mode === "split_50" && (!splitConsent || !api.payoutAccount.data?.ready)) throw new Error("Agree to the split terms and finish Stripe payout setup before submitting a split listing.");
        const payload = resaleItemSchema.parse({
          proceedsMode: mode, splitConsent: mode === "split_50" && splitConsent,
          donorName: data.get("donorName"), donorEmail: data.get("donorEmail"), zip: data.get("zip"),
          title: data.get("title"), description: data.get("description"), category: data.get("category"),
          askingCents: resaleCents(String(data.get("asking"))),
          minCents: data.get("minimum") ? resaleCents(String(data.get("minimum"))) : null,
          photos, fulfillment: data.getAll("fulfillment"), consent: data.get("consent") === "on", ownership: data.get("ownership") === "on",
        });
        await api.createItem.mutateAsync({ ...payload, proceedsMode: mode, splitConsent: mode === "split_50" && splitConsent }); setSubmitted(true);
      } catch (err) { setError(err); }
    }}>
      <div className="resale-two">
        <div className="resale-field"><label htmlFor="donor-name">Your name</label><input id="donor-name" name="donorName" required minLength={2} maxLength={100} autoComplete="name" /></div>
        <div className="resale-field"><label htmlFor="donor-email">Email for the rescue</label><input id="donor-email" type="email" name="donorEmail" required maxLength={200} autoComplete="email" /></div>
      </div>
      <div className="resale-field"><label htmlFor="item-title">Item title</label><input id="item-title" name="title" required minLength={3} maxLength={100} placeholder="A useful, honest description of your item" /></div>
      <div className="resale-field"><label htmlFor="item-description">Condition and details</label><textarea id="item-description" name="description" required minLength={15} maxLength={3000} placeholder="Include size, condition, wear, and anything a buyer should know. No personal contact information or home address." /></div>
      <div className="resale-two">
        <div className="resale-field"><label htmlFor="item-category">Category</label><select id="item-category" name="category">{["Home", "Furniture", "Clothing", "Electronics", "Pet supplies", "Other"].map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="resale-field"><label htmlFor="item-zip">ZIP code (no home address)</label><input id="item-zip" name="zip" required pattern="[0-9]{5}" inputMode="numeric" maxLength={5} autoComplete="postal-code" /></div>
        <div className="resale-field"><label htmlFor="item-asking">Asking price (USD)</label><input id="item-asking" name="asking" required inputMode="decimal" placeholder="25.00" /></div>
        <div className="resale-field"><label htmlFor="item-minimum">Minimum offer (USD, optional)</label><input id="item-minimum" name="minimum" inputMode="decimal" placeholder="Leave blank if not needed" /></div>
      </div>
      <fieldset className="resale-field"><legend className="font-semibold text-sm mb-2">Pickup arrangements you can support</legend>
        <label className="resale-check"><input name="fulfillment" type="checkbox" value="shelter_meetup" />Arranged shelter / rescue event meetup</label>
        <label className="resale-check"><input name="fulfillment" type="checkbox" value="public_meetup" />Arranged public-location meetup</label>
        <p className="resale-muted">Choose at least one. No early shelter drop-offs, home-address sharing, shipping, or courier service.</p>
      </fieldset>
      <div className="resale-field">
        <label htmlFor="resale-photos"><Upload size={16} className="inline mr-2" aria-hidden="true" />Photos (1–6)</label>
        <p className="resale-muted mb-2">JPG, PNG, or WebP. Up to 8 MB per photo. Avoid faces, mail, and other personal details in the background.</p>
        <input id="resale-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || photos.length >= 6} onChange={async event => {
          const files = Array.from(event.target.files || []); event.target.value = ""; setError(null);
          if (photos.length + files.length > 6) { setError(new Error("Choose no more than six photos in total.")); return; }
          if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setError(new Error("Use JPG, PNG, or WebP photos.")); return; }
          if (files.some(file => file.size > 8 * 1024 * 1024)) { setError(new Error("Each photo must be 8 MB or smaller.")); return; }
          setBusy(true);
          try { for (const file of files) { const result = await api.upload.mutateAsync(file); setPhotos(current => [...current, result.imageUrl]); } }
          catch (err) { setError(err); } finally { setBusy(false); }
        }} />
        {busy && <p role="status" className="resale-muted">Uploading photos…</p>}
        <div className="resale-gallery">{photos.map((url, index) => <div key={`${url}-${index}`}><img src={url} alt={`Item photo ${index + 1}`} /><button type="button" className="resale-btn secondary mt-2" aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X size={14} />Remove</button></div>)}</div>
      </div>
      <p className="resale-muted mb-3">A platform fee of 5% of the total sale price plus Stripe processing fees is deducted from your sale—not added to the buyer’s price. Full donation sends the remainder to the rescue. A 50/50 listing divides that remainder equally.</p>
      {api.config.data?.allowSplit && <fieldset className="resale-note mb-5"><legend className="px-2 font-semibold">Where the net proceeds go</legend>
        <label className="resale-check"><input type="radio" name="proceedsMode" checked={mode === "donate_all"} onChange={() => { setProceedsMode("donate_all"); setSplitConsent(false); setError(null); }} />Donate all net proceeds to the rescue (default)</label>
        <label className="resale-check mt-3"><input type="radio" name="proceedsMode" checked={mode === "split_50"} onChange={() => { setProceedsMode("split_50"); setError(null); }} />Optional 50/50 split with the rescue</label>
        {mode === "split_50" && <><PayoutSetup api={api} /><label className="resale-check mt-4"><input type="checkbox" checked={splitConsent} required onChange={event => setSplitConsent(event.target.checked)} /><span>I explicitly agree to receive half of net proceeds after Stripe processing and platform fees, with half supporting the rescue. Connect/payout costs may apply separately. Payouts require confirmed pickup and available funds, and are not instant.</span></label></>}
      </fieldset>}
      <label className="resale-check"><input type="checkbox" name="ownership" required />I own this item, have the right to donate it, and confirm it is safe, lawful, and not a prohibited item.</label>
      <label className="resale-check mt-3"><input type="checkbox" name="consent" required key={mode} />{mode === "split_50" ? "I understand the optional split selected above and will keep the item at home until the arranged pickup." : "I understand that all net proceeds are donated to the rescue, I receive no seller payment, and I must keep the item at home until the arranged pickup."}</label>
      <p className="resale-muted mt-4">A listing does not establish tax deductibility or guarantee a tax receipt. Ask your tax adviser about your circumstances.</p>
      <ResaleError error={error} />
      <button className="resale-btn mt-5" disabled={busy || api.createItem.isPending || !photos.length || (mode === "split_50" && (!splitConsent || !api.payoutAccount.data?.ready))}>{api.createItem.isPending ? "Submitting for review…" : "Submit for rescue review"}</button>
    </form>
  </section>;
}

export function CheckoutForm({ api, item, conversationId, amountCents }: { api: ResaleClient; item: Pick<ResaleItem, "id"> & Partial<Pick<ResaleItem, "fulfillment" | "proceedsMode">>; conversationId?: string; amountCents: number }) {
  const [pickupId, setPickupId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const options = (api.config.data?.pickupOptions || []).filter(p => Date.parse(p.startsAt) > Date.now() + 35 * 60 * 1000 && (!item.fulfillment || item.fulfillment.includes(p.kind)));
  return <form className="resale-note mt-4" onSubmit={async event => {
    event.preventDefault(); setError(null);
    if (!options.some(p => p.id === pickupId && Date.parse(p.startsAt) > Date.now() + 35 * 60 * 1000)) { setError(new Error("Choose an available pickup starting more than 35 minutes from now.")); return; }
    try { await api.checkout.mutateAsync({ itemId: item.id, conversationId, pickupId }); } catch (err) { setError(err); }
  }}>
    <h3>Choose your pickup before paying</h3>
    <p className="resale-muted mb-3">Local pickup only, starting more than 35 minutes from now. {item.proceedsMode === "split_50" ? "Half of net proceeds after Stripe processing and platform fees supports the rescue; half goes to the contributor. Connect/payout costs may apply separately." : "Net proceeds support the rescue."} Payment is securely handled by Stripe.</p>
    {item.proceedsMode === "split_50" && !api.config.data?.allowSplit && <p className="resale-status">New split checkouts are paused. Existing paid orders will still be honored.</p>}
    <label htmlFor={`pickup-${conversationId || item.id}`}>Available location and time</label>
    <select id={`pickup-${conversationId || item.id}`} value={pickupId} required onChange={e => setPickupId(e.target.value)}>
      <option value="">Select a pickup window</option>
      {options.map(p => <option value={p.id} key={p.id}>{p.label} · {p.address} · {new Date(p.startsAt).toLocaleString()} – {new Date(p.endsAt).toLocaleTimeString()}</option>)}
    </select>
    {!options.length && <p className="resale-muted mt-3">No compatible pickup windows starting more than 35 minutes from now are available. Check back after the rescue adds one.</p>}
    {!api.config.data?.checkoutEnabled && <p className="resale-muted mt-3">Payments are not available right now.</p>}
    <ResaleError error={error} />
    <button className="resale-btn mt-4" disabled={!api.token || !api.config.data?.checkoutEnabled || !options.length || api.checkout.isPending || (item.proceedsMode === "split_50" && !api.config.data?.allowSplit)}>{api.checkout.isPending ? "Opening checkout…" : `Pay ${resaleMoney(amountCents)} with Stripe`}</button>
  </form>;
}

export function MessageForm({ api, itemId, conversationId }: { api: ResaleClient; itemId?: string; conversationId?: string }) {
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  const uid = conversationId || itemId;
  return <form className="mt-4" onSubmit={async event => {
    event.preventDefault(); setError(null); setSent(false);
    try {
      if (!resaleMessageAllowed(body.trim())) throw new Error("Write 1–1,000 characters without contact information, links, home addresses, or payment handles.");
      if (conversationId) await api.reply.mutateAsync({ id: conversationId, body: body.trim() });
      else if (itemId) await api.startMessage.mutateAsync({ id: itemId, body: body.trim(), ...(amount ? { offerCents: resaleCents(amount) } : {}) });
      setBody(""); setAmount(""); setSent(true);
    } catch (err) { setError(err); }
  }}>
    <label htmlFor={`message-${uid}`}>{conversationId ? "Reply to this conversation" : "Ask a question or make an offer"}</label>
    <textarea id={`message-${uid}`} required maxLength={1000} value={body} onChange={e => setBody(e.target.value)} placeholder="Ask about the item. Keep contact details private." />
    {!conversationId && <div className="resale-field mt-3"><label htmlFor={`offer-${uid}`}>Your offer (USD, optional)</label><input id={`offer-${uid}`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Leave blank to ask a question" /></div>}
    <p className="resale-muted mt-2">Messages use masked identities. Filters cannot prevent all personal disclosures; do not share contact information.</p>
    <ResaleError error={error} />
    {sent && <p role="status" className="resale-status">Message sent. Follow replies and offers in My activity.</p>}
    <button className="resale-btn secondary mt-3" disabled={!api.token || api.reply.isPending || api.startMessage.isPending}>{api.reply.isPending || api.startMessage.isPending ? "Sending…" : "Send message"}</button>
  </form>;
}
