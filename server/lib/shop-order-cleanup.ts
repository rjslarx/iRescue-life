import { db } from '../db';
import { shopOrders } from '@shared/schema';
import { and, inArray, lt, sql } from 'drizzle-orm';

/**
 * Mark abandoned shop checkouts as failed. An order sits in
 * 'pending'/'processing' when the buyer reached checkout but never completed
 * payment. After 24 hours those are dead: mark them 'failed' so staff order
 * lists clearly separate real (paid) purchases from abandoned carts, and
 * raffle drawings (which already only draw from paid orders) stay clean.
 *
 * If Stripe somehow completes a payment after expiry, /checkout/confirm still
 * transitions the order to 'paid' (its guard is `payment_status != 'paid'`),
 * so no legitimate payment can be lost.
 */
export async function cleanupAbandonedShopOrders(): Promise<{ expired: number }> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const updated = await db
    .update(shopOrders)
    .set({ paymentStatus: 'failed', updatedAt: new Date() })
    .where(
      and(
        inArray(shopOrders.paymentStatus, ['pending', 'processing']),
        lt(shopOrders.createdAt, cutoff),
      ),
    )
    .returning({ id: shopOrders.id });
  return { expired: updated.length };
}
