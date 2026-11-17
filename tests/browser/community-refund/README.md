# Refund intent browser regressions

Run `npm run test:refund-browser`. Requires system Chromium (`CHROMIUM_PATH`
can override its executable) and the project's installed dependencies.

This suite bundles the production `CommunityLedger`, `AdminOrderSafeguards`,
React Query, TenantProvider, and request hooks into an isolated in-memory HTTP
fixture. It mounts the ledger at the tenant-admin and platform URLs, checks the
actual scoped API paths and tenant headers, and mocks every API response at the
browser network boundary. It does not start the application backend, use a
database, or contact Stripe or an email provider. Unexpected APIs and external requests fail the test.
It tests the ledger's permission handling, not login or the dashboard route gate.

Each scenario runs for tenant and platform scopes at desktop and 390px mobile
widths. Real clicks, form inputs, confirmation dialogs, reloads, sessionStorage,
query invalidation, and fetch errors exercise:

- Delayed email retry success for either recipient: both retry controls remain
  disabled during repeated clicks, only one selected-recipient POST is sent,
  statuses stay unchanged until success, and both controls recover after the
  response and ledger refresh. No queued duplicate is sent on response arrival.
- Lost response persistence, locked restored fields, no automatic resubmission.
- Sync failure and exact-ID terminal matching (including `requestId` alias).
- Unrelated refunds/balance changes and incomplete recovery never clearing intent.
- Same-ID unchanged retries with an immediate second sync.
- Corrected rejected requests retaining their ID and tenant HTTP error status.
- Dismissing native confirmations for initial refunds, unchanged retries, and
  corrected retries sends neither refund nor retry-preflight sync, allocates no
  UUID, and preserves the saved intent exactly. A later explicitly confirmed
  action succeeds with the expected payload and original retry ID.
- Balance changes or newly discovered records blocking the final retry.
- Dismissing native issue-resolution and manual-handoff confirmations preserves
  the exact reason/evidence and selected action, sends no mutation, and triggers
  no ledger refresh. A later explicit acceptance sends exactly one scoped POST
  with the correct issue/pickup-help reference and trimmed inputs, refreshes the
  ledger, and clears inputs only on success. Both actions run in both admin
  scopes at desktop and mobile widths (eight cases).
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
- Rapid same-turn initial submits, unchanged retries, and corrected retries with
  deferred sync/refund responses: one in-flight refund, one UUID, disabled
  controls throughout pending work, and no resubmission on response arrival.
  These cases cover same-component concurrency, not workspace-switch isolation.
- Authorized damaged-intent recovery, terminal outcomes, absent/pending/unresolved
  results, lost responses, wrong references, failed storage removal, and evidence
  changed during recovery. Recovery never issues a refund or allocates a new ID;
  read-only staff have no recovery control.
- Split recovery pending/failure responses and a hand-off-only result retain the
  damaged-intent block; only a verified recovered result permits retirement.
- Delayed preflight sync failures for unchanged/corrected retries send no refund.
  Delayed network failures and HTTP rejections for initial/unchanged/corrected
  submissions preserve the saved ID and payload, release busy controls, and do
  not queue another request. Explicit sync and unchanged retry recover using
  that same ID, with one UUID and no overlapping refund requests throughout.

`npx tsx --test tests/community-refund-intent-recovery.test.ts` checks the recovery
service with mocked database/provider boundaries: exact identity, terminal status,
audit preservation, tenant isolation, and fail-closed provider/audit errors.
It also verifies both split legs were actually reversed and blocks further refunds
while split recovery is unresolved.

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

Twenty-four manual email retry scenarios also run through the same fixture: buyer
and seller, authorized and read-only staff, tenant and platform, desktop and
mobile. Authorized cases dismiss the real native confirmation and assert zero
mutation requests, then explicitly accept a later attempt and assert exactly one
`retry-email` POST with the selected recipient (`buyer` or `donor` for seller).
They verify the scoped URL, tenant header, confirmation copy, and success
feedback after query refresh. Distinct initial buyer/seller statuses change only
for the selected recipient in the refreshed ledger; assertions verify both
recipient rows and the warning that provider acceptance is not proof of delivery.
The retry POST returns no statuses, so these checks require a ledger refetch.
Canceled and read-only attempts preserve both initial statuses.
Read-only cases click each disabled retry control
and assert no confirmation or request. All responses are intercepted; these
checks do not test email delivery, backend authorization, or dashboard login.
Authorized cases defer the retry response and repeatedly click both recipients,
checking that both controls remain disabled and only one POST is sent, including
after the response arrives. Separate same-turn bursts temporarily accept
confirmation synchronously to expose pre-render races; native confirmation
acceptance/cancellation remains covered independently.
