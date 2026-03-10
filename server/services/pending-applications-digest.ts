import { db } from '../db';
import {
  tenants,
  applications,
  fosterApplications,
  volunteerApplications,
  surrenderRequests,
  notificationPreferences,
  users,
} from '@shared/schema';
import type { NotificationEventKey } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { EmailService } from '../lib/email-service';

interface PipelineCount {
  eventKey: NotificationEventKey;
  label: string;
  count: number;
  stage: string;
}

interface RecipientInfo {
  email: string;
  fullName: string | null;
}

async function getDigestRecipients(
  tenantId: string,
  eventKey: NotificationEventKey
): Promise<RecipientInfo[]> {
  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenantId, tenantId),
        eq(notificationPreferences.eventKey, eventKey),
        eq(notificationPreferences.channel, 'email'),
      )
    )
    .limit(1);

  if (prefs.length === 0 || !prefs[0].isEnabled) {
    return [];
  }

  const pref = prefs[0];
  const recipients: RecipientInfo[] = [];
  const seenEmails = new Set<string>();

  if (pref.recipientRoles && pref.recipientRoles.length > 0) {
    const tenantUsers = await db
      .select({
        email: users.email,
        fullName: users.fullName,
        roles: users.roles,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));

    for (const user of tenantUsers) {
      const userRoles = user.roles || [];
      const hasMatchingRole = pref.recipientRoles.some(role => userRoles.includes(role as any));
      if (hasMatchingRole && !seenEmails.has(user.email.toLowerCase())) {
        seenEmails.add(user.email.toLowerCase());
        recipients.push({ email: user.email, fullName: user.fullName });
      }
    }
  }

  if (pref.recipientEmails && pref.recipientEmails.length > 0) {
    for (const email of pref.recipientEmails) {
      const normalized = email.toLowerCase().trim();
      if (normalized && !seenEmails.has(normalized)) {
        seenEmails.add(normalized);
        recipients.push({ email: normalized, fullName: null });
      }
    }
  }

  return recipients;
}

