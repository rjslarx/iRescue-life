---
name: Cash App Pay fundraising eligibility
description: Confirm provider eligibility before adding Cash App Pay to rescue donation checkouts.
---
Do not assume that a Cash App Pay dashboard toggle authorizes rescue fundraising through Stripe.

**Why:** On 2026-10-30, Stripe's Cash App Pay documentation explicitly listed MCC 8398, “Charitable and Social Service Organizations - Fundraising,” as prohibited. The requested donation/campaign integration was paused without checkout changes after discovering this restriction.

**How to apply:** Recheck https://docs.stripe.com/payments/cash-app-pay.md and obtain provider confirmation of eligibility for the actual platform/connected-account fundraising flow before implementing. Do not reroute charges through the platform or change business classifications to evade restrictions. This restriction concerns Cash App Pay, not all Stripe payment methods.

The user supplied a clarification that iRescue's platform account is classified as MCC 5734 (Software/SaaS); this account classification has not been independently verified. The clarification distinguishes prohibited MCCs (not resolved by extra onboarding information) from restricted MCCs, and says eligibility applies to each account's MCC.

**Why:** Eligibility for iRescue software fees must not be conflated with eligibility for rescue donations, even when the platform processes the charge.

**How to apply:** Keep nonprofit donation checkout unchanged pending clarification of the actual transaction and Connect charge flow. Do not claim that platform MCC 5734 authorizes charitable fundraising.
