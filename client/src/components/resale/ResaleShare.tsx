import { useState } from "react";
import { Share2, Link2, Copy } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import type { ResaleItem } from "@/hooks/use-rescue-resale";
import { resaleListingText, resaleListingUrl } from "@shared/resale-sharing";

export default function ResaleShare({ item, rescueName }: { item: ResaleItem; rescueName: string }) {
  const { basePath } = useTenant();
  const [notice, setNotice] = useState("");
  const [manual, setManual] = useState("");
  if (item.status !== "active") return null;
  const url = resaleListingUrl(window.location.origin, basePath, item.id);
  const text = resaleListingText(item, rescueName, url);
  async function copy(value: string, success: string) {
    setManual("");
    try { await navigator.clipboard.writeText(value); setNotice(success); }
    catch { setManual(value); setNotice("Automatic copying is unavailable. Select and copy the text below."); }
  }
  async function share() {
    if (!navigator.share) return copy(url, "Listing link copied. Paste it into your social post.");
    try {
      await navigator.share({ title: item.title, text: `${item.title} — supporting ${rescueName}`, url });
      setNotice("Listing shared.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setManual(url); setNotice("Sharing is unavailable. Select and copy this link instead.");
    }
  }
  return <section className="mt-4 min-w-0" aria-label={`Share ${item.title}`}>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="resale-btn secondary" onClick={() => void share()}><Share2 size={16} aria-hidden="true" />Share listing</button>
      <button type="button" className="resale-btn secondary" onClick={() => void copy(url, "Listing link copied.")}><Link2 size={16} aria-hidden="true" />Copy link</button>
      <button type="button" className="resale-btn secondary" onClick={() => void copy(text, "Listing text copied. Paste it into your social post or manually created Marketplace listing.")}><Copy size={16} aria-hidden="true" />Copy listing text</button>
    </div>
    <p className="resale-muted mt-2 text-xs">Facebook Marketplace listings must be created manually; sharing here does not post to Marketplace.</p>
    <p role="status" className="text-sm mt-2">{notice}</p>
    {manual && <textarea aria-label="Text to copy manually" className="w-full mt-2" rows={5} readOnly value={manual} onFocus={event => event.currentTarget.select()} />}
  </section>;
}
