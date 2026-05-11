-- Adds cancel_at_period_end to subscriptions so we can show donors a clear
-- "Your monthly gift will end on …" banner during the grace window between
-- portal cancellation and the actual end of the billing period (status stays
-- 'active' during that window).

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
