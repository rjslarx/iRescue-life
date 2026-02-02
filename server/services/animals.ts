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
      id: animals.id,
      tenantId: animals.tenantId,
      animalId: animals.animalId,
      name: animals.name,
      species: animals.species,
      breed: animals.breed,
      sex: animals.sex,
      age: animals.age,
      weight: animals.weight,
      status: animals.status,
      microchipNumber: animals.microchipNumber,
      intakeDate: animals.intakeDate,
      intakeSource: animals.intakeSource,
      neuterStatus: animals.neuterStatus,
      dateOfBirth: animals.dateOfBirth,
      kennelLocation: animals.kennelLocation,
      kennelBuildingId: animals.kennelBuildingId,
      kennelRowId: animals.kennelRowId,
      kennelPosition: animals.kennelPosition,
      medicalAlertMemo: animals.medicalAlertMemo,
      medicalStatus: animals.medicalStatus,
      scheduledSurgeryDate: animals.scheduledSurgeryDate,
      photoUrls: animals.photoUrls,
      bio: animals.bio,
      petfinderType: animals.petfinderType,
      petfinderBreed: animals.petfinderBreed,
      petfinderBreedSecondary: animals.petfinderBreedSecondary,
      petfinderAge: animals.petfinderAge,
      petfinderSize: animals.petfinderSize,
      petfinderGender: animals.petfinderGender,
      houseTrained: animals.houseTrained,
      declawed: animals.declawed,
      specialNeeds: animals.specialNeeds,
      shotsCurrent: animals.shotsCurrent,
      heartwormPositive: animals.heartwormPositive,
      childFriendly: animals.childFriendly,
      catFriendly: animals.catFriendly,
      dogFriendly: animals.dogFriendly,
      needsFence: animals.needsFence,
      mergedWithId: animals.mergedWithId,
      locationFound: animals.locationFound,
      strayHoldUntil: animals.strayHoldUntil,
      activityLevel: animals.activityLevel,
      dietaryRestrictions: animals.dietaryRestrictions,
      adoptionDate: animals.adoptionDate,
      deceasedDate: animals.deceasedDate,
      causeOfDeath: animals.causeOfDeath,
      deceasedNotes: animals.deceasedNotes,
      postedToPetfinder: animals.postedToPetfinder,
      petfinderUrl: animals.petfinderUrl,
      petfinderSyncedAt: animals.petfinderSyncedAt,
      flaggedForStory: animals.flaggedForStory,
      storyTags: animals.storyTags,
      behaviorColor: animals.behaviorColor,
      behaviorRestrictionReason: animals.behaviorRestrictionReason,
      flyerUrls: animals.flyerUrls,
      canvaDesignId: animals.canvaDesignId,
      medicalFundGoal: animals.medicalFundGoal,
      medicalFundRaised: animals.medicalFundRaised,
      externalId: animals.externalId,
      externalSource: animals.externalSource,
      driveFolderId: animals.driveFolderId,
      createdAt: animals.createdAt,
      updatedAt: animals.updatedAt,
      kennelRowName: kennelRows.name,
    })
    .from(animals)
    .leftJoin(kennelRows, eq(animals.kennelRowId, kennelRows.id))
    .where(eq(animals.tenantId, tenantId))
    .orderBy(desc(animals.createdAt));
  
  return results as any;
}

/**
 * Get available animals for adoption (public view)
 * Includes animals with 'available' and 'foster' status since foster animals are usually available for adoption
 */
export async function getAvailableAnimals(tenantId: string): Promise<Animal[]> {
  return db
    .select({
      id: animals.id,
      tenantId: animals.tenantId,
      animalId: animals.animalId,
      name: animals.name,
      species: animals.species,
      breed: animals.breed,
      sex: animals.sex,
      age: animals.age,
      weight: animals.weight,
      status: animals.status,
      microchipNumber: animals.microchipNumber,
      intakeDate: animals.intakeDate,
      intakeSource: animals.intakeSource,
      neuterStatus: animals.neuterStatus,
      dateOfBirth: animals.dateOfBirth,
      kennelLocation: animals.kennelLocation,
      kennelBuildingId: animals.kennelBuildingId,
      kennelRowId: animals.kennelRowId,
      kennelPosition: animals.kennelPosition,
      medicalAlertMemo: animals.medicalAlertMemo,
      medicalStatus: animals.medicalStatus,
      scheduledSurgeryDate: animals.scheduledSurgeryDate,
      photoUrls: animals.photoUrls,
      bio: animals.bio,
      petfinderType: animals.petfinderType,
      petfinderBreed: animals.petfinderBreed,
      petfinderBreedSecondary: animals.petfinderBreedSecondary,
      petfinderAge: animals.petfinderAge,
      petfinderSize: animals.petfinderSize,
      petfinderGender: animals.petfinderGender,
      houseTrained: animals.houseTrained,
      declawed: animals.declawed,
      specialNeeds: animals.specialNeeds,
      shotsCurrent: animals.shotsCurrent,
      heartwormPositive: animals.heartwormPositive,
      childFriendly: animals.childFriendly,
      catFriendly: animals.catFriendly,
      dogFriendly: animals.dogFriendly,
      needsFence: animals.needsFence,
      mergedWithId: animals.mergedWithId,
      locationFound: animals.locationFound,
      strayHoldUntil: animals.strayHoldUntil,
      activityLevel: animals.activityLevel,
      dietaryRestrictions: animals.dietaryRestrictions,
      adoptionDate: animals.adoptionDate,
      deceasedDate: animals.deceasedDate,
      causeOfDeath: animals.causeOfDeath,
      deceasedNotes: animals.deceasedNotes,
      postedToPetfinder: animals.postedToPetfinder,
      petfinderUrl: animals.petfinderUrl,
      petfinderSyncedAt: animals.petfinderSyncedAt,
      flaggedForStory: animals.flaggedForStory,
      storyTags: animals.storyTags,
      behaviorColor: animals.behaviorColor,
      behaviorRestrictionReason: animals.behaviorRestrictionReason,
      flyerUrls: animals.flyerUrls,
      canvaDesignId: animals.canvaDesignId,
      medicalFundGoal: animals.medicalFundGoal,
      medicalFundRaised: animals.medicalFundRaised,
      externalId: animals.externalId,
      externalSource: animals.externalSource,
      driveFolderId: animals.driveFolderId,
      createdAt: animals.createdAt,
      updatedAt: animals.updatedAt,
    })
    .from(animals)
    .where(and(
      eq(animals.tenantId, tenantId),
      or(
        eq(animals.status, 'available'),
        eq(animals.status, 'foster')
      )
    ))
    .orderBy(desc(animals.createdAt)) as any;
}

