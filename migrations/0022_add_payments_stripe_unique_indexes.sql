-- Task #215: Prevent duplicate Stripe webhook deliveries from double-counting donations.
--
-- The checkout.session.completed handler already dedupes by SELECTing for an
-- existing payment row keyed on stripe_checkout_session_id / stripe_payment_intent_id
-- before inserting, but there is no DB-level uniqueness. Under rare concurrent
-- webhook redeliveries (Stripe retries 1h/2h/2h on a non-2xx, and at-least-once
-- delivery can race a still-in-flight first attempt) two workers can both pass
-- the SELECT, both INSERT, and double-credit the donation — and for expense
-- campaigns (Task #213) double-credit the matching pool inside its transaction.
--
-- Adding partial unique indexes makes this race-proof for every donation flow:
-- the second insert raises a unique violation that the handler now treats as
-- "already processed" (HTTP 200 idempotent), exactly like the SELECT-based
-- pre-check.
--
-- Partial (WHERE ... IS NOT NULL) because:
--   * Subscription payments don't carry a checkout session id (they're keyed by
--     stripe_invoice_id instead).
--   * Subscription-mode checkout sessions don't expose a payment_intent.
--   * Manual / non-Stripe payments have neither column populated.
-- Postgres treats NULLs as distinct under UNIQUE so a plain unique constraint
-- would still allow many NULL rows, but the partial index keeps the index
-- itself smaller (only rows with a Stripe id are indexed) and documents the
-- intent that uniqueness only applies to Stripe-originated rows.

CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_stripe_session_unique
  ON payments (tenant_id, stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_stripe_intent_unique
  ON payments (tenant_id, stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