async function gatherPendingApplicationCounts(tenantId: string): Promise<PipelineCount[]> {
  const [adoptionResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(and(eq(applications.tenantId, tenantId), eq(applications.stage, 'new')));

  const [fosterResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fosterApplications)
    .where(and(eq(fosterApplications.tenantId, tenantId), eq(fosterApplications.pipelineStatus, 'new_app')));

  const [volunteerResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(volunteerApplications)
    .where(and(eq(volunteerApplications.tenantId, tenantId), eq(volunteerApplications.pipelineStatus, 'new_applicant')));

  const [intakeResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(surrenderRequests)
    .where(and(eq(surrenderRequests.tenantId, tenantId), eq(surrenderRequests.status, 'new')));

  return [
    { eventKey: 'pending_adoption_applications_digest', label: 'Adoption', count: adoptionResult.count, stage: 'New' },
    { eventKey: 'pending_foster_applications_digest', label: 'Foster', count: fosterResult.count, stage: 'New' },
    { eventKey: 'pending_volunteer_applications_digest', label: 'Volunteer', count: volunteerResult.count, stage: 'New Applicant' },
    { eventKey: 'pending_intake_applications_digest', label: 'Intake / Surrender', count: intakeResult.count, stage: 'New' },
  ];
}

function composeDigestHtml(pipelines: PipelineCount[], tenantName: string): string {
  const totalPending = pipelines.reduce((sum, p) => sum + p.count, 0);

  const rows = pipelines
    .map(p => {
      const countColor = p.count > 0 ? '#dc2626' : '#16a34a';
      const countLabel = p.count > 0 ? `${p.count} pending` : 'None';
      return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 15px; color: #374151;">${p.label}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 15px; text-align: center;">
            <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 13px; color: white; background-color: ${countColor};">${countLabel}</span>
          </td>
        </tr>`;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 24px;">
    <div style="background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background-color: #1e40af; padding: 20px 24px;">
        <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 600;">Pending Applications Summary</h1>
        <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 14px;">${tenantName}</p>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 16px; font-size: 15px; color: #374151;">
          You have <strong style="color: ${totalPending > 0 ? '#dc2626' : '#16a34a'};">${totalPending} application${totalPending !== 1 ? 's' : ''}</strong> across your pipelines that need attention.
        </p>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 10px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb;">Pipeline</th>
              <th style="padding: 10px 16px; text-align: center; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <p style="margin: 20px 0 0; font-size: 13px; color: #9ca3af;">
          Log in to your dashboard to review and process these applications.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function composeDigestPlainText(pipelines: PipelineCount[], tenantName: string): string {
  const totalPending = pipelines.reduce((sum, p) => sum + p.count, 0);
  const lines = [
    `Pending Applications Summary - ${tenantName}`,
    '',
    `You have ${totalPending} application${totalPending !== 1 ? 's' : ''} across your pipelines that need attention.`,
    '',
    ...pipelines.map(p => `  ${p.label}: ${p.count > 0 ? `${p.count} pending` : 'None'}`),
    '',
    'Log in to your dashboard to review and process these applications.',
  ];
  return lines.join('\n');
}

export async function sendPendingApplicationsDigest(tenantId: string): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    const pipelines = await gatherPendingApplicationCounts(tenantId);

    const pipelinesWithPending = pipelines.filter(p => p.count > 0);
    if (pipelinesWithPending.length === 0) {
      return { sent: 0, errors: [] };
    }

    const recipientPipelines = new Map<string, { info: RecipientInfo; eventKeys: Set<string> }>();

    for (const pipeline of pipelinesWithPending) {
      const recipients = await getDigestRecipients(tenantId, pipeline.eventKey);
      for (const r of recipients) {
        const key = r.email.toLowerCase();
        if (!recipientPipelines.has(key)) {
          recipientPipelines.set(key, { info: r, eventKeys: new Set() });
        }
        recipientPipelines.get(key)!.eventKeys.add(pipeline.eventKey);
      }
    }

    if (recipientPipelines.size === 0) {
      return { sent: 0, errors: [] };
    }

    const [tenantData] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const tenantName = tenantData?.name || 'Your Organization';

    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      return { sent: 0, errors: ['Email service not available for tenant'] };
    }

    const contentCache = new Map<string, { html: string; text: string; subject: string }>();

    for (const [, entry] of recipientPipelines) {
      const subscribedPipelines = pipelines.filter(p => entry.eventKeys.has(p.eventKey));
      const cacheKey = [...entry.eventKeys].sort().join(',');

      if (!contentCache.has(cacheKey)) {
        const html = composeDigestHtml(subscribedPipelines, tenantName);
        const text = composeDigestPlainText(subscribedPipelines, tenantName);
        const totalPending = subscribedPipelines.reduce((sum, p) => sum + p.count, 0);
        const subject = `${totalPending} New Application${totalPending !== 1 ? 's' : ''} Pending Review - ${tenantName}`;
        contentCache.set(cacheKey, { html, text, subject });
      }

      const content = contentCache.get(cacheKey)!;

      try {
        const result = await emailService.send({
          to: [entry.info.email],
          subject: content.subject,
          html: content.html,
          text: content.text,
        });

        if (result.success) {
          sent++;
        } else {
          errors.push(`Failed to send to ${entry.info.email}: ${result.error || 'Unknown error'}`);
        }
      } catch (sendErr: any) {
        errors.push(`Failed to send to ${entry.info.email}: ${sendErr.message}`);
      }
    }
  } catch (error: any) {
    errors.push(`Error sending digest for tenant ${tenantId}: ${error.message}`);
    console.error(`[PENDING APPS DIGEST] Error for tenant ${tenantId}:`, error);
  }

  return { sent, errors };
}

export async function sendPendingApplicationsDigestForAllTenants(): Promise<{ sent: number; errors: string[] }> {
  const allErrors: string[] = [];
  let totalSent = 0;

  try {
    const activeTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    for (const tenant of activeTenants) {
      try {
        const result = await sendPendingApplicationsDigest(tenant.id);
        totalSent += result.sent;
        allErrors.push(...result.errors);
      } catch (error: any) {
        allErrors.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }
  } catch (error: any) {
    allErrors.push(`Failed to query tenants: ${error.message}`);
  }

  return { sent: totalSent, errors: allErrors };
}
