#!/bin/bash
set -e
npm install

# drizzle-kit push reliably hangs against the live Neon pool on this project,
# so tasks that need schema changes apply SQL ALTERs directly. We still try
# the push (it auto-resolves additive drift when it does run) but cap it at
# 60s and never fail the merge if it hangs or errors. The "yes" pipe handles
# the occasional create-vs-rename prompt by selecting the highlighted default
# ("create column" — the safe additive choice).
# Task #72: rename subscriptions.first_name_display → display_name (Wall of
# Heroes recognition name). Idempotent: only runs if the old column still
# exists. Preserves existing donor recognition names.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] subscriptions display_name rename skipped (already applied or DB unreachable)."
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'first_name_display'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'display_name'
  ) THEN
    EXECUTE 'ALTER TABLE subscriptions RENAME COLUMN first_name_display TO display_name';
  END IF;
END $$;
SQL

# Task #215: Partial unique indexes on payments.(tenant_id, stripe_checkout_session_id)
# and payments.(tenant_id, stripe_payment_intent_id) so concurrent Stripe webhook
# redeliveries cannot double-insert the same donation. Idempotent — CREATE INDEX
# IF NOT EXISTS is a no-op if the indexes already exist. drizzle-kit push has
# historically dropped partial-index WHERE clauses, so we apply via SQL first.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] payments stripe unique indexes skipped (already applied or DB unreachable)."
CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_stripe_session_unique
  ON payments (tenant_id, stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_stripe_intent_unique
  ON payments (tenant_id, stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
SQL

# Task #240: Donation receipt authorized signature. Tenant-level columns that
# store the signature image path + signer name/title stamped onto every receipt
# PDF. Idempotent — ADD COLUMN IF NOT EXISTS is a no-op when already applied.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] tenants receipt signature columns skipped (already applied or DB unreachable)."
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_signature_url text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_signature_name text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_signature_title text;
SQL

# Task #253: $5 Friday custom page image. Per-tenant object-storage path for the
# hero image shown on the public /five-dollar-friday page. Idempotent —
# ADD COLUMN IF NOT EXISTS is a no-op when already applied.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] tenants five_dollar_friday_image_url column skipped (already applied or DB unreachable)."
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS five_dollar_friday_image_url text;
SQL

# Task #253 follow-up: $5 Friday campaign schedule window. Optional start/end
# timestamps; outside the window the public page redirects to /donate. Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] tenants five_dollar_friday schedule columns skipped (already applied or DB unreachable)."
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS five_dollar_friday_starts_at timestamp;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS five_dollar_friday_ends_at timestamp;
SQL

# $5 Friday recurring-day model: the campaign now runs all day on a per-tenant
# weekday (0=Sun..6=Sat, JS getDay; null defaults to Friday in code) instead of
# a fixed datetime window. Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] tenants five_dollar_friday_day_of_week column skipped (already applied or DB unreachable)."
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS five_dollar_friday_day_of_week integer;
SQL

# Day-before volunteer shift reminders: dedupe stamp on calendar_events so the
# hourly reminder cron never emails the same volunteer twice for one shift.
# Idempotent — ADD COLUMN IF NOT EXISTS is a no-op when already applied.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] volunteer reminder_email_sent_at columns skipped (already applied or DB unreachable)."
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_email_sent_at timestamp;
SQL

# CNR/TNR Trap Loan public form: custom field definitions (address, trap count,
# loan duration, ID upload) rendered on the public /f/:slug form page. Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] custom_forms form_fields column skipped (already applied or DB unreachable)."
ALTER TABLE custom_forms ADD COLUMN IF NOT EXISTS form_fields jsonb;
SQL

yes "" | timeout 60 npx drizzle-kit push --force || \
  echo "[post-merge] drizzle-kit push skipped (timeout or non-zero exit) — schema must be managed via SQL ALTER in the task."

# AI Grant Writing Assistant: per-grant application drafts (question/answer
# pairs with generation metadata) and the tenant-scoped reusable Answer Library.
# Idempotent — CREATE TABLE/INDEX IF NOT EXISTS are no-ops when already applied.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] grant AI assistant tables skipped (already applied or DB unreachable)."
CREATE TABLE IF NOT EXISTS grant_application_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text,
  sort_order integer NOT NULL DEFAULT 0,
  generation_meta jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_application_drafts_grant_idx
  ON grant_application_drafts (tenant_id, grant_id);
CREATE TABLE IF NOT EXISTS grant_answer_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  content text NOT NULL,
  ai_seeded boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_answer_library_tenant_idx
  ON grant_answer_library (tenant_id);
SQL

# Raffle bundle pricing: optional jsonb tiers on shop_products
# (e.g. [{"quantity":5,"price":"20.00"}]) so raffles can offer bulk-discount
# ticket bundles. Idempotent — ADD COLUMN IF NOT EXISTS is a no-op when applied.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] shop_products bundle_pricing column skipped (already applied or DB unreachable)."
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS bundle_pricing jsonb;
SQL

# Reminder email frequency controls (tenant-configurable cadence for adopter
# pet-care reminders, heartworm warnings, foster compliance lead time, and the
# staff medical digest). Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] reminder frequency columns skipped (already applied or DB unreachable)."
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS adopter_reminder_frequency_days integer;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS heartworm_warning_frequency_days integer;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS foster_reminder_lead_days integer;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS medical_digest_frequency_days integer;
SQL

# Peer-campaign themed backgrounds (birthday, confetti, hearts, paws, stars)
# for public /fundraise landing pages. Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] peer_campaigns theme_background column skipped (already applied or DB unreachable)."
ALTER TABLE peer_campaigns ADD COLUMN IF NOT EXISTS theme_background text;
SQL

# Shop order processing fee (buyer-paid card fee added at checkout). Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] shop_orders processing_fee column skipped (already applied or DB unreachable)."
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS processing_fee text NOT NULL DEFAULT '0';
SQL

# Per-form notification recipients for custom form signatures. Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] custom_forms notification_emails column skipped (already applied or DB unreachable)."
ALTER TABLE custom_forms ADD COLUMN IF NOT EXISTS notification_emails text[];
SQL

# Atomic idempotency for unmatched inbound SMS (alumni photo routing) —
# unique partial index on Twilio MessageSid so concurrent webhook
# redeliveries can't double-log or double-route. Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] sms_message_logs unmatched-inbound unique index skipped (already applied or DB unreachable)."
CREATE UNIQUE INDEX IF NOT EXISTS sms_message_logs_unmatched_inbound_sid_unique
  ON sms_message_logs (twilio_message_sid)
  WHERE message_type = 'unmatched_inbound' AND twilio_message_sid IS NOT NULL;
SQL

# Alumni routing lifecycle state for unmatched inbound SMS (retryable
# routing after post-claim failures). Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] sms_message_logs alumni_routing_status column skipped (already applied or DB unreachable)."
ALTER TABLE sms_message_logs ADD COLUMN IF NOT EXISTS alumni_routing_status text;
SQL

# Raffle sharing incentives: per-product toggle/caps + bonus-ticket records
# earned by paid buyers (social share once per order item, email referrals up
# to the cap). Unique partial indexes make grants idempotent under concurrency.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] raffle sharing incentive schema skipped (already applied or DB unreachable)."
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS access_token text NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS raffle_incentives_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS raffle_max_referrals integer NOT NULL DEFAULT 3;
CREATE TABLE IF NOT EXISTS shop_raffle_bonus_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES shop_order_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  referred_email text,
  ticket_numbers text[] NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_raffle_bonus_share_unique
  ON shop_raffle_bonus_tickets (order_item_id)
  WHERE action_type = 'share';
CREATE UNIQUE INDEX IF NOT EXISTS shop_raffle_bonus_referral_unique
  ON shop_raffle_bonus_tickets (order_item_id, referred_email)
  WHERE action_type = 'referral';
CREATE INDEX IF NOT EXISTS shop_raffle_bonus_product_idx
  ON shop_raffle_bonus_tickets (product_id);
CREATE INDEX IF NOT EXISTS shop_raffle_bonus_order_idx
  ON shop_raffle_bonus_tickets (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS shop_raffle_drawings_one_drawn_per_product
  ON shop_raffle_drawings (product_id) WHERE status='drawn';
SQL

# Lease timestamp for alumni-routing claims (stale 'processing' recovery). Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] sms_message_logs alumni_routing_claimed_at column skipped (already applied or DB unreachable)."
ALTER TABLE sms_message_logs ADD COLUMN IF NOT EXISTS alumni_routing_claimed_at timestamp;
SQL
