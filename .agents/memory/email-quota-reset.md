---
name: Platform email quota monthly reset
description: How tenant platform-email quotas work and the diagnostic trail when a tenant is "locked out" of email.
---

# Platform email quota & monthly reset

Tenants without their own Gmail/Resend fall back to the platform Resend key, which
is metered: `tenants.emailsSentThisMonth` counts sends and is capped at
`tenants.emailQuotaLimit` (default 500). When the cap is hit, `getEmailService()`
returns `null`, and downstream callers (medical reminders, contact form, etc.)
report a **misleading** "Email service is not configured for this organization" —
it's actually a quota exhaustion, not a config problem.

**Rule:** the counter must be rolled over at the start of each UTC month, otherwise
it accumulates forever and the tenant is permanently locked out of platform email.

**Why:** the schema comment ("Counter reset monthly") and the manual admin endpoint
`POST /api/admin/reset-email-quotas` ("should be called by a scheduled job at the
beginning of each month") documented this rollover, but no scheduled job ever
existed — so a real tenant hit 500/500 and stayed locked out across months.

**How to apply:** the rollover now lives in `server/lib/email-quota-reset.ts`
(`resetMonthlyEmailQuotas()`), registered as a daily cron + a boot-time self-heal in
`server/lib/scheduler.ts`. It is self-healing (resets any tenant whose
`lastEmailQuotaReset` predates the current UTC month), so missed runs and
deploy/restart gaps are caught. If a tenant ever reports email silently failing,
first check `emailsSentThisMonth` vs `emailQuotaLimit` before suspecting config.
