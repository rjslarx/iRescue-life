import { db } from '../db';
import { applications, animals, adoptions, dismissedWidgetItems, type InsertApplication, type Application } from '@shared/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';

/**
 * Thrown when finalizeAdoption() fails inside updateApplicationStage() for an
 * 'adopted' transition. Surfacing the structured `code` (e.g. 'no_application',
 * 'microchip_pending', 'animal_not_found') lets the caller distinguish the
 * failure mode without string matching, while preserving a real Error type
 * (no `any` cast).
 */
export class FinalizeAdoptionError extends Error {
  readonly code: string;
  /**
   * Populated for `code === 'MICROCHIP_TRANSFER_PENDING'` so the route
   * handler can echo the same {code, pendingMicrochips, requiresConfirmation}
   * shape that POST /api/adoptions returns. Keeping the response identical
   * across all three adoption entry points is the whole point of the Task
   * #168 alignment — UIs should never have to special-case which path they
   * came from.
   */
  readonly pendingMicrochips?: Array<{
    id: string;
    microchipNumber: string;
    registrationStatus: string;
  }>;
  constructor(
    message: string,
    code: string,
    pendingMicrochips?: Array<{ id: string; microchipNumber: string; registrationStatus: string }>,
  ) {
    super(message);
    this.name = 'FinalizeAdoptionError';
    this.code = code;
    this.pendingMicrochips = pendingMicrochips;
  }
}

/**
 * Ensure an `adoptions` row exists for (tenant, animal). Source of truth for
 * adopter contact info used by every reminder/warning/compliance engine.
 *
 * - If a row already exists for (tenant, animal): no-op (returns existing).
 * - If `applicationId` is provided, copies adopter info from THAT application.
 * - Otherwise looks up the most-recently-updated application for that animal
 *   whose stage IN ('adopted','approved','trial') and copies from there.
 * - Returns { adoption, created, reason }. `reason='no_application'` means
 *   no candidate application was found and no row was created — caller MUST
 *   hard-fail in that case (we never silently flip status to 'adopted'
 *   without adopter contact info).
 *
 * Tenant-scoped on every read and write.
 */
