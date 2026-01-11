import { Router } from 'express';
import { db } from '../db';
import { medicalImportBatches, medicalImportItems, animals, vaccineRecords, procedureLogs, medicalPrescriptions, diagnosticTests, medicalExams } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import multer from 'multer';
import { processMedicalDocument } from '../services/aiMedicalParser';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

router.post('/:animalId/upload', requireTenant, requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const animal = await db.query.animals.findFirst({
      where: and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)),
    });

    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' });
    }

    const [batch] = await db.insert(medicalImportBatches).values({
      tenantId,
      animalId,
      originalFileName: req.file.originalname,
      fileSize: req.file.size,
      status: 'processing',
      createdBy: userId,
    }).returning();

    const result = await processMedicalDocument(
      req.file.buffer,
      animal.name,
      animal.type || 'animal'
    );

    if (!result.success) {
      await db.update(medicalImportBatches)
        .set({
          status: 'failed',
          errorMessage: result.error,
          extractedText: result.extractedText,
          pageCount: result.pageCount,
          processingNotes: result.processingNotes,
        })
        .where(eq(medicalImportBatches.id, batch.id));

      return res.status(422).json({
        error: 'Failed to parse document',
        details: result.error,
        batchId: batch.id,
        extractedText: result.extractedText?.substring(0, 500),
      });
    }

    const itemsToInsert = [];

    for (const vaccine of result.vaccines) {
      itemsToInsert.push({
        batchId: batch.id,
        tenantId,
        animalId,
        recordType: 'vaccine' as const,
        extractedData: {
          itemName: vaccine.itemName,
          dateGiven: vaccine.dateGiven,
          dateDue: vaccine.dateDue,
          manufacturer: vaccine.manufacturer,
          lotNumber: vaccine.lotNumber,
          administeredBy: vaccine.administeredBy,
        },
        confidence: String(Math.round(vaccine.confidence)),
        sourceText: vaccine.sourceText,
      });
    }

    for (const procedure of result.procedures) {
      itemsToInsert.push({
        batchId: batch.id,
        tenantId,
        animalId,
        recordType: 'procedure' as const,
        extractedData: {
          procedureName: procedure.procedureName,
          procedureDate: procedure.procedureDate,
          veterinarian: procedure.veterinarian,
          notes: procedure.notes,
        },
        confidence: String(Math.round(procedure.confidence)),
        sourceText: procedure.sourceText,
      });
    }

    for (const prescription of result.prescriptions) {
      itemsToInsert.push({
        batchId: batch.id,
        tenantId,
        animalId,
        recordType: 'prescription' as const,
        extractedData: {
          medicationName: prescription.medicationName,
          dosage: prescription.dosage,
          route: prescription.route,
          frequency: prescription.frequency,
          startDate: prescription.startDate,
          endDate: prescription.endDate,
          notes: prescription.notes,
        },
        confidence: String(Math.round(prescription.confidence)),
        sourceText: prescription.sourceText,
      });
    }

    for (const diagnostic of result.diagnostics) {
      itemsToInsert.push({
        batchId: batch.id,
        tenantId,
        animalId,
        recordType: 'diagnostic' as const,
        extractedData: {
          testName: diagnostic.testName,
          testDate: diagnostic.testDate,
          result: diagnostic.result,
          notes: diagnostic.notes,
        },
        confidence: String(Math.round(diagnostic.confidence)),
        sourceText: diagnostic.sourceText,
      });
    }

    for (const exam of result.exams) {
      itemsToInsert.push({
        batchId: batch.id,
        tenantId,
        animalId,
        recordType: 'exam' as const,
        extractedData: {
          examType: exam.examType,
          examDate: exam.examDate,
          performedBy: exam.performedBy,
          subjective: exam.subjective,
          objective: exam.objective,
          assessment: exam.assessment,
          plan: exam.plan,
          weight: exam.weight,
          temperature: exam.temperature,
        },
        confidence: String(Math.round(exam.confidence)),
        sourceText: exam.sourceText,
      });
    }

    if (itemsToInsert.length > 0) {
      await db.insert(medicalImportItems).values(itemsToInsert);
    }

    await db.update(medicalImportBatches)
      .set({
        status: 'review',
        extractedText: result.extractedText,
        pageCount: result.pageCount,
        overallConfidence: String(Math.round(result.overallConfidence)),
        processingNotes: result.processingNotes,
      })
      .where(eq(medicalImportBatches.id, batch.id));

    const items = await db.query.medicalImportItems.findMany({
      where: eq(medicalImportItems.batchId, batch.id),
    });

    res.json({
      success: true,
      batchId: batch.id,
      itemCount: items.length,
      vaccines: result.vaccines.length,
      procedures: result.procedures.length,
      prescriptions: result.prescriptions.length,
      diagnostics: result.diagnostics.length,
      exams: result.exams.length,
      overallConfidence: result.overallConfidence,
      processingNotes: result.processingNotes,
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:animalId/batches', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const tenantId = req.tenant!.id;

    const batches = await db.query.medicalImportBatches.findMany({
      where: and(
        eq(medicalImportBatches.animalId, animalId),
        eq(medicalImportBatches.tenantId, tenantId)
      ),
      orderBy: (batches, { desc }) => [desc(batches.createdAt)],
    });

    res.json({ batches });
  } catch (error) {
    next(error);
  }
});

