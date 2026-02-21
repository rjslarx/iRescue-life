import { Router } from 'express';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { db } from '../db';
import { animals, vaccineRecords, preventativeCareRecords, users, transportEvents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import archiver from 'archiver';

const router = Router();

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

router.get(
  '/api/settings/export-data',
  requireTenant,
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;
      console.log(`[Export] Starting full data export for tenant ${tenantId} by user ${req.user!.id}`);

      const [animalRows, vaccineRows, preventativeCareRows, userRows, transportRows] =
        await Promise.all([
          db.select().from(animals).where(eq(animals.tenantId, tenantId)),
          db.select().from(vaccineRecords).where(eq(vaccineRecords.tenantId, tenantId)),
          db.select().from(preventativeCareRecords).where(eq(preventativeCareRecords.tenantId, tenantId)),
          db
            .select({
              id: users.id,
              email: users.email,
              fullName: users.fullName,
              phone: users.phone,
              roles: users.roles,
              isActive: users.isActive,
              fosterStatus: users.fosterStatus,
              hasCats: users.hasCats,
              hasKids: users.hasKids,
              hasFencedYard: users.hasFencedYard,
              sizePreference: users.sizePreference,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.tenantId, tenantId)),
          db.select().from(transportEvents).where(eq(transportEvents.tenantId, tenantId)),
        ]);

      console.log(
        `[Export] Data fetched — animals: ${animalRows.length}, vaccines: ${vaccineRows.length}, preventative_care: ${preventativeCareRows.length}, users: ${userRows.length}, transports: ${transportRows.length}`
      );

      const today = new Date().toISOString().slice(0, 10);
      const filename = `irescue_backup_${today}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('[Export] Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to generate export archive' });
        }
      });

      archive.pipe(res);

      archive.append(toCsv(animalRows), { name: 'animals.csv' });
      archive.append(toCsv(vaccineRows), { name: 'vaccine_records.csv' });
      archive.append(toCsv(preventativeCareRows), { name: 'preventative_care_records.csv' });
      archive.append(toCsv(userRows), { name: 'users.csv' });
      archive.append(toCsv(transportRows), { name: 'transport_events.csv' });

      await archive.finalize();
      console.log(`[Export] ZIP archive sent successfully for tenant ${tenantId}`);
    } catch (error) {
      console.error('[Export] Error generating data export:', error);
      next(error);
    }
  }
);

export default router;
