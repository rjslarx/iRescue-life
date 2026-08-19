import { db } from '../db';
import {
  shopOrders,
  shopOrderItems,
  shopProducts,
  shopRaffleDrawings,
} from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type Stripe from 'stripe';

/**
 * Payment states that a successful Stripe confirmation may transition to
 * 'paid'.
 *
 * - 'pending' / 'processing' / 'failed': normal pre-payment states.
 * - 'cancelled': the abandoned-checkout sweep (see shop-order-expiry.ts)
 *   auto-cancels unpaid orders after a cutoff. A genuinely successful (if
 *   slow) payment must still be able to reverse that cancellation, otherwise
 *   the buyer would be charged while their order stays cancelled and never
 *   receives tickets/receipt.
 * - 'refunded' / 'partially_refunded' / 'paid' are deliberately excluded:
 *   replayed confirm calls must never flip a refunded order back to paid,
 *   and repeat confirms of a paid order must be side-effect free.
 */
export const PAYABLE_ORDER_STATES = ['pending', 'processing', 'failed', 'cancelled'] as const;

export class ShopRaffleClosedError extends Error {
  constructor() {
    super('A raffle in this order was drawn before payment completed');
    this.name = 'ShopRaffleClosedError';
  }
}

/**
 * Idempotently transition an order to 'paid' after a verified successful
 * payment. Returns the updated row ids — empty when the order was not in a
 * payable state (already paid, refunded, etc.), in which case the caller
 * must skip first-payment side effects (inventory, confirmation email).
 */
export async function transitionShopOrderToPaid(
  orderId: string,
  stripeChargeId: string | null,
  tx?: any,
): Promise<{ id: string }[]> {
  if (!tx) {
    return db.transaction((transaction) =>
      transitionShopOrderToPaid(orderId, stripeChargeId, transaction)
    );
  }

  const raffleProducts = await tx
    .select({ id: shopProducts.id })
    .from(shopOrderItems)
    .innerJoin(shopProducts, eq(shopOrderItems.productId, shopProducts.id))
    .where(and(
      eq(shopOrderItems.orderId, orderId),
      eq(shopProducts.productType, 'raffle'),
    ));

  // Use the same product-row locks as ticket allocation, bonus grants, and
  // drawing. Sorted lock order avoids deadlocks for a multi-raffle order.
  const raffleProductIds = [...new Set<string>(raffleProducts.map((row: { id: string }) => row.id))].sort();
  for (const productId of raffleProductIds) {
    await tx.execute(sql`SELECT id FROM shop_products WHERE id = ${productId} FOR UPDATE`);
  }

  // Re-check after acquiring the locks. A concurrent confirm may already have
  // completed while we waited; repeated confirmations remain side-effect free.
  const [currentOrder] = await tx
    .select({ paymentStatus: shopOrders.paymentStatus })
    .from(shopOrders)
    .where(eq(shopOrders.id, orderId));
  if (!currentOrder || !PAYABLE_ORDER_STATES.includes(currentOrder.paymentStatus as any)) {
    return [];
  }

  if (raffleProductIds.length > 0) {
    const [drawing] = await tx
      .select({ id: shopRaffleDrawings.id })
      .from(shopRaffleDrawings)
      .where(and(
        inArray(shopRaffleDrawings.productId, raffleProductIds),
        eq(shopRaffleDrawings.status, 'drawn'),
      ));
    if (drawing) throw new ShopRaffleClosedError();
  }

  return tx
    .update(shopOrders)
    .set({
      paymentStatus: 'paid',
      stripeChargeId: stripeChargeId ?? undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(shopOrders.id, orderId),
        inArray(shopOrders.paymentStatus, [...PAYABLE_ORDER_STATES])
      )
    )
    .returning({ id: shopOrders.id });
}

/**
 * Refund a Stripe payment that completed after its raffle closed. Stripe's
 * idempotency key makes retries safe; the local state update is conditional so
 * an already-finalized order can never be overwritten.
 */
export async function refundClosedRafflePayment(
  stripe: Stripe,
  orderId: string,
  paymentIntentId: string,
  connect: {
    reverseTransfer: boolean;
    refundApplicationFee: boolean;
  } = { reverseTransfer: false, refundApplicationFee: false },
): Promise<void> {
  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    ...(connect.reverseTransfer ? { reverse_transfer: true } : {}),
    ...(connect.refundApplicationFee ? { refund_application_fee: true } : {}),
  };
  const refund = await stripe.refunds.create(
    refundParams,
    { idempotencyKey: `shop-raffle-closed-${orderId}` },
  );
  if (refund.status === 'failed' || refund.status === 'canceled') {
    throw new Error(`Stripe could not refund closed-raffle payment ${paymentIntentId}`);
  }

  await db
    .update(shopOrders)
    .set({
      paymentStatus: 'refunded',
      updatedAt: new Date(),
      internalNotes: sql`coalesce(${shopOrders.internalNotes} || E'\n', '') || ${`Automatically refunded: raffle was drawn before payment completed (Stripe refund ${refund.id})`}`,
    })
    .where(and(
      eq(shopOrders.id, orderId),
      inArray(shopOrders.paymentStatus, [...PAYABLE_ORDER_STATES]),
    ));
}
