---
name: $5 Friday recurring-day model
description: How the "$5 Friday" fundraiser scheduling works and why old datetime columns are intentionally kept
---

# $5 Friday recurring-day scheduling

The public $5 campaign page (`/five-dollar-friday`) runs **all day on one recurring weekday each week**, chosen per-tenant. Column: `tenants.five_dollar_friday_day_of_week` (integer, JS `getDay()` convention 0=Sun..6=Sat, nullable → defaults to Friday=5 in code via `fiveDollarDayName()` in `shared/schema.ts`). Branding (badge, headline, SEO, donation campaign title, monthly nudge) is derived from the day name, so it becomes "$5 Tuesday" etc.

**Liveness is computed client-side** in `FiveDollarFridayPage.tsx` by comparing the weekday name in the tenant timezone (`Intl.DateTimeFormat`, tz defaults to `FIVE_DOLLAR_DEFAULT_TIMEZONE = "America/Chicago"`) to the configured day; non-campaign days redirect to `/donate`. There is **no server-side enforcement** on donation-session creation — gating is UX-only, matching the original design.

**Why the old `five_dollar_friday_starts_at`/`ends_at` columns still exist:** they were intentionally kept (non-destructive) when this replaced the fixed datetime-window model. Their PATCH handling in the branding route is dead but harmless. Do NOT re-introduce a datetime window UI — the model is day-of-week now.

**Why Central default:** no tenant sets `tenants.timezone` (always null — see tenant-timezone-scheduling.md), so defaulting to America/Chicago (never UTC) avoids day-boundary drift.
