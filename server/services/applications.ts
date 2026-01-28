import { db } from '../db';
import { applications, animals, dismissedWidgetItems, type InsertApplication, type Application } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Get all applications for a tenant
 */
export async function getApplicationsByTenant(tenantId: string) {
  return db
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
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .leftJoin(animals, eq(applications.animalId, animals.id))
    .where(eq(applications.tenantId, tenantId))
    .orderBy(desc(applications.createdAt));
}

/**
 * Get application by ID within tenant
 */
export async function getApplicationById(tenantId: string, applicationId: string) {
  const [application] = await db
    .select()
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
    .select()
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
  userId?: string
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
        const existing = await db.select()
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
  
  // Sync animal status based on the new application stage
  await syncAnimalStatusFromApplicationStage(tenantId, animalId, stage, applicationId);
  
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
