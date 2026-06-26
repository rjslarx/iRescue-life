---
name: Schema changes & post-merge ALTERs
description: How to apply DB schema changes on this project (db:push hangs; use idempotent ALTER in scripts/post-merge.sh).
---

# Schema changes on this project

`npm run db:push` / `drizzle-kit push` reliably **hangs against the live Neon pool**, and also throws unrelated interactive create-vs-rename prompts from pre-existing drift (e.g. `foster_behavior_notes.foster_id`). Do NOT run it interactively and do NOT answer those prompts.

**How to add a column/table for a task:**
1. Add the field to `shared/schema.ts` as usual.
2. Apply to the live dev DB directly with additive SQL: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`.
3. **For deploy-safety**, append the same idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (wrapped in a `psql "$DATABASE_URL" ... || echo skipped` block) to `scripts/post-merge.sh`. This is the canonical post-merge script (`getPostMergeConfig()` → `scripts/post-merge.sh`). It runs on every merge and is how all environments get the schema change — the `migrations/` folder + drizzle journal are effectively NOT used for new changes (journal stuck at the first entry). Copy the style of the existing ALTER blocks already in that script.

**Why:** push hangs/prompts; the team standardized on idempotent SQL ALTERs in the post-merge script. A new column that lives only in `shared/schema.ts` + a manual local ALTER will break on deploy.

**How to apply:** any task that adds/renames DB columns.

# Surfacing a new tenant column to the frontend

A new `tenants.*` column is NOT automatically visible to the app. Public pages and most settings UIs read tenant data from `GET /api/tenant`, which returns `req.tenant` built by an **explicit projection** in `server/middleware/tenant.ts`. To expose a new column you MUST add it in THREE places in that file:
1. the `TenantContext` type (`export interface ...`),
2. the `db.select({ ... })` projection, and
3. the `req.tenant = { ... }` mapping.

Otherwise the column is saved in the DB but never reaches the client (image/setting silently fails to render). Note: some heavier/rarely-changed columns are instead exposed only via `GET /api/tenant/settings` (full row) — check which endpoint a page actually queries before deciding where to add the field.

**Why:** `req.tenant` is a hand-maintained allow-list projection, not a `SELECT *`.
