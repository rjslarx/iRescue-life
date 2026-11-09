import Stripe from 'stripe';
import { db } from '../db';
import { tenants } from '@shared/schema';
import { getPlatformStripeSecretKey } from '../config/platform';

export type StripeEconomicsRow = {
  created: string;
  tenantLabel: string;
  tenantSubdomain: string | null;
  surface: string;
  cadence: 'one-time' | 'recurring';
  methodFamily: 'card' | 'ach' | 'cashapp' | 'link' | 'other';
  grossCents: number;
  transferGrossCents: number;
  transferReversedCents: number;
  transferNetCents: number;
  applicationFeeGrossCents: number;
  applicationFeeRefundedCents: number;
  applicationFeeNetCents: number;
  rescueProceedsCents: number;
  iRescueRevenueCents: number | null;
  processingRecoveryCents: number | null;
  processingVarianceCents: number | null;
  classification: 'classified' | 'legacy/unclassified';
  stripeChargeFeesCents: number;
  stripeRefundFeesCents: number;
  stripeDisputeFeesCents: number;
  refundCents: number;
  refundStatus: 'none' | 'partial' | 'refunded';
  disputeCents: number;
  disputeRestoredCents: number;
  disputeStatus: string | null;
  platformNetCents: number;
};

type NumericTotals = Omit<StripeEconomicsRow,
  'created' | 'tenantLabel' | 'tenantSubdomain' | 'surface' | 'cadence' |
  'methodFamily' | 'classification' | 'refundStatus' | 'disputeStatus' |
  'iRescueRevenueCents' | 'processingRecoveryCents' |
  'processingVarianceCents'
> & {
  chargeCount: number;
  legacyUnclassifiedRetainedCents: number;
  iRescueRevenueCents: number;
  processingRecoveryCents: number;
  processingVarianceCents: number;
};

const SAFE_SURFACES: Record<string, string> = {
  donation: 'Donation',
  adoption_fee: 'Adoption fee',
  shop_order: 'Shop order',
  event_ticket: 'Event ticket',
  fundraiser: 'Fundraiser',
  emergency_fund: 'Emergency fund',
  virtual_kennel: 'Virtual kennel',
  surrender_fee: 'Surrender fee',
  reclaim_fee: 'Reclaim fee',
  voting_contest: 'Voting contest',
  subscription: 'Subscription',
  vip: 'Rescue Pack membership',
  vip_club: 'Rescue Pack membership',
  peer_campaign: 'Peer campaign',
  fundraiser_event: 'Fundraiser event',
};

const asObject = (value: unknown): any =>
  value && typeof value === 'object' ? value : null;

const cents = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return 0;
};

const feeOf = (transaction: unknown): number => cents(asObject(transaction)?.fee);
const netOf = (transaction: unknown): number => cents(asObject(transaction)?.net);

async function resolveBalanceTransaction(
  stripe: Stripe,
  value: unknown,
): Promise<Stripe.BalanceTransaction | null> {
  if (!value) return null;
  if (typeof value === 'string') return stripe.balanceTransactions.retrieve(value);
  return asObject(value) as Stripe.BalanceTransaction | null;
}

async function sumBalanceCashflows(
  stripe: Stripe,
  items: unknown[],
  field: 'fee' | 'net',
): Promise<number> {
  let total = 0;
  for (const item of items) {
    const transaction = await resolveBalanceTransaction(
      stripe,
      asObject(item)?.balance_transaction ?? item,
    );
    total += field === 'fee' ? feeOf(transaction) : netOf(transaction);
  }
  return total;
}

