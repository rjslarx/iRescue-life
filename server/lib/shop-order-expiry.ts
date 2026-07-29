import { db } from '../db';
import { shopOrders } from '@shared/schema';
import { and, inArray, lt, sql } from 'drizzle-orm';

/**
 * Cancel abandoned shop-order checkouts.
 *
 * Raffle ticket numbers are allocated at order creation (before payment), so
 * an abandoned checkout leaves an order stuck in 'pending'/'processing'
 * forever. Those tickets are already excluded from drawings (drawings only
 * consider paymentStatus='paid'), but the stale orders clutter the staff
 * orders list. This sweep marks any unpaid order older than the cutoff as
 * 'cancelled' so paid vs abandoned is obvious at a glance.
 *
 * Ticket numbering stays collision-free: allocation counts ALL order items
 * for a product (including cancelled orders), so cancelled ticket numbers
 * are never reused. If a customer somehow completes payment after the sweep
 * (e.g. a very slow Stripe confirmation), the confirm route still transitions
 * the order to 'paid' — cancellation here is safely reversible by payment.
 */
export async function expireAbandonedShopOrders(maxAgeHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const cancelled = await db
    .update(shopOrders)
    .set({
      paymentStatus: 'cancelled',
      updatedAt: new Date(),
      internalNotes: sql`coalesce(${shopOrders.internalNotes} || E'\n', '') || 'Auto-cancelled: checkout abandoned (unpaid after ' || ${maxAgeHours} || 'h)'`,
    })
    .where(
      and(
        inArray(shopOrders.paymentStatus, ['pending', 'processing']),
        lt(shopOrders.createdAt, cutoff)
      )
    )
    .returning({ id: shopOrders.id });

  return cancelled.length;
}
