---
name: Reserved paths must be updated in two places
description: New public top-level routes need adding to BOTH client reserved-path lists or tenant resolution breaks in dev/path-based mode.
---

When adding a new public top-level route (e.g. `/five-dollar-friday`, `/donate`, `/vip-club`), the path segment must be added to the `RESERVED_PATHS` array in BOTH:
- `client/src/contexts/TenantContext.tsx`
- `client/src/lib/tenantApi.ts`

**Why:** In dev / path-based tenant mode, the first URL path segment is interpreted as the tenant subdomain. If the new route isn't reserved, the resolver treats it as a (non-existent) tenant — the page 404s its API calls and `tenantApi`'s `buildTenantUrl` prepends the bad slug to API paths. The two lists are intentionally duplicated (tenantApi's comment says it MUST match TenantContext) but they are NOT auto-synced, so it's easy to update one and miss the other.

**How to apply:** Any time you register a new `<Route path="/foo" ...>` in `client/src/App.tsx` for a public page, grep for `RESERVED_PATHS` and add `'foo'` to every occurrence.
