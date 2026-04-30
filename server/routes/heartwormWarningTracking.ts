/**
 * Public engagement tracking endpoints for adopter heartworm-warning emails
 * (Task #140).
 *
 * These endpoints are intentionally PUBLIC (no auth, no tenant header):
 *   - The token in the URL is a 128-bit random string scoped to a single
 *     warning row, and possessing it is the proof of access. Email clients
 *     fetch the pixel without any session, so we cannot demand auth here.
 *   - Neither endpoint reveals PII; the pixel just records a timestamp and
 *     returns an empty GIF, the click endpoint records a timestamp and
 *     redirects to the adopter portal (which itself requires the adopter to
 *     log in).
 *
 * Both timestamps are flipped only on the FIRST hit (subsequent hits are no-ops)
 * so we record genuine first-engagement and do not over-count repeat opens.
 */
import { Router } from 'express';
import { db } from '../db';
import {
  adopterComplianceWarnings,
  tenants,
  animals,
} from '@shared/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { buildAdopterPortalUrl } from '../lib/adopter-compliance-warnings';

const router = Router();

// 1x1 transparent GIF (pre-encoded). Used by the email tracking pixel; we
// always return a 200 + this body so the email client renders nothing visible
// and never retries even when the token is bogus.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function sendPixel(res: import('express').Response): void {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', String(TRANSPARENT_GIF.length));
  // Tell intermediaries not to cache so a re-open from a different device or a
  // forward to a relative still pings us. Email clients (notably Gmail's image
  // proxy) will still cache aggressively but that's outside our control.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).end(TRANSPARENT_GIF);
}

// GET /api/track/heartworm-warning/open/:token.gif
// Records the first email-open and returns a 1x1 transparent GIF. ALWAYS
// returns 200 + the GIF so a stale or malformed token does not surface a
// broken image in the adopter's inbox.
router.get('/open/:tokenWithExt', async (req, res) => {
  try {
    const tokenWithExt = req.params.tokenWithExt || '';
    // Strip optional .gif suffix the email client request will include.
    const token = tokenWithExt.replace(/\.gif$/i, '');
    if (token && token.length <= 64) {
      await db
        .update(adopterComplianceWarnings)
        .set({ emailOpenedAt: sql`NOW()` })
        .where(and(
          eq(adopterComplianceWarnings.trackingToken, token),
          isNull(adopterComplianceWarnings.emailOpenedAt),
        ));
    }
  } catch (err) {
    // Tracking should never break the email — log and still return the pixel.
    console.error('[heartworm-warning tracking] open handler failed:', err);
  }
  sendPixel(res);
});

// GET /api/track/heartworm-warning/click/:token
// Records the first link-click and 302-redirects to the rebuilt adopter portal
// URL. If the token is unknown we redirect to the marketing home so the user
// is never left at a broken page.
router.get('/click/:token', async (req, res) => {
  const token = (req.params.token || '').trim();
  if (!token || token.length > 64) {
    return res.redirect(302, '/');
  }

  try {
    const [warning] = await db
      .select({
        id: adopterComplianceWarnings.id,
        tenantId: adopterComplianceWarnings.tenantId,
        animalId: adopterComplianceWarnings.animalId,
        linkClickedAt: adopterComplianceWarnings.linkClickedAt,
      })
      .from(adopterComplianceWarnings)
      .where(eq(adopterComplianceWarnings.trackingToken, token))
      .limit(1);

    if (!warning) {
      return res.redirect(302, '/');
    }

    if (!warning.linkClickedAt) {
      await db
        .update(adopterComplianceWarnings)
        .set({ linkClickedAt: sql`NOW()` })
        .where(and(
          eq(adopterComplianceWarnings.id, warning.id),
          isNull(adopterComplianceWarnings.linkClickedAt),
        ));
    }

    const [tenant] = await db
      .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain })
      .from(tenants)
      .where(eq(tenants.id, warning.tenantId))
      .limit(1);
    const [animal] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(eq(animals.id, warning.animalId))
      .limit(1);

    if (!tenant || !animal) {
      return res.redirect(302, '/');
    }

    const portalUrl = buildAdopterPortalUrl(
      { subdomain: tenant.subdomain, customDomain: tenant.customDomain },
      warning.animalId,
    );
    return res.redirect(302, portalUrl);
  } catch (err) {
    console.error('[heartworm-warning tracking] click handler failed:', err);
    return res.redirect(302, '/');
  }
});

export default router;
