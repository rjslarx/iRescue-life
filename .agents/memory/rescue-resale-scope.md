---
name: Rescue Resale scope
description: Approved first-version boundaries and safety decisions for the local resale fundraiser.
---

Rescue Resale is a separate page on the tenant website. Eligibility requires that tenant's configured Twilio SMS, not a Haseya-specific hardcoded allowlist. The user identified Haseya as the only currently eligible rescue.

**Why:** The user approved the recommended first version on 2026-11-13, not the entire uploaded Antigravity proposal.

**How to apply:** Keep all net proceeds with the rescue, donor-held items, staff listing approval, phone-number-masked conversations, private offers, Stripe checkout, scheduled shelter/event or approved public pickup, and sales records/CSV. Do not add 50/50 donor payouts, Uber Direct, external Antigravity automation, or automated charitable receipt claims without further approval.

The rescue and donor must decide the legal transfer and tax acknowledgment arrangement separately; a buyer's resale purchase is not automatically a charitable donation.

**Why:** The original proposal conflated contributed goods and purchase receipts. The approved recommendation explicitly separated these.

**How to apply:** Treat resale checkout as a sale, not the generic donation webhook path. Preserve exact inventory reservations until Stripe confirms expiry/payment. Do not release holds based on browser cancellation alone. SMS uses an explicit resale conversation prefix so existing foster, medication, and adopter routing keeps working.

SMS offer negotiation is approved, but acceptance must not charge the buyer or promise that an item is reserved.

**Why:** The user approved adapting the uploaded service's SMS commands, not replacing the tenant-integrated checkout or expanding the first-version scope.

**How to apply:** Keep phone/tenant ownership checks, explicit conversation codes, and replay-safe offer transitions. Direct accepted buyers to the existing pickup selection and secure checkout.
