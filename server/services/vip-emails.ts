import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { monthlyGivingTiers, type Tenant } from '@shared/schema';
import { EmailService } from '../lib/email-service';

export type VipEmailTenant = Pick<
  Tenant,
  'id' | 'name' | 'subdomain' | 'customDomain' | 'orgTaxEin' | 'orgLegalName' | 'transparencyVault'
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

export async function sendVipMonthlyReceiptEmail(params: VipMonthlyReceiptParams): Promise<void> {
  const { tenant, donorEmail, donorName } = params;
  if (!donorEmail) return;

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    console.warn(`[VIP Receipt] No EmailService configured for tenant ${tenant.id}`);
    return;
  }

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
  try {
    const result = await emailService.send({ to: donorEmail, subject, html });
    if (result.success) {
      console.log(`[VIP Receipt] Sent monthly receipt to ${donorEmail} for tenant ${tenant.id}`);
    } else {
      console.warn(`[VIP Receipt] Email send returned failure: ${result.error}`);
    }
  } catch (err) {
    console.error('[VIP Receipt] Failed to send monthly receipt email:', err);
  }
}
