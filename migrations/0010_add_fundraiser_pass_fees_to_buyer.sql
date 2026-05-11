ALTER TABLE fundraiser_events ADD COLUMN IF NOT EXISTS pass_fees_to_buyer boolean NOT NULL DEFAULT false;
