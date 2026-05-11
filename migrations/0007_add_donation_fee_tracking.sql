ALTER TABLE donations ADD COLUMN IF NOT EXISTS fees_covered boolean NOT NULL DEFAULT false;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS gross_amount integer;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS net_amount integer;