/**
 * Get animal by ID within tenant
 * Includes kennel row name for display purposes
 */
export async function getAnimalById(tenantId: string, animalId: string): Promise<(Animal & { kennelRowName?: string | null }) | null> {
  const [result] = await db
    .select({
      id: animals.id,
      tenantId: animals.tenantId,
      animalId: animals.animalId,
      name: animals.name,
      species: animals.species,
      breed: animals.breed,
      sex: animals.sex,
      age: animals.age,
      weight: animals.weight,
      status: animals.status,
      microchipNumber: animals.microchipNumber,
      intakeDate: animals.intakeDate,
      intakeSource: animals.intakeSource,
      neuterStatus: animals.neuterStatus,
      dateOfBirth: animals.dateOfBirth,
      kennelLocation: animals.kennelLocation,
      kennelBuildingId: animals.kennelBuildingId,
      kennelRowId: animals.kennelRowId,
      kennelPosition: animals.kennelPosition,
      medicalAlertMemo: animals.medicalAlertMemo,
      medicalStatus: animals.medicalStatus,
      scheduledSurgeryDate: animals.scheduledSurgeryDate,
      photoUrls: animals.photoUrls,
      bio: animals.bio,
      petfinderType: animals.petfinderType,
      petfinderBreed: animals.petfinderBreed,
      petfinderBreedSecondary: animals.petfinderBreedSecondary,
      petfinderAge: animals.petfinderAge,
      petfinderSize: animals.petfinderSize,
      petfinderGender: animals.petfinderGender,
      houseTrained: animals.houseTrained,
      declawed: animals.declawed,
      specialNeeds: animals.specialNeeds,
      shotsCurrent: animals.shotsCurrent,
      heartwormPositive: animals.heartwormPositive,
      childFriendly: animals.childFriendly,
      catFriendly: animals.catFriendly,
      dogFriendly: animals.dogFriendly,
      needsFence: animals.needsFence,
      mergedWithId: animals.mergedWithId,
      locationFound: animals.locationFound,
      strayHoldUntil: animals.strayHoldUntil,
      activityLevel: animals.activityLevel,
      dietaryRestrictions: animals.dietaryRestrictions,
      adoptionDate: animals.adoptionDate,
      deceasedDate: animals.deceasedDate,
      causeOfDeath: animals.causeOfDeath,
      deceasedNotes: animals.deceasedNotes,
      postedToPetfinder: animals.postedToPetfinder,
      petfinderUrl: animals.petfinderUrl,
      petfinderSyncedAt: animals.petfinderSyncedAt,
      flaggedForStory: animals.flaggedForStory,
      storyTags: animals.storyTags,
      behaviorColor: animals.behaviorColor,
      behaviorRestrictionReason: animals.behaviorRestrictionReason,
      flyerUrls: animals.flyerUrls,
      canvaDesignId: animals.canvaDesignId,
      medicalFundGoal: animals.medicalFundGoal,
      medicalFundRaised: animals.medicalFundRaised,
      externalId: animals.externalId,
      externalSource: animals.externalSource,
      driveFolderId: animals.driveFolderId,
      createdAt: animals.createdAt,
      updatedAt: animals.updatedAt,
      kennelRowName: kennelRows.name,
    })
    .from(animals)
    .leftJoin(kennelRows, eq(animals.kennelRowId, kennelRows.id))
    .where(and(
      eq(animals.tenantId, tenantId),
      eq(animals.id, animalId)
    ))
    .limit(1);
  
  return (result as any) || null;
}

/**
 * Create a new animal
 */
export async function createAnimal(tenantId: string, data: Omit<InsertAnimal, 'animalId' | 'tenantId'>): Promise<Animal> {
  const animalId = await generateAnimalId();
  
  const [animal] = await db
    .insert(animals)
    .values({
      ...data,
      tenantId,
      animalId,
    })
    .returning();
  
  return animal;
}

/**
 * Update an existing animal
 */
export async function updateAnimal(tenantId: string, animalId: string, data: Partial<InsertAnimal>): Promise<Animal | null> {
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
