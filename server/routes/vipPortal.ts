import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import {
  donors,
  donations,
  payments,
  subscriptions,
  tenants,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { EmailService } from '../lib/email-service';

const router = Router();

const TOKEN_EXPIRY_HOURS = 24;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Fail closed: never sign or verify VIP donor billing access tokens with a
    // weak/missing secret. Env validation also enforces SESSION_SECRET, so this
    // path should be unreachable in a properly configured environment.
    throw new Error('VIP portal token secret is not configured (SESSION_SECRET must be set and >= 32 chars)');
  }
  return secret;
}

function getAppBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return process.env.APP_BASE_URL || 'https://irescue.life';
}

function buildVipPortalUrl(tenant: { subdomain: string | null; customDomain: string | null }, token: string): string {
  const tenantPath = tenant.customDomain ? '' : (tenant.subdomain ? `/${tenant.subdomain}` : '');
  const base = tenant.customDomain ? `https://${tenant.customDomain}` : getAppBaseUrl();
  return `${base}${tenantPath}/vip-club?vipToken=${encodeURIComponent(token)}`;
}

function signVipToken(donorId: string, tenantId: string): string {
  const exp = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const payload = `${donorId}.${tenantId}.${exp}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyVipToken(token: string, tenantId: string): { donorId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 4) return null;
    const [donorId, tokTenantId, expStr, sig] = parts;
    if (tokTenantId !== tenantId) return null;
    const exp = parseInt(expStr, 10);
    if (!exp || exp < Date.now()) return null;
    const payload = `${donorId}.${tokTenantId}.${expStr}`;
    const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    return { donorId };
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const t = (req.query.token || req.query.vipToken) as string | undefined;
  if (typeof t === 'string' && t.length > 0) return t;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.substring(7);
  return null;
}

async function authVipDonor(req: Request, res: Response): Promise<{ donorId: string; tenantId: string } | null> {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    res.status(400).json({ error: 'Tenant context required' });
    return null;
  }
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Access link required' });
    return null;
  }
  const verified = verifyVipToken(token, tenantId);
  if (!verified) {
    res.status(401).json({ error: 'Invalid or expired access link' });
    return null;
  }
  return { donorId: verified.donorId, tenantId };
}

/**
 * POST /api/vip-portal/request-link
 * Public: Send a magic link to a VIP donor's email letting them view their giving history.
 * Always returns success message to avoid email enumeration.
 */
router.post('/request-link', async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Always respond success to avoid leaking which emails exist
    res.json({ message: 'If a VIP donor account exists for this email, a secure link has been sent.' });

    const [donor] = await db
      .select()
      .from(donors)
      .where(and(
        eq(donors.tenantId, tenantId),
        sql`LOWER(${donors.email}) = ${normalizedEmail}`,
      ))
      .limit(1);

    if (!donor) return;

    // Confirm donor has at least one VIP subscription (recurring tier) to gate access to "VIP" portal
    const [vipSub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.donorId, donor.id),
      ))
      .limit(1);

    if (!vipSub) return;

    const token = signVipToken(donor.id, tenantId);

    const [tenant] = await db
      .select({
        subdomain: tenants.subdomain,
        customDomain: tenants.customDomain,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) return;

    const portalUrl = buildVipPortalUrl(tenant, token);

    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) return;

    await emailService.send({
      to: donor.email,
      subject: `Your Giving History - ${tenant.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Your VIP Giving History</h2>
          <p>Hi ${donor.name},</p>
          <p>Click the button below to view and download your past donation receipts and your annual giving summary.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}"
               style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              View My Giving History
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            This secure link expires in ${TOKEN_EXPIRY_HOURS} hours. If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #9ca3af; font-size: 12px;">Sent by ${tenant.name}</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('[VIP Portal] Error sending magic link:', error);
    // Response already sent above
  }
});

/**
 * GET /api/vip-portal/history?token=...
 * Returns the donor's billing history (past payments) and active subscription summary.
 */
