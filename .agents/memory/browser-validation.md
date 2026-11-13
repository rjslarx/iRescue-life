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
