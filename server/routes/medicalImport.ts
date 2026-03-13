import { Router } from 'express';
import { db } from '../db';
import { medicalImportBatches, medicalImportItems, animals, vaccineRecords, procedureLogs, medicalPrescriptions, diagnosticTests, medicalExams, inboundEmails, medicalFiles } from '@shared/schema';
import { eq, and, isNotNull, isNull, desc, sql, inArray, count } from 'drizzle-orm';
import multer from 'multer';
import { processMedicalDocument } from '../services/aiMedicalParser';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';

const router = Router();

async function linkSourcePdfToAnimalDocuments(batchId: string, tenantId: string, userId: string) {
  try {
    const batch = await db.query.medicalImportBatches.findFirst({
      where: and(
        eq(medicalImportBatches.id, batchId),
        eq(medicalImportBatches.tenantId, tenantId)
      ),
    });

    if (!batch || !batch.animalId || !batch.inboundEmailId) return;

    const existing = await db.query.medicalFiles.findFirst({
      where: and(
        eq(medicalFiles.animalId, batch.animalId),
        eq(medicalFiles.tenantId, tenantId),
        eq(medicalFiles.description, `Imported from email - batch ${batch.id}`)
      ),
    });
    if (existing) return;

    const email = await db.query.inboundEmails.findFirst({
      where: and(
        eq(inboundEmails.id, batch.inboundEmailId),
        eq(inboundEmails.tenantId, tenantId)
      ),
    });

    if (!email || !email.attachments || !Array.isArray(email.attachments)) return;

    const pdfAttachment = email.attachments.find(
      (a: { contentType?: string; filename?: string }) =>
        a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
    );
    if (!pdfAttachment) return;

    const importDate = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const fileName = pdfAttachment.filename || batch.originalFileName || 'Vet Record.pdf';

    await db.insert(medicalFiles).values({
      animalId: batch.animalId,
      tenantId,
      fileName,
      fileUrl: pdfAttachment.url,
      mimeType: 'application/pdf',
      fileSize: pdfAttachment.size || batch.fileSize || null,
      description: `Imported from email - batch ${batch.id}`,
      uploadedBy: userId,
    });

    console.log(`[Medical Import] Linked PDF "${fileName}" to animal ${batch.animalId} documents (imported ${importDate})`);
  } catch (error) {
    console.error('[Medical Import] Failed to link PDF to animal documents:', error);
  }
}

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

    if (!item.animalId) {
      return res.status(400).json({ error: 'An animal must be assigned to this item before it can be approved. Use the assign-animal endpoint first.' });
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

        if (batch.inboundEmailId) {
          await linkSourcePdfToAnimalDocuments(batch.id, tenantId, userId);
        }
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

        if (batch.inboundEmailId && approvedCount.length > 0) {
          await linkSourcePdfToAnimalDocuments(batch.id, tenantId, userId);
        }
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

    const itemsWithoutAnimal = pendingItems.filter(item => !item.animalId);
    if (itemsWithoutAnimal.length > 0) {
      return res.status(400).json({ error: 'All items must have an animal assigned before bulk approval. Use the assign-animal endpoint first.', unassignedCount: itemsWithoutAnimal.length });
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

    const hasImportedRecords = results.some(r => r.success);
    if (hasImportedRecords && batch.inboundEmailId) {
      await linkSourcePdfToAnimalDocuments(batchId, tenantId, userId);
    }

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

router.get('/email-batches', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;

    const batches = await db.query.medicalImportBatches.findMany({
      where: and(
        eq(medicalImportBatches.tenantId, tenantId),
        isNotNull(medicalImportBatches.inboundEmailId)
      ),
      orderBy: [desc(medicalImportBatches.createdAt)],
    });

    const batchesWithItems = await Promise.all(
      batches.map(async (batch) => {
        const items = await db.query.medicalImportItems.findMany({
          where: eq(medicalImportItems.batchId, batch.id),
        });
        return { ...batch, items };
      })
    );

    res.json(batchesWithItems);
  } catch (error) {
    next(error);
  }
});

