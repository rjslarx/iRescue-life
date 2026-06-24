---
name: Volunteer alert systems & dedup gotcha
description: Two volunteer-shortage alert systems; the recruitment one's threshold-history dedup silently fails, so trust the 24h SMS gate instead. No personal names in blast SMS.
---

# Two volunteer shortage alert systems
There are two independent volunteer-shortage alerting paths (a settings-driven recruitment SMS service and a scheduler-driven threshold-alert service). They have different wording and partly overlapping storage. When changing volunteer-alert behavior, check both — a change in one does not affect the other.

# Recruitment dedup history is unreliable
The recruitment SMS service's writes to the threshold-alert history table fail silently (placeholder FK values violate FKs, swallowed by an empty catch), so that table is effectively empty.
**Why it matters:** do not treat that history table as the recruitment service's dedup source; per-shift dedup there does not work.
**How to apply:** rely on the 24h SMS-log suppression gate for recruitment dedup. If real per-opportunity dedup is ever needed, use valid FK values or a dedicated table and stop swallowing the error.

# No individual names in blast recruitment SMS
Urgent shortage SMS must stay count-based ("X/Y signed up"), never name a specific volunteer.
**Why:** naming one signer broadcasts their name to all recipients and goes stale the instant a signup changes (a tenant reported an alert naming a volunteer not on the shift). Volunteer-count miscounts come from send-time signup state, not from day-bucket splitting (same-time events always bucket together).
