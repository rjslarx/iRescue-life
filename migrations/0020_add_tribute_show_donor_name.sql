-- Task #210: Optional "From {donor name}" line on public Wall of Heroes
-- tribute tiles. Default OFF so silence stays private; donors opt in on
-- the Donate page or in the VIP portal.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS tribute_show_donor_name boolean NOT NULL DEFAULT false;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS memorial_show_donor_name boolean NOT NULL DEFAULT false;
