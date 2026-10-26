---
name: Matching milestone rules
description: Financial semantics and historical safeguards for sequential angel-donor commitments.
---

Sequential matching milestones represent ordered, dollar-for-dollar sponsor commitments: one sponsor matches the first eligible donations, the next sponsor matches the following donations, and so on. A gift crossing a boundary splits its match rather than receiving multiple full matches.

**Why:** The requested use case is several angel donors pledging distinct consecutive amounts, not simultaneous matching by every sponsor. Community gifts and sponsor obligations must remain separate; a pledge is not cash received.

**How to apply:** Preserve the existing configurable-ratio single-sponsor option. Milestone mode uses 1:1 with no per-gift cap, and the shared matching window determines eligibility. Milestone balances are based on matched eligible gifts, not all campaign gifts received outside that window.

Do not allow milestone conversion, reordering, removal, or matching-configuration changes after a campaign has received its first donation. Campaign descriptions and other non-matching details remain editable.

**Why:** Reinterpreting the order or sponsor identity after money arrives would silently reassign historical financial obligations. A new campaign is safer than rewriting those commitments.

**How to apply:** Enforce this in the API under the same campaign lock as payment allocation, not just with disabled controls. Keep per-gift sponsor attribution and never expose internal sponsor identities on public pages or receipts.