router.get('/history', async (req: Request, res: Response) => {
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  const { donorId, tenantId } = auth;

  try {
    const [donor] = await db
      .select()
      .from(donors)
      .where(and(eq(donors.id, donorId), eq(donors.tenantId, tenantId)))
      .limit(1);

    if (!donor) return res.status(404).json({ error: 'Donor not found' });

    // Pull subscriptions for this donor
    const subs = await db
      .select({
        id: subscriptions.id,
        amount: subscriptions.amount,
        interval: subscriptions.interval,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        canceledAt: subscriptions.canceledAt,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        memberSince: subscriptions.createdAt,
        tierName: subscriptions.vipTierNameSnapshot,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        cardBrand: subscriptions.cardBrand,
        cardLast4: subscriptions.cardLast4,
        cardUpdatedAt: subscriptions.cardUpdatedAt,
        displayOnWallOfHeroes: subscriptions.displayOnWallOfHeroes,
        displayName: subscriptions.displayName,
      })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.donorId, donorId),
      ))
      .orderBy(desc(subscriptions.createdAt));

    // Pull donations for this donor (by donorId or matching email).
    // Donations created by Stripe webhook may set donorId directly.
    const normalizedEmail = donor.email.toLowerCase();
    const donationRows = await db
      .select({
        id: donations.id,
        date: donations.date,
        amount: donations.amount,
        donationType: donations.donationType,
        description: donations.description,
        receiptNumber: donations.receiptNumber,
        receiptSentAt: donations.receiptSentAt,
        isRecurring: donations.isRecurring,
        externalSubscriptionId: donations.externalSubscriptionId,
      })
      .from(donations)
      .where(and(
        eq(donations.tenantId, tenantId),
        sql`(${donations.donorId} = ${donorId} OR LOWER(${donations.donorEmail}) = ${normalizedEmail})`,
      ))
      .orderBy(desc(donations.date));

    // Years available for annual summary (cash-type donations)
    const years = Array.from(new Set(
      donationRows
        .filter(d => d.donationType === 'cash' || d.donationType === 'online' || d.donationType === 'check')
        .map(d => new Date(d.date).getFullYear())
    )).sort((a, b) => b - a);

    // Pending/failed ACH payments not yet in the donations table.
    const pendingPaymentRows = await db
      .select({
        id: payments.id,
        date: payments.createdAt,
        amount: payments.amount,
        status: payments.status,
        isRecurring: payments.isRecurring,
        stripeCheckoutSessionId: payments.stripeCheckoutSessionId,
      })
      .from(payments)
      .where(and(
        eq(payments.tenantId, tenantId),
        eq(payments.donorId, donorId),
        sql`${payments.status} IN ('pending', 'failed')`,
      ))
      .orderBy(desc(payments.createdAt))
      .limit(20);

    // ACH settles in ~4 business days; surface a concrete expected-clear date. Skips weekends (US holidays still
    // approximate; close enough for a donor-facing estimate).
    const addBusinessDays = (start: Date, days: number): Date => {
      const d = new Date(start);
      let added = 0;
      while (added < days) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) added++;
      }
      return d;
    };
    const pendingPaymentsWithEstimate = pendingPaymentRows.map((p) => ({
      ...p,
      expectedClearDate: p.status === 'pending' && p.date
        ? addBusinessDays(p.date instanceof Date ? p.date : new Date(p.date), 4).toISOString()
        : null,
    }));

    res.json({
      donor: {
        name: donor.name,
        email: donor.email,
        totalDonated: donor.totalDonated,
      },
      subscriptions: subs,
      donations: donationRows,
      pendingPayments: pendingPaymentsWithEstimate,
      availableYears: years,
    });
  } catch (error) {
    console.error('[VIP Portal] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to load giving history' });
  }
});

/**
 * POST /api/vip-portal/wall-preferences
 * Body: { optIn: boolean, displayName?: string | null, firstNameDisplay?: string | null (legacy) }
 * Updates ALL of this donor's active subscriptions on this tenant with the new
 * Wall of Heroes opt-in choice and (optional) recognition name. Lets a donor
 * who originally said "no thanks" — or who was auto-tagged as VIP by the
 * monthly-donor backfill — flip their public visibility from their giving
 * history page without having to email staff.
 */
