import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { monthlyGivingTiers, type Donor, type Tenant } from '@shared/schema';
import { EmailService } from '../lib/email-service';
import { buildImpactLoopSection } from './impact-loop';

export type VipEmailTenant = Pick<
  Tenant,
  'id' | 'name' | 'subdomain' | 'customDomain' | 'orgTaxEin' | 'orgLegalName' | 'transparencyVault' | 'impactLoopEnabled' | 'contactEmail'
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

function formatCurrencyCents(cents: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((cents || 0) / 100);
}

function getTenantEin(tenant: VipEmailTenant): string | null {
  if (tenant.orgTaxEin) return tenant.orgTaxEin;
  const vault = tenant.transparencyVault as { ein?: string } | null | undefined;
  if (vault?.ein) return vault.ein;
  return null;
}

function buildBaseUrl(tenant: VipEmailTenant, fallbackOrigin: string): string {
  if (tenant.customDomain) {
    return `https://${tenant.customDomain}`;
  }
  const path = tenant.subdomain ? `/${tenant.subdomain}` : '';
  return `${fallbackOrigin.replace(/\/$/, '')}${path}`;
}

async function lookupTangibleImpact(
  tenantId: string,
  vipTierId: string | null | undefined
): Promise<string | null> {
  if (!vipTierId) return null;
  try {
    const [tier] = await db
      .select({ tangibleImpact: monthlyGivingTiers.tangibleImpact })
      .from(monthlyGivingTiers)
      .where(and(eq(monthlyGivingTiers.id, vipTierId), eq(monthlyGivingTiers.tenantId, tenantId)))
      .limit(1);
    return tier?.tangibleImpact || null;
  } catch {
    return null;
  }
}

export interface VipWelcomeEmailParams {
  tenant: VipEmailTenant;
  donorEmail: string;
  donorName: string;
  tierId: string | null;
  tierName: string | null;
  monthlyAmountCents: number;
  currency?: string;
  fallbackOrigin: string;
}

export async function sendVipWelcomeEmail(params: VipWelcomeEmailParams): Promise<void> {
  const { tenant, donorEmail, donorName } = params;
  if (!donorEmail) return;

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    console.warn(`[VIP Welcome] No EmailService configured for tenant ${tenant.id}`);
    return;
  }

  const tangibleImpact = await lookupTangibleImpact(tenant.id, params.tierId);

  const safeDonor = escapeHtml(donorName || 'Friend');
  const safeTenant = escapeHtml(tenant.name);
  const safeTier = escapeHtml(params.tierName || 'VIP Donor');
  const amountFormatted = formatCurrencyCents(params.monthlyAmountCents, params.currency);
  const ein = getTenantEin(tenant);
  const safeEin = escapeHtml(ein);
  const safeLegal = escapeHtml(tenant.orgLegalName || tenant.name);
  const manageUrl = `${buildBaseUrl(tenant, params.fallbackOrigin)}/vip-club`;
  const safeManageUrl = escapeHtml(manageUrl);
  const safeImpact = escapeHtml(tangibleImpact || '');
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const impactBlock = safeImpact
    ? `<div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 0; font-size: 14px; color: #065f46;"><strong>Your monthly impact:</strong></p>
        <p style="margin: 6px 0 0 0; font-size: 15px; color: #064e3b;">${safeImpact}</p>
      </div>`
    : '';

  const einSection = safeEin ? ` Our EIN is <strong>${safeEin}</strong>.` : '';

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <h2 style="color: #2563eb; margin-bottom: 8px;">Welcome to the VIP Monthly Donor Club, ${safeDonor}!</h2>
  <p style="margin-top: 0;">Thank you for becoming a <strong>${safeTier}</strong> at ${safeTenant}. Your generosity means the world to the animals in our care.</p>

  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 4px 0;"><strong>Tier:</strong> ${safeTier}</p>
    <p style="margin: 4px 0;"><strong>Monthly amount:</strong> ${amountFormatted}</p>
    <p style="margin: 4px 0;"><strong>Member since:</strong> ${today}</p>
  </div>

  ${impactBlock}

  <p>You can update your payment method, change tiers, or cancel anytime from your VIP Club page:</p>
  <p style="text-align: center; margin: 20px 0;">
    <a href="${safeManageUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 600;">Manage your subscription</a>
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

  <h3 style="margin: 0 0 8px 0; font-size: 16px;">Tax-deductible receipt</h3>
  <p style="margin: 4px 0;"><strong>Donor:</strong> ${safeDonor}</p>
  <p style="margin: 4px 0;"><strong>Recurring gift:</strong> ${amountFormatted} per month</p>
  <p style="margin: 4px 0;"><strong>Date of first gift:</strong> ${today}</p>
  <p style="margin: 4px 0;"><strong>Organization:</strong> ${safeLegal}</p>
  <p style="font-size: 12px; color: #6b7280; margin-top: 12px;">
    ${safeLegal} is a registered 501(c)(3) nonprofit organization.${einSection}
    No goods or services were provided in exchange for this contribution. Please retain this email for your tax records.
    A receipt will also be sent for each subsequent monthly payment.
  </p>
