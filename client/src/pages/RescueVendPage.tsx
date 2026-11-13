import { useCallback, useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Tenant } from "@shared/schema";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import { useRescueVend } from "@/hooks/use-rescue-vend";
import "./rescue-vend.css";

type CartLine = { id: string; quantity: number };

export default function RescueVendPage() {
  const { basePath, tenantId } = useTenant();
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({ queryKey: ["/api/tenant", tenantId], staleTime: 300000 });
  const [sessionId, setSessionId] = useState(() => new URLSearchParams(window.location.search).get("session_id"));
  const [cancelled, setCancelled] = useState(() => new URLSearchParams(window.location.search).get("cancelled") === "1");
  const { catalog, session, checkout } = useRescueVend(sessionId);
  const [frameReady, setFrameReady] = useState(false);
  const [loadedStyle, setLoadedStyle] = useState<"classic" | "photorealistic" | null>(null);
  const [frameHeight, setFrameHeight] = useState(1000);
  const [message, setMessage] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const displayedVersion = useRef<string | null>(null);
  const checkoutLock = useRef(false);
  const checkoutAttempt = useRef<{ signature: string; key: string } | null>(null);
  const confirmedSession = useRef<string | null>(null);
  const canonical = `${window.location.origin}${basePath}/rescue-vend`;
  const storageKey = `rescue-vend-cart:${canonical}`;
  const rescueName = catalog.data?.rescueName || "our rescue";
  // Never replace a live machine on a background settings refresh. The next
  // page visit uses the new style; the current tray and receipt stay intact.
  useEffect(() => {
    if (catalog.data) setLoadedStyle(current => current ?? (catalog.data.machineStyle === "photorealistic" ? "photorealistic" : "classic"));
  }, [catalog.data]);
  useSEO({
    title: `Rescue Vend | ${rescueName}`,
    description: `Pick symbolic shelter supplies and make a real donation to ${rescueName}. No physical goods are supplied.`,
    url: canonical,
  });
  const send = useCallback((data: unknown) => {
    frame.current?.contentWindow?.postMessage(data, window.location.origin);
  }, []);
  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(canonical);
      setMessage("Page link copied.");
    } catch {
      setMessage(`Copy this page link: ${canonical}`);
    }
  }, [canonical]);
  const initialize = useCallback(() => {
    // Background query refreshes must not silently change the price version
    // behind the already-rendered machine. Stale checkout is rejected instead.
    displayedVersion.current = catalog.data?.version ?? null;
    let cart: CartLine[] = [];
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) cart = saved;
    } catch { /* Storage is optional; never used as payment proof. */ }
    send({ type: "RESCUE_VEND_INIT", items: catalog.data?.items || [], machineTitle: catalog.data?.machineTitle || "Rescue Vend", cart });
  }, [catalog.data, send, storageKey]);
  const retryCheckout = () => {
    checkoutLock.current = false;
    setSubmitting(false);
    setCheckoutError("");
    send({ type: "RESCUE_VEND_RESET" });
  };
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.type === "RESCUE_VEND_HEIGHT" && Number.isFinite(data.height)) setFrameHeight(Math.max(600, Math.min(2000, data.height)));
      if (data?.type === "RESCUE_VEND_READY") setFrameReady(true);
      if (data?.type === "RESCUE_VEND_SHARE") void share();
      if (data?.type === "RESCUE_VEND_CART" && Array.isArray(data.items)) {
        const signature = JSON.stringify(data.items.map((p: CartLine) => ({ id: p.id, quantity: p.quantity })).sort((a: CartLine, b: CartLine) => a.id.localeCompare(b.id)));
        if (checkoutAttempt.current?.signature !== signature) checkoutAttempt.current = null;
        try { sessionStorage.setItem(storageKey, JSON.stringify(data.items.map((p: CartLine) => ({ id: p.id, quantity: p.quantity })))); } catch { /* Optional cart recovery. */ }
      }
      if (data?.type !== "RESCUE_VEND_CHECKOUT" || checkoutLock.current) return;
      if (sessionId || !catalog.data?.available) {
        send({ type: "RESCUE_VEND_RESET" });
        setCheckoutError(sessionId ? "Finish checking your previous payment, or start a new donation below." : "Donations are not available right now.");
        return;
      }
      const items: CartLine[] = Array.isArray(data.items) ? data.items.map((p: CartLine) => ({ id: p.id, quantity: p.quantity })) : [];
      if (!items.length || items.reduce((sum, p) => sum + p.quantity, 0) > 20 || items.some((p) => !catalog.data.items.some((i) => i.id === p.id) || !Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 10)) {
        setCheckoutError("Please review your selection and try again.");
        send({ type: "RESCUE_VEND_RESET" });
        return;
      }
      checkoutLock.current = true;
      setSubmitting(true);
      setCheckoutError("");
      setCancelled(false);
      try {
        const signature = JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)));
        if (checkoutAttempt.current?.signature !== signature) checkoutAttempt.current = { signature, key: crypto.randomUUID() };
        if (!displayedVersion.current) throw new Error("The machine is not ready");
        const result = await checkout.mutateAsync({ items, checkoutKey: checkoutAttempt.current.key, catalogVersion: displayedVersion.current });
        const url = new URL(result.url);
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Invalid checkout URL");
        window.location.assign(url.href);
      } catch (error) {
        checkoutLock.current = false;
        setSubmitting(false);
        setCheckoutError(error instanceof Error && error.message.includes("409")
          ? "The supplies or donation amounts changed. Refresh this page and review your selection before donating."
          : "Checkout could not be opened. Your selection is saved; please try again.");
        send({ type: "RESCUE_VEND_RESET" });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [catalog.data, checkout.mutateAsync, sessionId, send, share, storageKey]);
  useEffect(() => {
    if (!frameReady || session.data?.status !== "paid" || !sessionId || confirmedSession.current === sessionId) return;
    confirmedSession.current = sessionId;
    checkoutAttempt.current = null;
    // Server receipt items are authoritative, never the restored selection.
    send({ type: "RESCUE_VEND_PAID", items: session.data.items });
    try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
  }, [frameReady, session.data, sessionId, send, storageKey]);
  const startFresh = () => {
    checkoutAttempt.current = null;
    window.history.replaceState({}, "", `${basePath}/rescue-vend`);
    setSessionId(null);
    setCancelled(false);
    retryCheckout();
  };
  const paid = session.data?.status === "paid";
  const unavailable = catalog.data && (!catalog.data.available || !catalog.data.items.length);
  return (
    <div className="rescue-vend-page">
      <PublicHeader rescueName={catalog.data?.rescueName || ""} logoUrl={tenantData?.tenant.logoUrl || undefined} />
      <main>
        <section className="vend-intro">
          <div>
            <span className="vend-eyebrow">A little play. A lot of possibility.</span>
            <h1>Small supplies.<br />Real rescue support.</h1>
            <p>Welcome to Rescue Vend for <strong>{rescueName}</strong>. Tap a supply or punch in its code. Fill your donation tray, then give through Stripe to see the machine come to life.</p>
          </div>
          <div>
            <button type="button" className="vend-share" onClick={() => void share()}><Share2 size={17} /> Share this machine</button>
            {message && <p className="vend-copy-status" role="status">{message}</p>}
          </div>
        </section>
        {cancelled && <div className="vend-status" role="status"><strong>Checkout cancelled.</strong> Your donation has not been confirmed. Your tray is ready for another attempt.<br /><button onClick={startFresh}>Continue choosing supplies</button></div>}
        {submitting && <div className="vend-status" role="status">Opening secure Stripe checkout. Your selection is saved.</div>}
        {checkoutError && <div className="vend-status vend-error" role="alert"><p>{checkoutError}</p><button onClick={retryCheckout}>Reset checkout and try again</button></div>}
        {sessionId && <section className={`vend-status ${session.isError ? "vend-error" : ""}`} aria-live="polite">
          {session.isError ? <><strong>We couldn’t verify this payment.</strong><p>No supplies will dispense until your payment is confirmed. Retry verification before making another donation.</p><button onClick={() => void session.refetch()}>Retry verification</button></> :
            paid ? <><strong>Thank you. Your donation is confirmed.</strong><p>${(session.data!.totalCents / 100).toFixed(2)} donated to {rescueName}. Watch the machine dispense, then tap the delivery bay to view your symbolic supplies.</p><ul>{session.data!.items.map((item) => <li key={item.id}>{item.quantity} × {item.name} — ${(item.priceCents * item.quantity / 100).toFixed(2)}</li>)}</ul></> :
              <><strong>{session.isLoading ? "Checking your payment…" : "Your payment is still pending."}</strong><p>We’ll check again automatically. Please don’t submit a second payment while confirmation is pending.</p><button onClick={() => void session.refetch()}>Check payment again</button></>}
          <p><button onClick={startFresh}>{paid ? "Make another donation" : "Leave verification and start a new donation"}</button></p>
        </section>}
        {catalog.isLoading ? <div className="vend-stage" aria-label="Loading the supply machine"><div className="vend-skeleton" /></div> :
          catalog.isError ? <section className="vend-status vend-error" role="alert"><h2>The machine couldn’t connect.</h2><p>We couldn’t load this rescue’s supplies. Nothing has been charged by this page.</p><button onClick={() => void catalog.refetch()}>Try loading again</button></section> :
            unavailable && !paid ? <section className="vend-status"><h2>The machine is resting.</h2><p>This rescue isn’t accepting vending donations right now. Please check back soon.</p><button onClick={() => void catalog.refetch()}>Check availability</button></section> :
              catalog.data && loadedStyle ? <section className="vend-stage" aria-label="Interactive rescue supply vending machine">
                <iframe ref={frame} className="vend-machine" style={{ height: frameHeight }} title={`${catalog.data.machineTitle || "Rescue Vend"} — choose symbolic shelter supplies`} src={loadedStyle === "photorealistic" ? "/rescue-vend/photorealistic/index.html" : "/rescue-vend/index.html"} onLoad={() => { setFrameReady(false); confirmedSession.current = null; initialize(); }} />
              </section> : null}
        <section className="vend-notes">
          <div><h2>Virtual items. Real generosity.</h2><p>Every item is a symbolic donation to {rescueName}, not an order for physical goods. Descriptions show examples of what rescue support can make possible; gifts aren’t guaranteed to buy or be earmarked for a particular item.</p></div>
          <div><h2>No surprises at checkout.</h2><p>Your tray’s displayed total is your donation amount. There’s no additional fee-cover charge. Processing and platform fees are deducted from proceeds. Supplies dispense only after the server verifies payment. Choose up to 10 of each supply, with 20 items per donation.</p></div>
        </section>
      </main>
      <PublicFooter tenant={tenantData?.tenant} basePath={basePath} />
    </div>
  );
}
