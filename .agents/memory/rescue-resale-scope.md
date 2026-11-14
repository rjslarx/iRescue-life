---
name: Rescue Resale scope
description: Approved first-version boundaries and safety decisions for the local resale fundraiser.
---

Rescue Resale is a separate page on the tenant website. Eligibility requires that tenant's configured Twilio SMS, not a Haseya-specific hardcoded allowlist. The user identified Haseya as the only currently eligible rescue.

New Rescue Resale sales owe the platform 5% of the total sale price, independent of tenant subscription tier. Deduct this and processing fees within the sale price; split only the remainder for 50/50 listings.

**Why:** The user explicitly requested a feature-specific fee to cover additional platform expenses.

**How to apply:** Use the actual negotiated checkout price, not the listing asking price, and preserve fee snapshots for existing checkouts and paid sales. Do not change fees for other fundraisers.

**Why:** The user approved the recommended first version on 2026-11-13, not the entire uploaded Antigravity proposal.

**How to apply:** Full donation remains the default. Preserve donor-held items, staff listing approval, phone-number-masked conversations, private offers, Stripe checkout, scheduled shelter/event or approved public pickup, and sales records/CSV. The optional split extension below is now approved; Uber Direct, external Antigravity automation, and automatic charitable receipt claims remain outside scope.

The rescue and donor must decide the legal transfer and tax acknowledgment arrangement separately; a buyer's resale purchase is not automatically a charitable donation.

The user approved optional 50/50 splits of net proceeds with automatic contributor bank payouts, gated by rescue-admin opt-in. The other option (full donation) must remain the default.

**Why:** The user wants routine payouts to require no rescue-volunteer action and prefers automation over manually recording payments.

**How to apply:** Never enable the setting for tenants automatically. Require contributor Stripe onboarding and participant pickup confirmation. Preserve full-donation listings and existing orders; disabling new split purchases must not strand paid orders. Never exercise live transfers in workspace tests.

Split sales use separate transfers; partial refunds or disputes conservatively recover both shares and require review before releasing any remainder. An uncertain request older than Stripe's idempotency retention must not be blindly recreated.

**Why:** Once a contributor receives money in their bank, recovery is not guaranteed. Preventing duplicate or premature payouts matters more than automatically retrying every ambiguous failure.

**How to apply:** Keep split-sale recovery separate from destination-charge recovery, show actual transferred balances separately from calculated shares, and treat “transferred to Stripe” as distinct from “paid to bank.”

**Why:** The original proposal conflated contributed goods and purchase receipts. The approved recommendation explicitly separated these.

**How to apply:** Treat resale checkout as a sale, not the generic donation webhook path. Preserve exact inventory reservations until Stripe confirms expiry/payment. Do not release holds based on browser cancellation alone. SMS uses an explicit resale conversation prefix so existing foster, medication, and adopter routing keeps working.

SMS offer negotiation is approved, but acceptance must not charge the buyer or promise that an item is reserved.

**Why:** The user approved adapting the uploaded service's SMS commands, not replacing the tenant-integrated checkout or expanding the first-version scope.

**How to apply:** Keep phone/tenant ownership checks, explicit conversation codes, and replay-safe offer transitions. Direct accepted buyers to the existing pickup selection and secure checkout.

Treat old resale `failed` send outcomes as uncertain, not as proof that Twilio rejected a text.

**Why:** The previous shared sender could report failure when the provider accepted the SMS but saving its audit log failed. Retrying these historical outcomes can duplicate messages.

**How to apply:** Automatically retry pickup notifications only when non-acceptance is explicitly established. Missing delivery callbacks or old failure labels require reconciliation or staff review, never an automatic resend.

Direct SMS replies may bypass quiet hours, but not explicit organization-scoped unsubscribe records or communication pauses.

**Why:** The user authorized expanding a tests-only investigation to add the missing local unsubscribe safeguard. A default false marketing opt-in is not an explicit transactional SMS unsubscribe.

**How to apply:** Preserve explicit-opt-out semantics rather than blocking all transactional recipients lacking marketing opt-in. Do not claim provider-managed STOP suppression is a local pre-send check; synchronizing STOP/START for recipients without user accounts requires separate work.
