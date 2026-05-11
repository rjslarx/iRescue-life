-- Task #198: One-Time Donation Tributes
-- Add optional "in memory of / in honor of" fields to donations.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS tribute_kind text,
  ADD COLUMN IF NOT EXISTS tribute_name text,
  ADD COLUMN IF NOT EXISTS tribute_recipient_name text,
  ADD COLUMN IF NOT EXISTS tribute_recipient_email text,
  ADD COLUMN IF NOT EXISTS tribute_message text,
  ADD COLUMN IF NOT EXISTS tribute_photo_url text,
  ADD COLUMN IF NOT EXISTS tribute_frame_style text,
  ADD COLUMN IF NOT EXISTS tribute_wall_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tribute_wall_expires_at timestamp,
  ADD COLUMN IF NOT EXISTS tribute_acknowledgment_sent_at timestamp;

-- Partial index used by the public Wall of Heroes Honor Roll endpoint to
-- pull active tribute gifts within the 12-month rolling window.
CREATE INDEX IF NOT EXISTS donations_tribute_wall_idx
  ON donations (tenant_id, tribute_wall_expires_at)
  WHERE tribute_wall_opt_in = true;
