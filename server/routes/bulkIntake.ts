import { Router } from 'express';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { db } from '../db';
import {
  animals,
  preventativeCareRecords,
  preventativeCareTypes,
} from '@shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';

const router = Router();

async function generateAnimalIdInTx(tx: NodePgDatabase<any>): Promise<string> {
  let attempts = 0;
  while (attempts < 10) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const animalId = `A${randomNum}`;
    const [existing] = await tx
      .select({ id: animals.id })
      .from(animals)
      .where(eq(animals.animalId, animalId))
      .limit(1);
    if (!existing) return animalId;
    attempts++;
  }
  return `A${Date.now().toString().slice(-5)}`;
}

const bulkIntakeAnimalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sex: z.enum(["male", "female", "unknown"]).optional(),
  colors: z.array(z.string()).optional().default([]),
  weight: z.string().optional().default(""),
});

const bulkIntakeSchema = z.object({
  sharedData: z.object({
    intakeDate: z.string().optional(),
    intakeSource: z.enum(["stray", "owner_surrender", "transfer", "born_in_care", "other"]).optional(),
    petfinderType: z.string().optional(),
    petfinderBreed: z.string().optional(),
    petfinderAge: z.string().optional(),
    petfinderSize: z.string().optional(),
    species: z.string().optional(),
    breed: z.string().optional(),
    locationType: z.enum(["shelter", "foster", "clinic", "transport", "offsite"]).optional(),
    locationName: z.string().optional(),
    motherId: z.string().uuid().optional().nullable(),
    status: z.string().optional().default("available"),
  }),
  animals: z.array(bulkIntakeAnimalSchema).min(1, "At least one animal is required").max(25, "Maximum 25 animals per litter intake"),
  applyProtocol: z.boolean().default(false),
});

router.post(
  '/',
  requireTenant,
  requireAuth,
  requireRole('admin', 'staff'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      const parsed = bulkIntakeSchema.parse(req.body);
      const { sharedData, animals: animalRows, applyProtocol } = parsed;

      const intakeDate = sharedData.intakeDate ? new Date(sharedData.intakeDate) : new Date();
      const speciesVal = sharedData.species || sharedData.petfinderType || "Unknown";
      const breedVal = sharedData.breed || sharedData.petfinderBreed || "Unknown";

      if (sharedData.motherId) {
        const [mother] = await db
          .select({ id: animals.id })
          .from(animals)
          .where(and(eq(animals.id, sharedData.motherId), eq(animals.tenantId, tenantId)))
          .limit(1);
        if (!mother) {
          return res.status(400).json({ error: "Selected mother animal not found in your organization." });
        }
      }

      const names = animalRows.map(r => r.name.trim().toLowerCase());
      const uniqueNames = new Set(names);
      if (uniqueNames.size !== names.length) {
        return res.status(400).json({ error: "Each animal in the litter must have a unique name." });
      }

      const result = await db.transaction(async (tx) => {
        const createdAnimalIds: string[] = [];
        const createdAnimals: any[] = [];

        for (const row of animalRows) {
          const animalId = await generateAnimalIdInTx(tx as any);

          const [existing] = await tx
            .select({ id: animals.id })
            .from(animals)
            .where(and(
              eq(animals.tenantId, tenantId),
              sql`lower(trim(${animals.name})) = lower(trim(${row.name}))`,
              sql`${animals.status} != 'merged'`
            ))
            .limit(1);

          if (existing) {
            throw Object.assign(new Error(`An animal named "${row.name}" already exists. Please use unique names.`), { status: 409 });
          }

          const [animal] = await tx
            .insert(animals)
            .values({
              tenantId,
              animalId,
              name: row.name,
              species: speciesVal,
              breed: breedVal,
              age: sharedData.petfinderAge || "Baby",
              sex: row.sex || undefined,
              petfinderType: sharedData.petfinderType || null,
              petfinderBreed: sharedData.petfinderBreed || null,
              petfinderAge: sharedData.petfinderAge || null,
              petfinderSize: sharedData.petfinderSize || null,
              petfinderGender: row.sex === 'male' ? 'Male' : row.sex === 'female' ? 'Female' : 'Unknown',
              colors: row.colors?.length ? row.colors : [],
              weight: row.weight || null,
              intakeDate,
              intakeSource: sharedData.intakeSource || null,
              locationType: sharedData.locationType || "shelter",
              locationName: sharedData.locationName || null,
              motherId: sharedData.motherId || null,
              status: (sharedData.status as any) || "available",
              photoUrls: [],
              bio: "",
            })
            .returning();

          createdAnimalIds.push(animal.id);
          createdAnimals.push(animal);
        }

        if (applyProtocol && createdAnimalIds.length > 0) {
          const speciesType = (sharedData.petfinderType || sharedData.species || "").toLowerCase();
          const ageCategory = (sharedData.petfinderAge || "Baby").toLowerCase();
          let protocolName: string;
          if (speciesType.includes('cat')) {
            protocolName = ageCategory === 'baby' ? 'kitten' : 'adult_cat';
          } else {
            protocolName = ageCategory === 'baby' ? 'puppy' : 'adult_dog';
          }

          const protocolMap: Record<string, { careTypeNames: string[]; description: string }> = {
            puppy: {
              careTypeNames: ['DHPP', 'Dewormer', 'Flea/Tick Prevention'],
              description: 'Puppy Protocol'
            },
            kitten: {
              careTypeNames: ['FVRCP', 'Dewormer', 'Flea/Tick Prevention'],
              description: 'Kitten Protocol'
            },
            adult_dog: {
              careTypeNames: ['DHPP', 'Rabies', 'Bordetella', 'Heartworm Test', 'Dewormer', 'Flea/Tick Prevention'],
              description: 'Adult Dog Protocol'
            },
            adult_cat: {
              careTypeNames: ['FVRCP', 'Rabies', 'FeLV/FIV Test', 'Dewormer', 'Flea/Tick Prevention'],
              description: 'Adult Cat Protocol'
            },
          };

          const protocol = protocolMap[protocolName];
          if (protocol) {
            const careTypes = await tx
              .select()
              .from(preventativeCareTypes)
              .where(
                and(
                  eq(preventativeCareTypes.tenantId, tenantId),
                  inArray(preventativeCareTypes.name, protocol.careTypeNames)
                )
              );

            if (careTypes.length > 0) {
              const now = new Date();
              for (const createdAnimalId of createdAnimalIds) {
                for (const careType of careTypes) {
                  const dueDate = new Date(now);
                  dueDate.setDate(dueDate.getDate() + (careType.defaultIntervalDays || 21));

                  await tx.insert(preventativeCareRecords).values({
                    tenantId,
                    animalId: createdAnimalId,
                    careTypeId: careType.id,
                    careTypeName: careType.name,
                    status: 'due',
                    dueDate,
                    notes: `Auto-applied via ${protocol.description} (Bulk Litter Intake)`,
                  });
                }
              }
            }
          }
        }

        return { createdAnimalIds, createdAnimals };
      });

      res.json({
        success: true,
        count: result.createdAnimals.length,
        animalIds: result.createdAnimalIds,
        animals: result.createdAnimals,
      });
    } catch (error: any) {
      if (error.status === 409) {
        return res.status(409).json({ error: error.message });
      }
      next(error);
    }
  }
);

export default router;
