---
name: Destination-charge economics
description: Durable ownership, fee-allocation, and dispute-reconciliation rules for Stripe destination charges.
---

Destination routing depends on whether a connected destination exists, never on
whether iRescue's own revenue is positive. A destination charge's application
fee combines iRescue revenue with estimated Stripe processing-cost recovery,
but those components must remain separate in versioned metadata and reporting.
Direct and tenant-owned charges keep their existing ownership and refund rules.

**Why:** Stripe debits destination-charge processing costs from the platform.
Routing paid-tier 0% payments as platform-only charges or retaining only
iRescue revenue makes the platform absorb both rescue proceeds and processing
costs. Combining the transfer decision with the business-fee decision caused
the original loss.

**How to apply:** Every new destination-charge surface must set the destination
even at 0% iRescue revenue, estimate processing with integer-cent math, and
report actual balance cashflows separately from estimates. Refund both the
destination transfer and combined application fee only for destination charges.
For disputes, move rescue funds only when Stripe dispute balance transactions
show principal withdrawal; use durable tagged reversals/restorations and
post-mutation reconciliation so retries and out-of-order events are safe. A
won-dispute restoration is a separate transfer, so later refunds must recover
gross proceeds across both transfers rather than relying on Stripe's
`reverse_transfer` against the depleted original. In that case, create the
charge refund without either destination-refund flag, refund the application
fee separately, and key every external and local accounting step by the Stripe
refund ID.