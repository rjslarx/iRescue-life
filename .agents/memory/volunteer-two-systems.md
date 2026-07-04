---
name: Two isolated volunteer systems
description: calendar_events shifts vs volunteer_opportunities/signups — not linked; any volunteer-wide feature must cover both
---

There are TWO unlinked volunteer scheduling systems. Any feature that must reach
"all scheduled volunteers" (reminders, digests, notifications) has to query BOTH,
or it silently misses whole categories of volunteers.

1. **Internal calendar shifts** — `calendar_events` where the joined
   `calendars.type = 'volunteer'`. `startTime`/`endTime` are real timestamps.
   Volunteer identity is either `volunteerContactId` (FK → `users`, has email) or
   `manualVolunteerName` (free text, NO email — unreachable). "{Name} - Signup"
   titles come from CalendarViewPage "Simplified Mode" self-created shifts and can
   have neither a contact id nor a manual name (name only in the title → no email).

2. **Public opportunity signups** — `volunteer_opportunities` (has `date` as
   **plain YYYY-MM-DD text**, `time` as free-form text, `calendar_id`,
   slots_total/filled) + `volunteer_signups` (`applicantEmail` notNull,
   `applicantName`, `opportunityId`, optional `userId`). This is where public
   signup emails live.

**No linkage between them:** signing up for an opportunity does NOT create a
calendar_event, and calendar_events has no opportunity_id.

**Why it matters:** the pre-existing weekly volunteer digest
(`volunteer-schedule-digest.ts`) only reads system 1, so it misses all public
opportunity signups. When building the day-before shift reminder, only covering
system 1 emailed almost nobody for tenants (like Haseya) whose volunteers use the
opportunity signup flow. The reminder service now covers both.

**How to apply:** because opportunity `date` is timezone-less text, match it
directly against the tenant-local "tomorrow" YYYY-MM-DD string (no timestamp
conversion). For calendar_events, pull a UTC window and filter by formatting
`startTime` into the tenant tz. Dedupe with a `reminder_email_sent_at` column on
EACH source table (calendar_events + volunteer_signups).
