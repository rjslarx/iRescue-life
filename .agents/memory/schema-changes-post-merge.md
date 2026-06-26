---
name: Schema changes & post-merge ALTERs
description: How to apply DB schema changes on this project (db:push hangs; use idempotent ALTER in scripts/post-merge.sh).
---

# Schema changes on this project

`npm run db:push` / `drizzle-kit push` reliably **hangs against the live Neon pool**, and also throws unrelated interactive create-vs-rename prompts from pre-existing drift (e.g. `foster_behavior_notes.foster_id`). Do NOT run it interactively and do NOT answer those prompts.

**How to add a column/table for a task:**
1. Add the field to `shared/schema.ts` as usual.
2. Apply to the live dev DB directly with additive SQL: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`.
3. **For deploy-safety**, append the same idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (wrapped in a `psql "$DATABASE_URL" ... || echo skipped` block) to `scripts/post-merge.sh`. This is the canonical post-merge script (`getPostMergeConfig()` → `scripts/post-merge.sh`, 120s timeout). It runs on every merge and is how all environments get the schema change — the `migrations/` folder + drizzle journal are effectively NOT used for new changes (journal stuck at entry 0000).

**Why:** push hangs/prompts; the team standardized on idempotent SQL ALTERs in the post-merge script (see the Task #240 / #215 blocks there as templates). A new column that is only in `shared/schema.ts` + a manual local ALTER will break on deploy.

**How to apply:** any task that adds/renames DB columns. Follow the existing block style in `scripts/post-merge.sh`; the script ends with a best-effort `yes "" | timeout 60 npx drizzle-kit push --force` that must never be relied on for correctness.
