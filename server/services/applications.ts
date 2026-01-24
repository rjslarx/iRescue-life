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
  const completedStages = ['approved', 'denied', 'adopted'];
  
  // Get current stage to check if we need to auto-dismiss
  const [currentApp] = await db
    .select({ stage: applications.stage })
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