async function listAllChargeRefunds(stripe: Stripe, charge: any): Promise<any[]> {
  if (!cents(charge.amount_refunded)) return [];
  const embedded = asObject(charge.refunds);
  const embeddedData = Array.isArray(embedded?.data) ? embedded.data : [];
  const needsList = embedded?.has_more
    || embeddedData.some((item: any) => typeof item.balance_transaction === 'string');
  if (!needsList) return embeddedData;

  const refunds: any[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.refunds.list({
      charge: charge.id,
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.balance_transaction'],
    });
    refunds.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return refunds;
}

async function listAllTransferReversals(stripe: Stripe, transfer: any): Promise<any[]> {
  if (!cents(transfer?.amount_reversed) || !transfer?.id) return [];
  const embedded = asObject(transfer.reversals);
  const embeddedData = Array.isArray(embedded?.data) ? embedded.data : [];
  const needsList = embedded?.has_more
    || embeddedData.some((item: any) => typeof item.balance_transaction === 'string');
  if (!needsList) return embeddedData;

  const reversals: any[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.transfers.listReversals(transfer.id, {
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.balance_transaction'],
    });
    reversals.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return reversals;
}

async function listAllApplicationFeeRefunds(
  stripe: Stripe,
  applicationFee: any,
): Promise<any[]> {
  if (!cents(applicationFee?.amount_refunded) || !applicationFee?.id) return [];
  const embedded = asObject(applicationFee.refunds);
  const embeddedData = Array.isArray(embedded?.data) ? embedded.data : [];
  const needsList = embedded?.has_more
    || embeddedData.some((item: any) => typeof item.balance_transaction === 'string');
  if (!needsList) return embeddedData;

  const refunds: any[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.applicationFees.listRefunds(applicationFee.id, {
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.balance_transaction'],
    });
    refunds.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return refunds;
}

export async function resolveChargeEconomicsContext(
  stripe: Stripe,
  charge: any,
): Promise<{ metadata: Record<string, string> | null; recurring: boolean }> {
  const chargeMetadata = asObject(charge.metadata) as Record<string, string> | null;
  let invoiceReference = charge.invoice;

  // Clover removed Charge.invoice. Invoice Payments are now the authoritative
  // mapping from a charge's PaymentIntent back to its invoice.
  if (!invoiceReference) {
    const paymentIntentId = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;
    if (paymentIntentId) {
      const invoicePayments = await stripe.invoicePayments.list({
        payment: {
          type: 'payment_intent',
          payment_intent: paymentIntentId,
        },
        status: 'paid',
        limit: 1,
        expand: ['data.invoice'],
      });
      invoiceReference = invoicePayments.data[0]?.invoice;
    }
  }

  if (!invoiceReference) {
    return { metadata: chargeMetadata, recurring: false };
  }

  const invoice = typeof invoiceReference === 'string'
    ? await stripe.invoices.retrieve(invoiceReference)
    : invoiceReference;
  const invoiceObject = asObject(invoice);
  let subscriptionMetadata = asObject(
    invoiceObject?.parent?.subscription_details?.metadata,
  ) as Record<string, string> | null;

  // Support invoices created before Stripe added the parent subscription
  // metadata snapshot.
  if (!subscriptionMetadata) {
    const legacySubscription = invoiceObject?.subscription;
    if (legacySubscription && typeof legacySubscription === 'object') {
      subscriptionMetadata = asObject(legacySubscription.metadata);
    } else if (typeof legacySubscription === 'string') {
      const subscription = await stripe.subscriptions.retrieve(legacySubscription);
      subscriptionMetadata = asObject(subscription.metadata);
    }
  }

  return {
    metadata: subscriptionMetadata
      ? { ...subscriptionMetadata, ...(chargeMetadata || {}) }
      : chargeMetadata,
    recurring: true,
  };
}

async function loadDisputeRestorations(
  stripe: Stripe,
  cutoff: number,
): Promise<Map<string, Stripe.Transfer[]>> {
  const byOriginalTransfer = new Map<string, Stripe.Transfer[]>();
  let startingAfter: string | undefined;
  do {
    const page = await stripe.transfers.list({
      created: { gte: cutoff },
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.balance_transaction'],
    });
    for (const transfer of page.data) {
      const originalTransferId = transfer.metadata?.originalTransferId;
      if (
        transfer.metadata?.iRescueDisputeAction !== 'won_restoration'
        || !originalTransferId
      ) continue;
      const items = byOriginalTransfer.get(originalTransferId) || [];
      items.push(transfer);
      byOriginalTransfer.set(originalTransferId, items);
    }
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return byOriginalTransfer;
}

function methodFamily(charge: any): StripeEconomicsRow['methodFamily'] {
  const details = asObject(charge.payment_method_details);
  const type = String(details?.type || '').toLowerCase();
  const wallet = String(details?.card?.wallet?.type || '').toLowerCase();
  if (type === 'link' || wallet === 'link') return 'link';
  if (type === 'cashapp' || type === 'cash_app') return 'cashapp';
  if (type === 'us_bank_account' || type.includes('ach')) return 'ach';
  if (type === 'card') return 'card';
  return 'other';
}

function metadataClassification(metadata: Record<string, string> | null) {
  const version = metadata?.economicsVersion || metadata?.economics_version;
  if (!version) {
    return { revenue: null, recovery: null } as const;
  }

  const revenueValue =
    metadata?.iRescueRevenueCents ??
    metadata?.irescueRevenueCents ??
    metadata?.iRescueFeeRevenueCents ??
    metadata?.irescueFeeCents ??
    metadata?.platformRevenueCents ??
    metadata?.irescue_fee_revenue_cents;
  const recoveryValue =
    metadata?.processingRecoveryCents ??
    metadata?.processingFeeRecoveryCents ??
    metadata?.stripeFeeRecoveryCents ??
    metadata?.processing_recovery_cents ??
    metadata?.stripeProcessingRecoveryCents;

  if (revenueValue === undefined || recoveryValue === undefined) {
    return { revenue: null, recovery: null } as const;
  }
  return { revenue: cents(revenueValue), recovery: cents(recoveryValue) };
}

function safeSurface(metadata: Record<string, string> | null): string {
  const rawSurface = metadata?.type || metadata?.surface || '';
  if (SAFE_SURFACES[rawSurface]) return SAFE_SURFACES[rawSurface];
  if (metadata?.fundraiser_event_id || metadata?.fundraiserEventId) return 'Fundraiser event';
  if (metadata?.peerCampaignId || metadata?.peerDonationId) return 'Peer campaign';
  if (metadata?.eventTicketId || metadata?.eventName) return 'Event ticket';
  if (metadata?.orderId || metadata?.orderNumber) return 'Shop order';
  if (
    metadata?.source === 'vip_club'
    || metadata?.vipTierId
    || metadata?.vipTierName
  ) return 'Rescue Pack membership';
  if (
    metadata?.adoptionApplicationId
    || metadata?.adoptionCheckoutSessionId
    || metadata?.animalId && metadata?.paymentType === 'adoption_fee'
  ) return 'Adoption fee';
  return 'Other';
}

function emptyTotals(): NumericTotals {
  return {
    chargeCount: 0,
    grossCents: 0,
    transferGrossCents: 0,
    transferReversedCents: 0,
    transferNetCents: 0,
    applicationFeeGrossCents: 0,
    applicationFeeRefundedCents: 0,
    applicationFeeNetCents: 0,
    rescueProceedsCents: 0,
    iRescueRevenueCents: 0,
    processingRecoveryCents: 0,
    processingVarianceCents: 0,
    stripeChargeFeesCents: 0,
    stripeRefundFeesCents: 0,
    stripeDisputeFeesCents: 0,
    refundCents: 0,
    disputeCents: 0,
    disputeRestoredCents: 0,
    platformNetCents: 0,
    legacyUnclassifiedRetainedCents: 0,
  };
}

function addRow(total: NumericTotals, row: StripeEconomicsRow) {
  total.chargeCount += 1;
  total.grossCents += row.grossCents;
  total.transferGrossCents += row.transferGrossCents;
  total.transferReversedCents += row.transferReversedCents;
  total.transferNetCents += row.transferNetCents;
  total.applicationFeeGrossCents += row.applicationFeeGrossCents;
  total.applicationFeeRefundedCents += row.applicationFeeRefundedCents;
  total.applicationFeeNetCents += row.applicationFeeNetCents;
  total.rescueProceedsCents += row.rescueProceedsCents;
  total.iRescueRevenueCents += row.iRescueRevenueCents || 0;
  total.processingRecoveryCents += row.processingRecoveryCents || 0;
  total.processingVarianceCents += row.processingVarianceCents || 0;
  total.stripeChargeFeesCents += row.stripeChargeFeesCents;
  total.stripeRefundFeesCents += row.stripeRefundFeesCents;
  total.stripeDisputeFeesCents += row.stripeDisputeFeesCents;
  total.refundCents += row.refundCents;
  total.disputeCents += row.disputeCents;
  total.disputeRestoredCents += row.disputeRestoredCents;
  total.platformNetCents += row.platformNetCents;
  if (row.classification === 'legacy/unclassified') {
    total.legacyUnclassifiedRetainedCents += row.platformNetCents;
  }
}

export async function buildStripeEconomicsReport(days: number, limit: number) {
  const key = getPlatformStripeSecretKey();
  if (!key) throw new Error('Platform Stripe reporting is not configured');

  const stripe = new Stripe(key, { apiVersion: '2025-09-30.clover' });
  const tenantRecords = await db.select({
    id: tenants.id,
    name: tenants.name,
    subdomain: tenants.subdomain,
    accountId: tenants.stripeConnectedAccountId,
  }).from(tenants);
  const byId = new Map(tenantRecords.map(tenant => [tenant.id, tenant]));
  const byAccount = new Map(
    tenantRecords.filter(tenant => tenant.accountId).map(tenant => [tenant.accountId!, tenant]),
  );

  const expansions = [
    'data.balance_transaction',
    'data.transfer.balance_transaction',
    'data.application_fee.balance_transaction',
    'data.refunds.data.balance_transaction',
  ];
  const cutoff = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const rows: StripeEconomicsRow[] = [];
  const totals = emptyTotals();
  const categoryMap = new Map<string, NumericTotals>();
  let resultCount = 0;
  const restorationsByTransfer = await loadDisputeRestorations(stripe, cutoff);
  const disputesByCharge = new Map<string, any>();
  let disputeStartingAfter: string | undefined;
  let moreDisputes = true;
  while (moreDisputes) {
    const disputePage = await stripe.disputes.list({
      created: { gte: cutoff },
      limit: 100,
      starting_after: disputeStartingAfter,
      expand: ['data.balance_transactions'],
    });
    for (const stripeDispute of disputePage.data) {
      const dispute: any = stripeDispute;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
      if (chargeId) disputesByCharge.set(chargeId, dispute);
    }
    moreDisputes = disputePage.has_more;
    disputeStartingAfter = disputePage.data.at(-1)?.id;
    if (!disputeStartingAfter) break;
  }
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await stripe.charges.list({
      created: { gte: cutoff },
      limit: 100,
      starting_after: startingAfter,
      expand: expansions,
    });

    for (const stripeCharge of page.data) {
      const charge: any = stripeCharge;
      if (!charge.transfer) continue;
      let transfer = asObject(charge.transfer);
      let applicationFee = asObject(charge.application_fee);

      // These nested cashflows exceed the expansion depth available on a charge
      // list, so retrieve only the affected safe financial objects.
      if (typeof charge.transfer === 'string') {
        transfer = await stripe.transfers.retrieve(charge.transfer, {
          expand: ['balance_transaction', 'reversals.data.balance_transaction'],
        });
      }
      if (transfer?.amount_reversed &&
          transfer.reversals?.data?.some((item: any) => typeof item.balance_transaction === 'string')) {
        transfer = await stripe.transfers.retrieve(transfer.id, {
          expand: ['balance_transaction', 'reversals.data.balance_transaction'],
        });
      }
      if (typeof charge.application_fee === 'string') {
        applicationFee = await stripe.applicationFees.retrieve(charge.application_fee, {
          expand: ['balance_transaction', 'refunds.data.balance_transaction'],
        });
      }
      if (applicationFee?.amount_refunded && applicationFee.id) {
        applicationFee = await stripe.applicationFees.retrieve(applicationFee.id, {
          expand: ['balance_transaction', 'refunds.data.balance_transaction'],
        });
      }

      const chargeContext = await resolveChargeEconomicsContext(stripe, charge);
      const metadata = chargeContext.metadata;
      const destinationId =
        (typeof transfer?.destination === 'string'
          ? transfer.destination
          : transfer?.destination?.id) ||
        (typeof charge.on_behalf_of === 'string'
          ? charge.on_behalf_of
          : charge.on_behalf_of?.id) ||
        (typeof applicationFee?.account === 'string'
          ? applicationFee.account
          : applicationFee?.account?.id);
      const tenant = (destinationId && byAccount.get(destinationId)) ||
        (metadata?.tenantId && byId.get(metadata.tenantId));
      const surface = safeSurface(metadata);
      const classification = metadataClassification(metadata);
      const refunds = await listAllChargeRefunds(stripe, charge);
      const dispute = disputesByCharge.get(charge.id) || null;
      const transferReversals = await listAllTransferReversals(stripe, transfer);
      const applicationFeeRefunds =
        await listAllApplicationFeeRefunds(stripe, applicationFee);
      const disputeRestorations: Stripe.Transfer[] =
        restorationsByTransfer.get(transfer?.id) || [];
      const disputeRestorationReversals: any[] = [];
      for (const restoration of disputeRestorations) {
        disputeRestorationReversals.push(
          ...await listAllTransferReversals(stripe, restoration),
        );
      }

      const chargeBalanceTransaction =
        await resolveBalanceTransaction(stripe, charge.balance_transaction);
      const transferBalanceTransaction =
        await resolveBalanceTransaction(stripe, transfer?.balance_transaction);
      const applicationFeeBalanceTransaction =
        await resolveBalanceTransaction(stripe, applicationFee?.balance_transaction);
      const restorationNetCents = await sumBalanceCashflows(
        stripe,
        disputeRestorations,
        'net',
      );
      const disputeRestoredCents = disputeRestorations.reduce(
        (sum, restoration) =>
          sum + restoration.amount - restoration.amount_reversed,
        0,
      );

      // Each expanded balance transaction is a real platform balance cashflow.
      const platformNetCents =
        netOf(chargeBalanceTransaction) +
        netOf(transferBalanceTransaction) +
        netOf(applicationFeeBalanceTransaction) +
        await sumBalanceCashflows(stripe, refunds, 'net') +
        await sumBalanceCashflows(stripe, transferReversals, 'net') +
        await sumBalanceCashflows(stripe, applicationFeeRefunds, 'net') +
        await sumBalanceCashflows(
          stripe,
          asObject(dispute?.balance_transactions)?.data
            || dispute?.balance_transactions
            || [],
          'net',
        ) +
        restorationNetCents +
        await sumBalanceCashflows(
          stripe,
          disputeRestorationReversals,
          'net',
        );
      const refundCents = cents(charge.amount_refunded);
      const grossCents = cents(charge.amount);
      const transferNetCents = cents(transfer?.amount) - cents(transfer?.amount_reversed);
      const applicationFeeNetCents =
        cents(applicationFee?.amount) - cents(applicationFee?.amount_refunded);
      const stripeChargeFeesCents = feeOf(chargeBalanceTransaction);
      const processingVarianceCents = classification.recovery === null
        ? null
        : classification.recovery - stripeChargeFeesCents;

      const row: StripeEconomicsRow = {
        created: new Date(cents(charge.created) * 1000).toISOString(),
        tenantLabel: tenant?.name || tenant?.subdomain || 'Unmapped connected account',
        tenantSubdomain: tenant?.subdomain || null,
        surface,
        cadence: chargeContext.recurring || metadata?.cadence === 'recurring' ||
          metadata?.recurring === 'true' || metadata?.isRecurring === 'true' ||
          metadata?.frequency === 'monthly' || metadata?.frequency === 'yearly'
          ? 'recurring' : 'one-time',
        methodFamily: methodFamily(charge),
        grossCents,
        transferGrossCents: cents(transfer?.amount),
        transferReversedCents: cents(transfer?.amount_reversed),
        transferNetCents,
        applicationFeeGrossCents: cents(applicationFee?.amount),
        applicationFeeRefundedCents: cents(applicationFee?.amount_refunded),
        applicationFeeNetCents,
        rescueProceedsCents:
          transferNetCents - applicationFeeNetCents + disputeRestoredCents,
        iRescueRevenueCents: classification.revenue,
        processingRecoveryCents: classification.recovery,
        processingVarianceCents,
        classification: classification.revenue === null ? 'legacy/unclassified' : 'classified',
        stripeChargeFeesCents,
        stripeRefundFeesCents: await sumBalanceCashflows(stripe, refunds, 'fee'),
        stripeDisputeFeesCents: await sumBalanceCashflows(
          stripe,
          asObject(dispute?.balance_transactions)?.data
            || dispute?.balance_transactions
            || [],
          'fee',
        ),
        refundCents,
        refundStatus: refundCents === 0 ? 'none' : refundCents >= grossCents ? 'refunded' : 'partial',
        disputeCents: cents(dispute?.amount),
        disputeRestoredCents,
        disputeStatus: typeof dispute?.status === 'string' ? dispute.status : null,
        platformNetCents,
      };
      resultCount += 1;
      addRow(totals, row);
      const category = categoryMap.get(row.surface) || emptyTotals();
      addRow(category, row);
      categoryMap.set(row.surface, category);
      if (rows.length < limit) rows.push(row);
    }
    hasMore = page.has_more;
    startingAfter = page.data.at(-1)?.id;
    if (!startingAfter) break;
  }

  return {
    generatedAt: new Date().toISOString(),
    days,
    limit,
    resultCount,
    displayedCount: rows.length,
    totals,
    categories: Array.from(categoryMap.entries())
      .map(([category, categoryTotals]) => ({ category, ...categoryTotals }))
      .sort((a, b) => b.grossCents - a.grossCents),
    rows,
  };
}