-- Forever Hero — Task #196 review fix.
-- When a tribute subscription becomes a Forever Hero on cancellation, we
-- freeze its final tenure (in paid months) at that moment so the public
-- Wall of Heroes tile keeps showing the badge it had earned, instead of
-- continuing to advance from `since`.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS forever_hero_tenure_months integer;
