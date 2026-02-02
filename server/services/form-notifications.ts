import { db } from '../db';
import { tenants, inboundEmails } from '@shared/schema';
import { eq } from 'drizzle-orm';

export type FormType = 'adoption' | 'foster' | 'volunteer' | 'surrender';

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
  if (!customResponses || Object.keys(customResponses).length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('<div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;">');
  lines.push('<h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px;">Additional Form Responses</h3>');

  for (const [fieldId, value] of Object.entries(customResponses)) {
    if (value === undefined || value === null || value === '') continue;

    const field = formFieldLabels.find(f => f.id === fieldId);
    const label = field?.label || fieldId;
    const fieldType = field?.fieldType || 'text';

    // Check if this is a photo field with an image URL or object storage path
    const isPhotoField = fieldType === 'photo' && typeof value === 'string';
    const isHttpUrl = typeof value === 'string' && value.startsWith('http');
    const isObjectPath = typeof value === 'string' && (value.startsWith('/objects/') || value.startsWith('objects/'));
    
    if (isPhotoField && (isHttpUrl || isObjectPath)) {
      // Convert object storage paths to full URLs
      let imageUrl = value;
      if (isObjectPath && baseUrl) {
        // Ensure path starts with /
        const normalizedPath = value.startsWith('/') ? value : `/${value}`;
        imageUrl = `${baseUrl}${normalizedPath}`;
      }
      
      lines.push(`<div class="detail" style="margin: 12px 0;">
        <span class="label" style="font-weight: 600; color: #64748b;">${escapeHtml(label)}:</span>
        <div style="margin-top: 8px;">
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(label)}" style="max-width: 300px; max-height: 300px; border-radius: 8px; border: 1px solid #e2e8f0;" />
        </div>
      </div>`);
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
  }

  lines.push('</div>');
  return lines.join('\n');
}

function formatCustomResponsesText(
  customResponses: Record<string, any>,
  formFieldLabels: FormFieldLabel[]
): string {
  if (!customResponses || Object.keys(customResponses).length === 0) {
    return '';
  }

  const lines: string[] = ['\n--- Additional Form Responses ---\n'];

  for (const [fieldId, value] of Object.entries(customResponses)) {
    if (value === undefined || value === null || value === '') continue;

    const field = formFieldLabels.find(f => f.id === fieldId);
    const label = field?.label || fieldId;

    if (Array.isArray(value)) {
      lines.push(`${label}: ${value.join(', ')}`);
    } else if (typeof value === 'boolean') {
      lines.push(`${label}: ${value ? 'Yes' : 'No'}`);
    } else {
      lines.push(`${label}: ${String(value)}`);
    }
  }

  return lines.join('\n');
}

function getFormTypeLabel(formType: FormType): string {
  const labels: Record<FormType, string> = {
    adoption: 'Adoption Application',
    foster: 'Foster Application',
    volunteer: 'Volunteer Application',
    surrender: 'Animal Surrender Request',
  };
  return labels[formType];
}

function getDashboardPath(formType: FormType): string {
  const paths: Record<FormType, string> = {
    adoption: '/dashboard/applications',
    foster: '/dashboard/foster-management',
    volunteer: '/dashboard/volunteers',
    surrender: '/dashboard/intake',
  };
  return paths[formType];
}

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

    if (!tenant.formNotificationsEnabled) {
      return;
    }

    // Parse comma-separated emails or fall back to contact email
    let recipientEmails: string[] = [];
    if (tenant.formNotificationEmail) {
      recipientEmails = tenant.formNotificationEmail
        .split(',')
        .map(e => e.trim())
        .filter(e => e && e.includes('@'));
    }
    if (recipientEmails.length === 0 && tenant.contactEmail) {
      recipientEmails = [tenant.contactEmail];
    }
    
    // For volunteer applications, also add additional volunteer screener emails (additive)
    if (data.formType === 'volunteer' && tenant.volunteerApplicationNotificationEmails) {
      const additionalEmails = tenant.volunteerApplicationNotificationEmails
        .split(',')
        .map(e => e.trim())
        .filter(e => e && e.includes('@'));
      // Merge without duplicates
      recipientEmails = [...new Set([...recipientEmails, ...additionalEmails])];
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
      
      <a href="${baseUrl}${dashboardPath}" class="button">View in Dashboard</a>
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

export async function createInboxNotification(
  tenantId: string,
  subdomain: string,
  formType: FormType,
  applicantName: string,
  applicantEmail: string,
  applicationId: string,
  emailBody: string
): Promise<void> {
  try {
    const formLabel = getFormTypeLabel(formType);
    const subject = `New ${formLabel} from ${applicantName}`;

    await db.insert(inboundEmails).values({
      tenantId,
      messageId: `${formType}-app-${applicationId}`,
      from: applicantEmail,
      fromName: applicantName,
      to: `${subdomain}@mail.irescue.life`,
      subject,
      textBody: emailBody,
      htmlBody: emailBody.replace(/\n/g, '<br>'),
      status: 'unprocessed',
    });
  } catch (error) {
    console.error(`Failed to create inbox notification for ${formType}:`, error);
  }
}
