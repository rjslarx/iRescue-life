import { Router } from 'express';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { emailLimiter } from '../config/security';
import { db } from '../db';
import {
  complianceObligations,
  animals,
  adoptions,
  adoptionCheckoutSessions,
  adoptionContracts,
  microchipRecords,
  adopterHelpRequests,
  adopterComplianceWarningTemplates,
  adopterComplianceWarnings,
  adopterComplianceConfirmations,
  preventativeCareRecords,
  users,
  COMPLIANCE_OBLIGATION_TYPES,
} from '@shared/schema';
import { eq, and, or, ilike, desc, sql, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  findEligibleHeartwormWarnings,
  findRecentlyWarnedItems,
  getMonthlyWarningStats,
  sendComplianceWarning,
  previewWarning,
  getEffectiveTemplate,
  DEFAULT_WARNING_EMAIL_SUBJECT,
  DEFAULT_WARNING_EMAIL_BODY,
  DEFAULT_WARNING_SMS_BODY,
  WARNING_DEADLINE_DAYS,
} from '../lib/adopter-compliance-warnings';

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

      const pendingHelpRequests = await db
        .select({ id: adopterHelpRequests.id })
        .from(adopterHelpRequests)
        .where(and(
          eq(adopterHelpRequests.tenantId, tenantId),
          eq(adopterHelpRequests.status, 'pending'),
        ));

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
          helpRequestCount: pendingHelpRequests.length,
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

const createObligationSchema = z.object({
  animalId: z.string().uuid(),
  adopterName: z.string().min(1, 'Adopter name is required'),
  adopterEmail: z.string().email('Valid email is required'),
  adopterPhone: z.string().nullable().optional(),
  obligationType: z.enum(COMPLIANCE_OBLIGATION_TYPES as unknown as [string, ...string[]]),
  label: z.string().min(1, 'Label is required'),
  contractualDueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().nullable().optional(),
});

router.post(
  '/',
  requireTenant,
  requireAuth,
  requireRole('admin', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;

      const parsed = createObligationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(', ') });
      }

      const { animalId, adopterName, adopterEmail, adopterPhone, obligationType, label, contractualDueDate, notes } = parsed.data;

      const [animal] = await db
        .select({ id: animals.id })
        .from(animals)
        .where(and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)))
        .limit(1);

      if (!animal) {
        return res.status(404).json({ error: 'Animal not found in this organization' });
      }

      const [created] = await db
        .insert(complianceObligations)
        .values({
          tenantId,
          animalId,
          sessionId: null,
          adopterName,
          adopterEmail,
          adopterPhone: adopterPhone || null,
          obligationType,
          label,
          contractualDueDate,
          notes: notes || null,
          status: 'pending',
          proofDocumentUrl: null,
        })
        .returning();

      res.status(201).json({ obligation: created });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/help-requests',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;

      const requests = await db
        .select({
          id: adopterHelpRequests.id,
          adopterName: adopterHelpRequests.adopterName,
          adopterPhone: adopterHelpRequests.adopterPhone,
          animalId: adopterHelpRequests.animalId,
          animalName: adopterHelpRequests.animalName,
          message: adopterHelpRequests.message,
          status: adopterHelpRequests.status,
          resolvedByName: users.fullName,
          resolvedAt: adopterHelpRequests.resolvedAt,
          createdAt: adopterHelpRequests.createdAt,
        })
        .from(adopterHelpRequests)
        .leftJoin(users, eq(users.id, adopterHelpRequests.resolvedBy))
        .where(eq(adopterHelpRequests.tenantId, tenantId))
        .orderBy(desc(adopterHelpRequests.createdAt))
        .limit(50);

      res.json({ requests });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/help-requests/:id/resolve',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const requestId = req.params.id;
      const userId = req.user!.id;

      const [updated] = await db
        .update(adopterHelpRequests)
        .set({
          status: 'resolved',
          resolvedBy: userId,
          resolvedAt: new Date(),
        })
        .where(and(
          eq(adopterHelpRequests.id, requestId),
          eq(adopterHelpRequests.tenantId, tenantId),
          ne(adopterHelpRequests.status, 'resolved'),
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Help request not found or already resolved' });
      }

      res.json({ request: updated });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================
// Heartworm / Parasite-Prevention Compliance Warnings (Task #137)
// ============================================================

// GET /api/adoption-compliance/heartworm-warnings
// Returns the list of adopters with parasite-prevention items overdue ≥14d.
// Also returns recently-warned items (with engagement tracking — Task #140)
// and monthly counters for the tab header.
router.get(
  '/heartworm-warnings',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const [candidates, recentlyWarned, monthlyStats] = await Promise.all([
        findEligibleHeartwormWarnings(tenantId),
        findRecentlyWarnedItems(tenantId),
        getMonthlyWarningStats(tenantId),
      ]);
      res.json({
        candidates,
        recentlyWarned,
        monthlyStats,
        deadlineDays: WARNING_DEADLINE_DAYS,
      });
    } catch (error) {
      next(error);
    }
  }
);

