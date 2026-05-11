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

export interface VipBackfillWelcomeEmailParams {
  tenant: VipEmailTenant;
  donorEmail: string;
  donorName: string;
  tierId: string | null;
  tierName: string | null;
  monthlyAmountCents: number;
  currency?: string;
  /** When this donor's monthly subscription originally started. */
  memberSince: Date;
  fallbackOrigin: string;
}

/**
 * Retroactive VIP welcome — sent to monthly donors who were silently promoted
 * into a VIP tier by the backfill (Task #58). Different copy from the
 * standard welcome: it acknowledges they've already been giving for a while
 * and were grandfathered in, rather than thanking them for "becoming" a VIP.
 * Includes a CTA to opt onto the public Wall of Heroes from giving history.
 */
export async function sendVipBackfillWelcomeEmail(
  params: VipBackfillWelcomeEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const { tenant, donorEmail, donorName } = params;
  if (!donorEmail) return { success: false, error: 'Missing donor email' };

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    const msg = `No EmailService configured for tenant ${tenant.id}`;
    console.warn(`[VIP Backfill Welcome] ${msg}`);
    return { success: false, error: msg };
  }

  const tangibleImpact = await lookupTangibleImpact(tenant.id, params.tierId);

  const safeDonor = escapeHtml(donorName || 'Friend');
  const safeTenant = escapeHtml(tenant.name);
  const safeTier = escapeHtml(params.tierName || 'VIP Donor');
  const amountFormatted = formatCurrencyCents(params.monthlyAmountCents, params.currency);
  const memberSinceFormatted = params.memberSince.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
  const safeImpact = escapeHtml(tangibleImpact || '');
  const baseUrl = buildBaseUrl(tenant, params.fallbackOrigin);
  const givingHistoryUrl = `${baseUrl}/vip-club#giving-history`;
  const safeGivingHistoryUrl = escapeHtml(givingHistoryUrl);

  const impactBlock = safeImpact
    ? `<div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 0; font-size: 14px; color: #065f46;"><strong>Your monthly impact:</strong></p>
        <p style="margin: 6px 0 0 0; font-size: 15px; color: #064e3b;">${safeImpact}</p>
      </div>`
    : '';

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <h2 style="color: #2563eb; margin-bottom: 8px;">You're officially a ${safeTier}, ${safeDonor}.</h2>
  <p style="margin-top: 0;">You've been quietly powering ${safeTenant} as a sustaining monthly donor since <strong>${escapeHtml(memberSinceFormatted)}</strong> &mdash; long before we launched our VIP Donor Club. We just rolled out donor tiers, and because of your existing monthly gift, we've grandfathered you in as one of our founding <strong>${safeTier}</strong> members. No action needed on your part; we just wanted to say thank you, properly.</p>

  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 4px 0;"><strong>Tier:</strong> ${safeTier}</p>
    <p style="margin: 4px 0;"><strong>Monthly amount:</strong> ${amountFormatted}</p>
    <p style="margin: 4px 0;"><strong>Sustaining donor since:</strong> ${escapeHtml(memberSinceFormatted)}</p>
  </div>

  ${impactBlock}

  <p>You can now see your tier badge, full giving history, and download annual tax summaries from your VIP Club page:</p>
  <p style="text-align: center; margin: 20px 0;">
    <a href="${safeGivingHistoryUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 600;">View your giving history</a>
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

  <h3 style="margin: 0 0 8px 0; font-size: 16px;">Want to be celebrated publicly?</h3>
  <p style="margin: 4px 0 12px 0;">Founding donors like you are the reason we can keep saying yes to animals in need. If you'd like, you can add your first name to our public <strong>Wall of Heroes</strong> so other supporters can see what's possible. It's totally optional &mdash; you can opt in (or back out) anytime from your giving history page.</p>
  <p style="text-align: center; margin: 16px 0 0 0;">
    <a href="${safeGivingHistoryUrl}" style="display: inline-block; background: #ffffff; color: #2563eb; border: 1px solid #2563eb; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Add me to the Wall of Heroes</a>
  </p>

  <p style="font-size: 13px; color: #6b7280; margin-top: 28px;">Thank you for being one of the donors who showed up before there was any badge attached. We're lucky to have you.</p>
