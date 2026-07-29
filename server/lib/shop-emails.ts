import { db } from '../db';
import { shopOrders, shopOrderItems, shopProducts, tenants } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { EmailService } from './email-service';

/**
 * Email the buyer a receipt for a paid shop order, including raffle ticket
 * numbers, draw date, and prize when the order contains raffle tickets.
 * Called after the first successful payment confirmation.
 */
export async function sendShopOrderConfirmationEmail(tenantId: string, orderId: string): Promise<void> {
  const [order] = await db
    .select()
    .from(shopOrders)
    .where(and(eq(shopOrders.id, orderId), eq(shopOrders.tenantId, tenantId)));
  if (!order || !order.customerEmail) return;

  const items = await db
    .select()
    .from(shopOrderItems)
    .where(eq(shopOrderItems.orderId, orderId));
  if (items.length === 0) return;

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const rescueName = tenant?.name || 'the rescue';

  // Pull raffle details (draw date, prize) for any raffle items
  const raffleProductIds = items
    .filter((i) => i.productType === 'raffle')
    .map((i) => i.productId)
    .filter((id): id is string => !!id);
  const raffleProducts = raffleProductIds.length > 0
    ? await db
        .select({
          id: shopProducts.id,
          raffleDrawDate: shopProducts.raffleDrawDate,
          rafflePrizeDescription: shopProducts.rafflePrizeDescription,
        })
        .from(shopProducts)
        .where(inArray(shopProducts.id, raffleProductIds))
    : [];
  const raffleMap = new Map(raffleProducts.map((p) => [p.id, p]));

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const itemRows = items.map((item) => {
    const raffle = item.productId ? raffleMap.get(item.productId) : undefined;
    const ticketBlock = item.raffleTicketNumbers && item.raffleTicketNumbers.length > 0
      ? `<div style="margin-top:8px;padding:10px;background:#f4f6f8;border-radius:6px;">
           <div style="font-weight:bold;margin-bottom:4px;">Your ticket number${item.raffleTicketNumbers.length > 1 ? 's' : ''}:</div>
           <div style="font-family:monospace;font-size:15px;letter-spacing:1px;">${item.raffleTicketNumbers.map(escapeHtml).join(', ')}</div>
           ${raffle?.raffleDrawDate ? `<div style="margin-top:6px;font-size:13px;">Drawing: ${new Date(raffle.raffleDrawDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>` : ''}
           ${raffle?.rafflePrizeDescription ? `<div style="font-size:13px;">Prize: ${escapeHtml(raffle.rafflePrizeDescription)}</div>` : ''}
         </div>`
      : '';
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;">
        <div style="font-weight:bold;">${escapeHtml(item.productName)}${item.variantName ? ` — ${escapeHtml(item.variantName)}` : ''}</div>
        <div style="font-size:13px;color:#666;">Qty: ${item.quantity} × $${item.unitPrice}</div>
        ${ticketBlock}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;vertical-align:top;">$${item.totalPrice}</td>
    </tr>`;
  }).join('');

  const fee = parseFloat(order.processingFee || '0');
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color:#222;">
      <h2 style="margin-bottom:4px;">Thank you for your purchase!</h2>
      <p style="margin-top:0;color:#555;">Order ${escapeHtml(order.orderNumber)} from ${escapeHtml(rescueName)}</p>
      <table style="width:100%;border-collapse:collapse;">${itemRows}</table>
      <table style="width:100%;margin-top:12px;">
        <tr><td style="color:#555;">Subtotal</td><td style="text-align:right;">$${order.subtotal}</td></tr>
        ${fee > 0 ? `<tr><td style="color:#555;">Card processing fee</td><td style="text-align:right;">$${order.processingFee}</td></tr>` : ''}
        <tr><td style="font-weight:bold;padding-top:6px;">Total</td><td style="text-align:right;font-weight:bold;padding-top:6px;">$${order.totalAmount}</td></tr>
      </table>
      <p style="margin-top:20px;color:#555;font-size:13px;">Keep this email as your receipt${raffleProductIds.length > 0 ? ' and proof of your raffle entry' : ''}. Thank you for supporting ${escapeHtml(rescueName)}!</p>
    </div>`;

  const emailService = await EmailService.forTenant(tenantId);
  if (!emailService) {
    console.warn(`[Shop] No email service available for tenant ${tenantId}; skipped order confirmation for ${order.orderNumber}`);
    return;
  }
  await emailService.send({
    to: order.customerEmail,
    subject: raffleProductIds.length > 0
      ? `Your raffle tickets — Order ${order.orderNumber} (${rescueName})`
      : `Your receipt — Order ${order.orderNumber} (${rescueName})`,
    html,
  });
}