const sendWarningSchema = z.object({
  animalId: z.string().uuid(),
  itemId: z.string().min(1),
  channels: z.array(z.enum(['email', 'sms'])).min(1).optional(),
});

// POST /api/adoption-compliance/heartworm-warnings/send
// Manual "Send Warning Now" button. Re-fetches the candidate list to verify
// the item is still eligible (still overdue, no proof) before sending.
router.post(
  '/heartworm-warnings/send',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  emailLimiter,
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.id;
      const parsed = sendWarningSchema.parse(req.body);

      const candidates = await findEligibleHeartwormWarnings(tenantId);
      const candidate = candidates.find(
        (c) => c.animalId === parsed.animalId && c.itemId === parsed.itemId,
      );
      if (!candidate) {
        return res.status(404).json({
          error: 'No eligible warning found — the item may already be resolved or proof may have been uploaded.',
        });
      }

      // Enforce the 30-day dedup window for manual sends too. Without this, a
      // staff member could repeatedly hammer an adopter — defeating the
      // contract's "one warning then escalate" intent.
      if (candidate.warningsInLast30Days > 0) {
        return res.status(409).json({
          error: 'A warning was already sent for this item within the past 30 days. Please wait until the deadline passes before re-sending.',
          lastWarningAt: candidate.lastWarningAt,
          lastWarningDeadline: candidate.lastWarningDeadline,
        });
      }

      // Default to both channels when adopter has a phone, but honor explicit override
      let channels: ('email' | 'sms')[] = parsed.channels ?? ['email'];
      if (!parsed.channels && candidate.adopterPhone) channels = ['email', 'sms'];

      // Pre-validate explicitly requested channels: refuse with 400 (not 502)
      // when the adopter is missing the contact info for a channel the staff
      // member explicitly selected. This makes the failure mode obvious in the
      // UI before any partial delivery happens.
      if (channels.includes('email') && !candidate.adopterEmail) {
        return res.status(400).json({
          error: 'This adopter has no email on file. Remove the Email channel and try again.',
        });
      }
      if (channels.includes('sms') && !candidate.adopterPhone) {
        return res.status(400).json({
          error: 'This adopter has no phone on file. Remove the SMS channel and try again.',
        });
      }

      const result = await sendComplianceWarning({
        tenantId,
        animalId: candidate.animalId,
        animalName: candidate.animalName,
        itemId: candidate.itemId,
        itemKey: `parasite_prevention:${candidate.careName}`,
        careName: candidate.careName,
        dueDate: candidate.dueDate,
        adopterName: candidate.adopterName,
        adopterEmail: candidate.adopterEmail,
        adopterPhone: candidate.adopterPhone,
        channels,
        triggeredBy: userId,
        trigger: 'manual',
      });

      if (!result.success) {
        return res.status(502).json({
          error: result.reason || 'Failed to send warning on any channel',
          email: result.email,
          sms: result.sms,
        });
      }

      res.json({
        success: true,
        warningId: result.warningId,
        channelsSent: result.channelsSent,
        deadlineDate: result.deadlineDate,
        email: result.email,
        sms: result.sms,
      });
    } catch (error) {
      next(error);
    }
  }
);

