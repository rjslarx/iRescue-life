---
name: Rescue Resale scope
description: Approved first-version boundaries and safety decisions for the local resale fundraiser.
---

Rescue Resale is a separate page on the tenant website. Eligibility requires that tenant's configured Twilio SMS, not a Haseya-specific hardcoded allowlist. The user identified Haseya as the only currently eligible rescue.

The separately approved Facebook-first community workflow does not require Twilio. It uses manual Facebook posts, Messenger coordination, email-verified sellers, and approved existing rescue tenants. Preserve the original SMS workflow.

**Why:** The user explicitly requested a new workflow without deleting previous work, rather than a replacement or Facebook API integration.

**How to apply:** Never relax the original workflow's Twilio guard globally. Keep courier and volunteer delivery excluded from both workflows.

Community-gallery buyers need a reviewed public Facebook/Messenger contact link, not just a seller's first name. Keep that link with the order and explain that buyers must retain their Messenger conversation and share only the order reference after paying.

**Why:** Manual sharing alone left buyers who discovered an item on the site unable to arrange pickup.

**How to apply:** Require explicit disclosure that the contact link is public and may reveal Facebook identity; changing it must go through listing review again. Never put private access tokens in share links.

New Rescue Resale sales owe the platform 5% of the total sale price, independent of tenant subscription tier. Deduct this and processing fees within the sale price; split only the remainder for 50/50 listings.

**Why:** The user explicitly requested a feature-specific fee to cover additional platform expenses.

**How to apply:** Use the actual negotiated checkout price, not the listing asking price, and preserve fee snapshots for existing checkouts and paid sales. Do not change fees for other fundraisers.

**Why:** The user approved the recommended first version on 2026-11-13, not the entire uploaded Antigravity proposal.

**How to apply:** Full donation remains the default. Preserve donor-held items, staff listing approval, phone-number-masked conversations, private offers, Stripe checkout, scheduled shelter/event or approved public pickup, and sales records/CSV. Optional splits are approved; courier expansion is deferred as described below. External Antigravity automation and automatic charitable receipt claims remain outside scope.

The rescue and donor must decide the legal transfer and tax acknowledgment arrangement separately; a buyer's resale purchase is not automatically a charitable donation.

Community resale must not release payouts merely because 48 or 72 hours passed without a complaint. Forgotten pickup codes require reminders and an audited staff-reviewed handoff confirmation, not presumed delivery.

**Why:** The user approved the safer launch safeguards without automatic time-based payout release.

**How to apply:** Preserve existing payout timing unless separately authorized. Staff confirmation must not bypass an unresolved buyer issue, refund, dispute, or Stripe funds-availability requirement.

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

For any optional courier-delivery expansion, the buyer pays delivery; local pickup remains the existing baseline.

Courier integration is deferred to a possible phase two. Keep phase one pickup-only; do not resume Uber Direct or DoorDash implementation or request credentials without renewed authorization.

Volunteer delivery is excluded from Rescue Resale, including any future delivery phase.

**Why:** The user explicitly stated they do not want volunteers involved with delivery.

**How to apply:** Do not propose or build volunteer delivery requests, driver-claim queues, or volunteer delivery fees. Any future delivery discussion should concern professional couriers and still requires renewed authorization.

**Why:** On 2026-11-16, the user explicitly asked to hold off on courier integration and compare a pickup-only launch proposal. Volunteer delivery and a proposed $10 delivery charge were suggestions for review, not approved features.

**How to apply:** Preserve unused quote foundations without connecting them to checkout. Previously chosen platform ownership and buyer-paid economics apply only if courier work is later resumed.

**Why:** On 2026-11-16, the user chose buyer-paid delivery while discussing comparing Uber Direct and DoorDash Drive quotes. This does not authorize paid account setup or live dispatch.

**How to apply:** Keep delivery charges separate from item sale proceeds and the contributor split. Provider access and resale eligibility must be confirmed before activation.

Courier accounts are platform-owned: iRescue collects buyer-paid delivery charges and pays the courier.

**Why:** On 2026-11-16, the user explicitly chose platform-owned rather than rescue-owned accounts after being informed about billing and unrecovered cancellation/return/dispute costs.

**How to apply:** Use platform courier credentials with tenant-scoped orders, quotes and address access. Keep provider pass-through and delivery processing recovery separate from platform sale revenue. Account creation and live dispatch still require approval.

Direct SMS replies may bypass quiet hours, but not explicit organization-scoped unsubscribe records or communication pauses.

**Why:** The user authorized expanding a tests-only investigation to add the missing local unsubscribe safeguard. A default false marketing opt-in is not an explicit transactional SMS unsubscribe.

**How to apply:** Preserve explicit-opt-out semantics rather than blocking all transactional recipients lacking marketing opt-in. Do not claim provider-managed STOP suppression is a local pre-send check; synchronizing STOP/START for recipients without user accounts requires separate work.
