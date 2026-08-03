---
name: Alumni SMS photo updates
description: Constraints for routing adopter (alumni) SMS/MMS replies onto animal records
---
Adopter alumni replies are stored as **unpublished happy tails**, not foster updates.

**Why:** adopters are not `users`, and foster_updates has a NOT NULL fosterId FK → users. Happy tails already key by animal and power the adopter portal.

**How to apply:**
- Twilio MMS media URLs expire and need Basic auth (accountSid:authToken) — always download into object storage before saving; never store raw Twilio media URLs.
- Inbound webhook idempotency must be atomic (unique constraint + conflict-tolerant insert), not read-then-insert — concurrent Twilio redeliveries race. And "insert won" alone gives at-most-once: downstream routing needs a claimable retry state so a post-claim failure is retried on the next redelivery, not skipped forever.
- Never treat webhook-supplied URLs as fetch targets with credentials attached: validate the canonical host/account path, handle redirects manually without the auth header, and cap size/content-type.
- Drizzle gotcha: Postgres refused to infer a partial unique index as an ON CONFLICT arbiter via target/targetWhere; targetless `onConflictDoNothing()` was required.