const logProofSchema = z.object({
  animalId: z.string().uuid(),
  itemId: z.string().min(1),
  dateAdministered: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  clinicName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  fileUrl: z.string().max(1000).optional(),
});

// POST /api/adoption-compliance/heartworm-warnings/log-proof
// Staff-side resolution for a Heartworm Watch item. Handles BOTH candidate
// flavors: obligation-driven (itemId = complianceObligations.id → mark the
// obligation completed) and record-driven (itemId = preventativeCareRecords.id
// → insert an APPROVED adopter_compliance_confirmation covering the record,
// which findCoveringProof() picks up so no further warnings are sent).
router.post(
  '/heartworm-warnings/log-proof',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const staffUserId = req.user!.id;
      const parsed = logProofSchema.parse(req.body);
      const administeredDate = new Date(`${parsed.dateAdministered}T12:00:00Z`);
      if (Number.isNaN(administeredDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date administered' });
      }

      // Path 1: obligation-driven item — itemId is a complianceObligations.id
      const [obligation] = await db
        .select()
        .from(complianceObligations)
        .where(
          and(
            eq(complianceObligations.id, parsed.itemId),
            eq(complianceObligations.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (obligation) {
        if (obligation.status !== 'pending') {
          return res.status(409).json({ error: 'This obligation is already resolved.' });
        }
        const updateData: Record<string, unknown> = {
          status: 'completed' as const,
          completedAt: new Date(),
          updatedAt: new Date(),
        };
        if (parsed.fileUrl) updateData.proofDocumentUrl = parsed.fileUrl;
        if (parsed.notes) updateData.notes = parsed.notes;
        const [updated] = await db
          .update(complianceObligations)
          .set(updateData)
          .where(eq(complianceObligations.id, obligation.id))
          .returning();
        return res.json({ resolved: 'obligation', obligation: updated });
      }

      // Path 2: record-driven item — itemId is a preventativeCareRecords.id
      const [record] = await db
        .select({
          id: preventativeCareRecords.id,
          animalId: preventativeCareRecords.animalId,
          careName: preventativeCareRecords.careName,
          careCategory: preventativeCareRecords.careCategory,
        })
        .from(preventativeCareRecords)
        .where(
          and(
            eq(preventativeCareRecords.id, parsed.itemId),
            eq(preventativeCareRecords.tenantId, tenantId),
            eq(preventativeCareRecords.animalId, parsed.animalId),
          ),
        )
        .limit(1);

      if (!record) {
        return res.status(404).json({ error: 'Care item not found for this animal.' });
      }

      // Dedup: a pending/approved confirmation already covers this record
      const [existing] = await db
        .select({ id: adopterComplianceConfirmations.id })
        .from(adopterComplianceConfirmations)
        .where(
          and(
            eq(adopterComplianceConfirmations.tenantId, tenantId),
            eq(adopterComplianceConfirmations.preventativeCareRecordId, record.id),
            sql`${adopterComplianceConfirmations.status} IN ('pending_review', 'approved')`,
          ),
        )
        .limit(1);
      if (existing) {
        return res.status(409).json({
          error: 'Proof is already on file for this item — no further warnings will be sent.',
        });
      }

      const [confirmation] = await db
        .insert(adopterComplianceConfirmations)
        .values({
          tenantId,
          userId: staffUserId,
          animalId: parsed.animalId,
          preventativeCareRecordId: record.id,
          careCategory: record.careCategory,
          careName: record.careName,
          dateAdministered: administeredDate,
          clinicName: parsed.clinicName || null,
          notes: parsed.notes
            ? `[Logged by staff] ${parsed.notes}`
            : '[Logged by staff]',
          fileUrl: parsed.fileUrl || null,
          status: 'approved',
          reviewedBy: staffUserId,
          reviewedAt: new Date(),
          reviewNotes: 'Staff-logged proof from Heartworm Watch',
        })
        .returning();

      res.json({ resolved: 'record', confirmation });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || 'Invalid request' });
      }
      next(error);
    }
  }
);

