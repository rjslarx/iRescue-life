---
name: Lightweight browser checks
description: Workspace browser availability and limits observed during focused CSS checks.
---

For lightweight CSS checks, do not assume Puppeteer's bundled Chrome is installed merely because the package is present. Use an available system Chromium executable.

**Why:** The workspace's Puppeteer executable path pointed to a missing download. A system Chromium could run isolated DOM checks, while navigation to the proxied development domain timed out; the application screenshot service still loaded the page successfully.

**How to apply:** Check executable availability first. When proxy navigation fails, use the screenshot service for page rendering and isolated compiled-CSS checks for animation/media-query behavior. Do not describe isolated checks as end-to-end navigation verification.

When a Node DOM test loads bundled CommonJS components from an ESM test, inject the same React Query module instance used by the test's provider.

**Why:** Node's separate ESM and CommonJS exports create separate React Query contexts; an otherwise valid component reports “No QueryClient set” when it consumes the other instance.

**How to apply:** Share the real imported module at the bundle's require boundary rather than mocking hooks or cache behavior.

Keep isolated financial browser regressions offline at the network boundary, including font stylesheets.

**Why:** Production CSS can import remote fonts even when every API is mocked. An otherwise isolated browser fixture may still make external requests.

**How to apply:** Strip remote stylesheet imports from fixture-only CSS, allow local data-URL assets, and fail on unexpected API or external network requests. Keep production CSS unchanged.

Isolated ledger fixtures that omit dashboard route gates must establish tenant context before SPA navigation back from platform scope.

**Why:** Tenant restoration occurs in a parent effect; a child query can start earlier with no tenant header. This is separate from refund-intent isolation.

**How to apply:** Set tenant context before fixture navigation, keep strict request-header assertions, and do not claim this verifies real dashboard route-transition timing.

Do not wait for Puppeteer's request event before releasing a response held inside an asynchronous interception handler.

**Why:** A deferred interception handler can delay `waitForRequest` resolution until interception finishes, creating a circular wait instead of observing the pending UI.

**How to apply:** Observe pending controls and count requests inside the interception handler, or signal arrival explicitly from that handler. Release held responses in cleanup even if assertions fail.
