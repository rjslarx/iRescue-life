# Stripe payment economics and ownership

This document is the production payment-surface inventory for iRescue. It
describes **which Stripe account owns each charge**, who Stripe debits for
processing costs, and which code path must be used for refunds and disputes.

## Money model

For a platform-owned destination charge:

- `gross` is the amount charged to the donor or buyer.
- `iRescue revenue` is the tenant-tier application fee.
- `processing recovery` is the configured estimate of the Stripe fee that
  Stripe debits from the iRescue platform balance.
- `application fee total = iRescue revenue + processing recovery`.
- `rescue proceeds = gross - application fee total`.
- `expected platform net = iRescue revenue`.

Stripe receives one `application_fee_amount`; versioned Stripe metadata keeps
the two retained components separate. Reporting reconciles the estimate with
the actual charge balance transaction. Mixed card/ACH Checkout sessions reserve
the card estimate because the final payment method is not known at quote time.

Destination routing depends on the presence of a connected destination, **not**
on whether iRescue revenue is positive. Paid-tier tenants with a 0% iRescue fee
still use `transfer_data.destination` and retain processing recovery.

## Production payment surfaces

| Surface | Stripe ownership | Implementation | Processing-cost responsibility |
| --- | --- | --- | --- |
| General one-time donations | Destination charge when Connect is available; tenant-owned key remains supported | Shared Stripe service | iRescue on destination charges; tenant on own-key charges |
| Recurring donations and VIP memberships | Destination subscription when Connect is available; legacy/tenant objects remain supported | Shared Stripe service | iRescue on destination invoices, retained through conservative application-fee percentage |
| Event tickets | Destination Checkout | Shared Stripe service | iRescue, with optional donor gross-up |
| Application-linked adoption fees | Destination PaymentIntent | Shared Stripe service | iRescue |
| Direct adoption, reclaim, and surrender fees | Destination PaymentIntent | Shared Stripe service or Paw Pay | iRescue |
| Paw Pay donation, adoption-fee, and shop payments | Destination PaymentIntent | Paw Pay service | iRescue; routing remains active at 0% iRescue revenue |
| Shop orders and fixed raffles | Destination PaymentIntent when Connect is available | Shared Stripe service | iRescue; regular buyers are grossed up for card costs |
| 50/50 split-pot raffles | Destination PaymentIntent | Shared Stripe service | Costs come from the rescue half of the pot |
| Peer-to-peer campaign donations | Destination Checkout | Shared Stripe service | iRescue, with optional donor gross-up |
| Voting contests | Destination Checkout | Shared Stripe service | iRescue |
| Fundraiser-event orders | Destination Checkout | Manual destination-charge route using centralized economics | iRescue, optionally passed to buyer |
| Emergency medical fund checkout | Connected-account direct charge | Explicit connected-account request options | Connected rescue |
| Connected payment-link and campaign surfaces that create objects with `stripeAccount` | Connected-account direct charge | Explicit connected-account request options | Connected rescue |
| Tenant-owned encrypted Stripe key surfaces | Tenant-owned charge | Tenant Stripe client | Tenant |
| iRescue SaaS subscription billing and other platform products | Platform-only charge | Platform Stripe client | iRescue |

New payment surfaces must be added to this table and classified before release.
Do not migrate historical/direct charges merely to make the table uniform.

## Refund policy

- Resolve the existing Stripe object by probing tenant-owned, connected/direct,
  and platform contexts; never guess its account.
- Destination-charge refunds set both `reverse_transfer` and
  `refund_application_fee`, proportionally for partial refunds.
- If a won dispute was restored through a separate transfer, refunds recover
  the refunded gross amount across that restoration and the original transfer,
  then refund the application fee separately through Stripe's Application Fees
  API. The charge refund itself uses neither destination-refund flag because
  Stripe requires those flags together against the original transfer.
- Pending recovery is tagged by Stripe refund ID so a retry resumes each
  external step. A unique local accounting record for that same refund ID
  updates payment status and donor lifetime totals transactionally and exactly
  once.
- Direct and tenant-owned refunds do not pass destination-charge flags.
- Closed-raffle automatic refunds use an idempotency key and the same flags
  when the underlying PaymentIntent is a destination charge.

Stripe does not normally return the original processing fee. That cost is
reported as an actual platform expense rather than hidden in rescue proceeds.

## Dispute policy

- Direct-charge disputes remain the connected rescue's Stripe responsibility.
- For platform destination charges, iRescue reverses the connected rescue's
  proportional net proceeds only when Stripe's dispute balance transactions
  show that principal was actually withdrawn. Inquiry-only warning states do
  not move rescue funds.
- When Stripe reinstates the principal, iRescue idempotently restores the
  amount it previously reversed.
- Retry safety is durable in Stripe itself: existing dispute-tagged reversals
  and restoration transfers are discovered before another mutation. A stale
  creation webhook delivered after a win checks current dispute state and
  performs no reversal.
- Stripe dispute fees and all actual balance movements remain visible in the
  platform economics report.

## Operator reconciliation

The platform-only Stripe Economics report shows no donor/customer PII. It
separates gross volume, rescue proceeds, iRescue revenue, estimated processing
recovery, actual Stripe fees, refunds/disputes, and platform net. Actual balance
transactions are authoritative; metadata estimates explain expected allocation
and variance. Reconciliation includes paginated refunds, transfer reversals,
application-fee refunds, won-dispute restoration transfers, and later reversals
of those restorations for customer refunds. Recurring charges are mapped back
to their invoice through Clover's Invoice Payments API, then inherit their
versioned economics classification from the invoice's subscription metadata
snapshot.
