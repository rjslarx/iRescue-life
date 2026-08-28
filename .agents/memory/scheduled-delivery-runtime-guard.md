---
name: Scheduled delivery runtime guard
description: The production-only boundary for autonomous jobs that can contact live recipients or external systems.
---

Autonomous scheduled jobs must initialize only in a published Replit deployment (`REPLIT_DEPLOYMENT=1`). Do not treat `NODE_ENV=production` by itself as permission to start them.

**Why:** A development workspace can run a production build and share live provider credentials while containing stale data, which can send false messages to real recipients.

**How to apply:** Add new cron-driven delivery and polling jobs behind the centralized scheduler initialization guard. Keep explicit staff-triggered actions callable in development for intentional testing.