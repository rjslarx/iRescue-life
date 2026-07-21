---
name: UTC "today" date-shift in date inputs
description: Evening data entry shifted dates forward one day because "today" defaults used toISOString()
---

Rule: never build a "today" default or today-comparison for a date input with `new Date().toISOString().split('T')[0]` — that's the UTC date, which is TOMORROW during evenings in US timezones. Use `todayLocalISO()` from `client/src/lib/utils.ts`.

**Why:** Tenant staff entering vaccines at night on 7-14 saw them saved as 7-15; morning entry was fine. The default date field silently pre-filled tomorrow.

**How to apply:** Any new form defaulting a date field to today, or comparing against "today", must use the local helper. Converting STORED dates back to YYYY-MM-DD via toISOString is fine (they're UTC-midnight timestamps).
