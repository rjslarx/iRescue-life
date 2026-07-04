---
name: Two isolated volunteer systems
description: calendar_events shifts vs volunteer_opportunities/signups — not linked; know which one a "volunteer shift" feature actually means
---

There are TWO unlinked volunteer scheduling systems. They are NOT the same thing,
and a request about "volunteers signing up for shifts on the calendars" means
system 1, not system 2. Confirm which one the user means before building.

1. **Internal calendar shifts** — `calendar_events` where the joined
   `calendars.type = 'volunteer'`. `startTime`/`endTime` are real timestamps.
   Volunteer identity, in priority order of how to reach an email:
   - `volunteerContactId` (FK → `users`, has email) — explicitly assigned volunteer.
   - **Self-signup**: `createdBy` (FK → `users`) IS the volunteer for
     "{Name} - Signup" events created via CalendarViewPage "Simplified Mode".
     These frequently have NO `volunteerContactId` and NO `manualVolunteerName`
     (name lives only in the title). Resolve email via `createdBy` **only when the
     title names the creator** (strict normalized equality after stripping a
     trailing " - Signup"). Do NOT prefix-match — a coordinator (e.g. Courtney
     Pettigrew at Haseya) creates many "{OtherName} - Signup" events, and
     prefix/loose matching would email the coordinator instead of the volunteer.
   - `manualVolunteerName` (free text, NO email) → unreachable, skip.

2. **Public opportunity signups** — `volunteer_opportunities` (`date` as plain
   YYYY-MM-DD text, `time` free-form, `calendar_id`) + `volunteer_signups`
   (`applicantEmail` notNull). Separate public flow. **No linkage** to system 1.

**How to apply:** the day-before shift reminder
(`server/services/volunteer-shift-reminders.ts`) is calendar-only (system 1) by
design — the opportunity path was intentionally removed after the user clarified
scope. Dedupe with `calendar_events.reminder_email_sent_at`. For the tenant-local
"tomorrow": pull a UTC window on `startTime` and filter by formatting into the
tenant tz. If a future feature needs opportunity signups too, add system 2 back
as a separate source; don't assume one covers the other.
