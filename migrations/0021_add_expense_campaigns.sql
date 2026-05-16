-- Task #213: Expense campaigns with optional matching donor.
-- A standalone goal-based fundraiser for an organizational expense (A/C,
-- electrical upgrade, van replacement) — separate from peer/emergency/event
-- campaigns. Optionally pairs with a single "matching donor" pool that
-- doubles (or otherwise multiplies) gifts up to a pledged cap.

CREATE TABLE IF NOT EXISTS expense_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  short_description text,
  long_description text,
  hero_image_url text,
  goal_amount_cents integer NOT NULL,
  raised_amount_cents integer NOT NULL DEFAULT 0,
  end_date timestamp,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT expense_campaigns_tenant_slug_unique UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS expense_campaigns_tenant_idx
  ON expense_campaigns(tenant_id);

CREATE TABLE IF NOT EXISTS campaign_match_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expense_campaign_id uuid NOT NULL REFERENCES expense_campaigns(id) ON DELETE CASCADE,
  public_sponsor_name text,
  show_sponsor_publicly boolean NOT NULL DEFAULT true,
  internal_sponsor_name text NOT NULL,
  internal_sponsor_email text NOT NULL,
  pledged_cap_cents integer NOT NULL,
  ratio_numerator integer NOT NULL DEFAULT 1,
  ratio_denominator integer NOT NULL DEFAULT 1,
  per_gift_cap_cents integer,
  starts_at timestamp,
  ends_at timestamp,
  total_matched_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT campaign_match_pools_campaign_unique UNIQUE (expense_campaign_id)
);

CREATE INDEX IF NOT EXISTS campaign_match_pools_tenant_idx
  ON campaign_match_pools(tenant_id);

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS expense_campaign_id uuid REFERENCES expense_campaigns(id) ON DELETE SET NULL;

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS matched_amount_cents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS donations_expense_campaign_idx
  ON donations(expense_campaign_id)
  WHERE expense_campaign_id IS NOT NULL;