</div>
`.trim();

  const subject = `You've been a sustaining donor since ${memberSinceFormatted} — welcome to the VIP Club, ${safeDonor}`;
  try {
    const result = await emailService.send({ to: donorEmail, subject, html });
    if (result.success) {
      console.log(`[VIP Backfill Welcome] Sent to ${donorEmail} for tenant ${tenant.id}`);
      return { success: true };
    }
    console.warn(`[VIP Backfill Welcome] Email send returned failure: ${result.error}`);
    return { success: false, error: result.error || 'Email send failed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[VIP Backfill Welcome] Failed to send:', err);
    return { success: false, error: message };
  }
}

export interface VipRecognitionNameRequestEmailParams {
  tenant: VipEmailTenant;
  donorEmail: string;
  donorName: string;
  tierName: string | null;
  /** What we'd display on the Wall today if they take no action — typically
   *  "First L." derived from the donor's name. */
  fallbackWallName: string;
  fallbackOrigin: string;
}

/**
 * One-shot invitation to grandfathered VIP donors who have no recognition
 * (display) name saved on their subscription. Asks them to confirm the
 * fallback "First L." or customize it (couples, families, business names,
 * memorials, etc.). Deep-links into the VIP portal's giving-history section
 * where the Wall of Heroes opt-in / display-name editor lives. Task #73.
 */
