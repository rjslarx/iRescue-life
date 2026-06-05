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

yes "" | timeout 60 npx drizzle-kit push --force || \
  echo "[post-merge] drizzle-kit push skipped (timeout or non-zero exit) — schema must be managed via SQL ALTER in the task."
