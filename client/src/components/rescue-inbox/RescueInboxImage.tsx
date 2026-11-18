import { useEffect, useRef, useState } from "react";
import { tenantApiRequest } from "@/lib/tenantApi";

export function RescueInboxImage({ messageId, index }: { messageId: string; index: number }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const objectUrl = useRef("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);
  return <div className="mt-2">
    {url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Open attachment ${index + 1}`}>
      <img src={url} alt={`Received attachment ${index + 1}`} className="max-h-96 max-w-full rounded-md" onError={() => setError("This image could not be displayed.")} />
    </a> : <button type="button" className="ri-btn" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await tenantApiRequest("GET", `/api/rescue-help/messages/${encodeURIComponent(messageId)}/images/${index}`);
        const blob = await response.blob();
        if (!mounted.current) return;
        objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current);
      } catch {
        if (mounted.current) setError("Image unavailable. Try again, or ask the sender for a JPG or PNG screenshot.");
      } finally { if (mounted.current) setBusy(false); }
    }}>{busy ? "Loading image…" : `View image ${index + 1}`}</button>}
    {error && <p className="ri-error" role="alert">{error}</p>}
  </div>;
}
