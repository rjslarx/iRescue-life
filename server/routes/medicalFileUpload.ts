import { Router } from 'express';
import { db } from '../db';
import { medicalFiles, animals } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { ObjectStorageService } from '../objectStorage';
import { TenantFileStorage } from '../lib/tenantFileStorage';
import { z } from 'zod';
import multer from 'multer';

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for medical files
});

const createMedicalFileSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileUrl: z.string().min(1, 'File URL is required'),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
  description: z.string().optional(),
});

router.post('/:animalId/upload-url', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenant!.id;

    const animal = await db.query.animals.findFirst({
      where: and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)),
    });

    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' });
    }

    const storage = await TenantFileStorage.forTenant(tenantId);
    const storageInfo = await storage.getStorageInfo();

    if (storageInfo.primaryStorage === 'google_drive') {
      res.json({ 
        storageType: 'google_drive',
        useServerUpload: true,
        message: 'Upload file content to server for Google Drive storage',
      });
    } else {
      const objectStorageService = new ObjectStorageService();
      const { uploadUrl, objectPath } = await objectStorageService.getTenantDocumentUploadURL(tenantId);
      res.json({ 
        storageType: 'replit_object_storage',
        useServerUpload: false,
        uploadUrl, 
        objectPath,
      });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/:animalId/upload-file', requireTenant, requireAuth, upload.single('file'), async (req, res, next) => {
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

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const storage = await TenantFileStorage.forTenant(tenantId);
    const result = await storage.uploadFile({
      tenantId,
      userId,
      category: 'animal-medical',
      visibility: 'private',
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      content: req.file.buffer,
      animal: {
        id: animal.id,
        name: animal.name,
        status: animal.status as any,
      },
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to upload file' });
    }

    const description = req.body.description || undefined;

    const [file] = await db.insert(medicalFiles).values({
      animalId,
      tenantId,
      fileName: req.file.originalname,
      fileUrl: result.fileUrl,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      description,
      uploadedBy: userId,
    }).returning();

    res.status(201).json({ 
      file,
      storageType: result.storageType,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:animalId/files', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenant!.id;

    const animal = await db.query.animals.findFirst({
      where: and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)),
    });

    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' });
    }

    const files = await db.query.medicalFiles.findMany({
      where: and(eq(medicalFiles.animalId, animalId), eq(medicalFiles.tenantId, tenantId)),
      orderBy: (medicalFiles, { desc }) => [desc(medicalFiles.uploadDate)],
    });

    res.json({ files });
  } catch (error) {
    next(error);
  }
});

router.post('/:animalId/files', requireTenant, requireAuth, async (req, res, next) => {
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

    const data = createMedicalFileSchema.parse(req.body);

    // Set ACL policy on the uploaded file - private visibility for medical documents
    // These are accessed through authenticated tenant routes, not directly
    const objectStorageService = new ObjectStorageService();
    try {
      await objectStorageService.trySetObjectEntityAclPolicy(
        data.fileUrl,
        {
          owner: userId,
          visibility: 'private',
          tenantId: tenantId, // Include tenant ID for validation
        }
      );
    } catch (aclError) {
      console.error('Error setting ACL policy on medical file:', aclError);
      // Continue even if ACL setting fails - file may still be accessible
    }

    const [file] = await db.insert(medicalFiles).values({
      animalId,
      tenantId,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      description: data.description,
      uploadedBy: userId,
    }).returning();

    res.status(201).json({ file });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.delete('/:animalId/files/:fileId', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { animalId, fileId } = req.params;
    const tenantId = req.tenant!.id;

    const file = await db.query.medicalFiles.findFirst({
      where: and(
        eq(medicalFiles.id, fileId),
        eq(medicalFiles.animalId, animalId),
        eq(medicalFiles.tenantId, tenantId)
      ),
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    await db.delete(medicalFiles).where(eq(medicalFiles.id, fileId));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
