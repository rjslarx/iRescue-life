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

# Per-calendar minimum silently shadows the tenant-wide minimum
The shortage threshold is `calendar.minVolunteersRequired ?? settings.minimumVolunteers`. But `calendars.min_volunteers_required` has a **non-null DB default of 2**, so it is never null, so the global `minimumVolunteers` setting is effectively dead — lowering the global has zero effect on alerts.
**Why it matters:** a tenant set the global minimum to 1 ("1 volunteer is enough"), kept getting "needs 1 more" texts for 1-of-2 mornings, and reported it as broken. The per-calendar value (default 2) was overriding their global choice. The settings UI also doesn't cascade a global change down to per-calendar overrides, so the global control looks like it does nothing.
**How to apply:** to actually change a tenant's effective threshold, set `calendars.min_volunteers_required` per volunteer calendar (this also keeps CalendarViewPage color-coding consistent, since it reads the same per-calendar value with a hardcoded `?? 2`). A proper systemic fix would make the global setting authoritative across SMS + calendar color-coding + share image, all of which currently fall back to a hardcoded 2 rather than the global.
