---
name: Shop checkout confirm gap
description: Buyers can pay on Stripe but never trigger the client-side confirm; how orders get stuck and how they're recovered.
---

The shop checkout flow finalizes orders via a client-side POST to `/api/shop/checkout/confirm` after Stripe payment. If the buyer closes the page first, the payment succeeds on Stripe but the order stays `pending`/`processing` forever (happened in production).

**Why:** there is no Stripe webhook for shop orders — confirmation is client-driven only.

**How to apply:**
- The hourly abandoned-order sweep reconciles with Stripe before cancelling: succeeded PaymentIntents are finalized paid (transaction: transition + inventory, then email); only definitively-unpaid orders are cancelled; transient errors skip the order.
- To manually fix a stuck prod order: POST the public confirm endpoint on the live site with `orderId` + `paymentIntentId` and header `x-tenant-id: <subdomain>` (custom-domain/base-domain requests need that header for tenant resolution). It verifies with Stripe, so it's safe.
- Connect destination-charge PaymentIntents live on the PLATFORM account — retrieve with the platform key, no stripeAccount header.
