/**
 * Destination-charge fee allocation regression tests.
 *
 * Run via: scripts/run-tests.sh tests/stripe-payment-economics.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.STRIPE_CARD_PROCESSING_FEE_PERCENT = '2.9';
process.env.STRIPE_CARD_PROCESSING_FEE_FIXED_CENTS = '30';
process.env.STRIPE_ACH_PROCESSING_FEE_PERCENT = '0.8';
process.env.STRIPE_ACH_PROCESSING_FEE_CAP_CENTS = '500';
process.env.PLATFORM_STRIPE_SECRET_KEY = process.env.PLATFORM_STRIPE_SECRET_KEY || 'sk_test_economics';

const platform = await import('../server/config/platform');
const { StripeService } = await import('../server/lib/stripe-service');
const {
  applyDestinationChargeRefundBehavior,
  canProcessStripeEventForTenant,
  calculateOutstandingDisputePrincipal,
  calculateDisputeTransferReversalAmount,
  createOrResumeRestorationAwareDestinationRefund,
  handleDestinationChargeDisputeClosed,
  handleDestinationChargeDisputeCreated,
  markRestorationAwareDestinationRefundComplete,
  selectLatestRefundableVipPayment,
  shouldVerifyPlatformDisputeBeforeTenantGate,
} = await import('../server/lib/stripe-dispute-handling');
const { resolveChargeEconomicsContext } =
  await import('../server/lib/stripe-economics-report');

test('card estimate uses the observed 2.9% + 30 cents schedule with integer-cent rounding', () => {
  assert.equal(platform.STRIPE_PROCESSING_FEE_PERCENT, 2.9);
  assert.equal(platform.STRIPE_PROCESSING_FEE_FIXED_CENTS, 30);
  assert.equal(platform.estimateStripeProcessingFee(1_000), 59);
  assert.equal(platform.estimateStripeProcessingFee(2_727), 109);
  assert.equal(platform.estimateStripeProcessingFee(1), 30);
});

test('ACH estimate uses 0.8% and respects its five-dollar cap', () => {
  assert.equal(platform.estimateStripeProcessingFee(1_000, 'ach'), 8);
  assert.equal(platform.estimateStripeProcessingFee(62_500, 'ach'), 500);
  assert.equal(platform.estimateStripeProcessingFee(100_000, 'ach'), 500);
});

test('covered and uncovered destination allocations keep iRescue revenue separate from processing recovery', () => {
  assert.deepEqual(platform.calculateDonorCoversFees(0, 'free', 2), {
    baseAmount: 0,
    stripeFee: 0,
    platformFee: 0,
    totalAmount: 0,
    feesCovered: 0,
    applicationFeeAmount: 0,
    rescueProceeds: 0,
  });

  const coveredPaidTier = platform.calculateDonorCoversFees(1_000, 'professional', 0);
  assert.equal(coveredPaidTier.totalAmount, 1_061);
  assert.equal(coveredPaidTier.stripeFee, 61);
  assert.equal(coveredPaidTier.platformFee, 0);
  assert.equal(coveredPaidTier.rescueProceeds, 1_000);

  const coveredFreeTier = platform.calculateDonorCoversFees(1_000, 'free', 2);
  assert.equal(coveredFreeTier.rescueProceeds, 1_000);
  assert.equal(
    coveredFreeTier.applicationFeeAmount,
    coveredFreeTier.stripeFee + coveredFreeTier.platformFee,
  );

  const uncovered = platform.calculateDestinationChargeEconomics(1_000, 20);
  assert.deepEqual(uncovered, {
    grossAmountCents: 1_000,
    iRescueRevenueCents: 20,
    processingRecoveryCents: 59,
    applicationFeeTotalCents: 79,
    rescueProceedsCents: 921,
    expectedPlatformNetCents: 20,
    processingEstimateMethod: 'card',
    processingScheduleVersion: platform.STRIPE_PROCESSING_SCHEDULE_VERSION,
    economicsVersion: platform.DESTINATION_CHARGE_ECONOMICS_VERSION,
  });
});

test('subscription percentage rounds upward so fixed-cost recovery is never rounded away', () => {
  assert.equal(platform.calculateSubscriptionApplicationFeePercent(2_727, 109), 4);
  assert.equal(platform.calculateSubscriptionApplicationFeePercent(1_000, 0), 0);
});

test('generic PaymentIntents route to the destination at a 0% iRescue fee and retain processing recovery', async () => {
  const calls: any[] = [];
  const fakeStripe = {
    paymentIntents: {
      create: async (params: any) => {
        calls.push(params);
        return { id: 'pi_test', client_secret: 'pi_test_secret' };
      },
    },
  };
  class TestStripeService extends StripeService {
    getPlatformStripeClient(): any {
      return fakeStripe;
    }
  }

  const service = new TestStripeService();
  await service.createPaymentIntent(
    { id: 'tenant_test', name: 'Test Rescue', stripeEnabled: false } as any,
    {
      amount: 1_000,
      currency: 'usd',
      connectedAccountId: 'acct_test',
      platformFeeAmount: 0,
      metadata: { surface: 'paid_tier' },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].on_behalf_of, 'acct_test');
  assert.deepEqual(calls[0].transfer_data, { destination: 'acct_test' });
  assert.equal(calls[0].application_fee_amount, 59);
  assert.equal(calls[0].metadata.iRescueRevenueCents, '0');
  assert.equal(calls[0].metadata.processingRecoveryCents, '59');
});

test('destination subscriptions include processing recovery in their conservative application-fee percentage', async () => {
  const calls: any[] = [];
  const fakeStripe = {
    prices: {
      create: async () => ({ id: 'price_test' }),
    },
    checkout: {
      sessions: {
        create: async (params: any) => {
          calls.push(params);
          return { id: 'cs_test', url: 'https://checkout.stripe.test/session' };
        },
      },
    },
  };
  class TestStripeService extends StripeService {
    getPlatformStripeClient(): any {
      return fakeStripe;
    }
  }

  const service = new TestStripeService();
  await service.createCheckoutSession(
    { id: 'tenant_test', name: 'Test Rescue', stripeEnabled: false } as any,
    {
      amount: 2_727,
      currency: 'usd',
      successUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
      isRecurring: true,
      connectedAccountId: 'acct_test',
      platformFeeAmount: 0,
      forceCardOnly: true,
    },
  );

  assert.equal(calls[0].subscription_data.transfer_data.destination, 'acct_test');
  assert.equal(calls[0].subscription_data.application_fee_percent, 4);
  assert.equal(calls[0].metadata.applicationFeeTotalCents, '109');
});

test('all three Paw Pay surfaces apply destination economics without a positive-fee guard', async () => {
  const source = await readFile(
    new URL('../server/services/paw-pay.ts', import.meta.url),
    'utf8',
  );
  const calls = source.match(/applyDestinationChargeEconomics\(\s*paymentIntentParams,/g) || [];
  assert.equal(calls.length, 3);
  assert.doesNotMatch(
    source,
    /useStripeConnect\s*&&\s*tenantConnectedAccountId\s*&&\s*platformFeeAmount\s*>\s*0/,
  );
});

test('destination refunds unwind both transfer and application fee, while direct refunds do not', () => {
  assert.equal(canProcessStripeEventForTenant({
    tenantExists: true,
    stripeEnabled: false,
    isPlatformOwnedDisputeEvent: true,
  }), true);
  assert.equal(canProcessStripeEventForTenant({
    tenantExists: true,
    stripeEnabled: false,
    isPlatformOwnedDisputeEvent: false,
  }), false);
  assert.equal(shouldVerifyPlatformDisputeBeforeTenantGate({
    type: 'charge.dispute.funds_withdrawn',
    account: undefined,
    data: { object: { metadata: { tenantId: 'tenant_test' } } },
  } as any), true);
  assert.equal(selectLatestRefundableVipPayment([
    { id: 'latest-completed-refund', status: 'refunded' },
    { id: 'earlier-installment', status: 'succeeded' },
  ])?.id, 'earlier-installment');

  const destination: any = { payment_intent: 'pi_destination' };
  applyDestinationChargeRefundBehavior(destination, {
    isDestinationCharge: true,
    hasApplicationFee: true,
  });
  assert.deepEqual(destination, {
    payment_intent: 'pi_destination',
    reverse_transfer: true,
    refund_application_fee: true,
  });

  const direct: any = { payment_intent: 'pi_direct' };
  applyDestinationChargeRefundBehavior(direct, {
    isDestinationCharge: false,
    hasApplicationFee: true,
  });
  assert.deepEqual(direct, { payment_intent: 'pi_direct' });
});

test('won-dispute restorations support resumable partial and full destination refunds', async () => {
  const originalTransfer: any = {
    id: 'tr_original',
    amount: 1_000,
    amount_reversed: 921,
    created: 1_700_000_000,
    currency: 'usd',
    destination: 'acct_test',
    metadata: {},
  };
  const restorationTransfer: any = {
    id: 'tr_restoration',
    amount: 921,
    amount_reversed: 0,
    created: 1_700_000_100,
    currency: 'usd',
    destination: 'acct_test',
    metadata: {
      originalTransferId: 'tr_original',
      iRescueDisputeAction: 'won_restoration',
    },
  };
  const charge: any = {
    id: 'ch_refund_after_win',
    amount: 1_000,
    amount_refunded: 0,
    metadata: { tenantId: 'tenant_test' },
    application_fee: 'fee_test',
    application_fee_amount: 79,
    transfer: originalTransfer,
  };
  const refunds: any[] = [];
  const refundCreateParams: any[] = [];
  const applicationFee: any = {
    id: 'fee_test',
    amount: 79,
    amount_refunded: 0,
  };
  const applicationFeeRefunds: any[] = [];
  const reversals = new Map<string, any[]>([
    ['tr_original', [{
      id: 'trr_dispute',
      amount: 921,
      metadata: {
        iRescueDisputeId: 'dp_test',
        iRescueDisputeAction: 'principal_recovery',
      },
    }]],
    ['tr_restoration', []],
  ]);
  const transfers = new Map<string, any>([
    [originalTransfer.id, originalTransfer],
    [restorationTransfer.id, restorationTransfer],
  ]);
  const fakeStripe = {
    refunds: {
      list: async () => ({ data: refunds, has_more: false }),
      create: async (params: any) => {
        if (params.refund_application_fee && !params.reverse_transfer) {
          throw new Error('Stripe requires reverse_transfer with refund_application_fee');
        }
        refundCreateParams.push(params);
        const refund = {
          id: `re_${refunds.length + 1}`,
          amount: params.amount,
          charge: charge.id,
          status: 'succeeded',
          metadata: { ...params.metadata },
        };
        refunds.push(refund);
        charge.amount_refunded += params.amount;
        return refund;
      },
      update: async (id: string, params: any) => {
        const refund = refunds.find(item => item.id === id);
        Object.assign(refund.metadata, params.metadata);
        return refund;
      },
    },
    charges: {
      retrieve: async () => ({
        ...charge,
        application_fee: applicationFee,
      }),
    },
    applicationFees: {
      retrieve: async () => applicationFee,
      listRefunds: async () => ({
        data: applicationFeeRefunds,
        has_more: false,
      }),
      createRefund: async (_id: string, params: any) => {
        const feeRefund = {
          id: `fr_${applicationFeeRefunds.length + 1}`,
          amount: params.amount,
          metadata: params.metadata,
        };
        applicationFeeRefunds.push(feeRefund);
        applicationFee.amount_refunded += params.amount;
        return feeRefund;
      },
    },
    transfers: {
      list: async () => ({ data: [restorationTransfer], has_more: false }),
      retrieve: async (id: string) => transfers.get(id),
      listReversals: async (id: string) => ({
        data: reversals.get(id) || [],
        has_more: false,
      }),
      createReversal: async (id: string, params: any) => {
        const transfer = transfers.get(id);
        const reversal = {
          id: `trr_refund_${id}_${(reversals.get(id) || []).length}`,
          amount: params.amount,
          metadata: params.metadata,
        };
        reversals.get(id)!.push(reversal);
        transfer.amount_reversed += params.amount;
        return reversal;
      },
    },
  } as any;

  const first = await createOrResumeRestorationAwareDestinationRefund(fakeStripe, {
    charge,
    paymentId: 'payment_test',
    amountCents: 500,
    reason: 'requested_by_customer',
  });
  assert.equal(first?.amount, 500);
  assert.equal(refundCreateParams[0].reverse_transfer, undefined);
  assert.equal(refundCreateParams[0].refund_application_fee, undefined);
  assert.deepEqual(applicationFeeRefunds.map(item => item.amount), [40]);
  assert.equal(restorationTransfer.amount_reversed, 500);
  assert.equal(originalTransfer.amount_reversed, 921);

  const resumed = await createOrResumeRestorationAwareDestinationRefund(fakeStripe, {
    charge,
    paymentId: 'payment_test',
    amountCents: 500,
    reason: 'requested_by_customer',
  });
  assert.equal(resumed?.id, first?.id);
  assert.equal(refunds.length, 1);
  await markRestorationAwareDestinationRefundComplete(fakeStripe, first!.id);

  const second = await createOrResumeRestorationAwareDestinationRefund(fakeStripe, {
    charge,
    paymentId: 'payment_test',
    amountCents: 500,
    reason: 'requested_by_customer',
  });
  assert.equal(second?.amount, 500);
  assert.equal(refunds.length, 2);
  assert.deepEqual(applicationFeeRefunds.map(item => item.amount), [40, 39]);
  assert.equal(restorationTransfer.amount_reversed, 921);
  assert.equal(originalTransfer.amount_reversed, 1_000);
  const managedRefundRecovery = [...reversals.values()]
    .flat()
    .filter(item => item.metadata?.iRescueRefundAction === 'restoration_aware_recovery')
    .reduce((sum, item) => sum + item.amount, 0);
  assert.equal(managedRefundRecovery, 1_000);
  const fullRetry = await createOrResumeRestorationAwareDestinationRefund(
    fakeStripe,
    {
      charge,
      paymentId: 'payment_test',
      amountCents: 500,
      reason: 'requested_by_customer',
    },
  );
  assert.equal(fullRetry?.id, second?.id);
  await markRestorationAwareDestinationRefundComplete(fakeStripe, second!.id);
});

test('dispute transfer recovery removes only rescue net proceeds and restores them after a win', async () => {
  assert.equal(calculateDisputeTransferReversalAmount(1_000, 1_000, 79), 921);
  assert.equal(calculateDisputeTransferReversalAmount(1_000, 500, 79), 460);
  assert.equal(calculateOutstandingDisputePrincipal({
    amount: 1_000,
    balance_transactions: [],
  }), 0);
  assert.equal(calculateOutstandingDisputePrincipal({
    amount: 1_000,
    balance_transactions: [{ amount: -1_000 }] as any,
  }), 1_000);
  assert.equal(calculateOutstandingDisputePrincipal({
    amount: 1_000,
    balance_transactions: [{ amount: -1_000 }, { amount: 1_000 }] as any,
  }), 0);

  const dispute = {
    id: 'dp_test',
    amount: 1_000,
    charge: 'ch_test',
    created: 1_700_000_000,
    status: 'warning_needs_response',
    balance_transactions: [],
  } as any;
  const disputes = new Map<string, any>([[dispute.id, dispute]]);
  const reversalCalls: any[] = [];
  const reversals: any[] = [];
  const restorationCalls: any[] = [];
  const restorations: any[] = [];
  const fakeStripe = {
    disputes: {
      retrieve: async (id: string) => ({ ...disputes.get(id) }),
    },
    charges: {
      retrieve: async () => ({
        id: 'ch_test',
        amount: 1_000,
        currency: 'usd',
        metadata: { tenantId: 'tenant_test' },
        application_fee: { id: 'fee_test', amount: 79 },
        application_fee_amount: 79,
        transfer: {
          id: 'tr_test',
          amount: 1_000,
          amount_reversed: 0,
          currency: 'usd',
          destination: 'acct_test',
        },
      }),
    },
    transfers: {
      retrieve: async () => {
        throw new Error('expanded transfer should be used');
      },
      createReversal: async (_transferId: string, params: any, options: any) => {
        reversalCalls.push({ params, options });
        const reversal = {
          id: `trr_${reversals.length + 1}`,
          amount: params.amount,
          metadata: params.metadata,
        };
        reversals.push(reversal);
        return reversal;
      },
      listReversals: async () => ({
        data: reversals,
        has_more: false,
      }),
      list: async () => ({ data: restorations, has_more: false }),
      create: async (params: any, options: any) => {
        restorationCalls.push({ params, options });
        const restoration = {
          id: `tr_restore_${restorations.length + 1}`,
          amount: params.amount,
          metadata: params.metadata,
        };
        restorations.push(restoration);
        return restoration;
      },
    },
  } as any;

  const inquiryCreated =
    await handleDestinationChargeDisputeCreated(fakeStripe, dispute);
  assert.equal(inquiryCreated.action, 'no_action');
  dispute.status = 'warning_closed';
  const inquiryClosed =
    await handleDestinationChargeDisputeClosed(fakeStripe, dispute);
  assert.equal(inquiryClosed.action, 'no_action');
  assert.equal(reversalCalls.length, 0);

  // If the inquiry becomes a chargeback, Stripe adds a principal-withdrawal
  // balance transaction and the same dispute is now recovered.
  dispute.status = 'needs_response';
  dispute.balance_transactions = [{ amount: -1_000 }];
  const created = await handleDestinationChargeDisputeCreated(fakeStripe, dispute);
  assert.equal(created.action, 'reversed');
  assert.equal(created.amountCents, 921);
  assert.equal(reversalCalls[0].params.amount, 921);
  assert.match(reversalCalls[0].options.idempotencyKey, /dp_test/);
  const createdRetry = await handleDestinationChargeDisputeCreated(fakeStripe, dispute);
  assert.equal(createdRetry.action, 'already_reversed');
  assert.equal(createdRetry.amountCents, 921);
  assert.equal(reversalCalls.length, 1);

  dispute.status = 'won';
  dispute.balance_transactions = [{ amount: -1_000 }, { amount: 1_000 }];
  const closed = await handleDestinationChargeDisputeClosed(fakeStripe, dispute);
  assert.equal(closed.action, 'restored');
  assert.equal(restorationCalls[0].params.amount, 921);
  assert.equal(restorationCalls[0].params.destination, 'acct_test');
  assert.match(restorationCalls[0].options.idempotencyKey, /dp_test/);
  const closedRetry = await handleDestinationChargeDisputeClosed(fakeStripe, dispute);
  assert.equal(closedRetry.action, 'already_restored');
  assert.equal(closedRetry.amountCents, 921);
  assert.equal(restorationCalls.length, 1);

  const wonBeforeCreated = {
    ...dispute,
    id: 'dp_won_before_created',
    status: 'won',
    balance_transactions: [{ amount: -1_000 }, { amount: 1_000 }],
  };
  disputes.set(wonBeforeCreated.id, wonBeforeCreated);
  const closedBeforeCreated =
    await handleDestinationChargeDisputeClosed(fakeStripe, wonBeforeCreated);
  assert.equal(closedBeforeCreated.action, 'no_action');
  const staleCreated =
    await handleDestinationChargeDisputeCreated(fakeStripe, wonBeforeCreated);
  assert.equal(staleCreated.action, 'no_action');
  assert.equal(reversalCalls.length, 1);
  assert.equal(restorationCalls.length, 1);
});

test('post-reversal reconciliation restores funds when reinstatement overtakes creation', async () => {
  const dispute: any = {
    id: 'dp_race',
    amount: 1_000,
    charge: 'ch_race',
    created: 1_700_000_000,
    status: 'needs_response',
    balance_transactions: [{ amount: -1_000 }],
  };
  const reversals: any[] = [];
  const restorations: any[] = [];
  const fakeStripe = {
    disputes: {
      retrieve: async () => ({ ...dispute }),
    },
    charges: {
      retrieve: async () => ({
        id: 'ch_race',
        amount: 1_000,
        currency: 'usd',
        metadata: { tenantId: 'tenant_test' },
        application_fee: { id: 'fee_test', amount: 79 },
        transfer: {
          id: 'tr_race',
          amount: 1_000,
          amount_reversed: 0,
          currency: 'usd',
          destination: 'acct_test',
        },
      }),
    },
    transfers: {
      retrieve: async () => {
        throw new Error('expanded transfer should be used');
      },
      listReversals: async () => ({ data: reversals, has_more: false }),
      createReversal: async (_id: string, params: any) => {
        reversals.push({
          id: 'trr_race',
          amount: params.amount,
          metadata: params.metadata,
        });
        // Model funds reinstatement winning the race before this request
        // returns to the created-event handler.
        dispute.status = 'won';
        dispute.balance_transactions = [{ amount: -1_000 }, { amount: 1_000 }];
      },
      list: async () => ({ data: restorations, has_more: false }),
      create: async (params: any) => {
        restorations.push({
          id: 'tr_restore_race',
          amount: params.amount,
          metadata: params.metadata,
        });
      },
    },
  } as any;

  const result = await handleDestinationChargeDisputeCreated(fakeStripe, dispute);
  assert.equal(result.action, 'restored');
  assert.equal(reversals.length, 1);
  assert.equal(restorations.length, 1);
  assert.equal(restorations[0].amount, 921);
});

test('Clover recurring charges resolve economics through Invoice Payments', async () => {
  const context = await resolveChargeEconomicsContext({
    invoicePayments: {
      list: async (params: any) => {
        assert.equal(params.payment.payment_intent, 'pi_recurring');
        return {
          data: [{
            invoice: {
              parent: {
                subscription_details: {
                  metadata: {
                    economicsVersion: 'destination-charge-economics-v1',
                    iRescueRevenueCents: '20',
                    processingRecoveryCents: '59',
                    type: 'donation',
                  },
                },
              },
            },
          }],
        };
      },
    },
  } as any, {
    id: 'ch_recurring',
    payment_intent: 'pi_recurring',
    metadata: {},
  });

  assert.equal(context.recurring, true);
  assert.equal(context.metadata?.iRescueRevenueCents, '20');
  assert.equal(context.metadata?.processingRecoveryCents, '59');
});
