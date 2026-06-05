import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';

type Middleware = (req: Request, res: Response, next: NextFunction) => any;

export interface ReceiptSignatureRouteDeps {
  requireTenant: Middleware;
  requireAuth: Middleware;
  requireRole: (...roles: string[]) => Middleware;
}

/**
 * Registers the tenant-level "authorized signature on file" routes used to
 * stamp every donation-receipt PDF (Task #240).
 *
 * Extracted into its own registration function (taking the auth/tenant
 * middleware as dependencies) so the handlers can be mounted on a throwaway
 * Express app in tests without booting the full server.
 */
export function registerReceiptSignatureRoutes(app: Express, deps: ReceiptSignatureRouteDeps) {
  const { requireTenant, requireAuth, requireRole } = deps;

  /**
   * PUT /api/tenant/settings/receipt-signature
   * Save the organization's authorized signature for donation receipts (admin only).
   * The signature is stored once at the tenant level and stamped onto every receipt PDF.
   * A new base64 signature is optional — when omitted, only the signer name/title are
   * updated (an existing saved signature is required so we never store a name without an image).
   */
  app.put('/api/tenant/settings/receipt-signature', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const bodySchema = z.object({
        signature: z.string().optional().nullable(),
        name: z.string().max(120).optional().nullable(),
        title: z.string().max(120).optional().nullable(),
      });
      const { signature, name, title } = bodySchema.parse(req.body);

      const updates: Record<string, any> = {
        receiptSignatureName: name && name.trim() ? name.trim() : null,
        receiptSignatureTitle: title && title.trim() ? title.trim() : null,
      };

      if (signature) {
        // Strict data-URL validation: reject empty signatures and remote URLs (SSRF
        // risk during image handling), and cap the size before processing.
        const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
        const match = DATA_URL_RE.exec(signature);
        if (!match) {
          return res.status(400).json({ error: 'Invalid signature image format.' });
        }
        const base64 = match[2];
        const approxBytes = Math.floor((base64.length * 3) / 4);
        if (approxBytes > 2 * 1024 * 1024) {
          return res.status(400).json({ error: 'Signature image is too large (max 2MB).' });
        }
        const { processSignatureImage } = await import('../services/contract-pdf');
        const { objectUrl } = await processSignatureImage(signature);
        updates.receiptSignatureUrl = objectUrl;
      } else {
        const [current] = await db
          .select({ url: tenants.receiptSignatureUrl })
          .from(tenants)
          .where(eq(tenants.id, req.tenant!.id));
        if (!current?.url) {
          return res.status(400).json({ error: 'Please draw a signature before saving.' });
        }
      }

      const [updatedTenant] = await db
        .update(tenants)
        .set(updates)
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/tenant/settings/receipt-signature
   * Clear the organization's saved receipt signature (admin only).
   */
  app.delete('/api/tenant/settings/receipt-signature', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const [updatedTenant] = await db
        .update(tenants)
        .set({
          receiptSignatureUrl: null,
          receiptSignatureName: null,
          receiptSignatureTitle: null,
        })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });
}
