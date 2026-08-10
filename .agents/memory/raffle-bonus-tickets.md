---
name: Raffle bonus tickets & order access tokens
description: How raffle sharing-incentive bonus tickets stay collision-free and why public order actions need shop_orders.access_token
---

- Raffle ticket numbers are a single per-product sequence: purchased tickets (sum of shop_order_items.quantity) PLUS bonus tickets (sum of cardinality(shop_raffle_bonus_tickets.ticket_numbers)). ANY new allocator must take `SELECT ... FOR UPDATE` on the shop_products row and count both sources, or numbers collide.
- The draw and bonus grants serialize on that same product row lock; grants re-check drawn status and referral cap inside the transaction. A partial unique index (`shop_raffle_drawings_one_drawn_per_product`, product_id WHERE status='drawn') is the DB backstop against double draws.
- **Shop order numbers are sequential/guessable (`ORD-######`).** Buyer-only public actions must require `shop_orders.access_token` (gen_random_uuid default; returned by checkout, embedded as `?t=` in the confirmation-email order link, kept in sessionStorage `shop-order-token:<orderNumber>`). Never authorize by order number or customer email — architect review rejected both. The public order GET masks customerEmail and strips accessToken/phone.
- Idempotency for bonus grants lives in partial unique indexes on shop_raffle_bonus_tickets (one 'share' row per order_item_id; unique (order_item_id, referred_email) for 'referral') + onConflictDoNothing.

**Why:** bonus tickets create prize-winning entries and an email-sending primitive; two architect review rounds flagged post-draw grant races, raceable caps/draws, and order-number-based access as serious flaws.
**How to apply:** any future feature touching raffle tickets, draws, or public order-page actions.
