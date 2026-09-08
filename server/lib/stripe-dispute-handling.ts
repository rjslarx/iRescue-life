import Stripe from 'stripe';

export interface DestinationDisputeResult {
  action:
    | 'not_destination_charge'
    | 'reversed'
    | 'already_reversed'
    | 'restored'
    | 'already_restored'
    | 'no_action';
  amountCents: number;
  tenantId?: string;
}

export function canProcessStripeEventForTenant(options: {
  tenantExists: boolean;
  stripeEnabled: boolean;
  isPlatformOwnedDisputeEvent: boolean;
}): boolean {
  return options.tenantExists
    && (options.stripeEnabled || options.isPlatformOwnedDisputeEvent);
}

export function shouldVerifyPlatformDisputeBeforeTenantGate(payload: {
  type?: unknown;
  account?: unknown;
}): boolean {
  return !payload.account
    && typeof payload.type === 'string'
    && payload.type.startsWith('charge.dispute.');
}

export function selectLatestRefundableVipPayment<
  T extends { status: string },
>(paymentsNewestFirst: T[]): T | undefined {
  return paymentsNewestFirst.find(payment => payment.status === 'succeeded');
}

export function applyDestinationChargeRefundBehavior(
  refundParams: Stripe.RefundCreateParams,
  options: { isDestinationCharge: boolean; hasApplicationFee: boolean },
): void {
  if (options.isDestinationCharge) {
    refundParams.reverse_transfer = true;
    if (options.hasApplicationFee) refundParams.refund_application_fee = true;
  }
}

export function calculateDisputeTransferReversalAmount(
  chargeAmountCents: number,
  disputeAmountCents: number,
  applicationFeeAmountCents: number,
): number {
  if (
    !Number.isInteger(chargeAmountCents)
    || !Number.isInteger(disputeAmountCents)
    || !Number.isInteger(applicationFeeAmountCents)
    || chargeAmountCents <= 0
    || disputeAmountCents < 0
    || applicationFeeAmountCents < 0
  ) {
    throw new Error('Dispute amounts must be valid integer cents');
  }

  const boundedDispute = Math.min(disputeAmountCents, chargeAmountCents);
  const retainedShare = Math.round(
    (applicationFeeAmountCents * boundedDispute) / chargeAmountCents,
  );
  return Math.max(0, boundedDispute - retainedShare);
}

