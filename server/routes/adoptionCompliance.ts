import { Router } from 'express';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { db } from '../db';
import {
  complianceObligations,
  animals,
  adoptions,
  adoptionCheckoutSessions,
  adoptionContracts,
  microchipRecords,
} from '@shared/schema';
import { eq, and, or, ilike, desc, sql, inArray } from 'drizzle-orm';

const router = Router();

router.get(
  '/',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const now = new Date();

      const obligations = await db
        .select({
          id: complianceObligations.id,
          animalId: complianceObligations.animalId,
          sessionId: complianceObligations.sessionId,
          adopterName: complianceObligations.adopterName,
          adopterEmail: complianceObligations.adopterEmail,
          adopterPhone: complianceObligations.adopterPhone,
          obligationType: complianceObligations.obligationType,
          label: complianceObligations.label,
          suggestedDueDate: complianceObligations.suggestedDueDate,
          contractualDueDate: complianceObligations.contractualDueDate,
          notes: complianceObligations.notes,
          status: complianceObligations.status,
          completedAt: complianceObligations.completedAt,
          proofDocumentUrl: complianceObligations.proofDocumentUrl,
          createdAt: complianceObligations.createdAt,
          animalName: animals.name,
          animalSpecies: animals.species,
          neuterStatus: animals.neuterStatus,
        })
        .from(complianceObligations)
        .innerJoin(animals, eq(animals.id, complianceObligations.animalId))
        .where(eq(complianceObligations.tenantId, tenantId))
        .orderBy(desc(complianceObligations.createdAt));

      const pending = obligations.filter((o) => o.status === 'pending');

      const overdue: typeof pending = [];
      const upcoming: typeof pending = [];
      const ongoingTreatments: typeof pending = [];

      for (const ob of pending) {
        if (ob.obligationType === 'spay_neuter' && ob.neuterStatus !== 'intact') {
          continue;
        }

        const dueDate = new Date(ob.contractualDueDate);
        const daysUntilDue = Math.floor(
          (dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        const enriched = {
          ...ob,
          daysOverdue: daysUntilDue < 0 ? Math.abs(daysUntilDue) : 0,
          daysUntilDue: daysUntilDue >= 0 ? daysUntilDue : 0,
        };

        if (ob.obligationType === 'ongoing_treatment') {
          ongoingTreatments.push(ob);
          if (daysUntilDue < 0) {
            overdue.push(ob);
          }
        } else if (daysUntilDue < 0) {
          overdue.push(ob);
        } else if (daysUntilDue <= 30) {
          upcoming.push(ob);
        }
      }

      const completed = obligations.filter((o) => o.status === 'completed');
      const waived = obligations.filter((o) => o.status === 'waived');

      const customObligations = pending.filter((o) =>
        ['heartworm_prevention_proof', 'obedience_training', 'fecal_test', 'custom'].includes(
          o.obligationType
        )
      );

      const atRiskMap = new Map<
        string,
        {
          name: string;
          email: string;
          phone: string | null;
          overdueCount: number;
          obligations: Array<{
            animalName: string;
            obligationType: string;
            label: string;
            dueDate: string;
            daysOverdue: number;
          }>;
        }
      >();
      for (const ob of overdue) {
        const dueDate = new Date(ob.contractualDueDate);
        const daysOverdue = Math.floor(
          (now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)
        );
        const existing = atRiskMap.get(ob.adopterEmail);
        const item = {
          animalName: ob.animalName,
          obligationType: ob.obligationType,
          label: ob.label,
          dueDate: ob.contractualDueDate,
          daysOverdue,
        };
        if (existing) {
          existing.overdueCount++;
          existing.obligations.push(item);
        } else {
          atRiskMap.set(ob.adopterEmail, {
            name: ob.adopterName,
            email: ob.adopterEmail,
            phone: ob.adopterPhone,
            overdueCount: 1,
            obligations: [item],
          });
        }
      }
      const atRiskAdopters = Array.from(atRiskMap.values())
        .filter((a) => a.overdueCount >= 2)
        .sort((a, b) => b.overdueCount - a.overdueCount);

      const enrichWithDays = (items: typeof pending) =>
        items.map((ob) => {
          const dueDate = new Date(ob.contractualDueDate);
          const diff = Math.floor(
            (now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)
          );
          return {
            ...ob,
            daysOverdue: diff > 0 ? diff : 0,
            daysUntilDue: diff <= 0 ? Math.abs(diff) : 0,
          };
        });

      const overdueEnriched = enrichWithDays(overdue).sort(
        (a, b) => b.daysOverdue - a.daysOverdue
      );
      const upcomingEnriched = enrichWithDays(upcoming).sort(
        (a, b) => a.daysUntilDue - b.daysUntilDue
      );
      const ongoingEnriched = enrichWithDays(ongoingTreatments);
      const customEnriched = enrichWithDays(customObligations);

      const completedToday = completed.filter((o) => {
        if (!o.completedAt) return false;
        const completedDate = new Date(o.completedAt);
        return completedDate.toDateString() === now.toDateString();
      });

      res.json({
        stats: {
          totalActiveReminders: pending.length,
          totalOverdue: overdue.length,
          confirmedToday: completedToday.length,
          complianceRate:
            obligations.length > 0
              ? Math.round(
                  ((completed.length + waived.length) / obligations.length) * 100
                )
              : 100,
          atRiskCount: atRiskAdopters.length,
          pendingReviewCount: customObligations.length,
        },
        overdue: overdueEnriched.slice(0, 25),
        upcoming: upcomingEnriched.slice(0, 25),
        ongoingTreatments: ongoingEnriched.slice(0, 25),
        customObligations: customEnriched.slice(0, 25),
        atRiskAdopters: atRiskAdopters.slice(0, 10),
        completed: completed
          .sort(
            (a, b) =>
              new Date(b.completedAt || b.createdAt).getTime() -
              new Date(a.completedAt || a.createdAt).getTime()
          )
          .slice(0, 25),
        waived: waived
          .sort(
            (a, b) =>
              new Date(b.updatedAt || b.createdAt).getTime() -
              new Date(a.updatedAt || a.createdAt).getTime()
          )
          .slice(0, 25),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/complete',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const obligationId = req.params.id;
      const { proofDocumentUrl, notes } = req.body;

      const [obligation] = await db
        .select()
        .from(complianceObligations)
        .where(
          and(
            eq(complianceObligations.id, obligationId),
            eq(complianceObligations.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!obligation) {
        return res.status(404).json({ error: 'Obligation not found' });
      }

      const updateData: any = {
        status: 'completed' as const,
        completedAt: new Date(),
        updatedAt: new Date(),
      };
      if (proofDocumentUrl) updateData.proofDocumentUrl = proofDocumentUrl;
      if (notes) updateData.notes = notes;

      const [updated] = await db
        .update(complianceObligations)
        .set(updateData)
        .where(eq(complianceObligations.id, obligationId))
        .returning();

      res.json({ obligation: updated });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/waive',
  requireTenant,
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const obligationId = req.params.id;
      const { notes } = req.body;

      const [obligation] = await db
        .select()
        .from(complianceObligations)
        .where(
          and(
            eq(complianceObligations.id, obligationId),
            eq(complianceObligations.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!obligation) {
        return res.status(404).json({ error: 'Obligation not found' });
      }

      const [updated] = await db
        .update(complianceObligations)
        .set({
          status: 'waived' as const,
          notes: notes || obligation.notes,
          updatedAt: new Date(),
        })
        .where(eq(complianceObligations.id, obligationId))
        .returning();

      res.json({ obligation: updated });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/alumni-search',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const query = (req.query.q as string || '').trim();
      if (!query || query.length < 2) {
        return res.json({ results: [] });
      }

      const searchPattern = `%${query}%`;

      const adoptionResults = await db
        .select({
          adoptionId: adoptions.id,
          animalId: adoptions.animalId,
          adopterName: adoptions.adopterName,
          adopterEmail: adoptions.adopterEmail,
          adopterPhone: adoptions.adopterPhone,
          adoptionDate: adoptions.adoptionDate,
          adoptionFee: adoptions.adoptionFee,
          animalName: animals.name,
          animalSpecies: animals.species,
          animalBreed: animals.breed,
          animalPhotoUrls: animals.photoUrls,
          animalAnimalId: animals.animalId,
          neuterStatus: animals.neuterStatus,
        })
        .from(adoptions)
        .innerJoin(animals, eq(animals.id, adoptions.animalId))
        .where(
          and(
            eq(adoptions.tenantId, req.tenant!.id),
            or(
              ilike(adoptions.adopterName, searchPattern),
              ilike(adoptions.adopterEmail, searchPattern),
              ilike(animals.name, searchPattern),
              ilike(animals.animalId, searchPattern)
            )
          )
        )
        .limit(20);

      const microchipResults =
        query.length >= 5
          ? await db
              .select({
                animalId: microchipRecords.animalId,
                microchipNumber: microchipRecords.microchipNumber,
              })
              .from(microchipRecords)
              .where(
                and(
                  eq(microchipRecords.tenantId, req.tenant!.id),
                  ilike(microchipRecords.microchipNumber, searchPattern)
                )
              )
              .limit(10)
          : [];

      const animalIds = [
        ...adoptionResults.map((a) => a.animalId),
        ...microchipResults.map((m) => m.animalId),
      ];

      let contractMap = new Map<
        string,
        {
          contractPdfUrl: string | null;
          signerName: string;
          signedAt: any;
          spayNeuterDate: string | null;
        }
      >();
      if (animalIds.length > 0) {
        const contracts = await db
          .select({
            animalId: adoptionCheckoutSessions.animalId,
            contractPdfUrl: adoptionContracts.contractPdfUrl,
            signerName: adoptionContracts.signerName,
            signedAt: adoptionContracts.signedAt,
            spayNeuterDate: adoptionCheckoutSessions.spayNeuterDate,
          })
          .from(adoptionCheckoutSessions)
          .innerJoin(
            adoptionContracts,
            eq(adoptionContracts.sessionId, adoptionCheckoutSessions.id)
          )
          .where(
            and(
              eq(adoptionCheckoutSessions.tenantId, req.tenant!.id),
              inArray(adoptionCheckoutSessions.animalId, animalIds)
            )
          );
        contractMap = new Map(
          contracts.map((c) => [
            c.animalId,
            {
              contractPdfUrl: c.contractPdfUrl,
              signerName: c.signerName,
              signedAt: c.signedAt,
              spayNeuterDate: c.spayNeuterDate,
            },
          ])
        );
      }

      let chipMap = new Map<string, { number: string; manufacturer: string }>();
      if (animalIds.length > 0) {
        const chips = await db
          .select({
            animalId: microchipRecords.animalId,
            microchipNumber: microchipRecords.microchipNumber,
            manufacturer: microchipRecords.manufacturer,
          })
          .from(microchipRecords)
          .where(
            and(
              eq(microchipRecords.tenantId, req.tenant!.id),
              inArray(microchipRecords.animalId, animalIds)
            )
          );
        chipMap = new Map(
          chips.map((c) => [
            c.animalId,
            { number: c.microchipNumber, manufacturer: c.manufacturer || '' },
          ])
        );
      }

      const results = adoptionResults.map((a) => ({
        ...a,
        contract: contractMap.get(a.animalId) || null,
        microchip: chipMap.get(a.animalId) || null,
      }));

      res.json({ results });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/backfill',
  requireTenant,
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      let backfilledCount = 0;
      let skippedCount = 0;

      // Query all completed adoption checkout sessions with medical due dates
      const sessions = await db
        .select({
          id: adoptionCheckoutSessions.id,
          animalId: adoptionCheckoutSessions.animalId,
          tenantId: adoptionCheckoutSessions.tenantId,
          medicalDueDates: adoptionCheckoutSessions.medicalDueDates,
          spayNeuterDate: adoptionCheckoutSessions.spayNeuterDate,
        })
        .from(adoptionCheckoutSessions)
        .where(
          and(
            eq(adoptionCheckoutSessions.tenantId, tenantId),
            eq(adoptionCheckoutSessions.status, 'completed')
          )
        );

      for (const session of sessions) {
        // Skip sessions without medical due dates
        if (!session.medicalDueDates) {
          skippedCount++;
          continue;
        }

        // Check if obligations already exist for this session
        const existingObligations = await db
          .select({ id: complianceObligations.id })
          .from(complianceObligations)
          .where(eq(complianceObligations.sessionId, session.id))
          .limit(1);

        if (existingObligations.length > 0) {
          skippedCount++;
          continue;
        }

        // Get adopter info from adoption contract
        const contract = await db
          .select({
            signerName: adoptionContracts.signerName,
            signerEmail: adoptionContracts.signerEmail,
          })
          .from(adoptionContracts)
          .where(eq(adoptionContracts.sessionId, session.id))
          .limit(1);

        if (!contract || contract.length === 0) {
          skippedCount++;
          continue;
        }

        const adopterName = contract[0].signerName;
        const adopterEmail = contract[0].signerEmail;

        // Collect obligations to create
        const obligationsToCreate: typeof complianceObligations.$inferInsert[] = [];

        // Helper to determine status and completedAt
        const now = new Date();
        const determineStatus = (dueDateStr: string) => {
          const dueDate = new Date(dueDateStr);
          const sixMonthsAgo = new Date(now);
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

          if (dueDate < sixMonthsAgo) {
            // Mark as completed with completedAt = dueDateStr + 30 days
            const completedDate = new Date(dueDate);
            completedDate.setDate(completedDate.getDate() + 30);
            return { status: 'completed' as const, completedAt: completedDate };
          }
          return { status: 'pending' as const, completedAt: null };
        };

        // Create rabies obligation
        if (session.medicalDueDates.rabiesDueDate) {
          const statusInfo = determineStatus(session.medicalDueDates.rabiesDueDate);
          obligationsToCreate.push({
            tenantId,
            animalId: session.animalId,
            sessionId: session.id,
            adopterName,
            adopterEmail,
            adopterPhone: null,
            obligationType: 'rabies',
            label: 'Rabies Vaccine',
            contractualDueDate: session.medicalDueDates.rabiesDueDate,
            notes: 'Backfilled from checkout session',
            status: statusInfo.status,
            completedAt: statusInfo.completedAt,
            proofDocumentUrl: null,
          });
        }

        // Create dhpp_booster obligation
        if (session.medicalDueDates.dhppDueDate) {
          const statusInfo = determineStatus(session.medicalDueDates.dhppDueDate);
          obligationsToCreate.push({
            tenantId,
            animalId: session.animalId,
            sessionId: session.id,
            adopterName,
            adopterEmail,
            adopterPhone: null,
            obligationType: 'dhpp_booster',
            label: 'DHPP Booster',
            contractualDueDate: session.medicalDueDates.dhppDueDate,
            notes: 'Backfilled from checkout session',
            status: statusInfo.status,
            completedAt: statusInfo.completedAt,
            proofDocumentUrl: null,
          });
        }

        // Create spay_neuter obligation if applicable
        if (session.spayNeuterDate && session.spayNeuterDate !== 'not_applicable') {
          const statusInfo = determineStatus(session.spayNeuterDate);
          obligationsToCreate.push({
            tenantId,
            animalId: session.animalId,
            sessionId: session.id,
            adopterName,
            adopterEmail,
            adopterPhone: null,
            obligationType: 'spay_neuter',
            label: 'Spay/Neuter',
            contractualDueDate: session.spayNeuterDate,
            notes: 'Backfilled from checkout session',
            status: statusInfo.status,
            completedAt: statusInfo.completedAt,
            proofDocumentUrl: null,
          });
        }

        // Insert all obligations for this session
        if (obligationsToCreate.length > 0) {
          await db.insert(complianceObligations).values(obligationsToCreate);
          backfilledCount += obligationsToCreate.length;
        }
      }

      res.json({ backfilledCount, skippedCount });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
