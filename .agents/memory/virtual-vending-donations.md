---
name: Virtual vending donation policy
description: Symbolic donation semantics and fee allocation for the public rescue vending machine.
---

The virtual vending machine is a public, shareable tenant fundraiser, not a Rescue Pack perk or a physical-goods shop. A donor's displayed selection total must be their entire charge; deduct processing and platform fees from proceeds rather than adding a fee-cover charge.

**Why:** The user explicitly requested these boundaries when supplying the Antigravity vending machine on 2026-11-12.

**How to apply:** Reuse existing donation accounting and destination-charge economics. Treat supply descriptions as illustrative, not guaranteed earmarking or delivery. Only server-verified paid Stripe sessions may trigger the success experience; the uploaded demo events are not payment proof. Keep historical menu versions resolvable when changing item amounts.

Vending supply rankings use refund-adjusted gift value. Mixed-cart refunds and proceeds are proportional allocations, not item-specific refund instructions or restricted-fund accounting. Original assessed platform revenue and processing recovery remain distinct from current actual rescue proceeds.

**Why:** Stripe refunds and transfer reversals apply to the payment rather than individual symbolic supplies; pretending they establish supply-specific cashflows would mislead finance staff.

**How to apply:** Preserve every cent when splitting mixed carts, label allocations and original fees clearly, and retain unknown catalog metadata as unattributed rather than dropping verified gifts.

Bind checkout to the menu version actually displayed by the embedded machine, not merely the latest background-fetched catalog.

**Why:** The embedded machine initializes separately from React Query. A background refresh can otherwise send a new version while the donor still sees old prices.

**How to apply:** Reject stale selections for review rather than silently repricing them. Saved menu versions must remain immutable so both in-flight and paid Stripe sessions resolve against their original prices and descriptions.
