import { EmailService } from '../lib/email-service';
import { getAppBaseUrl } from '../lib/app-base-url';
import type { Tenant } from '@shared/schema';

export type GiftEmailTenant = Pick<
  Tenant,
  'id' | 'name' | 'subdomain' | 'customDomain'
>;

function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBaseUrl(tenant: GiftEmailTenant, fallbackOrigin: string): string {
  if (tenant.customDomain) return `https://${tenant.customDomain}`;
  const path = tenant.subdomain ? `/${tenant.subdomain}` : '';
  return `${fallbackOrigin.replace(/\/$/, '')}${path}`;
}

export interface SendGiftAnnouncementEmailArgs {
  tenant: GiftEmailTenant;
  honoreeEmail: string;
  honoreeName: string;
  gifterName: string | null;
  tierName: string | null;
  message: string | null;
  fallbackOrigin: string;
}

/**
 * Task #197 — "You've been honored" email sent to the gift honoree on the
 * announcement date. Critically: never reveals the dollar amount. Tasteful
 * tone, names the gifter (or "an anonymous friend"), surfaces any personal
 * note, and links the honoree back to the rescue's site.
 */
export async function sendGiftAnnouncementEmail(args: SendGiftAnnouncementEmailArgs): Promise<boolean> {
  const { tenant, honoreeEmail, honoreeName, gifterName, tierName, message, fallbackOrigin } = args;
  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    console.warn(`[VIP Gift] No EmailService for tenant ${tenant.id}; skipping announcement to ${honoreeEmail}`);
    return false;
  }

  const safeRescue = escapeHtml(tenant.name);
  const safeHonoree = escapeHtml(honoreeName);
  const safeGifter = escapeHtml(gifterName?.trim() || 'An anonymous friend');
  const safeTier = escapeHtml(tierName || 'monthly donor');
  const baseUrl = buildBaseUrl(tenant, fallbackOrigin);
  const wallUrl = `${baseUrl}/wall-of-heroes`;

  const noteBlock = message && message.trim().length > 0
    ? `<div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-left: 3px solid #2563eb; border-radius: 4px;">
         <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">A note from ${safeGifter}</p>
         <p style="margin: 0; color: #111827; font-style: italic;">${escapeHtml(message.trim())}</p>
       </div>`
    : '';

  try {
    await emailService.send({
      to: honoreeEmail,
      subject: `${safeGifter} honored you with a gift to ${safeRescue}`,
      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <h2 style="color: #2563eb; margin-top: 0;">${safeHonoree}, you've been honored.</h2>
  <p style="font-size: 16px; line-height: 1.55;">
    ${safeGifter} has made a recurring gift to <strong>${safeRescue}</strong> in your honor as a <strong>${safeTier}</strong>.
  </p>
  <p style="font-size: 16px; line-height: 1.55;">
    Their gift quietly supports the food, shelter, and medical care that animals here depend on every month — given in your name.
  </p>
  ${noteBlock}
  <p style="font-size: 14px; line-height: 1.55;">
    Your name appears on our public Wall of Heroes as part of this honor:
  </p>
  <p style="margin: 18px 0;">
    <a href="${wallUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">View the Wall of Heroes</a>
  </p>
  <p style="font-size: 14px; line-height: 1.55; color: #4b5563;">
    With gratitude,<br/>
    <strong>The ${safeRescue} team</strong>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px 0;" />
  <p style="font-size: 11px; color: #9ca3af; line-height: 1.5;">
    You're receiving this one-time message because someone made a tribute gift in your honor. We don't share the gift amount, and we won't add you to any other email lists.
  </p>
</div>
      `.trim(),
    });
    return true;
  } catch (err) {
    console.error('[VIP Gift] sendGiftAnnouncementEmail failed:', err);
    return false;
  }
}

/**
 * Daily worker — sends pending announcements (announcement_date <= now AND
 * announcement_sent_at IS NULL AND honoree_email IS NOT NULL). Stamps
 * `announcement_sent_at` to dedupe. Best-effort: failures are logged and
 * left unstamped so the next run retries.
 */
export async function runGiftAnnouncementJob(): Promise<{ sent: number; failed: number; skipped: number }> {
  const { db } = await import('../db');
  const { subscriptionGifts, subscriptions, donors, tenants } = await import('@shared/schema');
  const { and, eq, isNull, lte, isNotNull } = await import('drizzle-orm');

  const now = new Date();
  const due = await db
    .select({
      giftId: subscriptionGifts.id,
      tenantId: subscriptionGifts.tenantId,
      honoreeName: subscriptionGifts.honoreeName,
      honoreeEmail: subscriptionGifts.honoreeEmail,
      message: subscriptionGifts.giftMessage,
      tierName: subscriptions.vipTierNameSnapshot,
      gifterName: donors.name,
    })
    .from(subscriptionGifts)
    .innerJoin(subscriptions, eq(subscriptions.id, subscriptionGifts.subscriptionId))
    .innerJoin(donors, eq(donors.id, subscriptions.donorId))
    .where(and(
      isNull(subscriptionGifts.announcementSentAt),
      isNotNull(subscriptionGifts.honoreeEmail),
      lte(subscriptionGifts.announcementDate, now),
    ))
    .limit(500);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const fallbackOrigin = getAppBaseUrl();

  for (const row of due) {
    if (!row.honoreeEmail) { skipped++; continue; }
    try {
      const [tenant] = await db
        .select({ id: tenants.id, name: tenants.name, subdomain: tenants.subdomain, customDomain: tenants.customDomain })
        .from(tenants)
        .where(eq(tenants.id, row.tenantId))
        .limit(1);
      if (!tenant) { skipped++; continue; }
      const ok = await sendGiftAnnouncementEmail({
        tenant,
        honoreeEmail: row.honoreeEmail,
        honoreeName: row.honoreeName,
        gifterName: row.gifterName,
        tierName: row.tierName,
        message: row.message,
        fallbackOrigin,
      });
      if (ok) {
        await db
          .update(subscriptionGifts)
          .set({ announcementSentAt: new Date() })
          .where(eq(subscriptionGifts.id, row.giftId));
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error('[VIP Gift] Job iteration failed for gift', row.giftId, err);
      failed++;
    }
  }

  return { sent, failed, skipped };
}
