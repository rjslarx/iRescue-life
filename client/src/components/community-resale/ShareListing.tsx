import { useState } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import { communityCaption } from "@shared/community-resale";
import { ErrorBox, Field } from "./CommunityUI";

export function ShareListing({ item, rescueName }: { item: any; rescueName: string }) {
  const [fallback, setFallback] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const url = `${window.location.origin}/resale/item/${item.id}`;
  async function copy(text: string, label: string) {
    setError(null); setCopied(""); setFallback(text); setBusy(true);
    try { await navigator.clipboard.writeText(text); setCopied(label); }
    catch { setError(new Error("Clipboard access is unavailable. Select and copy the text below.")); }
    finally { setBusy(false); }
  }
  return <section className="cr-panel cr-safeguards"><span className="cr-kicker">Word of mouth, made easier</span><h3>Share a little good.</h3><p className="cr-muted">Copy a caption, save the photos, then create your own Facebook post. Talk price and pickup in Messenger. We never post or update Facebook for you.</p><div className="cr-row">
    <button className="cr-btn secondary" disabled={busy} onClick={() => void copy(communityCaption(item, rescueName, url), "Caption copied. Paste it into your own Facebook post.")}><Copy size={15} />Copy Facebook caption</button>
    <button className="cr-btn secondary" disabled={busy} onClick={() => void copy(communityCaption(item, rescueName, url, true), "Link-free caption copied. Copy the item link separately if you want to add it.")}>Copy caption without link</button>
    <button className="cr-btn secondary" disabled={busy} onClick={() => void copy(url, "Clean listing link copied.")}>Copy item link</button>
    <a className="cr-btn secondary" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Open Facebook share <ArrowUpRight size={14} /></a>
  </div><p className="cr-muted" style={{ marginTop: 12 }}>The optional link-free caption leaves out the listing URL. You choose where to include the item link; this does not promise different Facebook reach.</p><ErrorBox error={error} />{copied && <p className="cr-success" role="status">{copied}</p>}{fallback && <Field label="Copyable text (contains no private order tokens)"><textarea readOnly value={fallback} onFocus={e => e.target.select()} /></Field>}<details><summary>Save original photos for your post</summary><p className="cr-muted">Open an original photo. On mobile, touch and hold to save; on a computer, right-click and save.</p><div className="cr-row">{item.photos?.map((src: string, n: number) => <a key={src} href={src} target="_blank" rel="noopener noreferrer">Open original photo {n + 1}</a>)}</div></details></section>;
}
