---
name: Wouter base + useRoute double-prefix
description: Route patterns inside the based Router must be relative, never prefixed with basePath
---

The app wraps all routes in `<WouterRouter base={basePath}>` (path-based tenant prefix like `/southernpets` in dev). Inside that router, wouter matches against the base-stripped location.

**Rule:** `useRoute()` patterns inside pages must be relative (e.g. `/shop/:slug`), never `` `${basePath}/shop/:slug` ``.

**Why:** A basePath-prefixed pattern double-prefixes and never matches under path-based tenancy — slug params come back undefined and pages silently render their "not found" state. In production (subdomain tenants) basePath is "", which masks the bug: it only surfaces in dev/path-based access.

**How to apply:** When a public page shows "not found" in dev path-based mode but its API works via curl, check `useRoute` patterns for a basePath prefix first. All correct pages already use relative patterns.
