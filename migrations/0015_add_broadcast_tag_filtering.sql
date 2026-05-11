-- Task #24: Broadcast Notifications Tag Filtering
-- Adds AND/OR mode and tag-exclusion support to broadcasts and templates.
ALTER TABLE broadcast_templates ADD COLUMN IF NOT EXISTS target_tags text[];
ALTER TABLE broadcast_templates ADD COLUMN IF NOT EXISTS target_tags_mode text DEFAULT 'any';
ALTER TABLE broadcast_templates ADD COLUMN IF NOT EXISTS exclude_tags text[];
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS target_tags_mode text DEFAULT 'any';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS exclude_tags text[];
