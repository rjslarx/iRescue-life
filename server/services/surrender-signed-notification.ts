import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants } from '@shared/schema';

interface SurrenderSignedNotificationOptions {
  tenantId: string;
  surrenderRequestId: string;
  ownerName?: string | null;
  animalName?: string | null;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Notifies configured staff (email + optional SMS) when an owner signs the
 * Owner Surrender Agreement. Routed through the tenant's Notification
 * Preferences (event key `surrender_agreement_signed`) so each tenant controls
 * recipients and channels.
 *
 * Never throws — failures are logged so they cannot break the owner's signing
 * flow or the signed-PDF generation.
 */
export async function sendSurrenderSignedStaffNotification(
  options: SurrenderSignedNotificationOptions,
): Promise<void> {
  const { tenantId, surrenderRequestId, ownerName, animalName } = options;

  try {
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
        customDomain: tenants.customDomain,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      console.error(`[Surrender Signed] Tenant ${tenantId} not found; skipping staff notification.`);
      return;
    }

    // Deep link straight to the request in the Intake Manager so staff can
    // begin intake (review the pre-filled animal form and save to create the
    // profile). Mirrors the URL convention used by form-notifications.
    const baseUrl = tenant.customDomain
      ? `https://${tenant.customDomain}`
      : `https://${tenant.subdomain}.irescue.life`;
    const intakeUrl = `${baseUrl}/dashboard/intake?request=${encodeURIComponent(surrenderRequestId)}`;

    const ownerLabel = ownerName?.trim() || 'The owner';
    const animalLabel = animalName?.trim() || 'an animal';
    const subject = `Surrender agreement signed: ${animalLabel} (${ownerLabel})`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
    .footer { background: #f1f5f9; padding: 15px 20px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none; font-size: 13px; color: #64748b; }
    .button { display: inline-block; background: #16a34a; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; font-weight: 600; }
    .detail { margin: 8px 0; }
    .label { font-weight: 600; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 22px;">Surrender Agreement Signed</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">${escapeHtml(tenant.name)}</p>
    </div>
    <div class="content">
      <p><strong>${escapeHtml(ownerLabel)}</strong> has signed the Owner Surrender Agreement${animalName ? ` for <strong>${escapeHtml(animalLabel)}</strong>` : ''}.</p>
      <div class="detail"><span class="label">Owner:</span> ${escapeHtml(ownerLabel)}</div>
      <div class="detail"><span class="label">Animal:</span> ${escapeHtml(animalLabel)}</div>
      <h3 style="margin: 20px 0 8px 0; font-size: 16px;">Next step</h3>
      <p>Open the request in the Intake Manager to begin intake. You'll review the pre-filled animal form and save it to create the animal's profile.</p>
      <a href="${intakeUrl}" class="button">Open in Intake Manager</a>
      <p style="color:#666;font-size:14px;margin-top:16px;">Or copy and paste this link into your browser:</p>
      <p><a href="${intakeUrl}" style="color:#16a34a;">${intakeUrl}</a></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">You're receiving this because surrender agreement signed notifications are enabled for your organization. Manage recipients in Settings &rarr; Notifications.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const textBody = `
Surrender Agreement Signed — ${tenant.name}

${ownerLabel} has signed the Owner Surrender Agreement${animalName ? ` for ${animalLabel}` : ''}.

Owner: ${ownerLabel}
Animal: ${animalLabel}

Next step: Open the request in the Intake Manager to begin intake. You'll review the pre-filled animal form and save it to create the animal's profile.

Open in Intake Manager: ${intakeUrl}

---
You're receiving this because surrender agreement signed notifications are enabled for your organization. Manage recipients in Settings -> Notifications.
    `.trim();

    const smsBody = `${tenant.name}: ${ownerLabel} signed the surrender agreement${animalName ? ` for ${animalLabel}` : ''}. Begin intake: ${intakeUrl}`;

    const { dispatchEventNotification } = await import('./notification-dispatcher');
    await dispatchEventNotification({
      tenantId,
      eventKey: 'surrender_agreement_signed',
      subject,
      htmlBody,
      textBody,
      smsBody,
    });
  } catch (error) {
    console.error('[Surrender Signed] Failed to send staff notification:', error);
  }
}
