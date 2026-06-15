---
name: Tenant timezone is unset — local-time cron jobs must default it
description: tenants.timezone is nullable and never populated by any UI/onboarding; per-tenant local-time scheduled jobs must supply a safe default, never a midnight-UTC fallback.
---

# Tenant timezone & per-tenant scheduled jobs

`tenants.timezone` (IANA string) is nullable and, as of now, is **never set** —
there is no settings/onboarding UI and no server-side write that populates it. So
in practice it is `null` for every tenant.

**Rule:** any per-tenant job that must fire at a specific *local* hour (e.g. "6 PM
the evening before") must resolve the timezone with a safe default
(`getLocalParts(tenant.timezone || DEFAULT, now)`), never fall back to a
"midnight-UTC + tomorrow-in-UTC" scheme.

**Why:** the surgery-day SMS reminder did exactly that fallback. Firing at midnight
UTC means the *previous evening* for any west-of-UTC (US) tenant, while it computed
"tomorrow in UTC" — so the target date landed two local-days ahead and the reminder
arrived **a day too soon**. Symptom in logs/screenshots: reminder delivered at ~7 PM
local (= 00:00 UTC under US Central CDT). Fix lives in
`server/services/surgery-day-reminders.ts` (`DEFAULT_TENANT_TIMEZONE`, env-overridable,
defaults `America/Chicago`, validated at load).

**How to apply:** when adding/auditing any tenant-scoped local-time scheduler, assume
`tenant.timezone` is null. Default to a valid IANA zone and gate on local hour via the
DST-aware `Intl.DateTimeFormat` parts. If per-tenant accuracy matters platform-wide,
the real follow-up is capturing tenant timezone in settings + backfilling.