router.post('/wall-preferences', async (req: Request, res: Response) => {
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  const { donorId, tenantId } = auth;

  const body = req.body || {};
  const optIn = body.optIn === true;
  // Accept either the new `displayName` key or the legacy `firstNameDisplay`.
  let displayName: string | null = null;
  const rawName =
    typeof body.displayName === 'string'
      ? body.displayName
      : (typeof body.firstNameDisplay === 'string' ? body.firstNameDisplay : null);
  if (typeof rawName === 'string') {
    const trimmed = rawName.trim().slice(0, 60);
    displayName = trimmed.length > 0 ? trimmed : null;
  }

  try {
    const updated = await db
      .update(subscriptions)
      .set({
        displayOnWallOfHeroes: optIn,
        // When opting out, clear the saved recognition name so re-opt-in goes
        // back to the auto-derived name unless they explicitly type one.
        displayName: optIn ? displayName : null,
      })
      .where(and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.donorId, donorId),
        eq(subscriptions.status, 'active'),
      ))
      .returning({ id: subscriptions.id });

    res.json({
      success: true,
      updatedCount: updated.length,
      optIn,
      displayName: optIn ? displayName : null,
    });
  } catch (error) {
    console.error('[VIP Portal] Error updating wall preferences:', error);
    res.status(500).json({ error: 'Failed to update Wall of Heroes preferences' });
  }
});

/**
 * GET /api/vip-portal/receipt/:donationId?token=...
 * Stream a PDF receipt for a single donation. Token must belong to the same donor.
 */
