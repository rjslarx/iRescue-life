---
name: Cash App Pay fundraising eligibility
description: Confirm provider eligibility before adding Cash App Pay to rescue donation checkouts.
---
Do not assume that a Cash App Pay dashboard toggle authorizes rescue fundraising through Stripe.

**Why:** On 2026-10-30, Stripe's Cash App Pay documentation explicitly listed MCC 8398, “Charitable and Social Service Organizations - Fundraising,” as prohibited. The requested donation/campaign integration was paused without checkout changes after discovering this restriction.

**How to apply:** Recheck https://docs.stripe.com/payments/cash-app-pay.md and obtain provider confirmation of eligibility for the actual platform/connected-account fundraising flow before implementing. Do not reroute charges through the platform or change business classifications to evade restrictions. This restriction concerns Cash App Pay, not all Stripe payment methods.
