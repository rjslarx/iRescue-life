import crypto from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { surrenderAgreementSessions } from '@shared/schema';

interface TenantInfo {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string | null;
  contactEmail?: string | null;
}

interface SendSurrenderAgreementOptions {
  tenant: TenantInfo;
  surrenderRequestId: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  animalName?: string | null;
}

function buildSigningUrl(tenant: TenantInfo, token: string): string {
  if (tenant.customDomain) {
    return `https://${tenant.customDomain}/surrender-agreement/sign/${token}`;
  }
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const baseUrl = isProduction
    ? 'https://irescue.life'
    : process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';
  return `${baseUrl}/${tenant.subdomain}/surrender-agreement/sign/${token}`;
}

/**
 * Creates a surrender agreement signing session for a surrender request and
 * emails (and optionally texts) the owner a link to review and sign it.
 *
 * Idempotent per surrender request: if a non-cancelled session already exists
 * for the request, this is a no-op so an owner is never sent the agreement twice
 * (e.g. when both the promote and animal-intake paths run).
 *
 * Never throws — failures are logged so they cannot break the intake flow.
 */
export async function sendSurrenderAgreement(options: SendSurrenderAgreementOptions): Promise<void> {
  const { tenant, surrenderRequestId, ownerName, ownerEmail, ownerPhone, animalName } = options;

  try {
    if (!ownerEmail && !ownerPhone) {
      console.log(`[Surrender Agreement] No owner email or phone for request ${surrenderRequestId}; skipping send.`);
      return;
    }

    // Dedupe: skip if a pending or signed session already exists for this request
    const existing = await db
      .select({ id: surrenderAgreementSessions.id, status: surrenderAgreementSessions.status })
      .from(surrenderAgreementSessions)
      .where(and(
        eq(surrenderAgreementSessions.surrenderRequestId, surrenderRequestId),
        eq(surrenderAgreementSessions.tenantId, tenant.id),
        inArray(surrenderAgreementSessions.status, ['pending', 'signed']),
      ))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Surrender Agreement] Session already exists for request ${surrenderRequestId} (status ${existing[0].status}); skipping send.`);
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14); // 14 day expiration

    // Conflict-safe insert: the partial unique index on
    // (tenantId, surrenderRequestId) WHERE status IN ('pending','signed')
    // guarantees only one of two concurrent calls wins. If no row is returned
    // an active session already exists, so we skip sending.
    const inserted = await db
      .insert(surrenderAgreementSessions)
      .values({
        tenantId: tenant.id,
        surrenderRequestId,
        ownerName: ownerName || 'Animal Owner',
        ownerEmail: ownerEmail || '',
        ownerPhone: ownerPhone || null,
        animalName: animalName || null,
        status: 'pending',
        secureTokenHash: tokenHash,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: surrenderAgreementSessions.id });

    if (inserted.length === 0) {
      console.log(`[Surrender Agreement] Active session already exists for request ${surrenderRequestId} (insert conflict); skipping send.`);
      return;
    }

    const signingUrl = buildSigningUrl(tenant, token);
    const animalLabel = animalName ? ` for ${animalName}` : '';

    // Send email
    if (ownerEmail) {
      try {
        const { EmailService } = await import('../lib/email-service');
        const emailService = await EmailService.forTenant(tenant.id);
        if (emailService) {
          const buttonStyle = 'display:inline-block;padding:12px 24px;background-color:#f59e0b;color:white;text-decoration:none;border-radius:6px;';
          await emailService.send({
            to: ownerEmail,
            subject: `Action Required: Sign Surrender Agreement - ${tenant.name}`,
            html: `
<h2>Surrender Agreement Ready for Signature</h2>
<p>Hello ${ownerName || 'there'},</p>
<p>Thank you for surrendering your animal${animalLabel} to <strong>${tenant.name}</strong>.</p>
<p>To complete the surrender, please review and sign the Owner Surrender Agreement using the secure link below.</p>
<p><a href="${signingUrl}" style="${buttonStyle}">Review &amp; Sign Surrender Agreement</a></p>
<p style="color:#666;font-size:14px;">Or copy and paste this link into your browser:</p>
<p><a href="${signingUrl}" style="color:#f59e0b;">${signingUrl}</a></p>
<p style="color:#666;font-size:14px;">This link will expire in 14 days.</p>
<p style="color:#666;font-size:14px;">Questions? Contact us at ${tenant.contactEmail || 'our contact email'}.</p>
            `.trim(),
          });
          console.log(`[Surrender Agreement] Sent agreement email to ${ownerEmail} for request ${surrenderRequestId}`);
        } else {
          console.error(`[Surrender Agreement] No email service configured for tenant ${tenant.id}`);
        }
      } catch (emailError) {
        console.error('[Surrender Agreement] Error sending agreement email:', emailError);
      }
    }

    // SMS fallback / additional notification
    if (ownerPhone) {
      try {
        const { sendSms } = await import('../lib/twilio-service');
        const smsMessage = `${tenant.name}: Hi ${ownerName || 'there'}, please review and sign your Owner Surrender Agreement${animalLabel}: ${signingUrl}`;
        await sendSms(
          tenant.id,
          ownerPhone,
          smsMessage,
          'notification',
        );
        console.log(`[Surrender Agreement] Sent agreement SMS to ${ownerPhone} for request ${surrenderRequestId}`);
      } catch (smsError) {
        console.error('[Surrender Agreement] Error sending agreement SMS:', smsError);
      }
    }
  } catch (error) {
    console.error('[Surrender Agreement] Failed to initiate surrender agreement:', error);
  }
}
