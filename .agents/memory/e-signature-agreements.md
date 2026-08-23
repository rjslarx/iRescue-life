---
name: E-signature agreement flows (foster/surrender/adoption)
description: Conventions for the tenant-scoped token-based e-signature agreement flows and how to harden new ones.
---

# E-signature agreement flows

The app has several public, token-based e-signature flows that share one pattern: a
`*_agreement_sessions` table row holds a sha256 token hash + expiry; a public un-authed
`GET /api/public/.../:token` returns sanitized rendered HTML, and `POST .../:token/sign`
validates a signature, renders signed HTML, marks the row signed, and lazily generates a
stamped PDF. The foster flow (`PublicFosterAgreementPage`, foster routes) is the reference
implementation to mirror for new ones.

**Auto-send on approval:** surrender agreements send automatically when an intake/surrender
request is approved. There are TWO intake approval paths in `server/routes.ts` (the
`POST /api/animals` surrender block and `POST /api/surrender/:id/promote`) — any send logic
must be idempotent across BOTH.

## Hardening rules for these flows (learned via code review)
- **Idempotent send:** dedupe with a partial unique index `(tenant_id, <request>_id) WHERE status IN ('pending','signed')` + `onConflictDoNothing().returning()` insert; a read-then-insert check alone is racy across the two trigger paths.
- **Idempotent sign:** the sign UPDATE must carry a `status='pending'` precondition and check `.returning()` — return 409 if no row updated, so a concurrent double-submit can't overwrite a signature.
- **Signature input:** validate `signatureImageData` with a strict data-URL regex (`^data:image/(png|jpe?g|webp);base64,...$`) and a size cap. A bare `z.string()` allows empty "signatures" and remote URLs that Puppeteer would fetch server-side (SSRF) during PDF render.

## Verifying these flows end-to-end (testing gotchas)
- **The signing token is only emailed (stored as sha256 hash), so a browser test can't read it.** Pre-generate a token + its sha256 hash, run the real approval path to create the session, then `[DB] UPDATE *_agreement_sessions SET secure_token_hash='<hash>'` and navigate `/{subdomain}/.../sign/<token>`.
- **The `demo` admin's stored password hash does NOT match the value in the `DEMO_USER_PASSWORD` env var** — login fails with "Password verification failed". Before a browser login test, set the demo admin's `password_hash` to a bcrypt hash of a password you control via a one-off SQL UPDATE, then log in with that. Demo tenant resets daily so this is safe. (Never hardcode credential values in code or memory.)
- After signing, reloading the public page shows "Agreement Already Signed" (status card) rather than the post-submit "Agreement Signed!" success step — both are expected, not a bug.

## Environment gotcha
- **Full `npx tsc --noEmit` is killed by the sandbox (exit -1).** Scoped `tsc` on single server files reports false `@shared/schema` / es6-target errors because it ignores the project tsconfig path aliases — ignore those. Rely on the running `tsx` dev server + LSP instead.
- **`npm run db:push` is interactive and gets killed (exit -1).** For an empty/new table, create the index directly with `psql "$DATABASE_URL" -c "CREATE UNIQUE INDEX IF NOT EXISTS ..."` so it matches the drizzle definition. Dev URLs are path-based: `/{subdomain}/...`; hitting a route without the tenant prefix makes the app treat the first path segment as the tenant (404).

## Signature pad on iPad/mobile (fixed once — don't regress)
- The shared `SignatureCanvas` originally cleared the canvas on EVERY window resize. On iOS, opening/closing the on-screen keyboard fires a resize, so signing then tapping a text field silently wiped the signature ("it won't let me sign"). The fix: skip resizes where container width is unchanged (keyboard = height-only) and preserve/restore the signature via toDataURL/fromDataURL when width really changes. Any new signature canvas must follow the same rule.

## Verifying stored images in signed PDFs

A non-null signature or ID storage reference does not prove the image rendered in the signed PDF. Verify the actual PDF visually, including regeneration of an existing agreement.

**Why:** The files were saved correctly, but a later template-security step rejected the inline raster image source. The PDF still generated successfully with a broken signature icon, while a legacy template omitted the uploaded ID entirely.

**How to apply:** Keep inline PDF images restricted to validated raster base64 data (never SVG or arbitrary data URLs), ensure legacy templates receive the ID appendix exactly once, and test both the initial generation and staff regeneration paths by rendering the resulting PDF.

## Repairing historical signed PDFs

Historical agreement repair must preserve the original rendered PDF pages and
append recovered signature/ID evidence; do not re-render legal text from current
templates, contacts, animals, or session fields.

**Why:** Those source records can change after signing, so regenerating from live
data can silently alter an already executed agreement while trying to repair an
image.

**How to apply:** Select by the exact fix cutoff, process one tenant at a time,
use durable per-contract claims/outcomes, make abandoned-run recovery explicit,
and apply tenant-private ACLs to the original PDF, replacement PDF, signature,
and ID while rejecting any object already scoped to another tenant. Snapshot the
ID reference on the contract under an atomic signing claim; a legacy session
reference may be pinned only when object metadata proves it existed by signing,
otherwise leave the PDF unchanged and record a failure.
