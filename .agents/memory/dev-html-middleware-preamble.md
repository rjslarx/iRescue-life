---
name: Dev HTML middleware needs Vite React preamble
description: Any middleware that serves raw client/index.html in dev must inject the @vitejs/plugin-react preamble or every page it serves renders blank.
---

Rule: in development, any server code that reads `client/index.html` and serves it directly (bypassing `vite.transformIndexHtml`) must inject the standard React-refresh preamble script, or React refuses to mount ("can't detect preamble") and the page is a blank white screen — dev only; prod builds are unaffected.

**Why:** The OG/SEO tag middleware served raw index.html for animal profiles and tenant homepages, making them all blank in dev while APIs were healthy — very misleading during debugging (looked like a frontend crash).

**How to apply:** Reuse/replicate the `injectDevVitePreamble()` helper pattern (guarded by NODE_ENV and an idempotency check on `__vite_plugin_react_preamble_installed__`) in any new middleware that serves HTML in dev. `server/vite.ts` cannot be modified, so the fix belongs in the middleware itself.