router.get('/batches/:batchId', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const tenantId = req.tenant!.id;

    const batch = await db.query.medicalImportBatches.findFirst({
      where: and(
        eq(medicalImportBatches.id, batchId),
        eq(medicalImportBatches.tenantId, tenantId)
      ),
    });

    if (!batch) {
      return res.status(404).json({ error: 'Import batch not found' });
    }

    const items = await db.query.medicalImportItems.findMany({
      where: eq(medicalImportItems.batchId, batchId),
    });

    res.json({ batch, items });
  } catch (error) {
    next(error);
  }
});

router.patch('/items/:itemId', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { status, modifiedData } = req.body;
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    const item = await db.query.medicalImportItems.findFirst({
      where: and(
        eq(medicalImportItems.id, itemId),
        eq(medicalImportItems.tenantId, tenantId)
      ),
    });

    if (!item) {
      return res.status(404).json({ error: 'Import item not found' });
    }

    await db.update(medicalImportItems)
      .set({
        status: status || item.status,
        modifiedData: modifiedData || item.modifiedData,
        reviewedBy: userId,
        reviewedAt: new Date(),
      })
      .where(eq(medicalImportItems.id, itemId));

    const updated = await db.query.medicalImportItems.findFirst({
      where: eq(medicalImportItems.id, itemId),
    });

    res.json({ item: updated });
  } catch (error) {
    next(error);
  }
});

function validateDate(dateStr: unknown): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

function validateRequiredDate(dateStr: unknown, fieldName: string): Date {
  const date = validateDate(dateStr);
  if (!date) {
    throw new Error(`Invalid or missing required date field: ${fieldName}`);
  }
  return date;
}

