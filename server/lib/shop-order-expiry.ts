import Stripe from 'stripe';
import { db } from '../db';
import { shopOrders, shopOrderItems, shopProductVariants, tenants } from '@shared/schema';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { getPlatformStripeKey } from './stripe-service';
import {
  refundClosedRafflePayment,
  ShopRaffleClosedError,
  transitionShopOrderToPaid,
} from './shop-order-payment';
import { sendShopOrderConfirmationEmail } from './shop-emails';

/**
 * Sweep abandoned shop-order checkouts.
 *
 * Raffle ticket numbers are allocated at order creation (before payment), so
 * an abandoned checkout leaves an order stuck in 'pending'/'processing'
 * forever. Those tickets are already excluded from drawings (drawings only
 * consider paymentStatus='paid'), but the stale orders clutter the staff
 * orders list.
 *
 * IMPORTANT: a buyer can pay successfully on Stripe and then close the page
 * before the client fires /checkout/confirm — the payment succeeds but the
 * order never leaves 'pending'/'processing' (this happened in production).
 * So before cancelling, the sweep RECONCILES with Stripe: any stale order
 * whose PaymentIntent actually succeeded is finalized as paid (with the same
 * first-payment side effects: inventory decrement + confirmation email).
 * Only orders whose payment truly never completed are cancelled.
 *
 * Ticket numbering stays collision-free: allocation counts ALL order items
 * for a product (including cancelled orders), so cancelled ticket numbers
 * are never reused. If a customer somehow completes payment after the sweep
 * (e.g. a very slow Stripe confirmation), the confirm route still transitions
 * the order to 'paid' — cancellation here is safely reversible by payment.
 */
export async function expireAbandonedShopOrders(
  maxAgeHours = 24
): Promise<{ cancelled: number; recoveredPaid: number }> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const stale = await db
    .select({
      id: shopOrders.id,
      orderNumber: shopOrders.orderNumber,
      tenantId: shopOrders.tenantId,
      stripePaymentIntentId: shopOrders.stripePaymentIntentId,
    })
    .from(shopOrders)
    .where(
      and(
        inArray(shopOrders.paymentStatus, ['pending', 'processing']),
        lt(shopOrders.createdAt, cutoff)
      )
    )
    // Bounded batch per run — the sweep is hourly, so any backlog beyond the
    // cap is settled by subsequent runs instead of hammering Stripe.
    .orderBy(shopOrders.createdAt)
    .limit(200);

  let recoveredPaid = 0;
  const toCancel: string[] = [];
  const stripeClientCache = new Map<string, Stripe | null>();

  for (const order of stale) {
    if (!order.stripePaymentIntentId) {
      toCancel.push(order.id);
      continue;
    }

    try {
      let stripe = stripeClientCache.get(order.tenantId);
      if (stripe === undefined) {
        stripe = await buildStripeClientForTenant(order.tenantId);
        stripeClientCache.set(order.tenantId, stripe);
      }
      if (!stripe) {
        // Can't verify with Stripe — cancel as before (reversible by payment).
        toCancel.push(order.id);
        continue;
      }

      const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      if (pi.status === 'succeeded') {
        // Payment actually completed; the client just never confirmed.
        // Finalize with the same idempotent transition + side effects as
        // the confirm route.
        // Atomically transition to paid AND decrement inventory — if either
        // fails the whole recovery rolls back so a later sweep can retry.
        let recovered = false;
        try {
          recovered = await db.transaction(async (tx) => {
            const updated = await transitionShopOrderToPaid(
              order.id,
              typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
              tx
            );
            if (updated.length === 0) return false;
            const items = await tx
              .select()
              .from(shopOrderItems)
              .where(eq(shopOrderItems.orderId, order.id));
            for (const item of items) {
              if (item.variantId) {
                await tx.update(shopProductVariants)
                  .set({ inventory: sql`${shopProductVariants.inventory} - ${item.quantity}` })
                  .where(eq(shopProductVariants.id, item.variantId));
              }
            }
            return true;
          });
        } catch (error) {
          if (!(error instanceof ShopRaffleClosedError)) throw error;
          await refundClosedRafflePayment(stripe, order.id, order.stripePaymentIntentId, {
            reverseTransfer: !!pi.transfer_data,
            refundApplicationFee: !!pi.application_fee_amount,
          });
          console.log(`[Shop] Sweep refunded order ${order.orderNumber}: raffle was drawn before payment completed`);
          continue;
        }
        if (recovered) {
          recoveredPaid++;
          console.log(`[Shop] Sweep recovered paid order ${order.orderNumber} (payment succeeded on Stripe but was never confirmed)`);
          sendShopOrderConfirmationEmail(order.tenantId, order.id).catch((err) => {
            console.error(`[Shop] Confirmation email failed for recovered order ${order.orderNumber}:`, err);
          });
        }
      } else if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'canceled'].includes(pi.status)) {
        // Payment definitively never completed.
        toCancel.push(order.id);
      }
      // Other statuses (e.g. 'processing' on Stripe's side) — leave alone;
      // a later sweep will settle them.
    } catch (err) {
      console.error(`[Shop] Sweep could not verify payment for order ${order.orderNumber}:`, err instanceof Error ? err.message : err);
      // Leave the order untouched this run rather than cancelling a
      // possibly-paid order on a transient Stripe/API error.
    }
  }

  let cancelledCount = 0;
  if (toCancel.length > 0) {
    const cancelled = await db
      .update(shopOrders)
      .set({
        paymentStatus: 'cancelled',
        updatedAt: new Date(),
        internalNotes: sql`coalesce(${shopOrders.internalNotes} || E'\n', '') || 'Auto-cancelled: checkout abandoned (unpaid after ' || ${maxAgeHours} || 'h)'`,
      })
      .where(
        and(
          inArray(shopOrders.id, toCancel),
          inArray(shopOrders.paymentStatus, ['pending', 'processing'])
        )
      )
      .returning({ id: shopOrders.id });
    cancelledCount = cancelled.length;
  }

  return { cancelled: cancelledCount, recoveredPaid };
}

/**
 * Build the Stripe client that owns a tenant's PaymentIntents:
 * tenant's own key when configured, otherwise the platform key (Connect
 * destination charges live on the platform account). Returns null when
 * neither is available.
 */
async function buildStripeClientForTenant(tenantId: string): Promise<Stripe | null> {
  const [tenant] = await db
    .select({
      stripeSecretKeyEncrypted: tenants.stripeSecretKeyEncrypted,
      stripeConnectedAccountId: tenants.stripeConnectedAccountId,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) return null;

  if (tenant.stripeSecretKeyEncrypted) {
    const { decrypt } = await import('./encryption');
    return new Stripe(decrypt(tenant.stripeSecretKeyEncrypted), { apiVersion: '2025-09-30.clover' });
  }
  const platformKey = getPlatformStripeKey();
  if (tenant.stripeConnectedAccountId && platformKey) {
    return new Stripe(platformKey, { apiVersion: '2025-09-30.clover' });
  }
  return null;
}