export async function ensureAdoptionRowForAnimal(
  tenantId: string,
  animalId: string,
  options: { applicationId?: string; adoptionDate?: Date } = {},
): Promise<{
  adoption: typeof adoptions.$inferSelect | null;
  created: boolean;
  reason?: 'already_exists' | 'created' | 'no_application';
}> {
  const [existing] = await db
    .select()
    .from(adoptions)
    .where(and(
      eq(adoptions.tenantId, tenantId),
      eq(adoptions.animalId, animalId),
    ))
    .orderBy(desc(adoptions.adoptionDate))
    .limit(1);

  if (existing) {
    return { adoption: existing, created: false, reason: 'already_exists' };
  }

  // Find a candidate application: explicit id wins, otherwise pick the most
  // recently updated adopted/approved/trial application for this animal.
  let candidateApp:
    | { id: string; applicantName: string; applicantEmail: string; applicantPhone: string }
    | null = null;

  if (options.applicationId) {
    const [byId] = await db
      .select({
        id: applications.id,
        applicantName: applications.applicantName,
        applicantEmail: applications.applicantEmail,
        applicantPhone: applications.applicantPhone,
      })
      .from(applications)
      .where(and(
        eq(applications.tenantId, tenantId),
        eq(applications.id, options.applicationId),
        eq(applications.animalId, animalId),
      ))
      .limit(1);
    if (byId) candidateApp = byId;
  }

  if (!candidateApp) {
    // Stage-priority lookup per task spec: prefer the most-recent
    // application whose stage is exactly 'adopted'; only fall back to
    // approved/trial if no adopted application exists for this animal.
    // (A newer approved/trial must NOT win over an older adopted one,
    // because the adopted row is the explicit signal of who took the
    // animal home.)
    const [latestAdopted] = await db
      .select({
        id: applications.id,
        applicantName: applications.applicantName,
        applicantEmail: applications.applicantEmail,
        applicantPhone: applications.applicantPhone,
      })
      .from(applications)
      .where(and(
        eq(applications.tenantId, tenantId),
        eq(applications.animalId, animalId),
        eq(applications.stage, 'adopted'),
      ))
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (latestAdopted) {
      candidateApp = latestAdopted;
    } else {
      const [latestPending] = await db
        .select({
          id: applications.id,
          applicantName: applications.applicantName,
          applicantEmail: applications.applicantEmail,
          applicantPhone: applications.applicantPhone,
        })
        .from(applications)
        .where(and(
          eq(applications.tenantId, tenantId),
          eq(applications.animalId, animalId),
          inArray(applications.stage, ['approved', 'trial']),
        ))
        .orderBy(desc(applications.updatedAt))
        .limit(1);
      if (latestPending) candidateApp = latestPending;
    }
  }

  if (!candidateApp) {
    return { adoption: null, created: false, reason: 'no_application' };
  }

  // Race-safe insert: a single INSERT ... SELECT ... WHERE NOT EXISTS
  // statement so we don't double-insert if two writers race on the same
  // animal. (We deliberately do NOT add a unique constraint on
  // (tenant_id, animal_id) — the adoptions table is intentionally
  // multi-row per animal to support returns + re-adoptions.) If the guard
  // sees an existing row, RETURNING yields zero rows and we re-read.
  const adoptionDate = options.adoptionDate ?? new Date();
  const insertRes = await db.execute(sql`
    INSERT INTO adoptions (
      tenant_id, animal_id, application_id,
      adopter_name, adopter_email, adopter_phone, adoption_date
    )
    SELECT
      ${tenantId}::uuid, ${animalId}::uuid, ${candidateApp.id}::uuid,
      ${candidateApp.applicantName}, ${candidateApp.applicantEmail},
      ${candidateApp.applicantPhone}, ${adoptionDate}
    WHERE NOT EXISTS (
      SELECT 1 FROM adoptions
      WHERE tenant_id = ${tenantId}::uuid
        AND animal_id = ${animalId}::uuid
    )
    RETURNING id
  `);
  const insertedRows = ((insertRes as { rows?: Array<{ id: string }> }).rows) ?? [];
  if (insertedRows.length > 0) {
    const [created] = await db
      .select()
      .from(adoptions)
      .where(eq(adoptions.id, insertedRows[0].id))
      .limit(1);
    return { adoption: created, created: true, reason: 'created' };
  }

  // Race fallback: another writer inserted first (or NOT EXISTS guard
  // matched a row that appeared between our initial check and the insert).
  const [raceExisting] = await db
    .select()
    .from(adoptions)
    .where(and(
      eq(adoptions.tenantId, tenantId),
      eq(adoptions.animalId, animalId),
    ))
    .orderBy(desc(adoptions.adoptionDate))
    .limit(1);
  return { adoption: raceExisting ?? null, created: false, reason: 'already_exists' };
}

/**
 * Used by Path C (PATCH /api/animals/:id) to resolve adopter info BEFORE
 * the status flip. Returns one of:
 *   - { ok: true, alreadyExists: true } — adoptions row already present
 *   - { ok: true, applicationId } — candidate application resolved
 *   - { ok: false } — no adoption row and no candidate application; the
 *     caller MUST hard-fail with 400 and not flip status to 'adopted'.
 *
 * Stage priority matches `ensureAdoptionRowForAnimal`: prefer latest
 * 'adopted', fall back to latest 'approved'/'trial'. Tenant-scoped.
 */
export async function resolveAdopterSourceForAnimal(
  tenantId: string,
  animalId: string,
): Promise<
  | { ok: true; alreadyExists: true }
  | { ok: true; alreadyExists: false; applicationId: string }
  | { ok: false }
> {
  const [existing] = await db
    .select({ id: adoptions.id })
    .from(adoptions)
    .where(and(
      eq(adoptions.tenantId, tenantId),
      eq(adoptions.animalId, animalId),
    ))
    .limit(1);
  if (existing) return { ok: true, alreadyExists: true };

  const [latestAdopted] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(
      eq(applications.tenantId, tenantId),
      eq(applications.animalId, animalId),
      eq(applications.stage, 'adopted'),
    ))
    .orderBy(desc(applications.updatedAt))
    .limit(1);
  if (latestAdopted) {
    return { ok: true, alreadyExists: false, applicationId: latestAdopted.id };
  }

  const [latestPending] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(
      eq(applications.tenantId, tenantId),
      eq(applications.animalId, animalId),
      inArray(applications.stage, ['approved', 'trial']),
    ))
    .orderBy(desc(applications.updatedAt))
    .limit(1);
  if (latestPending) {
    return { ok: true, alreadyExists: false, applicationId: latestPending.id };
  }

  return { ok: false };
}

