import { db } from '../db';
import { shopOrders, shopOrderItems, shopProducts, shopRaffleBonusTickets, tenants } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { EmailService } from './email-service';

/** Public base URL for a tenant (custom domain when verified, else path-based). */
function tenantPublicBaseUrl(tenant: { subdomain: string | null; customDomain: string | null; customDomainVerified: boolean | null }): string {
  if (tenant.customDomain && tenant.customDomainVerified) {
    return `https://${tenant.customDomain}`;
  }
  return `https://irescue.life/${tenant.subdomain || ''}`.replace(/\/$/, '');
}

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
    .select({
      name: tenants.name,
      subdomain: tenants.subdomain,
      customDomain: tenants.customDomain,
      customDomainVerified: tenants.customDomainVerified,
    })
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
          name: shopProducts.name,
          slug: shopProducts.slug,
          raffleDrawDate: shopProducts.raffleDrawDate,
          rafflePrizeDescription: shopProducts.rafflePrizeDescription,
          raffleIncentivesEnabled: shopProducts.raffleIncentivesEnabled,
          raffleMaxReferrals: shopProducts.raffleMaxReferrals,
        })
        .from(shopProducts)
        .where(inArray(shopProducts.id, raffleProductIds))
    : [];
  const raffleMap = new Map(raffleProducts.map((p) => [p.id, p]));

  // Bonus tickets earned via sharing incentives (shown alongside purchased ones)
  const bonusRows = raffleProductIds.length > 0
    ? await db
        .select()
        .from(shopRaffleBonusTickets)
        .where(eq(shopRaffleBonusTickets.orderId, orderId))
    : [];

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const itemRows = items.map((item) => {
    const raffle = item.productId ? raffleMap.get(item.productId) : undefined;
    const bonusNumbers = bonusRows
      .filter((b) => b.orderItemId === item.id)
      .flatMap((b) => b.ticketNumbers);
    const ticketBlock = item.raffleTicketNumbers && item.raffleTicketNumbers.length > 0
      ? `<div style="margin-top:8px;padding:10px;background:#f4f6f8;border-radius:6px;">
           <div style="font-weight:bold;margin-bottom:4px;">Your ticket number${item.raffleTicketNumbers.length > 1 ? 's' : ''}:</div>
           <div style="font-family:monospace;font-size:15px;letter-spacing:1px;">${item.raffleTicketNumbers.map(escapeHtml).join(', ')}</div>
           ${bonusNumbers.length > 0 ? `<div style="margin-top:4px;font-size:13px;">Bonus ticket${bonusNumbers.length > 1 ? 's' : ''} (earned by sharing): <span style="font-family:monospace;">${bonusNumbers.map(escapeHtml).join(', ')}</span></div>` : ''}
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

  // "Earn extra tickets" block for raffles with sharing incentives enabled
  const incentiveProduct = raffleProducts.find((p) => p.raffleIncentivesEnabled);
  let incentiveBlock = '';
  if (incentiveProduct && tenant) {
    const baseUrl = tenantPublicBaseUrl(tenant);
    const raffleUrl = `${baseUrl}/shop/${incentiveProduct.slug}`;
    const orderUrl = `${baseUrl}/shop/order/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.accessToken)}`;
    const shareText = encodeURIComponent(`I just entered the ${incentiveProduct.name} raffle to support ${rescueName} — you can too!`);
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(raffleUrl)}`;
    const xUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(raffleUrl)}&text=${shareText}`;
    const btn = (href: string, label: string, bg: string) =>
      `<a href="${href}" style="display:inline-block;padding:10px 16px;margin:4px;background:${bg};color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">${label}</a>`;
    incentiveBlock = `
      <div style="margin-top:20px;padding:16px;background:#fff8e6;border:1px solid #f0ddb0;border-radius:8px;text-align:center;">
        <div style="font-weight:bold;font-size:16px;margin-bottom:4px;">🎟️ Earn extra tickets!</div>
        <div style="font-size:13px;color:#555;margin-bottom:10px;">
          Share this raffle to get <b>+1 free ticket</b>, or refer friends by email for up to
          <b>${incentiveProduct.raffleMaxReferrals} more free tickets</b>.
        </div>
        ${btn(fbUrl, 'Share on Facebook', '#1877F2')}
        ${btn(xUrl, 'Share on X', '#000000')}
        <div style="margin-top:10px;font-size:13px;">
          After sharing, <a href="${orderUrl}" style="color:#5B7B6B;font-weight:bold;">visit your order page</a> to claim your bonus ticket and refer friends.
        </div>
      </div>`;
  }

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
      ${incentiveBlock}
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

/**
 * Invite a referred friend to a raffle. Sent when a buyer earns a referral
 * bonus ticket; contains a link to the public raffle page.
 */
export async function sendRaffleReferralInviteEmail(
  tenantId: string,
  friendEmail: string,
  referrerName: string,
  productId: string,
): Promise<void> {
  const [tenant] = await db
    .select({
      name: tenants.name,
      subdomain: tenants.subdomain,
      customDomain: tenants.customDomain,
      customDomainVerified: tenants.customDomainVerified,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) return;

  const [product] = await db
    .select({
      name: shopProducts.name,
      slug: shopProducts.slug,
      rafflePrizeDescription: shopProducts.rafflePrizeDescription,
      raffleDrawDate: shopProducts.raffleDrawDate,
    })
    .from(shopProducts)
    .where(and(eq(shopProducts.id, productId), eq(shopProducts.tenantId, tenantId)));
  if (!product) return;

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const rescueName = tenant.name || 'the rescue';
  const raffleUrl = `${tenantPublicBaseUrl(tenant)}/shop/${product.slug}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color:#222;">
      <h2 style="margin-bottom:4px;">${escapeHtml(referrerName)} thinks you'd love this raffle!</h2>
      <p style="color:#555;">They just entered the <b>${escapeHtml(product.name)}</b> raffle supporting ${escapeHtml(rescueName)} and wanted you to know about it.</p>
      ${product.rafflePrizeDescription ? `<p><b>Prize:</b> ${escapeHtml(product.rafflePrizeDescription)}</p>` : ''}
      ${product.raffleDrawDate ? `<p><b>Drawing:</b> ${new Date(product.raffleDrawDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
      <p style="text-align:center;margin:24px 0;">
        <a href="${raffleUrl}" style="display:inline-block;padding:12px 24px;background:#5B7B6B;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Get Your Tickets</a>
      </p>
      <p style="color:#555;font-size:13px;">Every ticket supports the animals at ${escapeHtml(rescueName)}. Thank you!</p>
    </div>`;

  const emailService = await EmailService.forTenant(tenantId);
  if (!emailService) {
    console.warn(`[Shop] No email service available for tenant ${tenantId}; skipped referral invite`);
    return;
  }
  await emailService.send({
    to: friendEmail,
    subject: `${referrerName} invited you to the ${product.name} raffle (${rescueName})`,
    html,
  });
}