</div>
`.trim();

  const subject = `Welcome to the ${safeTier} circle at ${tenant.name}`;
  try {
    const result = await emailService.send({ to: donorEmail, subject, html });
    if (result.success) {
      console.log(`[VIP Welcome] Sent welcome email to ${donorEmail} for tenant ${tenant.id}`);
    } else {
      console.warn(`[VIP Welcome] Email send returned failure: ${result.error}`);
    }
  } catch (err) {
    console.error('[VIP Welcome] Failed to send welcome email:', err);
  }
}

export interface VipMonthlyReceiptParams {
  tenant: VipEmailTenant;
  donorEmail: string;
  donorName: string;
  tierName: string | null;
  amountCents: number;
  currency?: string;
  paidAt: Date;
  invoiceNumber?: string | null;
  invoiceHostedUrl?: string | null;
  fallbackOrigin: string;
}

export async function renderVipMonthlyReceiptEmail(params: VipMonthlyReceiptParams & {
  donor?: Pick<Donor, 'id' | 'impactLoopOptOut'> | null;
}): Promise<{ subject: string; html: string; impactSection: string | null }> {
  const { tenant, donorName } = params;
  const safeDonor = escapeHtml(donorName || 'Friend');
  const safeTenant = escapeHtml(tenant.name);
  const safeTier = escapeHtml(params.tierName || 'VIP Donor');
  const amountFormatted = formatCurrencyCents(params.amountCents, params.currency);
  const ein = getTenantEin(tenant);
  const safeEin = escapeHtml(ein);
  const safeLegal = escapeHtml(tenant.orgLegalName || tenant.name);
  const dateFormatted = params.paidAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const safeInvoiceNumber = escapeHtml(params.invoiceNumber || '');
  const manageUrl = `${buildBaseUrl(tenant, params.fallbackOrigin)}/vip-club`;
  const safeManageUrl = escapeHtml(manageUrl);
  const einSection = safeEin ? ` Our EIN is <strong>${safeEin}</strong>.` : '';

  const invoiceLink = params.invoiceHostedUrl
    ? `<p style="margin: 8px 0;"><a href="${escapeHtml(params.invoiceHostedUrl)}">View Stripe invoice</a></p>`
    : '';

  const impactSection = await buildImpactLoopSection({
    tenant,
    donor: params.donor ?? null,
    baseUrl: buildBaseUrl(tenant, params.fallbackOrigin),
  });
  const impactBlock = impactSection ? `\n  ${impactSection}\n` : '';

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <h2 style="color: #2563eb; margin-bottom: 8px;">Thank you, ${safeDonor}!</h2>
  <p style="margin-top: 0;">Your monthly contribution to ${safeTenant} as a <strong>${safeTier}</strong> has been received. This email serves as your tax-deductible receipt.</p>

  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 4px 0;"><strong>Amount:</strong> ${amountFormatted}</p>
    <p style="margin: 4px 0;"><strong>Date:</strong> ${dateFormatted}</p>
    <p style="margin: 4px 0;"><strong>Tier:</strong> ${safeTier}</p>
    ${safeInvoiceNumber ? `<p style="margin: 4px 0;"><strong>Invoice:</strong> ${safeInvoiceNumber}</p>` : ''}
    ${invoiceLink}
  </div>
  ${impactBlock}
  <p style="margin: 4px 0;"><strong>Organization:</strong> ${safeLegal}</p>
  <p style="font-size: 12px; color: #6b7280; margin-top: 12px;">
    ${safeLegal} is a registered 501(c)(3) nonprofit organization.${einSection}
    No goods or services were provided in exchange for this contribution. Please retain this email for your tax records.
  </p>

  <p style="margin-top: 20px;">You can manage or update your VIP subscription at any time:</p>
  <p style="text-align: center; margin: 16px 0;">
    <a href="${safeManageUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 600;">Manage subscription</a>
  </p>
</div>
`.trim();

  const subject = `Your monthly receipt from ${tenant.name} (${amountFormatted})`;
  return { subject, html, impactSection };
}

