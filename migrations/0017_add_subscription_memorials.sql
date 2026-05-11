-- Task #196: Wall of Heroes memorial photos + Forever Hero flag.
-- Adds optional tribute photo + decorative frame style + the persistence flag
-- the public-wall reader checks so canceled tribute subscriptions with >= 12
-- months of active billing keep their tile.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS memorial_photo_url text,
  ADD COLUMN IF NOT EXISTS memorial_frame_style text,
  ADD COLUMN IF NOT EXISTS forever_hero boolean NOT NULL DEFAULT false;

-- Speeds up the public Wall reader filter `WHERE status IN (...) OR forever_hero = true`.
CREATE INDEX IF NOT EXISTS subscriptions_tenant_forever_hero_idx
  ON subscriptions (tenant_id) WHERE forever_hero = true;
