---
name: Shop checkout confirm gap
description: How shop orders are finalized when Stripe succeeds through redirects, webhooks, or delayed reconciliation.
---

Shop payment completion must not depend solely on the checkout component receiving Stripe's result. Redirect-based methods such as Cash App Pay can return directly to the order page, and buyers can close the page before any client confirmation runs.

**Why:** a production Cash App Pay PaymentIntent succeeded while the matching raffle order stayed `processing`, excluding valid tickets from the drawing.

**How to apply:**
- Treat `payment_intent.succeeded` as the primary server-side shop finalization signal when its metadata and stored PaymentIntent match the tenant/order.
- The Stripe return page must also call the verified confirm endpoint once for a matching successful redirect, then remove the order token, PaymentIntent client secret, and Stripe return parameters from the URL.
- The hourly abandoned-order sweep reconciles with Stripe before cancelling: succeeded PaymentIntents are finalized paid (transaction: transition + inventory, then email); only definitively-unpaid orders are cancelled; transient errors skip the order.
- To manually fix a stuck prod order: POST the public confirm endpoint on the live site with `orderId` + `paymentIntentId` and header `x-tenant-id: <subdomain>` (custom-domain/base-domain requests need that header for tenant resolution). It verifies with Stripe, so it's safe.
- Connect destination-charge PaymentIntents live on the PLATFORM account — retrieve with the platform key, no stripeAccount header.
- Every completion path must use the same idempotent paid transition and product-row lock as the draw. If the draw wins that race, automatically refund instead; Connect destination-charge refunds must reverse the transfer and refund any application fee.