export async function sendVipRecognitionNameRequestEmail(
  params: VipRecognitionNameRequestEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const { tenant, donorEmail, donorName } = params;
  if (!donorEmail) return { success: false, error: 'Missing donor email' };

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    const msg = `No EmailService configured for tenant ${tenant.id}`;
    console.warn(`[VIP Recognition Name] ${msg}`);
    return { success: false, error: msg };
  }

  const safeDonor = escapeHtml(donorName || 'Friend');
  const safeTenant = escapeHtml(tenant.name);
  const safeTier = escapeHtml(params.tierName || 'VIP Donor');
  const safeFallback = escapeHtml(params.fallbackWallName || 'Anonymous');
  const baseUrl = buildBaseUrl(tenant, params.fallbackOrigin);
  const givingHistoryUrl = `${baseUrl}/vip-club#giving-history`;
  const safeGivingHistoryUrl = escapeHtml(givingHistoryUrl);

  const optInBlock = `<p style="margin: 8px 0;">You're already opted in to our public Wall of Heroes, and we're currently displaying your name as <strong>${safeFallback}</strong>. If that's perfect, you don't have to do anything &mdash; but many founding donors prefer a family name (e.g., "The Garcia Family"), a business, or a memorial dedication ("In memory of Buddy"). You can update it in one click.</p>`;

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <h2 style="color: #2563eb; margin-bottom: 8px;">How should we recognize you, ${safeDonor}?</h2>
  <p style="margin-top: 0;">You're one of our founding <strong>${safeTier}</strong> members at ${safeTenant} &mdash; thank you. When we built the public Wall of Heroes, we didn't have a "how should we list you?" field yet, so we don't have one saved for you.</p>

  ${optInBlock}

  <p style="text-align: center; margin: 22px 0;">
    <a href="${safeGivingHistoryUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 600;">Set my recognition name</a>
  </p>

  <p style="font-size: 13px; color: #6b7280; margin-top: 24px;">No pressure &mdash; this is optional. If you don't update anything, we'll keep showing <strong>${safeFallback}</strong> (only if you've opted in to the Wall). You can change it anytime from your VIP Club page.</p>
</div>
`.trim();

  const subject = `How should we list you on the Wall of Heroes, ${safeDonor}?`;
  try {
    const result = await emailService.send({ to: donorEmail, subject, html });
    if (result.success) {
      console.log(`[VIP Recognition Name] Sent to ${donorEmail} for tenant ${tenant.id}`);
      return { success: true };
    }
    console.warn(`[VIP Recognition Name] Email send returned failure: ${result.error}`);
    return { success: false, error: result.error || 'Email send failed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[VIP Recognition Name] Failed to send:', err);
    return { success: false, error: message };
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
  /** Friendly reason from Stripe (e.g. "Your card has expired."). Optional. */
  failureReason?: string | null;
  /** Stripe will not retry again — this is the donor's last chance to update
   *  the card before the subscription is canceled. When true the email uses
   *  more urgent "final reminder" copy. */
  isFinalAttempt?: boolean;
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
  const isReminder = (params.attemptNumber ?? 0) > 1;
  const isFinal = !!params.isFinalAttempt;

  const attempt = isReminder
    ? `<p style="margin: 4px 0; color: #6b7280; font-size: 13px;">This is attempt #${params.attemptNumber}${isFinal ? ' &mdash; the final automatic retry before your subscription is canceled.' : '.'}</p>`
    : '';

  let retryNote: string;
  if (isFinal) {
    retryNote = `<p style="margin: 8px 0 0 0; font-size: 14px; color: #7f1d1d;"><strong>This was our last automatic retry.</strong> If we don't have a working card on file soon, your monthly subscription will be canceled and you'll drop off our VIP roster. Please update your payment method today to keep your support flowing.</p>`;
  } else if (params.nextRetryAt) {
    retryNote = `<p style="margin: 8px 0 0 0; font-size: 14px; color: #92400e;">We'll automatically try again on <strong>${escapeHtml(params.nextRetryAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</strong>. To avoid any interruption to your monthly support, please update your card now.</p>`;
  } else {
    retryNote = `<p style="margin: 8px 0 0 0; font-size: 14px; color: #92400e;">To avoid any interruption to your monthly support, please update your card.</p>`;
  }

  const invoiceLine = safeInvoiceUrl
    ? `<p style="margin: 12px 0 0 0; font-size: 13px;"><a href="${safeInvoiceUrl}" style="color: #2563eb;">View this invoice on Stripe →</a></p>`
    : '';

  const safeReason = params.failureReason ? escapeHtml(params.failureReason) : null;
  const reasonBlock = safeReason
    ? `<p style="margin: 4px 0 0 0; font-size: 14px; color: #92400e;"><strong>What the bank told us:</strong> ${safeReason}</p>`
    : '';

  const heading = isFinal
    ? `Last chance: your ${safeTier} subscription is about to be canceled`
    : isReminder
      ? `Reminder: your monthly gift still hasn't gone through`
      : `Your monthly gift didn't go through`;

  const headingColor = isFinal ? '#7f1d1d' : '#b91c1c';

  const intro = isReminder
    ? `Hi ${safeDonor}, we tried again to process your <strong>${safeTier}</strong> payment of <strong>${amountFormatted}</strong> to ${safeTenant}, but the card on file is still being declined.`
    : `Hi ${safeDonor}, your most recent <strong>${safeTier}</strong> payment of <strong>${amountFormatted}</strong> to ${safeTenant} couldn't be processed.`;

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <h2 style="color: ${headingColor}; margin-bottom: 8px;">${heading}</h2>
  <p style="margin-top: 0;">${intro}</p>
  ${attempt}

  <div style="background: ${isFinal ? '#fef2f2' : '#fffbeb'}; border-left: 4px solid ${isFinal ? '#dc2626' : '#f59e0b'}; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
    ${reasonBlock}
    <p style="margin: ${reasonBlock ? '12px' : '0'} 0 0 0; font-weight: 600; color: ${isFinal ? '#7f1d1d' : '#92400e'};">Common reasons cards fail:</p>
    <ul style="margin: 8px 0 0 0; padding-left: 20px; color: ${isFinal ? '#7f1d1d' : '#92400e'}; font-size: 14px;">
      <li>The card has expired</li>
      <li>Insufficient funds</li>
      <li>The bank flagged it as suspicious</li>
      <li>The billing address changed</li>
    </ul>
    ${retryNote}
  </div>

  <p style="text-align: center; margin: 24px 0;">
    <a href="${safeManageUrl}" style="display: inline-block; background: ${isFinal ? '#dc2626' : '#2563eb'}; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 600;">Update your payment method</a>
  </p>

  ${invoiceLine}

  <p style="font-size: 14px; color: #4b5563;">Thank you for your continued support of the animals in our care &mdash; we couldn't do this work without you.</p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="font-size: 12px; color: #6b7280;">If you've already updated your card or believe this is an error, please disregard this message.</p>
</div>
`.trim();

  const subject = isFinal
    ? `[Last chance] Update your card to keep your ${safeTier} gift to ${tenant.name} active`
    : isReminder
      ? `Reminder: your ${safeTier} gift to ${tenant.name} still needs a working card`
      : `Action needed: your ${safeTier} gift to ${tenant.name} didn't go through`;
  try {
    const result = await emailService.send({ to: donorEmail, subject, html });
    if (result.success) {
      console.log(`[VIP PaymentFailed] Sent card-failure email to ${donorEmail} for tenant ${tenant.id} (attempt=${params.attemptNumber ?? 1}, final=${isFinal})`);
    } else {
      console.warn(`[VIP PaymentFailed] Email send returned failure: ${result.error}`);
    }
  } catch (err) {
    console.error('[VIP PaymentFailed] Failed to send card-failure email:', err);
  }
}

