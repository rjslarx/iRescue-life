---
name: Volunteer scheduling — two systems & audit trail
description: How to tell who scheduled a volunteer shift and when; two distinct volunteer scheduling systems exist.
---

There are TWO separate volunteer scheduling systems — don't confuse them:

1. **Calendar-based self-scheduling** (`calendar_events` table). Each booked shift
   is a calendar event, usually titled `"{Name} - Signup"`. Audit fields:
   - `created_by` (uuid → users.id) = the logged-in account that booked the shift.
     Set server-side from `req.user!.id` on POST create-event, so it is trustworthy
     (cannot be spoofed by the assigned volunteer).
   - `created_at` = when it was booked. `start_time`/`end_time` = the shift.
   - Assigned volunteer = `volunteer_contact_id` (uuid → users.id) OR
     `manual_volunteer_name` (free text for volunteers not in the system).
   - Permissions: non-admins need calendar `canAdd`; scheduling SOMEONE ELSE needs
     `canAssignOthers` (user- or role-level). So a coordinator account can create
     shifts for many different volunteers.

2. **Public opportunity signups** (`volunteer_signups` table) — separate flow tied to
   `volunteer_opportunities`. Stores applicantName/Email/Phone, optional `user_id`,
   and `created_at`. Route: POST `/api/volunteer-opportunities/:id/signup`.

**How to answer "who scheduled whom":** for calendar shifts, query `calendar_events`
by title/volunteer_contact_id and read `created_by` (join users) + `created_at`.
A single `created_by` across many different volunteers' shifts = a coordinator
booking on their behalf, NOT self-scheduling.
