/**
 * Public engagement-tracking endpoints for heartworm compliance warnings
 * (Task #140).
 *
 * These routes are deliberately UNAUTHENTICATED — they are hit by adopters'
 * email clients (the open-tracking pixel) and by clicking the upload link in
 * the warning email. They only stamp `email_opened_at` / `link_clicked_at`
 * on the matching warning row and never expose any data back to the caller.
 *
 * Both endpoints are idempotent first-write only: they only write the
 * timestamp if it is currently NULL. Subsequent opens / clicks are silently
 * ignored so we capture a clean "first interaction" timestamp.
 */
import { Router } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db';
import { adopterComplianceWarnings, tenants, animals } from '@shared/schema';
import { buildAdopterPortalUrl } from '../lib/adopter-compliance-warnings';

const router = Router();

// 1x1 transparent GIF — minimum-size payload to keep email clients happy.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sendPixel(res: any) {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', String(TRANSPARENT_GIF.length));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).end(TRANSPARENT_GIF);
}

// GET /api/heartworm-tracking/open/:warningId.gif
// Stamps email_opened_at on first hit, then always returns the 1x1 pixel.
router.get('/open/:warningIdGif', async (req, res) => {
  // Strip the .gif suffix the email client expects (helps anti-spam filters
  // treat the request like a legitimate image fetch).
  const raw = String(req.params.warningIdGif || '');
  const warningId = raw.endsWith('.gif') ? raw.slice(0, -4) : raw;

  if (!UUID_REGEX.test(warningId)) {
    // Always serve the pixel anyway so the email never shows a broken-image
    // icon to the adopter. We just don't write anything.
    return sendPixel(res);
  }

  try {
    await db
      .update(adopterComplianceWarnings)
      .set({ emailOpenedAt: new Date() })
      .where(and(
        eq(adopterComplianceWarnings.id, warningId),
        isNull(adopterComplianceWarnings.emailOpenedAt),
      ));
  } catch (err) {
    // Never let a tracking failure surface to the adopter — log and serve.
    console.error('[HeartwormTracking] open stamp failed:', err);
  }

  sendPixel(res);
});

// GET /api/heartworm-tracking/click/:warningId
// Stamps link_clicked_at on first hit, then redirects to the adopter portal.
// If the warning row can't be found we still 302 to the app root so the
// adopter never sees a confusing error page.
router.get('/click/:warningId', async (req, res) => {
  const warningId = String(req.params.warningId || '');

  const fallback = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_BASE_URL || 'https://irescue.life');

  if (!UUID_REGEX.test(warningId)) {
    return res.redirect(302, fallback);
  }

  try {
    const [row] = await db
      .select({
        id: adopterComplianceWarnings.id,
        animalId: adopterComplianceWarnings.animalId,
        tenantId: adopterComplianceWarnings.tenantId,
        linkClickedAt: adopterComplianceWarnings.linkClickedAt,
      })
      .from(adopterComplianceWarnings)
      .where(eq(adopterComplianceWarnings.id, warningId))
      .limit(1);

    if (!row) {
      return res.redirect(302, fallback);
    }

    if (!row.linkClickedAt) {
      try {
        await db
          .update(adopterComplianceWarnings)
          .set({ linkClickedAt: new Date() })
          .where(and(
            eq(adopterComplianceWarnings.id, warningId),
            isNull(adopterComplianceWarnings.linkClickedAt),
          ));
      } catch (err) {
        console.error('[HeartwormTracking] click stamp failed:', err);
      }
    }

    // Resolve the adopter portal URL fresh from the tenant + animal so we
    // don't have to trust any user-supplied target query param (avoids
    // turning this into an open-redirect endpoint).
    const [tenant] = await db
      .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain })
      .from(tenants)
      .where(eq(tenants.id, row.tenantId))
      .limit(1);

    // Verify the animal still exists in this tenant before redirecting.
    const [animal] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.id, row.animalId), eq(animals.tenantId, row.tenantId)))
      .limit(1);

    if (!tenant || !animal) {
      return res.redirect(302, fallback);
    }

    return res.redirect(302, buildAdopterPortalUrl(tenant, row.animalId));
  } catch (err) {
    console.error('[HeartwormTracking] click handler failed:', err);
    return res.redirect(302, fallback);
  }
});

export default router;