export async function sendVipMonthlyReceiptEmail(params: VipMonthlyReceiptParams & {
  donor?: Pick<Donor, 'id' | 'impactLoopOptOut'> | null;
}): Promise<void> {
  const { tenant, donorEmail } = params;
  if (!donorEmail) return;

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    console.warn(`[VIP Receipt] No EmailService configured for tenant ${tenant.id}`);
    return;
  }

  const { subject, html, impactSection } = await renderVipMonthlyReceiptEmail(params);

  try {
    const result = await emailService.send({
      to: donorEmail,
      subject,
      html,
      ...(impactSection && tenant.contactEmail ? { replyTo: tenant.contactEmail } : {}),
    });
    if (result.success) {
      console.log(`[VIP Receipt] Sent monthly receipt to ${donorEmail} for tenant ${tenant.id}`);
    } else {
      console.warn(`[VIP Receipt] Email send returned failure: ${result.error}`);
    }
  } catch (err) {
    console.error('[VIP Receipt] Failed to send monthly receipt email:', err);
  }
}

export interface ImpactLoopPreviewParams {
  tenant: VipEmailTenant;
  recipientEmail: string;
  fallbackOrigin: string;
}

/**
 * Sends a sample monthly receipt with the Impact Loop section to the
 * requesting admin so they can preview what donors will receive. Reuses the
 * production receipt renderer (renderVipMonthlyReceiptEmail) to ensure the
 * preview matches actual donor emails. Caller must verify an eligible
 * adopted animal exists before calling.
 */
export async function sendImpactLoopPreviewEmail(
  params: ImpactLoopPreviewParams,
): Promise<{ success: boolean; error?: string; impactRendered: boolean }> {
  const { tenant, recipientEmail, fallbackOrigin } = params;
  if (!recipientEmail) return { success: false, error: 'Missing recipient email', impactRendered: false };

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    return { success: false, error: 'No email service configured for this rescue.', impactRendered: false };
  }

  const previewTenant: VipEmailTenant = { ...tenant, impactLoopEnabled: true };
  const rendered = await renderVipMonthlyReceiptEmail({
    tenant: previewTenant,
    donor: null,
    donorEmail: recipientEmail,
    donorName: 'Sample Donor',
    tierName: 'VIP Donor',
    amountCents: 2500,
    currency: 'usd',
    paidAt: new Date(),
    invoiceNumber: 'PREVIEW-0001',
    invoiceHostedUrl: null,
    fallbackOrigin,
  });

  const previewBanner = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0 20px;">
  <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 10px 14px; border-radius: 6px; margin: 16px 0; font-size: 13px; color: #78350f;">
    <strong>Preview only.</strong> This is a sample receipt sent to you so you can see what donors will receive when the Impact Loop is enabled. No donor received this email.
  </div>
