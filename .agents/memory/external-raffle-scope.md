---
name: External raffle scope
description: Decision to leave future third-party raffles outside iRescue rather than building an integration.
---

The user decided not to build an external raffle-provider integration. Rescues can run future raffles directly through Zeffy or another provider and share campaign links in social posts.

**Why:** The user judged an iRescue integration unnecessary when supporters can follow the provider's link directly.

**How to apply:** Do not resume the stopped external-provider feature unless explicitly requested. Leave Southern Pets' existing 50/50 raffle unchanged; the user explicitly chose to let it finish. This is not confirmation of processor approval or legal compliance.

## Separate football-pool scope

The user specified that community football squares should be available only to Haseyas and Southern Pets, not platform-wide. They initially requested Venmo/Cash App paid entries with no Stripe involvement, but subsequently accepted the explicitly scoped free-entry board with custom staff email/text messaging.

**Why:** The rescues want to stop managing square requests through social-media comments. The implemented scope was agreed after explicitly explaining that entries must be free and messaging is for reservation confirmations/event updates, not payment instructions.

**How to apply:** Treat this as separate from the deferred Zeffy/provider integration and existing raffles. Keep it free-entry with no required donation, payment links, paid-entry tracking, or payouts. Enforce hosting eligibility on the server and UI. Staff texts require optional explicit participant consent; no messages are sent automatically on reservation. Unlisted/share-by-link is not private authentication.
