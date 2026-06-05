---
name: In-kind donation receipt IRS compliance
description: Where in-kind (non-cash) donation receipt rules are enforced, and why no dollar value is printed.
---

# In-kind donation receipt compliance

In-kind (non-cash) donation receipts must NOT print any dollar value — the IRS
makes establishing fair market value the donor's sole responsibility; the charity
only describes the donated items + the "No goods or services were provided in
exchange for this contribution." magic language.

## The rule lives in three layers — keep them in lockstep
A change to what fields are required/printed for in-kind donations must be applied
in all three or new donations break:
1. **Form** — `client/src/components/RecordOfflineDonationDialog.tsx` (zod schema +
   superRefine + JSX fields + mutation payload).
2. **Route validation** — `POST /api/donations/offline` in `server/routes.ts`
   (in-kind requires description + donor email + full mailing address).
3. **Receipt generation gate** — `generateDonationReceipt()` /
   `generateAndEmailReceipt()` in `server/services/donation-receipt-service.ts`
   has its OWN "IRS Safety Check" that returns failure if required in-kind fields
   are missing. This is the easy one to miss: relaxing the form/route without
   relaxing this gate makes auto-send fail with `requiresManualReview`.

**Why:** The "Donor Stated Value" field was removed from the form (it was no
longer printed on the receipt and duplicated "Org Estimated Value — internal
tracking only"). Removing it from form + route alone still failed because the
receipt service independently required `donorStatedValue`.

**How to apply:** When changing in-kind required fields or printed values, grep
all three sites. The `donorStatedValue` DB column is retained but no longer
populated by the offline form. Regression coverage:
`tests/in-kind-receipt-no-value.test.ts` (run via `scripts/run-tests.sh`),
including a case asserting receipts still generate when `donorStatedValue` is null.
