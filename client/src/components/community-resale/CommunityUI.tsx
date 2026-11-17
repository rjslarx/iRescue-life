import { useState, type ReactNode } from "react";
import { ArrowUpRight, HeartHandshake, PackageOpen } from "lucide-react";
import { communityRequest, saveCommunityToken, useRefreshCommunity } from "@/hooks/use-community-resale";
import type { useCommunityAction } from "@/hooks/use-community-actions";
import "./community-resale.css";

export const money = (cents: number | null | undefined) => cents == null ? "Not reported" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export const human = (value: unknown) => typeof value === "string" ? value.replaceAll("_", " ") : value == null ? "Not reported" : typeof value === "object" ? JSON.stringify(value) : String(value);
export const date = (value: string) => value ? new Date(value).toLocaleString() : "Not reported";
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const issues = typeof error === "object" && error && "issues" in error ? (error as { issues: { message: string }[] }).issues : null;
  const message = issues ? issues.map(i => i.message).join(" ") : error instanceof SyntaxError ? "The marketplace service is not responding with usable data. Please try again shortly." : error instanceof Error ? error.message : String(error);
  return <div className="cr-error" role="alert">{message}</div>;
}
export function Feedback({ action }: { action: Pick<ReturnType<typeof useCommunityAction>, "error" | "message"> }) {
  return <><ErrorBox error={action.error} />{action.message && <p className="cr-success" role="status">{action.message}</p>}</>;
}
export function QueryState({ query, children, label = "Loading marketplace" }: { query: any; children: ReactNode; label?: string }) {
  if (query.isLoading) return <div role="status" aria-label={label}><div className="cr-skeleton" /><p className="cr-muted">{label}…</p></div>;
  if (query.isError) return <><ErrorBox error={query.error} /><button className="cr-btn secondary" onClick={() => void query.refetch()}>Try again</button></>;
  return <>{children}</>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="cr-empty"><PackageOpen size={35} strokeWidth={1.3} /><h3>{title}</h3><p>{children}</p></div>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="cr-field"><span>{label}</span>{children}</label>;
}
export function SellerContact({ url, context = "item", orderId }: { url?: string; context?: "item" | "review" | "order"; orderId?: string }) {
  return <div className="cr-note">
    <strong>{context === "review" ? "Verify the seller is reachable before approval" : context === "order" ? "Keep your pickup conversation going" : "Message first. Pay after you agree."}</strong>
    <p>{context === "review"
      ? "Open the public contact link and confirm buyers can reach the correct seller on Facebook or Messenger before approving this listing. Reject with a clear note if the link is incorrect or unreachable."
      : context === "order"
        ? "Resume your original Messenger conversation to arrange a safe public pickup. After payment is confirmed, share only the order ID below with the seller—not this private page, your access token, or your pickup code."
        : "Message the seller on Facebook or Messenger before paying to confirm availability, agree on price, and arrange a safe public pickup. Keep that conversation. After payment, send your order ID in the same Messenger conversation; never share your private order link or pickup code."}</p>
    {url ? <a className="cr-btn" href={url} target="_blank" rel="noopener noreferrer">Message seller on Facebook <ArrowUpRight size={15} /></a> : <p className="cr-muted">Seller contact is unavailable. {context === "review" ? "Request a working Facebook or Messenger link before approval." : "Use your existing Messenger conversation. Do not pay without contacting the seller first."}</p>}
    {context === "review" && url && <p className="cr-muted" style={{ marginTop: 10, overflowWrap: "anywhere" }}>{url}</p>}
    {context === "order" && orderId && <p style={{ marginTop: 14, marginBottom: 0, overflowWrap: "anywhere" }}><strong>Order ID to share in Messenger:</strong> <span style={{ userSelect: "all" }}>{orderId}</span></p>}
  </div>;
}
export function Check({ children, checked, onChange, disabled = false }: { children: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="cr-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span>{children}</span></label>;
}
import { RESALE_PUBLIC_ENABLED } from "@shared/resale-availability";

export function Shell({ children }: { children: ReactNode }) {
  // Recovery pages stay accessible while public discovery and new sales are paused.
  if (!RESALE_PUBLIC_ENABLED) return <div className="cr"><header className="cr-header"><strong>Rescue Resale · Existing orders</strong><a href="/resale/manage">My activity</a></header><main className="cr-wrap"><p role="status">Rescue Resale is paused. New listings and purchases are closed.</p>{children}</main></div>;
  return <div className="cr"><header className="cr-header"><a className="cr-brand" href="/resale"><span className="cr-mark"><HeartHandshake size={25} strokeWidth={1.5} /></span><span>Acadiana Rescue Resale<small>Good neighbors. Second chances.</small></span></a><nav className="cr-nav" aria-label="Community resale"><a href="/resale">Find something good</a><a href="/resale#partners">Our rescues</a><a href="/resale/manage">My activity</a><a className="cr-btn" href="/resale/create">Sell for a rescue <ArrowUpRight size={15} /></a></nav></header><main className="cr-wrap cr-enter">{children}</main><footer className="cr-footer"><span>Acadiana Rescue Resale · Local goods. Local good.</span><span>Belongings only. Never animals or services.</span><a href="/resale#how-it-works">How it works & safety</a></footer></div>;
}
export function GroundRules() {
  return <div className="cr-note"><strong>A neighborhood sale, not an automated Facebook shop.</strong><p>Share listings to Facebook yourself. Negotiate and coordinate a safe public pickup in Messenger. No automatic posting, messages, or sold-status sync. Update your Facebook post manually when an item sells.</p><p>A platform fee of 5% of the gross sale price plus payment processing is deducted within the agreed price, not added at checkout. All net proceeds go to your chosen rescue by default. Optional 50/50 splits divide net proceeds only, after fees.</p><p>Checkout locks the listing and price. If the agreed price changes, the buyer must cancel the unpaid checkout from their private order page before the seller updates it. Waiting for a timer does not itself release a reserved item.</p><p>Sell only belongings you own. No animal sales, rehoming, or services. Never send payment or pickup codes in a public post. Only share the pickup code at handover.</p></div>;
}
export function Verification({ tenantId, onVerified }: { tenantId: string; onVerified?: () => void }) {
  const refresh = useRefreshCommunity();
  const [email, setEmail] = useState(""); const [challenge, setChallenge] = useState(""); const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [done, setDone] = useState(false);
  return <section className="cr-panel"><span className="cr-kicker">Your private seller access</span><h2>{done ? "Email verified." : "A little trust goes a long way."}</h2><p className="cr-muted">Verify your email to list items, manage a sale, or recover your activity. Use the same email each time. No new password to remember.</p><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (challenge) { const r = await communityRequest("/auth/verify", "POST", { challengeId: challenge, code }); saveCommunityToken(r.token); await refresh(); setDone(true); onVerified?.(); }
      else { const r = await communityRequest("/auth/request", "POST", { email: email.trim(), tenantId }); setChallenge(r.challengeId); }
    } catch (err) { setError(err); } finally { setBusy(false); }
  }}><Field label="Email address"><input type="email" required autoComplete="email" value={email} disabled={!!challenge || busy} onChange={e => setEmail(e.target.value)} /></Field>{challenge && !done && <><p className="cr-success" role="status">Check your email for a verification code.</p><Field label="Email verification code"><input required value={code} autoComplete="one-time-code" onChange={e => setCode(e.target.value)} /></Field></>}<ErrorBox error={error} /><div className="cr-row">{!done && <button className="cr-btn" disabled={!tenantId || busy}>{busy ? "Please wait…" : challenge ? "Verify & continue" : "Email me a code"}</button>}{challenge && <button className="cr-btn secondary" type="button" disabled={busy} onClick={() => { setChallenge(""); setCode(""); setDone(false); }}>Use another email / resend</button>}</div>{!tenantId && <p className="cr-muted">Choose a rescue first.</p>}</form></section>;
}
