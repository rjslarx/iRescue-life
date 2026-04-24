import { db } from '../db';
import { tenants, surgeryDayRequests } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export type FormType = 'adoption' | 'foster' | 'volunteer' | 'surrender' | 'surgery_day';

interface FormFieldLabel {
  id: string;
  label: string;
  fieldType: string;
}

interface FormSubmissionData {
  formType: FormType;
  tenantId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  applicationId: string;
  animalName?: string;
  additionalDetails?: string;
  customResponses?: Record<string, any>;
  formFieldLabels?: FormFieldLabel[];
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

function formatCustomResponsesHtml(
  customResponses: Record<string, any>,
  formFieldLabels: FormFieldLabel[],
  baseUrl?: string
): string {
  const knownFieldIds = new Set(formFieldLabels.map(f => f.id));
  const orphanedEntries = Object.entries(customResponses || {}).filter(([id]) => !knownFieldIds.has(id));
  if (formFieldLabels.length === 0 && orphanedEntries.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('<div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;">');
  lines.push('<h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px;">Additional Form Responses</h3>');

  const renderField = (label: string, fieldType: string, value: any) => {
    const isEmpty = value === undefined || value === null || value === '';

    if (isEmpty) {
      lines.push(`<div class="detail" style="margin: 8px 0;">
        <span class="label" style="font-weight: 600; color: #64748b;">${escapeHtml(label)}:</span> <em>Not provided</em>
      </div>`);
    } else if (fieldType === 'photo' && typeof value === 'string') {
      const isHttpUrl = value.startsWith('http');
      const isObjectPath = value.startsWith('/objects/') || value.startsWith('objects/');
      if (isHttpUrl || isObjectPath) {
        let imageUrl = value;
        if (isObjectPath && baseUrl) {
          const normalizedPath = value.startsWith('/') ? value : `/${value}`;
          imageUrl = `${baseUrl}${normalizedPath}`;
        }
        lines.push(`<div class="detail" style="margin: 12px 0;">
          <span class="label" style="font-weight: 600; color: #64748b;">${escapeHtml(label)}:</span>
          <div style="margin-top: 8px;">
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(label)}" style="max-width: 300px; max-height: 300px; border-radius: 8px; border: 1px solid #e2e8f0;" />
          </div>
        </div>`);
      } else {
        lines.push(`<div class="detail" style="margin: 8px 0;">
          <span class="label" style="font-weight: 600; color: #64748b;">${escapeHtml(label)}:</span> ${escapeHtml(String(value))}
        </div>`);
      }
    } else if (Array.isArray(value)) {
      lines.push(`<div class="detail" style="margin: 8px 0;">
        <span class="label" style="font-weight: 600; color: #64748b;">${escapeHtml(label)}:</span> ${value.map(v => escapeHtml(String(v))).join(', ')}
      </div>`);
    } else if (typeof value === 'boolean') {
      lines.push(`<div class="detail" style="margin: 8px 0;">
        <span class="label" style="font-weight: 600; color: #64748b;">${escapeHtml(label)}:</span> ${value ? 'Yes' : 'No'}
      </div>`);
    } else {
      lines.push(`<div class="detail" style="margin: 8px 0;">
        <span class="label" style="font-weight: 600; color: #64748b;">${escapeHtml(label)}:</span> ${escapeHtml(String(value))}
      </div>`);
    }
  };

  for (const field of formFieldLabels) {
    renderField(field.label, field.fieldType || 'text', customResponses?.[field.id]);
  }
  for (const [fieldId, value] of orphanedEntries) {
    renderField(fieldId, 'text', value);
  }

  lines.push('</div>');
  return lines.join('\n');
}

function formatCustomResponsesText(
  customResponses: Record<string, any>,
  formFieldLabels: FormFieldLabel[]
): string {
  const knownFieldIds = new Set(formFieldLabels.map(f => f.id));
  const orphanedEntries = Object.entries(customResponses || {}).filter(([id]) => !knownFieldIds.has(id));
  if (formFieldLabels.length === 0 && orphanedEntries.length === 0) {
    return '';
  }

  const lines: string[] = ['\n--- Additional Form Responses ---\n'];

  const formatValue = (label: string, value: any) => {
    const isEmpty = value === undefined || value === null || value === '';
    if (isEmpty) return `${label}: Not provided`;
    if (Array.isArray(value)) return `${label}: ${value.join(', ')}`;
    if (typeof value === 'boolean') return `${label}: ${value ? 'Yes' : 'No'}`;
    return `${label}: ${String(value)}`;
  };

  for (const field of formFieldLabels) {
    lines.push(formatValue(field.label, customResponses?.[field.id]));
  }
  for (const [fieldId, value] of orphanedEntries) {
    lines.push(formatValue(fieldId, value));
  }

  return lines.join('\n');
}

function getFormTypeLabel(formType: FormType): string {
  const labels: Record<FormType, string> = {
    adoption: 'Adoption Application',
    foster: 'Foster Application',
    volunteer: 'Volunteer Application',
    surrender: 'Animal Surrender Request',
    surgery_day: 'Surgery Day Request',
  };
  return labels[formType];
}

function getDashboardPath(formType: FormType): string {
  const paths: Record<FormType, string> = {
    adoption: '/dashboard/applications',
    foster: '/dashboard/foster-management',
    volunteer: '/dashboard/volunteers',
    surrender: '/dashboard/intake',
    surgery_day: '/dashboard/surgery-day-requests',
  };
  return paths[formType];
}

const FORM_TYPE_EVENT_MAP: Record<FormType, string> = {
  adoption: 'adoption_application_received',
  foster: 'foster_application_received',
  volunteer: 'volunteer_application_received',
  surrender: 'surrender_request_received',
  surgery_day: 'surgery_day_request_received',
};

export async function sendFormSubmissionNotification(data: FormSubmissionData): Promise<void> {
  try {
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
        formNotificationsEnabled: tenants.formNotificationsEnabled,
        formNotificationEmail: tenants.formNotificationEmail,
        volunteerApplicationNotificationEmails: tenants.volunteerApplicationNotificationEmails,
        contactEmail: tenants.contactEmail,
        customDomain: tenants.customDomain,
      })
      .from(tenants)
      .where(eq(tenants.id, data.tenantId))
      .limit(1);

    if (!tenant) {
      console.error('Tenant not found for form notification:', data.tenantId);
      return;
    }

    let recipientEmails: string[] = [];

    if (tenant.formNotificationsEnabled) {
      if (tenant.formNotificationEmail) {
        recipientEmails = tenant.formNotificationEmail
          .split(',')
          .map(e => e.trim())
          .filter(e => e && e.includes('@'));
      }
      if (recipientEmails.length === 0 && tenant.contactEmail) {
        recipientEmails = [tenant.contactEmail];
      }
      
      if (data.formType === 'volunteer' && tenant.volunteerApplicationNotificationEmails) {
        const additionalEmails = tenant.volunteerApplicationNotificationEmails
          .split(',')
          .map(e => e.trim())
          .filter(e => e && e.includes('@'));
        recipientEmails = [...new Set([...recipientEmails, ...additionalEmails])];
      }
    }

    try {
      const eventKey = FORM_TYPE_EVENT_MAP[data.formType];
      if (eventKey) {
        const { getNotificationRecipients } = await import('./notification-dispatcher');
        const { enabled, recipients } = await getNotificationRecipients(data.tenantId, eventKey as any, 'email');
        if (enabled) {
          const prefEmails = recipients.map(r => r.email.toLowerCase());
          const existingLower = new Set(recipientEmails.map(e => e.toLowerCase()));
          for (const email of prefEmails) {
            if (!existingLower.has(email)) {
              recipientEmails.push(email);
              existingLower.add(email);
            }
          }
        }
      }
    } catch (prefError) {
      console.warn('[FormNotifications] Error merging notification preference recipients:', prefError);
    }
    
    if (recipientEmails.length === 0) {
      console.log('No notification email configured for tenant:', tenant.subdomain);
      return;
    }

    const formLabel = getFormTypeLabel(data.formType);
    const dashboardPath = getDashboardPath(data.formType);
    
    // Support both path-based URLs (irescue.life/{subdomain}) and subdomain URLs ({subdomain}.irescue.life)
    // Use subdomain-based URLs for consistency with production environment
    const baseUrl = tenant.customDomain 
      ? `https://${tenant.customDomain}`
      : `https://${tenant.subdomain}.irescue.life`;

    const subject = `New ${formLabel} from ${data.applicantName}`;
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
    .footer { background: #f1f5f9; padding: 15px 20px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
    .detail { margin: 8px 0; }
    .label { font-weight: 600; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">New ${formLabel}</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">${tenant.name}</p>
    </div>
    <div class="content">
      <p>You've received a new ${formLabel.toLowerCase()} submission.</p>
      
      <div class="detail">
        <span class="label">Name:</span> ${escapeHtml(data.applicantName)}
      </div>
      <div class="detail">
        <span class="label">Email:</span> <a href="mailto:${escapeHtml(data.applicantEmail)}">${escapeHtml(data.applicantEmail)}</a>
      </div>
      ${data.applicantPhone ? `<div class="detail"><span class="label">Phone:</span> ${escapeHtml(data.applicantPhone)}</div>` : ''}
      ${data.animalName ? `<div class="detail"><span class="label">Animal:</span> ${escapeHtml(data.animalName)}</div>` : ''}
      ${data.additionalDetails ? `<div class="detail"><span class="label">Details:</span> ${escapeHtml(data.additionalDetails)}</div>` : ''}
      
      ${data.customResponses && data.formFieldLabels ? formatCustomResponsesHtml(data.customResponses, data.formFieldLabels, baseUrl) : ''}
      
      <a href="${baseUrl}${dashboardPath}" class="button" style="display: inline-block; background: #2563eb; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; font-weight: 600;">View in Dashboard</a>
    </div>
    <div class="footer">
      <p style="margin: 0; font-size: 14px; color: #64748b;">
        This notification was sent because form submission notifications are enabled for your organization.
        You can manage this setting in your dashboard under Settings.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const customResponsesText = data.customResponses && data.formFieldLabels 
      ? formatCustomResponsesText(data.customResponses, data.formFieldLabels)
      : '';
    
    const textBody = `
New ${formLabel} from ${data.applicantName}

${tenant.name} has received a new ${formLabel.toLowerCase()} submission.

Name: ${data.applicantName}
Email: ${data.applicantEmail}
${data.applicantPhone ? `Phone: ${data.applicantPhone}` : ''}
${data.animalName ? `Animal: ${data.animalName}` : ''}
${data.additionalDetails ? `Details: ${data.additionalDetails}` : ''}
${customResponsesText}

View in Dashboard: ${baseUrl}${dashboardPath}

---
This notification was sent because form submission notifications are enabled for your organization.
    `.trim();

    const { EmailService } = await import('../lib/email-service');
    const emailService = await EmailService.forTenant(data.tenantId);
    if (!emailService) {
      console.warn(`Email service not configured for tenant ${data.tenantId}, skipping form notification`);
      return;
    }
    
    // Send to all configured notification emails
    for (const recipientEmail of recipientEmails) {
      try {
        await emailService.send({
          to: recipientEmail,
          subject,
          html: htmlBody,
          text: textBody,
        });
        console.log(`Form notification sent for ${data.formType} application to ${recipientEmail}`);
      } catch (emailError) {
        console.error(`Failed to send form notification to ${recipientEmail}:`, emailError);
      }
    }
    
    console.log(`Form notifications sent for ${data.formType} application to ${recipientEmails.length} recipient(s)`);
  } catch (error) {
    console.error('Failed to send form submission notification:', error);
  }
}

const SURGERY_DAY_PRE_OP_INSTRUCTIONS = [
  'No food after 10:00 PM the night before surgery.',
  'Water may be removed at the same time (no food or water after 10:00 PM).',
  'Drop-off is between 8:00 AM and 9:00 AM on the scheduled surgery day.',
  'Pick-up is between 2:00 PM and 3:00 PM the same day.',
  'If your animal is sick, in heat, or has eaten that morning, please call to reschedule.',
];

function formatScheduledDate(scheduledDate: string): string {
  // scheduledDate is a date-only string like 'YYYY-MM-DD'
  const [y, m, d] = scheduledDate.split('-').map(Number);
  if (!y || !m || !d) return scheduledDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export interface SurgeryDayConfirmationResult {
  sent: boolean;
  recipientEmail?: string;
  reason?: string;
}

/**
 * Send a surgery day scheduling confirmation email to the partner rescue's contact.
 * Returns metadata about whether the send succeeded so the caller can persist it.
 */
export async function sendSurgeryDayConfirmationEmail(params: {
  tenantId: string;
  requestId: string;
}): Promise<SurgeryDayConfirmationResult> {
  const { tenantId, requestId } = params;

  try {
    const [request] = await db
      .select()
      .from(surgeryDayRequests)
      .where(and(eq(surgeryDayRequests.id, requestId), eq(surgeryDayRequests.tenantId, tenantId)))
      .limit(1);

    if (!request) {
      return { sent: false, reason: 'Request not found' };
    }
    if (!request.contactEmail) {
      return { sent: false, reason: 'No contact email on file' };
    }
    if (!request.scheduledDate) {
      return { sent: false, reason: 'No scheduled date set' };
    }

    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
        contactEmail: tenants.contactEmail,
        contactPhone: tenants.contactPhone,
        customDomain: tenants.customDomain,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return { sent: false, reason: 'Tenant not found' };
    }

    const friendlyDate = formatScheduledDate(request.scheduledDate);
    const subject = `Surgery day confirmed for ${friendlyDate} — ${tenant.name}`;

    const instructionsHtml = SURGERY_DAY_PRE_OP_INSTRUCTIONS
      .map(line => `<li style="margin: 4px 0;">${escapeHtml(line)}</li>`)
      .join('');

    const instructionsText = SURGERY_DAY_PRE_OP_INSTRUCTIONS.map(l => `- ${l}`).join('\n');

    const contactBlock = tenant.contactPhone || tenant.contactEmail
      ? `<p style="margin: 12px 0 0 0; font-size: 14px; color: #475569;">Questions? ${
          tenant.contactPhone ? `Call ${escapeHtml(tenant.contactPhone)}` : ''
        }${tenant.contactPhone && tenant.contactEmail ? ' or ' : ''}${
          tenant.contactEmail ? `email <a href="mailto:${escapeHtml(tenant.contactEmail)}">${escapeHtml(tenant.contactEmail)}</a>` : ''
        }.</p>`
      : '';

    const contactBlockText = tenant.contactPhone || tenant.contactEmail
      ? `\nQuestions? ${tenant.contactPhone ? `Call ${tenant.contactPhone}` : ''}${
          tenant.contactPhone && tenant.contactEmail ? ' or ' : ''
        }${tenant.contactEmail ? `email ${tenant.contactEmail}` : ''}.`
      : '';

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
    .footer { background: #f1f5f9; padding: 15px 20px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none; font-size: 13px; color: #64748b; }
    .window-card { display: inline-block; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin: 4px 6px 4px 0; }
    .window-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .window-time { font-size: 16px; font-weight: 600; color: #0f172a; }
    h2 { color: #0f172a; font-size: 18px; margin: 24px 0 8px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 22px;">Surgery Day Confirmed</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">${escapeHtml(tenant.name)}</p>
    </div>
    <div class="content">
      <p>Hi ${escapeHtml(request.contactName)},</p>
      <p>Your surgery day request for <strong>${escapeHtml(request.organizationName)}</strong> has been scheduled. Here are the details:</p>

      <p style="font-size: 18px; font-weight: 600; color: #0f172a; margin: 16px 0;">
        ${escapeHtml(friendlyDate)}
      </p>

      <div>
        <div class="window-card">
          <div class="window-label">Drop-off</div>
          <div class="window-time">8:00 AM – 9:00 AM</div>
        </div>
        <div class="window-card">
          <div class="window-label">Pick-up</div>
          <div class="window-time">2:00 PM – 3:00 PM</div>
        </div>
      </div>

      <h2>Pre-Operative Instructions</h2>
      <ul style="padding-left: 20px; margin: 8px 0;">
        ${instructionsHtml}
      </ul>

      <p style="margin-top: 20px;">Please reply to this email or call us if anything changes — including if any of the animals on this request need to be removed or rescheduled.</p>
      ${contactBlock}
    </div>
    <div class="footer">
      <p style="margin: 0;">This confirmation was sent automatically by ${escapeHtml(tenant.name)} when your surgery day was scheduled.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const textBody = `
Surgery Day Confirmed — ${tenant.name}

Hi ${request.contactName},

Your surgery day request for ${request.organizationName} has been scheduled.

Date: ${friendlyDate}
Drop-off: 8:00 AM – 9:00 AM
Pick-up:  2:00 PM – 3:00 PM

Pre-Operative Instructions:
${instructionsText}

Please reply to this email or call us if anything changes — including if any of the animals on this request need to be removed or rescheduled.${contactBlockText}

---
This confirmation was sent automatically by ${tenant.name} when your surgery day was scheduled.
    `.trim();

    const { EmailService } = await import('../lib/email-service');
    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      return { sent: false, reason: 'Email service not configured for tenant' };
    }

    await emailService.send({
      to: request.contactEmail,
      subject,
      html: htmlBody,
      text: textBody,
    });

    console.log(`[SurgeryDayConfirmation] Sent to ${request.contactEmail} for request ${requestId}`);
    return { sent: true, recipientEmail: request.contactEmail };
  } catch (error: any) {
    console.error('[SurgeryDayConfirmation] Failed to send confirmation email:', error);
    return { sent: false, reason: error?.message || 'Unknown error' };
  }
}
