import { Router } from 'express';
import { db } from '../db';
import { animalDriveFiles, animals } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { z } from 'zod';

const router = Router();

const attachDriveFileSchema = z.object({
  driveFileId: z.string().min(1, 'Drive file ID is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileUrl: z.string().min(1, 'File URL is required'),
  mimeType: z.string().optional(),
  iconLink: z.string().optional(),
});

router.get('/:animalId/drive-files', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenant!.id;

    const animal = await db.query.animals.findFirst({
      where: and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)),
    });

    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' });
    }

    const files = await db.query.animalDriveFiles.findMany({
      where: and(eq(animalDriveFiles.animalId, animalId), eq(animalDriveFiles.tenantId, tenantId)),
      orderBy: (animalDriveFiles, { desc }) => [desc(animalDriveFiles.attachedAt)],
    });

    res.json({ files });
  } catch (error) {
    next(error);
  }
});

router.post('/:animalId/drive-files', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    const animal = await db.query.animals.findFirst({
      where: and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)),
    });

    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' });
    }

    const data = attachDriveFileSchema.parse(req.body);

    const existingFile = await db.query.animalDriveFiles.findFirst({
      where: and(
        eq(animalDriveFiles.animalId, animalId),
        eq(animalDriveFiles.tenantId, tenantId),
        eq(animalDriveFiles.driveFileId, data.driveFileId)
      ),
    });

    if (existingFile) {
      return res.status(400).json({ error: 'This file is already attached to this animal' });
    }

    const [file] = await db.insert(animalDriveFiles).values({
      animalId,
      tenantId,
      driveFileId: data.driveFileId,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      mimeType: data.mimeType,
      iconLink: data.iconLink,
      attachedBy: userId,
    }).returning();

    res.status(201).json({ file });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.delete('/:animalId/drive-files/:fileId', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { animalId, fileId } = req.params;
    const tenantId = req.tenant!.id;

    const file = await db.query.animalDriveFiles.findFirst({
      where: and(
        eq(animalDriveFiles.id, fileId),
        eq(animalDriveFiles.animalId, animalId),
        eq(animalDriveFiles.tenantId, tenantId)
      ),
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    await db.delete(animalDriveFiles).where(eq(animalDriveFiles.id, fileId));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
