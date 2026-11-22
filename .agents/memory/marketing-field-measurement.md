---
name: Marketing field measurement
description: Privacy and interpretation constraints for real-user performance measurement
---

Keep marketing performance separate from acquisition analytics and avoid attaching
document-wide Web Vitals to later SPA routes. Prefer losing a sample over recording
tenant-private activity against a public marketing route.

**Why:** The requirement excludes token URLs, identities and tenant-private data.
Standard document metrics can include later screens; filtering only the initial
URL is insufficient. Controlled lab measurements are not visitor field scores.

**How to apply:** Preserve strict public-route boundaries and sanitized tracker
context. Disclose sampling exclusions and per-metric sample sizes when interpreting
results. Release-dependent checks require the actual released build and traffic;
never substitute workspace headers or local measurements.
