import { db } from '../db';
import { shopOrders } from '@shared/schema';
import { and, eq, inArray } from 'drizzle-orm';

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

/**
 * Idempotently transition an order to 'paid' after a verified successful
 * payment. Returns the updated row ids — empty when the order was not in a
 * payable state (already paid, refunded, etc.), in which case the caller
 * must skip first-payment side effects (inventory, confirmation email).
 */
export async function transitionShopOrderToPaid(
  orderId: string,
  stripeChargeId: string | null,
  tx: Pick<typeof db, 'update'> = db
): Promise<{ id: string }[]> {
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