const previewWarningSchema = z.object({
  animalId: z.string().uuid(),
  itemId: z.string().min(1),
});

// POST /api/adoption-compliance/heartworm-warnings/preview
// Renders the email subject + body and SMS body for a candidate WITHOUT
// sending anything. Used by the manual-send confirmation dialog so staff can
// review the message and pick channels before triggering delivery.
router.post(
  '/heartworm-warnings/preview',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const parsed = previewWarningSchema.parse(req.body);

      const candidates = await findEligibleHeartwormWarnings(tenantId);
      const candidate = candidates.find(
        (c) => c.animalId === parsed.animalId && c.itemId === parsed.itemId,
      );
      if (!candidate) {
        return res.status(404).json({
          error: 'No eligible warning found for this item.',
        });
      }

      const preview = await previewWarning({
        tenantId,
        animalId: candidate.animalId,
        animalName: candidate.animalName,
        adopterName: candidate.adopterName,
      });

      res.json({
        ...preview,
        candidate: {
          animalName: candidate.animalName,
          careName: candidate.careName,
          dueDate: candidate.dueDate,
          daysOverdue: candidate.daysOverdue,
          adopterName: candidate.adopterName,
          adopterEmail: candidate.adopterEmail,
          adopterPhone: candidate.adopterPhone,
          warningsInLast30Days: candidate.warningsInLast30Days,
          lastWarningAt: candidate.lastWarningAt,
        },
        availableChannels: {
          email: !!candidate.adopterEmail,
          sms: !!candidate.adopterPhone,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/adoption-compliance/warning-template
// Returns the effective warning template (custom override or defaults).
router.get(
  '/warning-template',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const tpl = await getEffectiveTemplate(tenantId);
      res.json({
        ...tpl,
        defaults: {
          emailSubject: DEFAULT_WARNING_EMAIL_SUBJECT,
          emailBody: DEFAULT_WARNING_EMAIL_BODY,
          smsBody: DEFAULT_WARNING_SMS_BODY,
        },
        deadlineDays: WARNING_DEADLINE_DAYS,
      });
    } catch (error) {
      next(error);
    }
  }
);

const updateTemplateSchema = z.object({
  emailSubject: z.string().trim().min(1).max(300).nullable().optional(),
  emailBody: z.string().trim().min(1).max(10_000).nullable().optional(),
  smsBody: z.string().trim().min(1).max(800).nullable().optional(),
});

// PUT /api/adoption-compliance/warning-template
// Save a custom template. Send `null` for any field to revert that field to default.
router.put(
  '/warning-template',
  requireTenant,
  requireAuth,
  requireRole('admin', 'owner', 'manager'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.id;
      const parsed = updateTemplateSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(adopterComplianceWarningTemplates)
        .where(eq(adopterComplianceWarningTemplates.tenantId, tenantId))
        .limit(1);

      if (existing) {
        await db
          .update(adopterComplianceWarningTemplates)
          .set({
            ...(parsed.emailSubject !== undefined ? { emailSubject: parsed.emailSubject } : {}),
            ...(parsed.emailBody !== undefined ? { emailBody: parsed.emailBody } : {}),
            ...(parsed.smsBody !== undefined ? { smsBody: parsed.smsBody } : {}),
            updatedAt: new Date(),
            updatedBy: userId,
          })
          .where(eq(adopterComplianceWarningTemplates.tenantId, tenantId));
      } else {
        await db.insert(adopterComplianceWarningTemplates).values({
          tenantId,
          emailSubject: parsed.emailSubject ?? null,
          emailBody: parsed.emailBody ?? null,
          smsBody: parsed.smsBody ?? null,
          updatedBy: userId,
        });
      }

      const tpl = await getEffectiveTemplate(tenantId);
      res.json({ success: true, ...tpl });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