/**
 * Tasteful "in memory of / in honor of" acknowledgment email — Task #198.
 * Notifies a family member or friend that a donation was made in their loved
 * one's name. NEVER reveals the donation amount.
 */
export async function sendDonationTributeAcknowledgmentEmail(params: {
  tenant: VipEmailTenant;
  donationId: string;
  recipientEmail: string;
  recipientName?: string;
  donorName?: string | null;
  honoreeName: string;
  kind: 'memory' | 'honor';
  personalMessage?: string;
  fallbackOrigin: string;
}): Promise<void> {
  const { tenant, recipientEmail, recipientName, donorName, honoreeName, kind, personalMessage } = params;
  if (!recipientEmail || !honoreeName) return;

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    console.warn(`[Tribute Ack] No EmailService configured for tenant ${tenant.id}`);
    return;
  }

  const safeRecipient = escapeHtml(recipientName || 'Friend');
  const safeDonor = escapeHtml(donorName || 'A friend');
  const safeHonoree = escapeHtml(honoreeName);
  const safeTenant = escapeHtml(tenant.name);
  const safeMessage = escapeHtml(personalMessage || '');
  const phrase = kind === 'memory' ? 'in loving memory of' : 'in honor of';
  const subject = kind === 'memory'
    ? `A gift was made in loving memory of ${honoreeName}`
    : `A gift was made in honor of ${honoreeName}`;
  const rescueUrl = buildBaseUrl(tenant, params.fallbackOrigin);
  const safeRescueUrl = escapeHtml(rescueUrl);

  const html = `
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
  <p style="font-size: 16px;">Dear ${safeRecipient},</p>
  <p style="font-size: 15px; line-height: 1.7;">
    We wanted you to know that <strong>${safeDonor}</strong> recently made a donation to
    <a href="${safeRescueUrl}" style="color: #2563eb; text-decoration: underline;">${safeTenant}</a>
    ${phrase} <strong>${safeHonoree}</strong>.
  </p>
  ${safeMessage ? `
  <div style="margin: 20px 0; padding: 16px 20px; border-left: 3px solid #d1d5db; background: #f9fafb; font-style: italic; line-height: 1.6;">
    &ldquo;${safeMessage}&rdquo;
  </div>` : ''}
  <p style="font-size: 15px; line-height: 1.7;">
    Their thoughtful gift will help care for animals in need &mdash; a quiet, lasting tribute to ${safeHonoree}.
  </p>
  <p style="text-align: center; margin: 24px 0;">
    <a href="${safeRescueUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-family: Arial, sans-serif; font-size: 14px;">Visit ${safeTenant}</a>
  </p>
  <p style="font-size: 15px; line-height: 1.7;">
    With gratitude,<br/>
    <strong>The ${safeTenant} family</strong>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="font-size: 11px; color: #9ca3af; line-height: 1.5;">
    This message was sent because someone designated you as a person to notify of a tribute gift. We never share donation amounts.
  </p>
</div>`.trim();

  try {
    const result = await emailService.send({ to: recipientEmail, subject, html });
    if (result.success) {
      console.log(`[Tribute Ack] Sent acknowledgment to ${recipientEmail} for donation ${params.donationId}`);
    } else {
      console.warn(`[Tribute Ack] Email send returned failure: ${result.error}`);
    }
  } catch (err) {
    console.error('[Tribute Ack] Failed to send acknowledgment email:', err);
    throw err;
  }
}
