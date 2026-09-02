import { db } from '../db';
import { animals, kennelRows, fosterAnimals, users, type InsertAnimal, type Animal } from '@shared/schema';
import { eq, and, or, desc, sql, ne, inArray, isNull } from 'drizzle-orm';

import { generateLocalShelterId } from '../utils/shelterId';

/** Reusable filter that excludes TNR animals from all standard rescue views */
export const excludeTnr = or(isNull(animals.recordType), ne(animals.recordType, 'tnr'));

export const publicAnimalStatuses = ['available', 'adoption_pending', 'in_trial'] as const;

const publicAnimalSelect = {
  id: animals.id,
  name: animals.name,
  species: animals.species,
  breed: animals.breed,
  age: animals.age,
  sex: animals.sex,
  photoUrls: animals.photoUrls,
  bio: animals.bio,
  status: animals.status,
  weight: animals.weight,
  colors: animals.colors,
  activityLevel: animals.activityLevel,
  houseTrained: animals.houseTrained,
  specialNeeds: animals.specialNeeds,
  shotsCurrent: animals.shotsCurrent,
  childFriendly: animals.childFriendly,
  catFriendly: animals.catFriendly,
  dogFriendly: animals.dogFriendly,
  needsFence: animals.needsFence,
};

export const publicAnimalFilter = (tenantId: string) => and(
  eq(animals.tenantId, tenantId),
  or(
    eq(animals.status, 'available'),
    eq(animals.status, 'adoption_pending'),
    eq(animals.status, 'in_trial' as any),
  ),
  eq(animals.medicalHold, false),
  excludeTnr,
);

async function checkDuplicateAnimalName(tenantId: string, name: string, excludeAnimalId?: string): Promise<void> {
  const conditions = [
    eq(animals.tenantId, tenantId),
    sql`lower(trim(${animals.name})) = lower(trim(${name}))`,
    sql`${animals.status} != 'merged'`
  ];
  if (excludeAnimalId) {
    conditions.push(ne(animals.id, excludeAnimalId));
  }
  const [existing] = await db
    .select({ id: animals.id, name: animals.name })
    .from(animals)
    .where(and(...conditions))
    .limit(1);
  if (existing) {
    const error: any = new Error(`An animal named "${existing.name}" already exists. Please use a unique name.`);
    error.status = 409;
    throw error;
  }
}

/**
 * Generate a unique animal ID (e.g., A12345)
 */
async function generateAnimalId(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Generate a random 5-digit number
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const animalId = `A${randomNum}`;
    
    // Check if this ID already exists
    const [existing] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(eq(animals.animalId, animalId))
      .limit(1);
    
    if (!existing) {
      return animalId;
    }
    
    attempts++;
  }
  
  // Fallback: use timestamp-based ID if all random attempts fail
  return `A${Date.now().toString().slice(-5)}`;
}

/**
 * Get all animals for a tenant
 * Includes kennel row name for display purposes
 */
export async function getAnimalsByTenant(tenantId: string): Promise<(Animal & { kennelRowName?: string | null })[]> {
  const animalResults = await db
    .select()
    .from(animals)
    .where(and(eq(animals.tenantId, tenantId), excludeTnr))
    .orderBy(desc(animals.createdAt));
  
  if (!animalResults.length) return [];
  
  const rowIds = [...new Set(animalResults.map(a => a.kennelRowId).filter(Boolean))] as string[];
  const rowMap: Record<string, string> = {};
  if (rowIds.length > 0) {
    const rows = await db
      .select({ id: kennelRows.id, name: kennelRows.name })
      .from(kennelRows)
      .where(inArray(kennelRows.id, rowIds));
    rows.forEach(r => { rowMap[r.id] = r.name; });
  }
  
  const fosterAnimalIds = animalResults.filter(a => a.locationType === 'foster').map(a => a.id);
  const fosterNameMap: Record<string, string> = {};
  if (fosterAnimalIds.length > 0) {
    const fosterResults = await db
      .select({
        animalId: fosterAnimals.animalId,
        fosterName: users.fullName,
      })
      .from(fosterAnimals)
      .innerJoin(users, eq(fosterAnimals.fosterId, users.id))
      .where(and(
        inArray(fosterAnimals.animalId, fosterAnimalIds),
        eq(fosterAnimals.tenantId, tenantId),
        eq(fosterAnimals.status, 'active')
      ));
    fosterResults.forEach(r => { fosterNameMap[r.animalId] = r.fosterName; });
  }

  return animalResults.map(a => ({
    ...a,
    kennelRowName: a.kennelRowId ? (rowMap[a.kennelRowId] || null) : null,
    locationName: (a.locationType === 'foster' && !a.locationName && fosterNameMap[a.id])
      ? fosterNameMap[a.id]
      : a.locationName,
  })) as any;
}

