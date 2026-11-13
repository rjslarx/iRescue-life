# Rescue Vend frontend

This is the uploaded Antigravity vending machine, adapted in place. Original
cabinet styling, keypad, product SVGs, audio engine and dispense/chute animations
are preserved. Demonstration payment controls/listeners have been removed.

Vite root is `client`, with its default public directory `client/public`.
The machine is served at `/rescue-vend/index.html`; the application route is
`/rescue-vend` (plus the existing tenant router prefix).

Rebuild the committed browser bundle after source changes:

    node client/public/rescue-vend/build.mjs

Uses the repository's existing esbuild; no new dependency or workflow required.

The parent page calls tenantApiRequest for:

- GET `/api/public/rescue-vend` → `{rescueName, items, available}`
- POST `/api/public/rescue-vend/checkout` with `{items:[{id,quantity}],checkoutKey}` → `{url}`
- GET `/api/public/rescue-vend/session?session_id=...`
  → `{status:'paid'|'pending', items:[{id,code,name,priceCents,quantity}], totalCents}`

Checkout URL is restricted to HTTPS `checkout.stripe.com`.
The backend must derive prices from its catalog, validate positive bounded
quantities (10 per item, 20 overall), create the exact-total Stripe donation, and ensure session lookup
belongs to the current tenant. No client total, cart, query flag or storage
value is payment evidence. Session endpoint should verify Stripe's paid state.
Return URLs: tenant `/rescue-vend?session_id={CHECKOUT_SESSION_ID}` and
`/rescue-vend?cancelled=1`.

Both parent and child verify postMessage origin AND exact source window.
Parent supplies catalog and optional sessionStorage cart using RESCUE_VEND_INIT.
Child announces RESCUE_VEND_READY and sends CART, CHECKOUT, SHARE messages.
Only server-confirmed paid session items generate RESCUE_VEND_PAID.
RESCUE_VEND_RESET unlocks checkout after a failed attempt.

SVG illustrations are selected from the uploaded inventory by stable item ID;
external product photos are intentionally not used. The shared backend catalog
should retain treats, toy, shampoo, hay, flea, microchip, heartworm, kibble
(A1–D2), with D1 named Heartworm Prevention.
