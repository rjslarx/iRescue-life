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
