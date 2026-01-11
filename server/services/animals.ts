import { db } from '../db';
import { animals, kennelRows, type InsertAnimal, type Animal } from '@shared/schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';

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
  const results = await db
    .select({
      animal: animals,
      kennelRowName: kennelRows.name,
    })
    .from(animals)
    .leftJoin(kennelRows, eq(animals.kennelRowId, kennelRows.id))
    .where(eq(animals.tenantId, tenantId))
    .orderBy(desc(animals.createdAt));
  
  return results.map(r => ({
    ...r.animal,
    kennelRowName: r.kennelRowName,
  }));
}

/**
 * Get available animals for adoption (public view)
 * Includes animals with 'available' and 'foster' status since foster animals are usually available for adoption
 */
export async function getAvailableAnimals(tenantId: string): Promise<Animal[]> {
  return db
    .select()
    .from(animals)
    .where(and(
      eq(animals.tenantId, tenantId),
      or(
        eq(animals.status, 'available'),
        eq(animals.status, 'foster')
      )
    ))
    .orderBy(desc(animals.createdAt));
}

/**
 * Get animal by ID within tenant
 * Includes kennel row name for display purposes
 */
export async function getAnimalById(tenantId: string, animalId: string): Promise<(Animal & { kennelRowName?: string | null }) | null> {
  const [result] = await db
    .select({
      animal: animals,
      kennelRowName: kennelRows.name,
    })
    .from(animals)
    .leftJoin(kennelRows, eq(animals.kennelRowId, kennelRows.id))
    .where(and(
      eq(animals.tenantId, tenantId),
      eq(animals.id, animalId)
    ))
    .limit(1);
  
  if (!result) return null;
  
  return {
    ...result.animal,
    kennelRowName: result.kennelRowName,
  };
}

/**
 * Create a new animal
 */
export async function createAnimal(tenantId: string, data: Omit<InsertAnimal, 'tenantId'>): Promise<Animal> {
  // Generate unique animal ID
  const animalId = await generateAnimalId();
  
  const [animal] = await db
    .insert(animals)
    .values({
      ...(data as any),
      tenantId,
      animalId,
    })
    .returning();
  
  return animal;
}

/**
 * Update an animal
 */
export async function updateAnimal(
  tenantId: string,
  animalId: string,
  data: Partial<Omit<InsertAnimal, 'tenantId'>>
): Promise<Animal | null> {
  const [animal] = await db
    .update(animals)
    .set({
      ...(data as any),
      updatedAt: new Date(),
    })
    .where(and(
      eq(animals.tenantId, tenantId),
      eq(animals.id, animalId)
    ))
    .returning();
  
  return animal || null;
}

/**
 * Delete an animal
 */
export async function deleteAnimal(tenantId: string, animalId: string): Promise<boolean> {
  const result = await db
    .delete(animals)
    .where(and(
      eq(animals.tenantId, tenantId),
      eq(animals.id, animalId)
    ))
    .returning();
  
  return result.length > 0;
}