export function calculateOutstandingDisputePrincipal(
  dispute: Pick<Stripe.Dispute, 'amount' | 'balance_transactions'>,
): number {
  const netPrincipalWithdrawal = dispute.balance_transactions.reduce(
    (sum, transaction) => sum - transaction.amount,
    0,
  );
  return Math.max(0, Math.min(dispute.amount, netPrincipalWithdrawal));
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function retrieveDestinationCharge(
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<{
  charge: Stripe.Charge;
  transfer: Stripe.Transfer | null;
  applicationFeeAmountCents: number;
}> {
  const chargeId = idOf(dispute.charge);
  if (!chargeId) {
    throw new Error(`Stripe dispute ${dispute.id} has no charge`);
  }

  const charge = await stripe.charges.retrieve(chargeId, {
    expand: ['transfer', 'application_fee'],
  });
  const transfer = charge.transfer
    ? (typeof charge.transfer === 'string'
      ? await stripe.transfers.retrieve(charge.transfer)
      : charge.transfer)
    : null;
  const applicationFeeAmountCents = typeof charge.application_fee === 'object'
    && charge.application_fee
    ? charge.application_fee.amount
    : charge.application_fee_amount ?? 0;

  return { charge, transfer, applicationFeeAmountCents };
}

async function listAllTransferReversals(
  stripe: Stripe,
  transferId: string,
): Promise<Stripe.TransferReversal[]> {
  const reversals: Stripe.TransferReversal[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.transfers.listReversals(transferId, {
      limit: 100,
      starting_after: startingAfter,
    });
    reversals.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return reversals;
}

async function findDisputeRestorations(
  stripe: Stripe,
  destination: string,
  dispute: Stripe.Dispute,
): Promise<Stripe.Transfer[]> {
  const restorations: Stripe.Transfer[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.transfers.list({
      destination,
      created: { gte: dispute.created },
      limit: 100,
      starting_after: startingAfter,
    });
    restorations.push(...page.data.filter(
      transfer =>
        transfer.metadata?.iRescueDisputeId === dispute.id
        && transfer.metadata?.iRescueDisputeAction === 'won_restoration',
    ));
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return restorations;
}

async function findAllRestorationTransfers(
  stripe: Stripe,
  originalTransfer: Stripe.Transfer,
  requestOptions?: Stripe.RequestOptions,
): Promise<Stripe.Transfer[]> {
  const destination = idOf(originalTransfer.destination);
  if (!destination) return [];
  const restorations: Stripe.Transfer[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.transfers.list({
      destination,
      created: { gte: originalTransfer.created || 0 },
      limit: 100,
      starting_after: startingAfter,
    }, requestOptions);
    restorations.push(...page.data.filter(
      transfer =>
        transfer.metadata?.originalTransferId === originalTransfer.id
        && transfer.metadata?.iRescueDisputeAction === 'won_restoration',
    ));
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return restorations;
}

async function listAllChargeRefunds(
  stripe: Stripe,
  chargeId: string,
  requestOptions?: Stripe.RequestOptions,
): Promise<Stripe.Refund[]> {
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.refunds.list({
      charge: chargeId,
      limit: 100,
      starting_after: startingAfter,
    }, requestOptions);
    refunds.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return refunds;
}

async function listAllApplicationFeeRefunds(
  stripe: Stripe,
  applicationFeeId: string,
  requestOptions?: Stripe.RequestOptions,
): Promise<Stripe.FeeRefund[]> {
  const refunds: Stripe.FeeRefund[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.applicationFees.listRefunds(
      applicationFeeId,
      { limit: 100, starting_after: startingAfter },
      requestOptions,
    );
    refunds.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return refunds;
}

async function refundApplicationFeeForManagedRefund(
  stripe: Stripe,
  charge: Stripe.Charge,
  refund: Stripe.Refund,
  requestOptions?: Stripe.RequestOptions,
): Promise<void> {
  const applicationFeeReference = charge.application_fee;
  const applicationFeeId = typeof applicationFeeReference === 'string'
    ? applicationFeeReference
    : applicationFeeReference?.id;
  if (!applicationFeeId) return;
  const applicationFee = typeof applicationFeeReference === 'object'
    ? applicationFeeReference
    : await stripe.applicationFees.retrieve(applicationFeeId, requestOptions);
  if (!applicationFee || !applicationFee.amount) return;
  const existingRefunds = await listAllApplicationFeeRefunds(
    stripe,
    applicationFee.id,
    requestOptions,
  );
  if (existingRefunds.some(
    item => item.metadata?.iRescueRefundId === refund.id,
  )) return;

  const targetCumulativeFeeRefundCents = Math.round(
    applicationFee.amount
    * Math.min(charge.amount_refunded, charge.amount)
    / charge.amount,
  );
  const feeRefundAmountCents = Math.max(
    0,
    targetCumulativeFeeRefundCents - applicationFee.amount_refunded,
  );
  if (feeRefundAmountCents <= 0) return;
  await stripe.applicationFees.createRefund(
    applicationFee.id,
    {
      amount: feeRefundAmountCents,
      metadata: {
        iRescueRefundId: refund.id,
        iRescueRefundAction: 'restoration_aware_fee_refund',
      },
    },
    {
      ...(requestOptions || {}),
      idempotencyKey:
        `destination-application-fee-refund-${refund.id}`,
    },
  );
}

export async function createOrResumeRestorationAwareDestinationRefund(
  stripe: Stripe,
  options: {
    charge: Stripe.Charge;
    paymentId: string;
    amountCents?: number;
    reason?: Stripe.RefundCreateParams.Reason;
    requestOptions?: Stripe.RequestOptions;
  },
): Promise<Stripe.Refund | null> {
  if (!options.charge.transfer) return null;
  const originalTransfer = typeof options.charge.transfer === 'string'
    ? await stripe.transfers.retrieve(
      options.charge.transfer,
      options.requestOptions,
    )
    : options.charge.transfer;
  const restorations = await findAllRestorationTransfers(
    stripe,
    originalTransfer,
    options.requestOptions,
  );
  if (restorations.length === 0) return null;

  const refunds = await listAllChargeRefunds(
    stripe,
    options.charge.id,
    options.requestOptions,
  );
  let refund = refunds.find(item =>
    item.metadata?.iRescueManagedDestinationRefund === 'true'
    && item.metadata?.iRescuePaymentId === options.paymentId
    && item.metadata?.iRescueRefundRecoveryStatus === 'pending'
    && item.status !== 'failed'
    && item.status !== 'canceled',
  );
  const requestedAmountCents = refund?.amount
    ?? options.amountCents
    ?? Math.max(0, options.charge.amount - options.charge.amount_refunded);
  if (requestedAmountCents <= 0) {
    throw new Error(`Charge ${options.charge.id} has no refundable amount remaining`);
  }

  const transfers = [...restorations, originalTransfer];
  const transferStates = await Promise.all(transfers.map(async transfer => {
    const current = await stripe.transfers.retrieve(
      transfer.id,
      options.requestOptions,
    );
    const reversals = await listAllTransferReversals(stripe, current.id);
    return { transfer: current, reversals };
  }));
  const capacityCents = transferStates.reduce(
    (sum, state) => sum + Math.max(
      0,
      state.transfer.amount - state.transfer.amount_reversed,
    ),
    0,
  );
  if (!refund && capacityCents < requestedAmountCents) {
    throw new Error(
      `Destination transfers for charge ${options.charge.id} have only `
      + `${capacityCents} cents available for a ${requestedAmountCents}-cent refund`,
    );
  }

  if (!refund) {
    const refundParams: Stripe.RefundCreateParams = {
      charge: options.charge.id,
      amount: requestedAmountCents,
      reason: options.reason,
      // Stripe requires reverse_transfer when refund_application_fee is used
      // on a destination-charge refund. Both pieces are handled independently
      // below because the original transfer was depleted by dispute recovery.
      metadata: {
        iRescueManagedDestinationRefund: 'true',
        iRescuePaymentId: options.paymentId,
        iRescueRefundRecoveryStatus: 'pending',
      },
    };
    refund = await stripe.refunds.create(refundParams, {
      ...(options.requestOptions || {}),
      idempotencyKey:
        `destination-restored-refund-${options.paymentId}-`
        + `${options.charge.amount_refunded}-${requestedAmountCents}`,
    });
  }

  const currentCharge = await stripe.charges.retrieve(
    options.charge.id,
    { expand: ['application_fee'] },
    options.requestOptions,
  );
  await refundApplicationFeeForManagedRefund(
    stripe,
    currentCharge,
    refund,
    options.requestOptions,
  );

  let remainingCents = refund.amount;
  for (const state of transferStates) {
    const alreadyReversedCents = state.reversals
      .filter(reversal => reversal.metadata?.iRescueRefundId === refund!.id)
      .reduce((sum, reversal) => sum + reversal.amount, 0);
    remainingCents -= alreadyReversedCents;
    if (remainingCents <= 0) break;
    const availableCents = Math.max(
      0,
      state.transfer.amount - state.transfer.amount_reversed,
    );
    const reversalAmountCents = Math.min(remainingCents, availableCents);
    if (reversalAmountCents <= 0) continue;
    await stripe.transfers.createReversal(
      state.transfer.id,
      {
        amount: reversalAmountCents,
        description: `Destination refund recovery ${refund.id}`,
        metadata: {
          iRescueRefundId: refund.id,
          iRescueRefundAction: 'restoration_aware_recovery',
          tenantId: options.charge.metadata?.tenantId || '',
        },
      },
      {
        ...(options.requestOptions || {}),
        idempotencyKey:
          `destination-refund-reversal-${refund.id}-${state.transfer.id}`,
      },
    );
    remainingCents -= reversalAmountCents;
  }
  if (remainingCents > 0) {
    throw new Error(
      `Destination refund ${refund.id} still needs ${remainingCents} cents of transfer recovery`,
    );
  }
  return refund;
}

export async function markRestorationAwareDestinationRefundComplete(
  stripe: Stripe,
  refundId: string,
  requestOptions?: Stripe.RequestOptions,
): Promise<void> {
  await stripe.refunds.update(refundId, {
    metadata: { iRescueRefundRecoveryStatus: 'complete' },
  }, requestOptions);
}

/**
 * Destination-charge disputes debit iRescue, not the connected rescue. Recover
 * the rescue's proportional net proceeds when funds are withdrawn. The
 * application fee stays on the platform to cover iRescue revenue and the
 * original processing estimate; Stripe's dispute fee remains a platform cost
 * and is visible in the economics report.
 */
export async function handleDestinationChargeDisputeCreated(
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<DestinationDisputeResult> {
  // Inquiry events do not necessarily withdraw principal. The balance
  // transactions, rather than a status label, are the authoritative signal.
  const currentDispute = await stripe.disputes.retrieve(dispute.id, {
    expand: ['balance_transactions'],
  });
  const outstandingPrincipalCents =
    calculateOutstandingDisputePrincipal(currentDispute);
  if (outstandingPrincipalCents === 0) {
    // This is also a repair path for a reinstatement event that overtook the
    // original created/funds-withdrawn delivery.
    return handleDestinationChargeDisputeClosed(stripe, currentDispute);
  }

  const { charge, transfer, applicationFeeAmountCents } =
    await retrieveDestinationCharge(stripe, currentDispute);
  if (!transfer) {
    return {
      action: 'not_destination_charge',
      amountCents: 0,
      tenantId: charge.metadata?.tenantId,
    };
  }

  const targetAmountCents = calculateDisputeTransferReversalAmount(
    charge.amount,
    outstandingPrincipalCents,
    applicationFeeAmountCents,
  );
  const reversals = await listAllTransferReversals(stripe, transfer.id);
  const existingAmountCents = reversals
    .filter(reversal => reversal.metadata?.iRescueDisputeId === dispute.id)
    .reduce((sum, reversal) => sum + reversal.amount, 0);
  if (existingAmountCents > 0) {
    return {
      action: 'already_reversed',
      amountCents: existingAmountCents,
      tenantId: charge.metadata?.tenantId,
    };
  }

  // Exclude this dispute's own reversals from the availability calculation.
  // That makes the operation amount stable across webhook retries while still
  // respecting unrelated refund/dispute reversals already on the transfer.
  const unrelatedReversedCents = reversals.reduce(
    (sum, reversal) => sum + reversal.amount,
    0,
  );
  const availableAmountCents = Math.max(0, transfer.amount - unrelatedReversedCents);
  const amountCents = Math.min(targetAmountCents, availableAmountCents);
  if (amountCents === 0) {
    return {
      action: 'already_reversed',
      amountCents: 0,
      tenantId: charge.metadata?.tenantId,
    };
  }

  await stripe.transfers.createReversal(
    transfer.id,
    {
      amount: amountCents,
      metadata: {
        iRescueDisputeId: dispute.id,
        iRescueDisputeAction: 'principal_recovery',
        tenantId: charge.metadata?.tenantId || '',
      },
      description: `Destination-charge dispute recovery ${dispute.id}`,
    },
    { idempotencyKey: `destination-dispute-reversal-${dispute.id}` },
  );

  // Close the only ordering race left by webhook delivery: funds may be
  // reinstated after our first status read but before the reversal commits.
  // Re-read the authoritative cashflows after the mutation and restore
  // immediately if the platform no longer carries the disputed principal.
  const afterReversal = await stripe.disputes.retrieve(dispute.id, {
    expand: ['balance_transactions'],
  });
  if (calculateOutstandingDisputePrincipal(afterReversal) === 0) {
    return handleDestinationChargeDisputeClosed(stripe, afterReversal);
  }

  return {
    action: 'reversed',
    amountCents,
    tenantId: charge.metadata?.tenantId,
  };
}

/**
 * A won dispute returns the principal to iRescue. Restore the exact amount that
 * this handler previously recovered from the connected rescue. The idempotency
 * key makes Stripe webhook redelivery safe.
 */
export async function handleDestinationChargeDisputeClosed(
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<DestinationDisputeResult> {
  const currentDispute = await stripe.disputes.retrieve(dispute.id, {
    expand: ['balance_transactions'],
  });
  if (calculateOutstandingDisputePrincipal(currentDispute) > 0) {
    return { action: 'no_action', amountCents: 0 };
  }

  const { charge, transfer } =
    await retrieveDestinationCharge(stripe, currentDispute);
  if (!transfer) {
    return {
      action: 'not_destination_charge',
      amountCents: 0,
      tenantId: charge.metadata?.tenantId,
    };
  }

  const reversals = await listAllTransferReversals(stripe, transfer.id);
  const amountCents = reversals
    .filter((reversal) => reversal.metadata?.iRescueDisputeId === dispute.id)
    .reduce((sum, reversal) => sum + reversal.amount, 0);
  if (amountCents === 0) {
    return {
      action: 'no_action',
      amountCents: 0,
      tenantId: charge.metadata?.tenantId,
    };
  }

  const destination = idOf(transfer.destination);
  if (!destination) {
    throw new Error(`Destination transfer ${transfer.id} has no connected account`);
  }

  const existingRestorations =
    await findDisputeRestorations(stripe, destination, currentDispute);
  if (existingRestorations.length > 0) {
    return {
      action: 'already_restored',
      amountCents: existingRestorations.reduce((sum, item) => sum + item.amount, 0),
      tenantId: charge.metadata?.tenantId,
    };
  }

  await stripe.transfers.create(
    {
      amount: amountCents,
      currency: transfer.currency,
      destination,
      description: `Restore proceeds after won dispute ${dispute.id}`,
      metadata: {
        iRescueDisputeId: dispute.id,
        iRescueDisputeAction: 'won_restoration',
        originalTransferId: transfer.id,
        tenantId: charge.metadata?.tenantId || '',
      },
    },
    { idempotencyKey: `destination-dispute-restoration-${dispute.id}` },
  );

  return {
    action: 'restored',
    amountCents,
    tenantId: charge.metadata?.tenantId,
  };
}