/**
 * Get available animals for adoption (public view)
 * Shows animals with 'available' status regardless of location (shelter or foster)
 */
export async function getAvailableAnimals(tenantId: string) {
  return db
    .select(publicAnimalSelect)
    .from(animals)
    .where(publicAnimalFilter(tenantId))
    .orderBy(desc(animals.createdAt));
}

export async function getPublicAnimalById(tenantId: string, animalId: string) {
  const [animal] = await db
    .select(publicAnimalSelect)
    .from(animals)
    .where(and(publicAnimalFilter(tenantId), eq(animals.id, animalId)))
    .limit(1);
  return animal || null;
}

export function canAccessInternalAnimalProfile(viewer: { roles?: string[] | null } | null | undefined): boolean {
  return !!viewer?.roles?.some((role) => role === 'owner' || role === 'admin' || role === 'staff');
}

export async function getAnimalForProfileRequest(
  tenantId: string,
  animalId: string,
  viewer: { roles?: string[] | null } | null | undefined,
) {
  return canAccessInternalAnimalProfile(viewer)
    ? getAnimalById(tenantId, animalId)
    : getPublicAnimalById(tenantId, animalId);
}

/**
 * Get animal by ID within tenant
 * Includes kennel row name for display purposes
 */
export async function getAnimalById(tenantId: string, animalId: string): Promise<(Animal & { kennelRowName?: string | null }) | null> {
  const results = await db
    .select()
    .from(animals)
    .where(and(
      eq(animals.tenantId, tenantId),
      eq(animals.id, animalId)
    ))
    .limit(1);
  
  if (!results.length) return null;
  
  const animal = results[0];
  
  let kennelRowName: string | null = null;
  if (animal.kennelRowId) {
    const [row] = await db
      .select({ name: kennelRows.name })
      .from(kennelRows)
      .where(eq(kennelRows.id, animal.kennelRowId))
      .limit(1);
    kennelRowName = row?.name || null;
  }
  
  return { ...animal, kennelRowName } as any;
}

/**
 * Create a new animal
 */
export async function createAnimal(tenantId: string, data: Omit<InsertAnimal, 'animalId' | 'tenantId'>): Promise<Animal> {
  await checkDuplicateAnimalName(tenantId, data.name);
  const animalId = await generateAnimalId();
  const localShelterId = await generateLocalShelterId(tenantId, data.species);
  
  const [animal] = await db
    .insert(animals)
    .values({
      ...data,
      tenantId,
      animalId,
      localShelterId,
    })
    .returning();
  
  return animal;
}

/**
 * Update an existing animal
 */
export async function updateAnimal(tenantId: string, animalId: string, data: Partial<InsertAnimal>): Promise<Animal | null> {
  if (data.name) {
    await checkDuplicateAnimalName(tenantId, data.name, animalId);
  }
  const [updated] = await db
    .update(animals)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(
      eq(animals.tenantId, tenantId),
      eq(animals.id, animalId)
    ))
    .returning();
  
  return updated || null;
}
