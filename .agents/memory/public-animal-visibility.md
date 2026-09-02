---
name: Public animal visibility
description: Privacy and eligibility rules for public animal profiles across APIs, crawler metadata, and discovery.
---

Public animal pages are eligible only while an animal is in a deliberately public adoption status, is not on medical hold, and is not a TNR record. Unauthenticated responses must select an explicit visitor-safe field whitelist rather than returning a full animal row and deleting known-sensitive fields afterward.

**Why:** A public profile is exposed through more than the browser API. Server-rendered crawler metadata and sitemap generation can leak the existence or details of private animals even when the React page itself appears protected.

**How to apply:** Whenever public animal eligibility changes, update the public API/list query, individual profile query, server-side OG lookup, and sitemap filter together. Authenticated staff may retain the full internal animal response.