router.get('/all-batches', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 100));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const source = req.query.source as string | undefined;

    const tenantCondition = eq(medicalImportBatches.tenantId, tenantId);
    const whereClause = source === 'email'
      ? and(tenantCondition, isNotNull(medicalImportBatches.inboundEmailId))
      : source === 'upload'
      ? and(tenantCondition, isNull(medicalImportBatches.inboundEmailId))
      : tenantCondition;

    const [{ value: total }] = await db.select({ value: count() })
      .from(medicalImportBatches)
      .where(whereClause);

    const batches = await db.query.medicalImportBatches.findMany({
      where: whereClause,
      orderBy: [desc(medicalImportBatches.createdAt)],
      limit,
      offset,
    });

    const batchesWithItems = await Promise.all(
      batches.map(async (batch) => {
        const items = await db.query.medicalImportItems.findMany({
          where: eq(medicalImportItems.batchId, batch.id),
        });
        const animal = batch.animalId
          ? await db.query.animals.findFirst({
              where: and(eq(animals.id, batch.animalId), eq(animals.tenantId, tenantId)),
            })
          : null;
        return {
          ...batch,
          items,
          source: batch.inboundEmailId ? 'email' as const : 'upload' as const,
          animalName: animal?.name || null,
        };
      })
    );

    res.json({ batches: batchesWithItems, total, hasMore: offset + limit < total });
  } catch (error) {
    next(error);
  }
});

router.post('/batches/:batchId/assign-animal', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { animalId } = req.body;
    const tenantId = req.tenant!.id;

    if (!animalId) {
      return res.status(400).json({ error: 'animalId is required' });
    }

    const batch = await db.query.medicalImportBatches.findFirst({
      where: and(
        eq(medicalImportBatches.id, batchId),
        eq(medicalImportBatches.tenantId, tenantId)
      ),
    });

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const animal = await db.query.animals.findFirst({
      where: and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)),
    });

    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' });
    }

    await db.update(medicalImportBatches)
      .set({ animalId })
      .where(eq(medicalImportBatches.id, batchId));

    await db.update(medicalImportItems)
      .set({ animalId })
      .where(eq(medicalImportItems.batchId, batchId));

    const updatedBatch = await db.query.medicalImportBatches.findFirst({
      where: eq(medicalImportBatches.id, batchId),
    });

    const items = await db.query.medicalImportItems.findMany({
      where: eq(medicalImportItems.batchId, batchId),
    });

    res.json({ ...updatedBatch, items, assignedAnimalName: animal.name });
  } catch (error) {
    next(error);
  }
});

