---
name: Adoption placeholder vaccine coverage
description: Adoption due-date placeholders must not override actual vaccination coverage in portal alerts.
---

Treat “Set at adoption” preventative-care rows as deadline placeholders, not evidence of a newly administered vaccine.

**Why:** An adoption checkout created a rabies placeholder whose administration timestamp was the checkout date but whose due year was erroneous. It appeared newer than the actual three-year vaccination, producing contradictory portal alerts.

**How to apply:** Consult actual administered vaccine history across both medical sources when resolving rabies alerts. Ignore future administrations, impossible date intervals, and adoption placeholders as coverage evidence. Preserve stored history and contractual dates; reminder eligibility is not proof-obligation completion.

Outbound reminders must retain valid historical expiry evidence even after it expires, resolving obsolete deadlines forward to that expiry rather than reviving the original date.

**Why:** Filtering only while coverage is current makes an erroneous ancient deadline reappear as years overdue on the day coverage expires. Upcoming renewal reminders at the actual expiry must still be allowed.
