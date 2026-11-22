---
name: Acquisition analytics privacy
description: Privacy tradeoff for platform conversion measurement
---

Prefer coarse platform-funnel dimensions over raw attribution URLs. Do not
restore raw referrer or query-string collection in custom events just to
improve campaign attribution.

**Why:** Signup and demo contexts can carry identifiers or sensitive tokens.
The acquisition measurement requirement explicitly excludes PII and tokens,
including incidental tracker context rather than only custom properties.

**How to apply:** Check both custom properties and tracker-default payload
context when extending analytics. Treat any need for richer attribution as
a separate privacy-reviewed decision. See the measurement guide in
`docs/platform-acquisition-analytics.md` for current interpretation limits.
