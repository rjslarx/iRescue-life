import { db } from '../db';
import { applications, animals, type InsertApplication, type Application } from '@shared/schema';
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
 */
export async function updateApplicationStage(
  tenantId: string,
  applicationId: string,
  stage: Application['stage']
) {
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
  
  return application || null;
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