/**
 * Get all applications for a tenant
 * Returns animal as nested object { id, name } for frontend compatibility
 */
export async function getApplicationsByTenant(tenantId: string) {
  const results = await db
    .select({
      id: applications.id,
      tenantId: applications.tenantId,
      animalId: applications.animalId,
      animalName: animals.name,
      applicantName: applications.applicantName,
      applicantEmail: applications.applicantEmail,
      applicantPhone: applications.applicantPhone,
      stage: applications.stage,
      notes: applications.notes,
      customResponses: applications.customResponses,
      smsConsent: applications.smsConsent,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .leftJoin(animals, eq(applications.animalId, animals.id))
    .where(eq(applications.tenantId, tenantId))
    .orderBy(desc(applications.createdAt));
  
  // Transform to include both flat animalName (used by ApplicationsPage's
  // active + terminal cards and KanbanBoard subtitle) AND nested
  // animal: { id, name } (used by the dashboard PipelineManager). Stripping
  // animalName here is what caused the "Applied for: Unknown Animal" labels
  // on the Adopted/Denied/Trial-Failed tabs — those cards read app.animalName
  // directly from the API response (no /api/animals lookup), so we must
  // surface it.
  return results.map(app => ({
    id: app.id,
    tenantId: app.tenantId,
    animalId: app.animalId,
    animalName: app.animalName ?? undefined,
    applicantName: app.applicantName,
    applicantEmail: app.applicantEmail,
    applicantPhone: app.applicantPhone,
    stage: app.stage,
    notes: app.notes,
    customResponses: app.customResponses,
    smsConsent: app.smsConsent,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    // Provide animal as nested object { id, name } for frontend
    animal: app.animalId && app.animalName ? { id: app.animalId, name: app.animalName } : undefined,
  }));
}

/**
 * Get application by ID within tenant
 */
export async function getApplicationById(tenantId: string, applicationId: string) {
  const [application] = await db
    .select({
      id: applications.id,
      tenantId: applications.tenantId,
      animalId: applications.animalId,
      applicantName: applications.applicantName,
      applicantEmail: applications.applicantEmail,
      applicantPhone: applications.applicantPhone,
      stage: applications.stage,
      notes: applications.notes,
      customResponses: applications.customResponses,
      smsConsent: applications.smsConsent,
      gclid: applications.gclid,
      gclidCapturedAt: applications.gclidCapturedAt,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .where(and(
      eq(applications.tenantId, tenantId),
      eq(applications.id, applicationId)
    ))
    .limit(1);
  
  return application || null;
}

/**
 * Create a new application
 */
export async function createApplication(tenantId: string, data: Omit<InsertApplication, 'tenantId'>): Promise<Application> {
  // Verify animal belongs to this tenant
  const [animal] = await db
    .select({ id: animals.id, tenantId: animals.tenantId })
    .from(animals)
    .where(and(
      eq(animals.tenantId, tenantId),
      eq(animals.id, data.animalId)
    ))
    .limit(1);

  if (!animal) {
    throw new Error('Animal not found or does not belong to this organization');
  }

  const [application] = await db
    .insert(applications)
    .values({
      ...(data as any),
      tenantId,
    })
    .returning();
  
  // Create/update contact from this adoption application
  try {
    const { createContactFromAdoptionApplication } = await import('./contacts');
    await createContactFromAdoptionApplication(
      tenantId,
      data.applicantName,
      data.applicantEmail,
      data.applicantPhone
    );
  } catch (error) {
    console.error('Failed to create contact from adoption application:', error);
    // Don't fail the application creation if contact creation fails
  }
  
  return application;
}

/**
 * Update application stage
 * Auto-dismisses from pending widget when moving from pending stages to completed stages
 * 
 * @param tenantId - The tenant ID
 * @param applicationId - The application ID to update
 * @param stage - The new stage to set
 * @param userId - User ID for auto-dismiss attribution (required for auto-dismiss to work)
 */
export async function updateApplicationStage(
  tenantId: string,
  applicationId: string,
  stage: Application['stage'],
  userId?: string,
  options: { confirmMicrochipPending?: boolean } = {},
) {
  // Stages that appear in the pending applications widget
  const pendingStages = ['new', 'screening', 'vet_check', 'home_visit'];
  // Stages that indicate the application is no longer pending
  const completedStages = ['approved', 'trial', 'adopted', 'denied', 'trial_failed'];
  
  // Get current stage and animalId to check if we need to auto-dismiss and sync animal status
  const [currentApp] = await db
    .select({ stage: applications.stage, animalId: applications.animalId })
    .from(applications)
    .where(and(
      eq(applications.tenantId, tenantId),
      eq(applications.id, applicationId)
    ))
    .limit(1);
  
  // If application doesn't exist, return early
  if (!currentApp) {
    return null;
  }
  
  const oldStage = currentApp.stage;
  const animalId = currentApp.animalId;

  // Path B: when transitioning to 'adopted', finalize the adoption FIRST
  // (before the application stage update is committed). finalizeAdoption()
  // handles the adoption row insert, animal status flip + location clear,
  // microchip transfer, animal audit log, AND it promotes the application
  // stage to 'adopted' itself. Doing it first means a finalize failure
  // throws BEFORE we update applications.stage, so we cannot leave the
  // application marked adopted with no adoption row / animal flip behind
  // it.
  const isAdoptedTransition = stage === 'adopted' && oldStage !== 'adopted';
  if (isAdoptedTransition) {
    // Task #168: align with Path A (POST /api/adoptions). Pass
    // microchipPolicy: 'block' so the Kanban drag surfaces the same
    // MICROCHIP_TRANSFER_PENDING guardrail as the Record Adoption form.
    // Staff can override by re-issuing the stage change with
    // confirmMicrochipPending=true (handled at the route layer).
    const { finalizeAdoption } = await import('./adoptions');
    const result = await finalizeAdoption(tenantId, animalId, {
      applicationId,
      microchipPolicy: 'block',
      confirmMicrochipPending: options.confirmMicrochipPending,
      actor: userId ? { id: userId } : undefined,
      auditNote: options.confirmMicrochipPending
        ? 'Adopted via Kanban stage change (microchip pending acknowledged)'
        : 'Adopted via Kanban stage change',
    });
    if (!result.ok) {
      throw new FinalizeAdoptionError(
        `finalizeAdoption failed for animal ${animalId} from application ${applicationId}: ${result.code}`,
        result.code,
        result.code === 'MICROCHIP_TRANSFER_PENDING' ? result.pendingMicrochips : undefined,
      );
    }
  }

  const [application] = await db
    .update(applications)
    .set({
      stage,
      updatedAt: new Date(),
    })
    .where(and(
      eq(applications.tenantId, tenantId),
      eq(applications.id, applicationId)
    ))
    .returning();
  
  if (!application) {
    return null;
  }
  
  // Auto-dismiss from widget if moving from a pending stage to a completed stage
  const shouldAutoDismiss = pendingStages.includes(oldStage) && completedStages.includes(stage);
  
  if (shouldAutoDismiss) {
    if (!userId) {
      console.log(`[AUTO-DISMISS] Skipping adoption application ${applicationId} - no user ID provided for attribution`);
    } else {
      try {
        // Check if already dismissed
        const existing = await db.select({ id: dismissedWidgetItems.id })
          .from(dismissedWidgetItems)
          .where(
            and(
              eq(dismissedWidgetItems.tenantId, tenantId),
              eq(dismissedWidgetItems.applicationType, 'adoption'),
              eq(dismissedWidgetItems.applicationId, applicationId)
            )
          )
          .limit(1);
        
        if (existing.length === 0) {
          // Insert auto-dismiss record
          await db.insert(dismissedWidgetItems).values({
            tenantId,
            applicationType: 'adoption',
            applicationId,
            dismissedBy: userId,
          });
          
          console.log(`[AUTO-DISMISS] Adoption application ${applicationId} auto-dismissed (${oldStage} -> ${stage})`);
        } else {
          console.log(`[AUTO-DISMISS] Adoption application ${applicationId} already dismissed`);
        }
      } catch (error) {
        // Don't fail the stage update if auto-dismiss fails
        console.error('Failed to auto-dismiss adoption application:', error);
      }
    }
  }
  
  // Sync animal status based on the new application stage (non-adopted
  // transitions only — the 'adopted' transition was already handled by
  // finalizeAdoption() above, which owns animal status, location clear,
  // adoption row, and audit log for that case).
  if (!isAdoptedTransition) {
    await syncAnimalStatusFromApplicationStage(tenantId, animalId, stage, applicationId);
  }

  return application;
}

/**
 * Update application
 */
export async function updateApplication(
  tenantId: string,
  applicationId: string,
  data: Partial<Omit<InsertApplication, 'tenantId'>>
) {
  const [application] = await db
    .update(applications)
    .set({
      ...(data as any),
      updatedAt: new Date(),
    })
    .where(and(
      eq(applications.tenantId, tenantId),
      eq(applications.id, applicationId)
    ))
    .returning();
  
  return application || null;
}

/**
 * Sync animal status based on application stage changes
 * This ensures the animal's status reflects the most advanced application stage
 * 
 * Rules:
 * - home_visit or approved → adoption_pending
 * - trial → in_trial
 * - adopted → adopted
 * - denied or trial_failed → check for other active applications, revert to available if none
 */
export async function syncAnimalStatusFromApplicationStage(
  tenantId: string,
  animalId: string,
  newStage: Application['stage'],
  applicationId: string
): Promise<void> {
  try {
    // Define stage to animal status mapping
    const stageToAnimalStatus: Record<string, string> = {
      'home_visit': 'adoption_pending',
      'approved': 'adoption_pending',
      'trial': 'in_trial',
      'adopted': 'adopted',
    };

    // Stages that indicate the application is no longer progressing
    const terminalStages = ['denied', 'trial_failed'];
    
    // Stages that should trigger animal status update
    const triggerStages = ['home_visit', 'approved', 'trial', 'adopted'];

    if (triggerStages.includes(newStage)) {
      // Update animal status based on application stage
      const newAnimalStatus = stageToAnimalStatus[newStage];
      if (newAnimalStatus) {
        await db
          .update(animals)
          .set({ 
            status: newAnimalStatus as any,
            updatedAt: new Date()
          })
          .where(and(
            eq(animals.id, animalId),
            eq(animals.tenantId, tenantId)
          ));
        console.log(`Animal ${animalId} status updated to ${newAnimalStatus} due to application stage ${newStage}`);
      }
    } else if (terminalStages.includes(newStage)) {
      // Application was denied or trial failed - check if there are other active applications
      const otherActiveApplications = await db
        .select({ id: applications.id, stage: applications.stage })
        .from(applications)
        .where(and(
          eq(applications.tenantId, tenantId),
          eq(applications.animalId, animalId)
        ));
      
      // Filter to find other applications in home_visit, approved, or trial stages
      const hasOtherActiveApps = otherActiveApplications.some(
        app => app.id !== applicationId && 
               ['home_visit', 'approved', 'trial'].includes(app.stage)
      );

      if (!hasOtherActiveApps) {
        // No other active applications, revert animal to available
        // But only if current status is adoption_pending or in_trial
        const [currentAnimal] = await db
          .select({ status: animals.status })
          .from(animals)
          .where(and(
            eq(animals.id, animalId),
            eq(animals.tenantId, tenantId)
          ))
          .limit(1);

        if (currentAnimal && ['adoption_pending', 'in_trial'].includes(currentAnimal.status)) {
          await db
            .update(animals)
            .set({ 
              status: 'available',
              updatedAt: new Date()
            })
            .where(and(
              eq(animals.id, animalId),
              eq(animals.tenantId, tenantId)
            ));
          console.log(`Animal ${animalId} status reverted to available after application ${newStage}`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to sync animal status from application stage:', error);
    // Don't throw - this is a side effect that shouldn't fail the main operation
  }
}
