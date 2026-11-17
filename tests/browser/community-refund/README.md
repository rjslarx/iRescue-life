# Refund intent browser regressions

Run `npm run test:refund-browser`. Requires system Chromium (`CHROMIUM_PATH`
can override its executable) and the project's installed dependencies.

This suite bundles the production `CommunityLedger`, `AdminOrderSafeguards`,
React Query, TenantProvider, and request hooks into an isolated in-memory HTTP
fixture. It mounts the ledger at the tenant-admin and platform URLs, checks the
actual scoped API paths and tenant headers, and mocks every API response at the
browser network boundary. It does not start the application backend, use a
database, or contact Stripe. Unexpected APIs and external requests fail the test.
It tests the ledger's permission handling, not login or the dashboard route gate.

Each scenario runs for tenant and platform scopes at desktop and 390px mobile
widths. Real clicks, form inputs, confirmation dialogs, reloads, sessionStorage,
query invalidation, and fetch errors exercise:

- Lost response persistence, locked restored fields, no automatic resubmission.
- Sync failure and exact-ID terminal matching (including `requestId` alias).
- Unrelated refunds/balance changes and incomplete recovery never clearing intent.
- Same-ID unchanged retries with an immediate second sync.
- Corrected rejected requests retaining their ID and tenant HTTP error status.
- Balance changes or newly discovered records blocking the final retry.
- Failed/canceled outcomes clearing intent without reporting refunded funds.
- Read-only staff lacking refund/retry controls even with a stored intent.
- UUID allocation counts surviving reload: no replacement on uncertain outcomes.
- Throwing `sessionStorage.setItem` before initial submission and same-ID retries
  (including corrected rejections): no refund POST until persistence succeeds.
- Throwing `removeItem` for succeeded/failed/canceled exact-ID records: saved
  reference and locked form survive reload until storage and explicit sync recover.
- Malformed JSON and invalid saved intent fields fail closed without allocating
  an ID, erasing evidence, crashing, or posting a replacement refund.
- Storage failures show actionable recovery instructions, not raw browser errors.

Four additional isolation scenarios run at both widths and with each workspace
visited first. Each keeps one tab/context alive while two ledger orders appear
in both scopes with identical order IDs. Fixture navigation uses same-tab SPA
links and warm query caches, with reload checks as well.
The fixture establishes tenant context before navigating back to the tenant
ledger; it does not test the real dashboard's route/context transition timing.
Distinct requests are
saved through all four production forms; row-scoped assertions check exact
amounts, reasons, request references, locked fields, and initially blank forms.
Each request is then reconciled independently: exact sessionStorage snapshots
prove only that scope/order key is removed, preserving the other requests and
unrelated session data. Navigation and reload must not submit or sync anything.

The existing `tests/community-resale-safeguards.test.ts` complements this suite
with server-side idempotency and recovery checks; it is not replaced.
