---
name: Tenant settings data source
description: Where to read full tenant rows vs the limited req.tenant subset in this app
---

# Tenant settings data source

`req.tenant` (and `GET /api/tenant`, which returns `{ tenant: req.tenant }`) is a
**limited subset** of tenant columns. Newly added `tenants` columns will NOT appear
there.

**Rule:** to read or surface new tenant columns in admin settings UI, use
`GET /api/tenant/settings` (admin-only) which does `db.select().from(tenants)` and
returns the full row as `{ tenant }`. Invalidate `['/api/tenant/settings']` after writes.

**Why:** silently reading from `/api/tenant` made new fields come back undefined; the
full-row endpoint is the correct source for settings pages.

**Also:** `client/src/components/OrganizationSettings.tsx` is dead code (no importers).
Reachable settings pages are branding/notifications/integrations/billing/security/medical;
`BrandingSettingsPage` is the default landing (SettingsPage redirects there).
