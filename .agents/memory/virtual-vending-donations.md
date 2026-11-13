---
name: Virtual vending donation policy
description: Symbolic donation semantics and fee allocation for the public rescue vending machine.
---

The virtual vending machine is a public, shareable tenant fundraiser, not a Rescue Pack perk or a physical-goods shop. A donor's displayed selection total must be their entire charge; deduct processing and platform fees from proceeds rather than adding a fee-cover charge.

**Why:** The user explicitly requested these boundaries when supplying the Antigravity vending machine on 2026-11-12.

**How to apply:** Reuse existing donation accounting and destination-charge economics. Treat supply descriptions as illustrative, not guaranteed earmarking or delivery. Only server-verified paid Stripe sessions may trigger the success experience; the uploaded demo events are not payment proof. Keep historical menu versions resolvable when changing item amounts.
