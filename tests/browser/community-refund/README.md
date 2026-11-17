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

The existing `tests/community-resale-safeguards.test.ts` complements this suite
with server-side idempotency and recovery checks; it is not replaced.