router.post('/items/:itemId/approve', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    const item = await db.query.medicalImportItems.findFirst({
      where: and(
        eq(medicalImportItems.id, itemId),
        eq(medicalImportItems.tenantId, tenantId)
      ),
    });

    if (!item) {
      return res.status(404).json({ error: 'Import item not found' });
    }

    if (item.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Item already processed', 
        currentStatus: item.status 
      });
    }

    const data = (item.modifiedData as Record<string, unknown>) || (item.extractedData as Record<string, unknown>);
    if (!data) {
      return res.status(400).json({ error: 'No extracted data to import' });
    }

    let createdRecordId: string | null = null;

    await db.transaction(async (tx) => {
      switch (item.recordType) {
        case 'vaccine': {
          if (!data.itemName) throw new Error('Vaccine name is required');
          const dateGiven = validateRequiredDate(data.dateGiven, 'dateGiven');
          
          const [record] = await tx.insert(vaccineRecords).values({
            animalId: item.animalId,
            tenantId,
            itemName: data.itemName as string,
            dateGiven,
            dateDue: validateDate(data.dateDue),
            manufacturer: (data.manufacturer as string) || null,
            lotNumber: (data.lotNumber as string) || null,
            administeredBy: (data.administeredBy as string) || null,
            createdBy: userId,
          }).returning();
          createdRecordId = record.id;
          break;
        }
        case 'procedure': {
          if (!data.procedureName) throw new Error('Procedure name is required');
          const procedureDate = validateRequiredDate(data.procedureDate, 'procedureDate');
          
          const [record] = await tx.insert(procedureLogs).values({
            animalId: item.animalId,
            tenantId,
            procedureName: data.procedureName as string,
            procedureDate,
            veterinarian: (data.veterinarian as string) || null,
            notes: (data.notes as string) || null,
            createdBy: userId,
          }).returning();
          createdRecordId = record.id;
          break;
        }
        case 'prescription': {
          if (!data.medicationName) throw new Error('Medication name is required');
          if (!data.dosage) throw new Error('Dosage is required');
          if (!data.frequency) throw new Error('Frequency is required');
          const startDate = validateRequiredDate(data.startDate, 'startDate');
          
          const validRoutes = ['PO', 'SQ', 'IM', 'IV', 'Topical', 'Other'];
          const route = validRoutes.includes(data.route as string) 
            ? (data.route as "PO" | "SQ" | "IM" | "IV" | "Topical" | "Other")
            : 'Other';
          
          const [record] = await tx.insert(medicalPrescriptions).values({
            animalId: item.animalId,
            tenantId,
            medicationName: data.medicationName as string,
            dosage: data.dosage as string,
            route,
            frequency: data.frequency as string,
            startDate,
            endDate: validateDate(data.endDate),
            notes: (data.notes as string) || null,
            createdBy: userId,
          }).returning();
          createdRecordId = record.id;
          break;
        }
        case 'diagnostic': {
          if (!data.testName) throw new Error('Test name is required');
          if (!data.result) throw new Error('Test result is required');
          const testDate = validateRequiredDate(data.testDate, 'testDate');
          
          const [record] = await tx.insert(diagnosticTests).values({
            animalId: item.animalId,
            tenantId,
            testName: data.testName as string,
            testDate,
            result: data.result as string,
            notes: (data.notes as string) || null,
            createdBy: userId,
          }).returning();
          createdRecordId = record.id;
          break;
        }
        case 'exam': {
          if (!data.performedBy) throw new Error('Performed by is required');
          const examDate = validateRequiredDate(data.examDate, 'examDate');
          
          const validExamTypes = ['intake', 'recheck', 'adoption', 'wellness', 'emergency', 'other'];
          const examType = validExamTypes.includes(data.examType as string)
            ? (data.examType as "intake" | "recheck" | "adoption" | "wellness" | "emergency" | "other")
            : 'other';
          
          const [record] = await tx.insert(medicalExams).values({
            animalId: item.animalId,
            tenantId,
            examType,
            examDate,
            performedBy: data.performedBy as string,
            subjective: (data.subjective as string) || null,
            objective: (data.objective as string) || null,
            assessment: (data.assessment as string) || null,
            plan: (data.plan as string) || null,
            structuredFields: {
              weight: data.weight as string | undefined,
              temperature: data.temperature as string | undefined,
            },
            createdBy: userId,
          }).returning();
          createdRecordId = record.id;
          break;
        }
        default:
          throw new Error(`Unknown record type: ${item.recordType}`);
      }

      await tx.update(medicalImportItems)
        .set({
          status: 'approved',
          createdRecordId,
          reviewedBy: userId,
          reviewedAt: new Date(),
        })
        .where(eq(medicalImportItems.id, itemId));
    });

    const batch = await db.query.medicalImportBatches.findFirst({
      where: eq(medicalImportBatches.id, item.batchId),
    });

    if (batch) {
      const pendingItems = await db.query.medicalImportItems.findMany({
        where: and(
          eq(medicalImportItems.batchId, batch.id),
          eq(medicalImportItems.status, 'pending')
        ),
      });

      if (pendingItems.length === 0) {
        const rejectedCount = await db.query.medicalImportItems.findMany({
          where: and(
            eq(medicalImportItems.batchId, batch.id),
            eq(medicalImportItems.status, 'rejected')
          ),
        });

        await db.update(medicalImportBatches)
          .set({
            status: rejectedCount.length > 0 ? 'partially_imported' : 'completed',
            reviewedBy: userId,
            reviewedAt: new Date(),
            completedAt: new Date(),
          })
          .where(eq(medicalImportBatches.id, batch.id));
      }
    }

    res.json({
      success: true,
      recordType: item.recordType,
      createdRecordId,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/items/:itemId/reject', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    const item = await db.query.medicalImportItems.findFirst({
      where: and(
        eq(medicalImportItems.id, itemId),
        eq(medicalImportItems.tenantId, tenantId)
      ),
    });

    if (!item) {
      return res.status(404).json({ error: 'Import item not found' });
    }

    if (item.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Item already processed', 
        currentStatus: item.status 
      });
    }

    await db.update(medicalImportItems)
      .set({
        status: 'rejected',
        reviewedBy: userId,
        reviewedAt: new Date(),
      })
      .where(eq(medicalImportItems.id, itemId));

    const batch = await db.query.medicalImportBatches.findFirst({
      where: eq(medicalImportBatches.id, item.batchId),
    });

    if (batch) {
      const pendingItems = await db.query.medicalImportItems.findMany({
        where: and(
          eq(medicalImportItems.batchId, batch.id),
          eq(medicalImportItems.status, 'pending')
        ),
      });

      if (pendingItems.length === 0) {
        const approvedCount = await db.query.medicalImportItems.findMany({
          where: and(
            eq(medicalImportItems.batchId, batch.id),
            eq(medicalImportItems.status, 'approved')
          ),
        });

        await db.update(medicalImportBatches)
          .set({
            status: approvedCount.length > 0 ? 'partially_imported' : 'completed',
            reviewedBy: userId,
            reviewedAt: new Date(),
            completedAt: new Date(),
          })
          .where(eq(medicalImportBatches.id, batch.id));
      }
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/batches/:batchId/approve-all', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    const batch = await db.query.medicalImportBatches.findFirst({
      where: and(
        eq(medicalImportBatches.id, batchId),
        eq(medicalImportBatches.tenantId, tenantId)
      ),
    });

    if (!batch) {
      return res.status(404).json({ error: 'Import batch not found' });
    }

    const pendingItems = await db.query.medicalImportItems.findMany({
      where: and(
        eq(medicalImportItems.batchId, batchId),
        eq(medicalImportItems.status, 'pending')
      ),
    });

    if (pendingItems.length === 0) {
      return res.status(400).json({ error: 'No pending items to approve' });
    }

    const results: Array<{ itemId: string; success: boolean; createdRecordId?: string; error?: string }> = [];
    
    for (const item of pendingItems) {
      const data = (item.modifiedData as Record<string, unknown>) || (item.extractedData as Record<string, unknown>);
      let createdRecordId: string | null = null;

      try {
        await db.transaction(async (tx) => {
          switch (item.recordType) {
            case 'vaccine': {
              if (!data.itemName) throw new Error('Vaccine name is required');
              const dateGiven = validateRequiredDate(data.dateGiven, 'dateGiven');
              
              const [record] = await tx.insert(vaccineRecords).values({
                animalId: item.animalId,
                tenantId,
                itemName: data.itemName as string,
                dateGiven,
                dateDue: validateDate(data.dateDue),
                manufacturer: (data.manufacturer as string) || null,
                lotNumber: (data.lotNumber as string) || null,
                administeredBy: (data.administeredBy as string) || null,
                createdBy: userId,
              }).returning();
              createdRecordId = record.id;
              break;
            }
            case 'procedure': {
              if (!data.procedureName) throw new Error('Procedure name is required');
              const procedureDate = validateRequiredDate(data.procedureDate, 'procedureDate');
              
              const [record] = await tx.insert(procedureLogs).values({
                animalId: item.animalId,
                tenantId,
                procedureName: data.procedureName as string,
                procedureDate,
                veterinarian: (data.veterinarian as string) || null,
                notes: (data.notes as string) || null,
                createdBy: userId,
              }).returning();
              createdRecordId = record.id;
              break;
            }
            case 'prescription': {
              if (!data.medicationName) throw new Error('Medication name is required');
              if (!data.dosage) throw new Error('Dosage is required');
              if (!data.frequency) throw new Error('Frequency is required');
              const startDate = validateRequiredDate(data.startDate, 'startDate');
              
              const validRoutes = ['PO', 'SQ', 'IM', 'IV', 'Topical', 'Other'];
              const route = validRoutes.includes(data.route as string) 
                ? (data.route as "PO" | "SQ" | "IM" | "IV" | "Topical" | "Other")
                : 'Other';
              
              const [record] = await tx.insert(medicalPrescriptions).values({
                animalId: item.animalId,
                tenantId,
                medicationName: data.medicationName as string,
                dosage: data.dosage as string,
                route,
                frequency: data.frequency as string,
                startDate,
                endDate: validateDate(data.endDate),
                notes: (data.notes as string) || null,
                createdBy: userId,
              }).returning();
              createdRecordId = record.id;
              break;
            }
            case 'diagnostic': {
              if (!data.testName) throw new Error('Test name is required');
              if (!data.result) throw new Error('Test result is required');
              const testDate = validateRequiredDate(data.testDate, 'testDate');
              
              const [record] = await tx.insert(diagnosticTests).values({
                animalId: item.animalId,
                tenantId,
                testName: data.testName as string,
                testDate,
                result: data.result as string,
                notes: (data.notes as string) || null,
                createdBy: userId,
              }).returning();
              createdRecordId = record.id;
              break;
            }
            case 'exam': {
              if (!data.performedBy) throw new Error('Performed by is required');
              const examDate = validateRequiredDate(data.examDate, 'examDate');
              
              const validExamTypes = ['intake', 'recheck', 'adoption', 'wellness', 'emergency', 'other'];
              const examType = validExamTypes.includes(data.examType as string)
                ? (data.examType as "intake" | "recheck" | "adoption" | "wellness" | "emergency" | "other")
                : 'other';
              
              const [record] = await tx.insert(medicalExams).values({
                animalId: item.animalId,
                tenantId,
                examType,
                examDate,
                performedBy: data.performedBy as string,
                subjective: (data.subjective as string) || null,
                objective: (data.objective as string) || null,
                assessment: (data.assessment as string) || null,
                plan: (data.plan as string) || null,
                structuredFields: {
                  weight: data.weight as string | undefined,
                  temperature: data.temperature as string | undefined,
                },
                createdBy: userId,
              }).returning();
              createdRecordId = record.id;
              break;
            }
          }

          await tx.update(medicalImportItems)
            .set({
              status: 'approved',
              createdRecordId,
              reviewedBy: userId,
              reviewedAt: new Date(),
            })
            .where(eq(medicalImportItems.id, item.id));
        });

        results.push({ itemId: item.id, success: true, createdRecordId: createdRecordId || undefined });
      } catch (error) {
        results.push({ itemId: item.id, success: false, error: (error as Error).message });
      }
    }

    await db.update(medicalImportBatches)
      .set({
        status: results.every(r => r.success) ? 'completed' : 'partially_imported',
        reviewedBy: userId,
        reviewedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(medicalImportBatches.id, batchId));

    res.json({
      success: true,
      imported: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