router.get('/receipt/:donationId', async (req: Request, res: Response) => {
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  const { donorId, tenantId } = auth;

  try {
    const [donor] = await db
      .select({ email: donors.email })
      .from(donors)
      .where(and(eq(donors.id, donorId), eq(donors.tenantId, tenantId)))
      .limit(1);
    if (!donor) return res.status(404).json({ error: 'Donor not found' });

    const [donation] = await db
      .select()
      .from(donations)
      .where(and(
        eq(donations.id, req.params.donationId),
        eq(donations.tenantId, tenantId),
      ))
      .limit(1);

    if (!donation) return res.status(404).json({ error: 'Donation not found' });

    // Authorize: donation must belong to donor (by donorId or matching email)
    const donorEmailLower = donor.email.toLowerCase();
    if (donation.donorId !== donorId && (donation.donorEmail || '').toLowerCase() !== donorEmailLower) {
      return res.status(403).json({ error: 'You do not have access to this receipt' });
    }

    const { generateDonationReceipt } = await import('../services/donation-receipt-service');
    const result = await generateDonationReceipt({
      donationId: donation.id,
      tenantId,
    });

    if (!result.success || !result.pdfBuffer) {
      return res.status(400).json({ error: result.message || 'Could not generate receipt' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt_${result.receiptNumber}.pdf"`);
    res.send(result.pdfBuffer);
  } catch (error) {
    console.error('[VIP Portal] Error generating receipt:', error);
    res.status(500).json({ error: 'Failed to generate receipt' });
  }
});

/**
 * GET /api/vip-portal/annual-summary/:year?token=...
 * Stream a PDF annual giving summary for the donor for the given year.
 */
router.get('/annual-summary/:year', async (req: Request, res: Response) => {
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  const { donorId, tenantId } = auth;

  const year = parseInt(req.params.year, 10);
  if (!year || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  try {
    const [donor] = await db
      .select()
      .from(donors)
      .where(and(eq(donors.id, donorId), eq(donors.tenantId, tenantId)))
      .limit(1);
    if (!donor) return res.status(404).json({ error: 'Donor not found' });

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);
    const donorEmailLower = donor.email.toLowerCase();

    const yearDonations = await db
      .select()
      .from(donations)
      .where(and(
        eq(donations.tenantId, tenantId),
        sql`(${donations.donorId} = ${donorId} OR LOWER(${donations.donorEmail}) = ${donorEmailLower})`,
        sql`${donations.date} >= ${startDate}`,
        sql`${donations.date} < ${endDate}`,
      ));

    const cashDonations = yearDonations.filter(d => {
      const t = (d.donationType || 'cash');
      return t === 'cash' || t === 'online' || t === 'check';
    });

    if (cashDonations.length === 0) {
      return res.status(404).json({ error: `No donations found for ${year}` });
    }

    const totalAmount = cashDonations.reduce((sum, d) => {
      const amt = typeof d.amount === 'string' ? parseInt(d.amount, 10) : (d.amount || 0);
      return sum + amt;
    }, 0);

    const eligibleDonor = {
      donorName: donor.name,
      donorEmail: donor.email,
      donorAddress: cashDonations[0]?.donorAddress || null,
      totalAmount,
      donationCount: cashDonations.length,
      donations: cashDonations
        .map(d => ({
          id: d.id,
          date: d.date,
          amount: typeof d.amount === 'string' ? parseInt(d.amount, 10) : (d.amount || 0),
          donationType: d.donationType || 'cash',
          description: d.description,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    };

    const { generateAnnualSummaryPdf } = await import('../services/annual-giving-summary-service');
    const result = await generateAnnualSummaryPdf(tenantId, eligibleDonor, year);

    if (!result.success || !result.pdfBuffer) {
      return res.status(500).json({ error: result.message || 'Could not generate summary' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Annual_Giving_Summary_${year}.pdf"`);
    res.send(result.pdfBuffer);
  } catch (error) {
    console.error('[VIP Portal] Error generating annual summary:', error);
    res.status(500).json({ error: 'Failed to generate annual summary' });
  }
});

/**
 * POST /api/vip-portal/billing-portal
 * Body: { subscriptionId: string, returnUrl?: string }
 * Returns: { url } — a Stripe Customer Portal session URL where the donor can
 * update their payment method or cancel the subscription self-serve.
 *
 * Gated by the same magic-link token used for the other VIP portal endpoints.
 */
router.post('/billing-portal', async (req: Request, res: Response) => {
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  const { donorId, tenantId } = auth;

  const { subscriptionId, returnUrl } = (req.body || {}) as {
    subscriptionId?: string;
    returnUrl?: string;
  };

  if (!subscriptionId || typeof subscriptionId !== 'string') {
    return res.status(400).json({ error: 'subscriptionId is required' });
  }

  try {
    const [donor] = await db
      .select({ stripeCustomerId: donors.stripeCustomerId })
      .from(donors)
      .where(and(eq(donors.id, donorId), eq(donors.tenantId, tenantId)))
      .limit(1);
    if (!donor) return res.status(404).json({ error: 'Donor not found' });
    if (!donor.stripeCustomerId) {
      return res.status(400).json({
        error: 'No billing account is linked to this donor record yet. Please contact the rescue.',
      });
    }

    // Confirm the subscription belongs to this donor on this tenant.
    const [sub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.donorId, donorId),
      ))
      .limit(1);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    // Build the default (safe) return URL anchored to this tenant's own
    // /vip-club page. Only honor a client-supplied returnUrl when its origin
    // matches one of this tenant's allowed origins — otherwise we'd give the
    // Stripe-hosted portal an open-redirect back into our app.
    const tenantPath = tenant.customDomain ? '' : (tenant.subdomain ? `/${tenant.subdomain}` : '');
    const defaultBase = tenant.customDomain ? `https://${tenant.customDomain}` : getAppBaseUrl();
    const defaultReturnUrl = `${defaultBase}${tenantPath}/vip-club?from_portal=1#giving-history`;

    const allowedOrigins = new Set<string>();
    try { allowedOrigins.add(new URL(getAppBaseUrl()).origin); } catch {}
    if (tenant.customDomain) {
      try { allowedOrigins.add(new URL(`https://${tenant.customDomain}`).origin); } catch {}
    }

    // Always tag the return URL with from_portal=1 so the giving-history page
    // can detect the round-trip from Stripe and bridge the few-second gap
    // before the customer.subscription.updated webhook lands.
    const safeReturnUrl = (() => {
      if (typeof returnUrl === 'string') {
        try {
          const u = new URL(returnUrl);
          if ((u.protocol === 'http:' || u.protocol === 'https:') && allowedOrigins.has(u.origin)) {
            u.searchParams.set('from_portal', '1');
            return u.toString();
          }
        } catch {}
      }
      return defaultReturnUrl;
    })();

    const { stripeService } = await import('../lib/stripe-service');
    const session = await stripeService.createDonorBillingPortalSession(tenant, {
      customerId: donor.stripeCustomerId,
      returnUrl: safeReturnUrl,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('[VIP Portal] Error creating billing portal session:', error);
    res.status(500).json({ error: error?.message || 'Failed to open billing portal' });
  }
});

/**
 * PATCH /api/vip-portal/subscriptions/:id/wall-of-heroes
 * Body: { displayOnWallOfHeroes: boolean, displayName?: string | null, firstNameDisplay?: string | null (legacy) }
 * Update the donor's Wall of Heroes opt-in for one of their own subscriptions.
 */
router.patch('/subscriptions/:id/wall-of-heroes', async (req: Request, res: Response) => {
  const auth = await authVipDonor(req, res);
  if (!auth) return;
  const { donorId, tenantId } = auth;

  const bodySchema = z.object({
    displayOnWallOfHeroes: z.boolean(),
    displayName: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .optional(),
    // Legacy alias accepted so older clients in the wild don't 400.
    firstNameDisplay: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : (v === null || v.length === 0 ? null : v))),
  });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const [existing] = await db
      .select({
        id: subscriptions.id,
        displayOnWallOfHeroes: subscriptions.displayOnWallOfHeroes,
        displayName: subscriptions.displayName,
      })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.id, req.params.id),
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.donorId, donorId),
      ))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Subscription not found' });

    // Prefer the new `displayName` key, then the legacy alias, then keep the
    // existing stored value if neither was supplied. When opting out, clear.
    const incomingName =
      parsed.displayName !== undefined
        ? parsed.displayName
        : (parsed.firstNameDisplay !== undefined ? parsed.firstNameDisplay : undefined);
    const nextDisplayName = parsed.displayOnWallOfHeroes
      ? (incomingName !== undefined ? incomingName : existing.displayName)
      : null;

    await db
      .update(subscriptions)
      .set({
        displayOnWallOfHeroes: parsed.displayOnWallOfHeroes,
        displayName: nextDisplayName,
      })
      .where(and(
        eq(subscriptions.id, existing.id),
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.donorId, donorId),
      ));

    // Donor self-serve action: log to console for traceability. The
    // audit_logs table requires a real user.id, which donors don't have, so
    // we use the same console-based pattern as other VIP-portal donor
    // actions (billing portal, receipt downloads, etc).
    console.log('[VIP Portal Audit] wall_of_heroes.update', {
      tenantId,
      donorId,
      subscriptionId: existing.id,
      before: {
        displayOnWallOfHeroes: existing.displayOnWallOfHeroes,
        displayName: existing.displayName,
      },
      after: {
        displayOnWallOfHeroes: parsed.displayOnWallOfHeroes,
        displayName: nextDisplayName,
      },
      ipAddress: (req.get('x-forwarded-for') || '').split(',')[0].trim() || req.socket.remoteAddress,
    });

    res.json({
      success: true,
      subscription: {
        id: existing.id,
        displayOnWallOfHeroes: parsed.displayOnWallOfHeroes,
        displayName: nextDisplayName,
      },
    });
  } catch (error) {
    console.error('[VIP Portal] Error updating wall opt-in:', error);
    res.status(500).json({ error: 'Failed to update Wall of Heroes preference' });
  }
});

export default router;
