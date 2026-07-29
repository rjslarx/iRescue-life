---
name: Raffle bundle pricing & buyer-paid fees
description: Shop/raffle pricing policy — exact configured tier prices, no cheapest-combo optimization; buyer pays grossed-up card fee.
---

# Raffle bundle pricing & buyer-paid card fees

Rule: `computeBundledPrice` (shared/raffle-pricing.ts) must charge the EXACT configured tier prices, decomposing quantity greedily from the largest tier down (10 = 10-pack price; 13 = 10-pack + 3-pack; remainder at single price). Never re-optimize across tiers for the cheapest combination.

**Why:** The original DP "cheapest combo" implementation priced 10 tickets as three 3-packs + one single ($16.94) when the rescue configured a $20 10-pack — user explicitly wants the exact price she set. (July 2026)

Shop checkout also adds a buyer-paid card processing fee grossed up as `(subtotal + 0.30)/(1 - 0.029)` so the rescue nets the configured price; stored in `shop_orders.processing_fee`, included in `total_amount` and the payment intent. Server totals are authoritative — checkout UI must display the server-returned subtotal/processingFee/totalAmount once the order is created (client calc is only a pre-order estimate). Zero subtotal ⇒ zero fee on both sides.

**How to apply:** any future shop pricing change (discounts, promo codes, fee toggle) must keep client estimate + server calc + Stripe amount in lockstep, and keep tier prices exact.