router.get('/batches/:batchId/check-duplicates', requireTenant, requireAuth, async (req, res, next) => {
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

    const pendingItems = await db.query.medicalImportItems.findMany({
      where: and(
        eq(medicalImportItems.batchId, batchId),
        eq(medicalImportItems.status, 'pending')
      ),
    });

    if (pendingItems.length === 0) {
      return res.json({ duplicates: {} });
    }

    const animalIds = [...new Set(pendingItems.map(i => i.animalId).filter(Boolean))] as string[];
    if (animalIds.length === 0) {
      return res.json({ duplicates: {} });
    }

    const [existingVaccines, existingProcedures, existingPrescriptions, existingDiagnostics, existingExams] = await Promise.all([
      db.select({ id: vaccineRecords.id, animalId: vaccineRecords.animalId, itemName: vaccineRecords.itemName, dateGiven: vaccineRecords.dateGiven })
        .from(vaccineRecords)
        .where(and(eq(vaccineRecords.tenantId, tenantId), inArray(vaccineRecords.animalId, animalIds))),
      db.select({ id: procedureLogs.id, animalId: procedureLogs.animalId, procedureName: procedureLogs.procedureName, procedureDate: procedureLogs.procedureDate })
        .from(procedureLogs)
        .where(and(eq(procedureLogs.tenantId, tenantId), inArray(procedureLogs.animalId, animalIds))),
      db.select({ id: medicalPrescriptions.id, animalId: medicalPrescriptions.animalId, medicationName: medicalPrescriptions.medicationName, startDate: medicalPrescriptions.startDate })
        .from(medicalPrescriptions)
        .where(and(eq(medicalPrescriptions.tenantId, tenantId), inArray(medicalPrescriptions.animalId, animalIds))),
      db.select({ id: diagnosticTests.id, animalId: diagnosticTests.animalId, testName: diagnosticTests.testName, testDate: diagnosticTests.testDate })
        .from(diagnosticTests)
        .where(and(eq(diagnosticTests.tenantId, tenantId), inArray(diagnosticTests.animalId, animalIds))),
      db.select({ id: medicalExams.id, animalId: medicalExams.animalId, examType: medicalExams.examType, examDate: medicalExams.examDate })
        .from(medicalExams)
        .where(and(eq(medicalExams.tenantId, tenantId), inArray(medicalExams.animalId, animalIds))),
    ]);

    const normalize = (s: string | null | undefined) => (s || '').trim().toLowerCase();
    const dateStr = (d: Date | string | null | undefined) => {
      if (!d) return '';
      if (d instanceof Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      const str = String(d).trim();
      const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      const parsed = new Date(str);
      if (isNaN(parsed.getTime())) return '';
      const y2 = parsed.getFullYear();
      const m2 = String(parsed.getMonth() + 1).padStart(2, '0');
      const day2 = String(parsed.getDate()).padStart(2, '0');
      return `${y2}-${m2}-${day2}`;
    };

    const duplicates: Record<string, { isDuplicate: boolean; matchedRecordId?: string; matchedSummary?: string }> = {};

    for (const item of pendingItems) {
      const data = (item.modifiedData as Record<string, unknown>) || (item.extractedData as Record<string, unknown>);
      if (!data || !item.animalId) {
        duplicates[item.id] = { isDuplicate: false };
        continue;
      }

      let match: { id: string; summary: string } | null = null;

      switch (item.recordType) {
        case 'vaccine': {
          const name = normalize(data.itemName as string);
          const date = dateStr(data.dateGiven as string);
          const found = existingVaccines.find(v =>
            v.animalId === item.animalId && normalize(v.itemName) === name && dateStr(v.dateGiven) === date
          );
          if (found) match = { id: found.id, summary: `Vaccine "${found.itemName}" on ${dateStr(found.dateGiven)}` };
          break;
        }
        case 'procedure': {
          const name = normalize(data.procedureName as string);
          const date = dateStr(data.procedureDate as string);
          const found = existingProcedures.find(p =>
            p.animalId === item.animalId && normalize(p.procedureName) === name && dateStr(p.procedureDate) === date
          );
          if (found) match = { id: found.id, summary: `Procedure "${found.procedureName}" on ${dateStr(found.procedureDate)}` };
          break;
        }
        case 'prescription': {
          const name = normalize(data.medicationName as string);
          const date = dateStr(data.startDate as string);
          const found = existingPrescriptions.find(p =>
            p.animalId === item.animalId && normalize(p.medicationName) === name && dateStr(p.startDate) === date
          );
          if (found) match = { id: found.id, summary: `Prescription "${found.medicationName}" starting ${dateStr(found.startDate)}` };
          break;
        }
        case 'diagnostic': {
          const name = normalize(data.testName as string);
          const date = dateStr(data.testDate as string);
          const found = existingDiagnostics.find(d =>
            d.animalId === item.animalId && normalize(d.testName) === name && dateStr(d.testDate) === date
          );
          if (found) match = { id: found.id, summary: `Diagnostic "${found.testName}" on ${dateStr(found.testDate)}` };
          break;
        }
        case 'exam': {
          const type = normalize(data.examType as string);
          const date = dateStr(data.examDate as string);
          const found = existingExams.find(e =>
            e.animalId === item.animalId && normalize(e.examType) === type && dateStr(e.examDate) === date
          );
          if (found) match = { id: found.id, summary: `${(found.examType || 'Exam').charAt(0).toUpperCase() + (found.examType || 'exam').slice(1)} exam on ${dateStr(found.examDate)}` };
          break;
        }
      }

      duplicates[item.id] = match
        ? { isDuplicate: true, matchedRecordId: match.id, matchedSummary: match.summary }
        : { isDuplicate: false };
    }

    res.json({ duplicates });
  } catch (error) {
    next(error);
  }
});

export default router;
