#!/bin/bash
set -e
npm install

# Phase 1 interactive animal profiles and their tenant-controlled review queue.
# All changes are additive and safe to rerun.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] interactive animal profile schema skipped (already applied or DB unreachable)."
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS require_animal_profile_submission_approval boolean NOT NULL DEFAULT false;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS personality_tags text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE animals ADD COLUMN IF NOT EXISTS superpower_badges jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS reveal_cards jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS profile_videos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS photo_alt_texts jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS animal_profile_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  proposed_payload jsonb NOT NULL,
  contributor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  contributor_name text NOT NULL,
  contributor_roles text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  review_notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS animal_profile_submissions_tenant_status_idx
  ON animal_profile_submissions (tenant_id, status);
CREATE INDEX IF NOT EXISTS animal_profile_submissions_animal_idx
  ON animal_profile_submissions (tenant_id, animal_id);
SQL

# Public animal questions and meet-and-greet requests.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] animal inquiries schema skipped (already applied or DB unreachable)."
CREATE TABLE IF NOT EXISTS animal_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  animal_id uuid REFERENCES animals(id) ON DELETE SET NULL,
  animal_name text NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  request_type text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  preferred_contact text NOT NULL DEFAULT 'email',
  message text NOT NULL,
  availability text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS animal_inquiries_tenant_created_idx
  ON animal_inquiries (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS animal_inquiries_tenant_animal_idx
  ON animal_inquiries (tenant_id, animal_id);
SQL

# Task #298: foster agreements can be sent directly to an existing approved
# adopter. These additive ALTERs preserve legacy application-backed sessions.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] foster direct agreement columns skipped (already applied or DB unreachable)."
ALTER TABLE foster_agreement_sessions ALTER COLUMN foster_application_id DROP NOT NULL;
ALTER TABLE foster_agreement_sessions ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'application';
ALTER TABLE foster_agreement_sessions ADD COLUMN IF NOT EXISTS staff_initiated_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE foster_agreement_sessions ADD COLUMN IF NOT EXISTS direct_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE foster_agreement_sessions ADD COLUMN IF NOT EXISTS foster_address text;
ALTER TABLE foster_agreement_sessions ADD COLUMN IF NOT EXISTS template_name text;
ALTER TABLE foster_agreement_sessions ADD COLUMN IF NOT EXISTS template_html_snapshot text;
ALTER TABLE foster_agreement_sessions ADD COLUMN IF NOT EXISTS send_method text;
CREATE INDEX IF NOT EXISTS foster_agreement_sessions_direct_contact_idx
  ON foster_agreement_sessions (tenant_id, direct_contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS foster_agreement_sessions_active_direct_contact_unique
  ON foster_agreement_sessions (tenant_id, direct_contact_id)
  WHERE origin = 'direct'
    AND direct_contact_id IS NOT NULL
    AND status IN ('pending', 'resending');
SQL

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

# Exactly-once local accounting for restoration-aware Stripe refunds. The
# unique Stripe refund ID lets retries resume external recovery without
# decrementing donor totals twice.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] payment refund accounting table skipped (already applied or DB unreachable)."
CREATE TABLE IF NOT EXISTS payment_refund_accounting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_refund_id text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  donor_id uuid REFERENCES donors(id) ON DELETE SET NULL,
  refunded_amount integer NOT NULL,
  full_refund boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_refund_accounting_tenant_payment_idx
  ON payment_refund_accounting (tenant_id, payment_id);
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

# Historical adoption-agreement PDF repairs: every attempted regeneration gets
# a durable per-contract outcome without altering the legal signing record.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] adoption contract PDF repair audit table skipped (already applied or DB unreachable)."
ALTER TABLE adoption_checkout_sessions
  ADD COLUMN IF NOT EXISTS signature_claimed_at timestamp;
ALTER TABLE adoption_contracts
  ADD COLUMN IF NOT EXISTS drivers_license_image_url text;
ALTER TABLE adoption_contracts
  ADD COLUMN IF NOT EXISTS drivers_license_number text;
CREATE TABLE IF NOT EXISTS adoption_contract_pdf_regeneration_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id integer NOT NULL REFERENCES adoption_contracts(id) ON DELETE CASCADE,
  status text NOT NULL,
  reason text NOT NULL,
  old_pdf_url text,
  new_pdf_url text,
  signature_image_url text,
  drivers_license_image_url text,
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);
CREATE INDEX IF NOT EXISTS adoption_contract_pdf_regen_tenant_run_idx
  ON adoption_contract_pdf_regeneration_audits (tenant_id, run_id);
CREATE INDEX IF NOT EXISTS adoption_contract_pdf_regen_contract_status_idx
  ON adoption_contract_pdf_regeneration_audits (contract_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS adoption_contract_pdf_regen_active_unique
  ON adoption_contract_pdf_regeneration_audits (contract_id, reason)
  WHERE status IN ('started', 'succeeded');
SQL

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

-- Adoption agreement direct sends (send agreement straight to a person, no application)
CREATE TABLE IF NOT EXISTS adoption_agreement_direct_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id integer REFERENCES adoption_contract_templates(id) ON DELETE SET NULL,
  template_name text NOT NULL,
  template_html_snapshot text NOT NULL,
  animal_id uuid REFERENCES animals(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  staff_initiated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  secure_token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  signed_at timestamp,
  signer_name text,
  signer_email text,
  signer_phone text,
  signer_address text,
  signature_data text,
  signed_ip text,
  signed_user_agent text,
  rendered_contract text,
  contract_pdf_url text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adoption_agreement_direct_sends_tenant_idx
  ON adoption_agreement_direct_sends (tenant_id);
CREATE INDEX IF NOT EXISTS adoption_agreement_direct_sends_token_idx
  ON adoption_agreement_direct_sends (secure_token_hash);
SQL

# Lease timestamp for alumni-routing claims (stale 'processing' recovery). Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] sms_message_logs alumni_routing_claimed_at column skipped (already applied or DB unreachable)."
ALTER TABLE sms_message_logs ADD COLUMN IF NOT EXISTS alumni_routing_claimed_at timestamp;
SQL

# 50/50 split-the-pot raffles: product mode plus immutable prize accounting
# and staff-recorded payout status on the drawing. Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] split-the-pot raffle columns skipped (already applied or DB unreachable)."
ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS raffle_mode text NOT NULL DEFAULT 'fixed';
ALTER TABLE shop_raffle_drawings
  ADD COLUMN IF NOT EXISTS ticket_sales_amount text,
  ADD COLUMN IF NOT EXISTS winner_prize_amount text,
  ADD COLUMN IF NOT EXISTS rescue_share_amount text,
  ADD COLUMN IF NOT EXISTS payout_status text,
  ADD COLUMN IF NOT EXISTS prize_paid_at timestamp,
  ADD COLUMN IF NOT EXISTS prize_paid_by uuid REFERENCES users(id) ON DELETE SET NULL;
SQL

# Public raffle ticket-sales goal. Existing and new raffles default to 100;
# the value is informational and does not cap ticket sales. Idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] raffle ticket goal column skipped (already applied or DB unreachable)."
ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS raffle_ticket_goal integer NOT NULL DEFAULT 100;
SQL

# Dedicated 1200x630 social-preview derivative for shop products and raffles.
# The original product image remains unchanged; legacy products fall back to it.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] shop product social image column skipped (already applied or DB unreachable)."
ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS social_image_url text;
SQL

# Optional, tenant-scoped cat safety appendix. Sent agreements retain
# an immutable template/version and the signed response evidence.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' || echo "[post-merge] cat safety addendum schema skipped (already applied or DB unreachable)."
CREATE TABLE IF NOT EXISTS cat_safety_addendum_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  html_template text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  updated_at timestamp NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
ALTER TABLE adoption_checkout_sessions ADD COLUMN IF NOT EXISTS cat_safety_addendum_html_snapshot text;
ALTER TABLE adoption_checkout_sessions ADD COLUMN IF NOT EXISTS cat_safety_addendum_version text;
ALTER TABLE adoption_checkout_sessions ADD COLUMN IF NOT EXISTS cat_safety_addendum_answers jsonb;
ALTER TABLE adoption_agreement_direct_sends ADD COLUMN IF NOT EXISTS recipient_phone text;
ALTER TABLE adoption_agreement_direct_sends ADD COLUMN IF NOT EXISTS recipient_address text;
ALTER TABLE adoption_agreement_direct_sends ADD COLUMN IF NOT EXISTS cat_safety_addendum_html_snapshot text;
ALTER TABLE adoption_agreement_direct_sends ADD COLUMN IF NOT EXISTS cat_safety_addendum_version text;
ALTER TABLE adoption_agreement_direct_sends ADD COLUMN IF NOT EXISTS cat_safety_addendum_answers jsonb;
CREATE INDEX IF NOT EXISTS cat_safety_addendum_settings_enabled_idx ON cat_safety_addendum_settings (enabled);
SQL