</div>
`.trim();

  const html = `${previewBanner}\n${rendered.html}`;
  const subject = `[Preview] ${rendered.subject}`;

  try {
    const result = await emailService.send({ to: recipientEmail, subject, html });
    if (!result.success) {
      return { success: false, error: result.error || 'Email send failed', impactRendered: !!rendered.impactSection };
    }
    return { success: true, impactRendered: !!rendered.impactSection };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error sending preview email';
    return { success: false, error: message, impactRendered: !!rendered.impactSection };
  }
}

export interface VipPaymentFailedEmailParams {
  tenant: VipEmailTenant;
  donorEmail: string;
  donorName: string;
  tierName: string | null;
  amountCents: number;
  currency?: string;
  attemptNumber?: number | null;
  nextRetryAt?: Date | null;
  hostedInvoiceUrl?: string | null;
  manageUrl: string;
}

export async function sendVipPaymentFailedEmail(params: VipPaymentFailedEmailParams): Promise<void> {
  const { tenant, donorEmail, donorName } = params;
  if (!donorEmail) return;

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    console.warn(`[VIP PaymentFailed] No EmailService configured for tenant ${tenant.id}`);
    return;
  }

  const safeDonor = escapeHtml(donorName || 'Friend');
  const safeTenant = escapeHtml(tenant.name);
  const safeTier = escapeHtml(params.tierName || 'VIP Donor');
  const amountFormatted = formatCurrencyCents(params.amountCents, params.currency);
  const safeManageUrl = escapeHtml(params.manageUrl);
  const safeInvoiceUrl = params.hostedInvoiceUrl ? escapeHtml(params.hostedInvoiceUrl) : null;
  const attempt = params.attemptNumber && params.attemptNumber > 1
    ? `<p style="margin: 4px 0; color: #6b7280; font-size: 13px;">This is attempt #${params.attemptNumber}.</p>`
    : '';
  const retryNote = params.nextRetryAt
    ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #92400e;">We'll automatically try again on <strong>${escapeHtml(params.nextRetryAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</strong>. To avoid any interruption to your monthly support, please update your card now.</p>`
    : `<p style="margin: 8px 0 0 0; font-size: 14px; color: #92400e;">To avoid any interruption to your monthly support, please update your card.</p>`;
  const invoiceLine = safeInvoiceUrl
    ? `<p style="margin: 12px 0 0 0; font-size: 13px;"><a href="${safeInvoiceUrl}" style="color: #2563eb;">View this invoice on Stripe →</a></p>`
    : '';

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <h2 style="color: #b91c1c; margin-bottom: 8px;">Your monthly gift didn't go through</h2>
  <p style="margin-top: 0;">Hi ${safeDonor}, your most recent <strong>${safeTier}</strong> payment of <strong>${amountFormatted}</strong> to ${safeTenant} couldn't be processed.</p>
  ${attempt}

  <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0; font-weight: 600; color: #92400e;">Common reasons cards fail:</p>
    <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #92400e; font-size: 14px;">
      <li>The card has expired</li>
      <li>Insufficient funds</li>
      <li>The bank flagged it as suspicious</li>
      <li>The billing address changed</li>
    </ul>
    ${retryNote}
  </div>

  <p style="text-align: center; margin: 24px 0;">
    <a href="${safeManageUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 600;">Update your payment method</a>
  </p>

  ${invoiceLine}

  <p style="font-size: 14px; color: #4b5563;">Thank you for your continued support of the animals in our care &mdash; we couldn't do this work without you.</p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="font-size: 12px; color: #6b7280;">If you've already updated your card or believe this is an error, please disregard this message.</p>
</div>
`.trim();

  const subject = `Action needed: your ${safeTier} gift to ${tenant.name} didn't go through`;
  try {
    const result = await emailService.send({ to: donorEmail, subject, html });
    if (result.success) {
      console.log(`[VIP PaymentFailed] Sent card-failure email to ${donorEmail} for tenant ${tenant.id}`);
    } else {
      console.warn(`[VIP PaymentFailed] Email send returned failure: ${result.error}`);
    }
  } catch (err) {
    console.error('[VIP PaymentFailed] Failed to send card-failure email:', err);
  }
}
