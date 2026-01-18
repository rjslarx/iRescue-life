import { db } from '../db';
import { tenants, inboundEmails } from '@shared/schema';
import { eq } from 'drizzle-orm';

export type FormType = 'adoption' | 'foster' | 'volunteer' | 'surrender';

interface FormSubmissionData {
  formType: FormType;
  tenantId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  applicationId: string;
  animalName?: string;
  additionalDetails?: string;
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
    surrender: '/dashboard/animals',
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

    const recipientEmail = tenant.formNotificationEmail || tenant.contactEmail;
    if (!recipientEmail) {
      console.log('No notification email configured for tenant:', tenant.subdomain);
      return;
    }

    const formLabel = getFormTypeLabel(data.formType);
    const dashboardPath = getDashboardPath(data.formType);
    
    const baseUrl = tenant.customDomain 
      ? `https://${tenant.customDomain}`
      : `https://irescue.life/${tenant.subdomain}`;

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
        <span class="label">Name:</span> ${data.applicantName}
      </div>
      <div class="detail">
        <span class="label">Email:</span> <a href="mailto:${data.applicantEmail}">${data.applicantEmail}</a>
      </div>
      ${data.applicantPhone ? `<div class="detail"><span class="label">Phone:</span> ${data.applicantPhone}</div>` : ''}
      ${data.animalName ? `<div class="detail"><span class="label">Animal:</span> ${data.animalName}</div>` : ''}
      ${data.additionalDetails ? `<div class="detail"><span class="label">Details:</span> ${data.additionalDetails}</div>` : ''}
      
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

    const textBody = `
New ${formLabel} from ${data.applicantName}

${tenant.name} has received a new ${formLabel.toLowerCase()} submission.

Name: ${data.applicantName}
Email: ${data.applicantEmail}
${data.applicantPhone ? `Phone: ${data.applicantPhone}` : ''}
${data.animalName ? `Animal: ${data.animalName}` : ''}
${data.additionalDetails ? `Details: ${data.additionalDetails}` : ''}

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
    await emailService.send({
      to: recipientEmail,
      subject,
      html: htmlBody,
      text: textBody,
    });

    console.log(`Form notification sent for ${data.formType} application to ${recipientEmail}`);
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
