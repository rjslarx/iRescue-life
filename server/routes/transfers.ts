import { Router } from 'express';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { db } from '../db';
import {
  tenantTransfers,
  animals,
  tenants,
  vaccineRecords,
  preventativeCareRecords,
  microchipRecords,
  medicalFiles,
  medicationPlans,
  fosterAnimals,
  users,
} from '@shared/schema';
import { eq, and, or, desc, ne, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

async function generateAnimalId(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const animalId = `A${randomNum}`;
    const [existing] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(eq(animals.animalId, animalId))
      .limit(1);
    if (!existing) return animalId;
    attempts++;
  }
  throw new Error('Failed to generate unique animal ID');
}

router.get('/network-tenants', requireTenant, requireAuth, requireRole('admin', 'owner', 'staff'), async (req, res, next) => {
  try {
    const currentTenantId = req.tenant!.id;
    const networkTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
      })
      .from(tenants)
      .where(and(
        ne(tenants.id, currentTenantId),
        eq(tenants.isActive, true),
      ))
      .orderBy(tenants.name);
    res.json({ tenants: networkTenants });
  } catch (error) {
    console.error(`[TRANSFERS] GET /network-tenants failed for tenant "${req.tenant?.name}" (${req.tenant?.id}):`, error);
    next(error);
  }
});

const createTransferSchema = z.object({
  receivingTenantId: z.string().uuid(),
  animalId: z.string().uuid(),
  notes: z.string().optional(),
});

router.post('/', requireTenant, requireAuth, requireRole('admin', 'owner', 'staff'), async (req, res, next) => {
  try {
    const parsed = createTransferSchema.parse(req.body);
    const sendingTenantId = req.tenant!.id;

    if (parsed.receivingTenantId === sendingTenantId) {
      return res.status(400).json({ error: 'Cannot transfer to your own organization' });
    }

    const animal = await db.query.animals.findFirst({
      where: and(eq(animals.id, parsed.animalId), eq(animals.tenantId, sendingTenantId)),
    });
    if (!animal) return res.status(404).json({ error: 'Animal not found' });

    const terminalStatuses = ['adopted', 'transported', 'deceased'];
    if (terminalStatuses.includes(animal.status)) {
      return res.status(400).json({ error: 'Cannot transfer an animal with a terminal status' });
    }

    const existingPending = await db.query.tenantTransfers.findFirst({
      where: and(
        eq(tenantTransfers.animalId, parsed.animalId),
        eq(tenantTransfers.status, 'pending'),
      ),
    });
    if (existingPending) {
      return res.status(400).json({ error: 'A pending transfer already exists for this animal' });
    }

    const receivingTenant = await db.query.tenants.findFirst({
      where: and(eq(tenants.id, parsed.receivingTenantId), eq(tenants.isActive, true)),
    });
    if (!receivingTenant) return res.status(404).json({ error: 'Receiving organization not found' });

    const [transfer] = await db.insert(tenantTransfers).values({
      sendingTenantId,
      receivingTenantId: parsed.receivingTenantId,
      animalId: parsed.animalId,
      notes: parsed.notes || null,
      requestedBy: req.user!.id,
    }).returning();

    try {
      const { dispatchEventNotification } = await import('../services/notification-dispatcher');
      const sendingTenant = req.tenant!;
      await dispatchEventNotification({
        tenantId: parsed.receivingTenantId,
        eventKey: 'animal_transfer_received',
        subject: `Incoming Animal Transfer: ${animal.name} from ${sendingTenant.name}`,
        htmlBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Incoming Animal Transfer Request</h2>
            <p><strong>${sendingTenant.name}</strong> would like to transfer an animal to your organization:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Animal</td>
                <td style="padding: 8px 0;">${animal.name}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Species</td>
                <td style="padding: 8px 0;">${animal.species}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Breed</td>
                <td style="padding: 8px 0;">${animal.breed}</td>
              </tr>
              ${parsed.notes ? `<tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Notes</td>
                <td style="padding: 8px 0;">${parsed.notes}</td>
              </tr>` : ''}
            </table>
            <p>Please log in to your iRescue dashboard to review and accept or reject this transfer.</p>
            <p style="color: #888; font-size: 12px;">This is an automated notification from your iRescue platform.</p>
          </div>
        `,
        textBody: `Incoming Animal Transfer: ${animal.name} (${animal.species}, ${animal.breed}) from ${sendingTenant.name}. ${parsed.notes ? `Notes: ${parsed.notes}` : ''} Please log in to review.`,
      });
    } catch (notifError) {
      console.error('[TRANSFERS] Failed to dispatch transfer notification:', notifError);
    }

    res.status(201).json({ transfer });
  } catch (error) {
    console.error(`[TRANSFERS] POST / (create transfer) failed for tenant "${req.tenant?.name}" (${req.tenant?.id}), user ${req.user?.id}:`, error);
    next(error);
  }
});

router.get('/', requireTenant, requireAuth, requireRole('admin', 'owner', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const direction = req.query.direction as string | undefined;

    let whereClause;
    if (direction === 'incoming') {
      whereClause = eq(tenantTransfers.receivingTenantId, tenantId);
    } else if (direction === 'outgoing') {
      whereClause = eq(tenantTransfers.sendingTenantId, tenantId);
    } else {
      whereClause = or(
        eq(tenantTransfers.sendingTenantId, tenantId),
        eq(tenantTransfers.receivingTenantId, tenantId),
      );
    }

    const transfers = await db
      .select({
        transfer: tenantTransfers,
        animal: {
          id: animals.id,
          name: animals.name,
          species: animals.species,
          breed: animals.breed,
          age: animals.age,
          sex: animals.sex,
          status: animals.status,
          photoUrls: animals.photoUrls,
          weight: animals.weight,
          microchipNumber: animals.microchipNumber,
          neuterStatus: animals.neuterStatus,
          medicalStatus: animals.medicalStatus,
          heartwormPositive: animals.heartwormPositive,
          biteHistory: animals.biteHistory,
          specialDiet: animals.specialDiet,
          needsSpayNeuter: animals.needsSpayNeuter,
          isFlightRisk: animals.isFlightRisk,
          catFriendly: animals.catFriendly,
          dogFriendly: animals.dogFriendly,
          childFriendly: animals.childFriendly,
          behaviorColor: animals.behaviorColor,
          behaviorRestrictionReason: animals.behaviorRestrictionReason,
          intakeDate: animals.intakeDate,
          intakeSource: animals.intakeSource,
          dateOfBirth: animals.dateOfBirth,
          bio: animals.bio,
        },
        sendingTenant: {
          id: sql<string>`st.id`,
          name: sql<string>`st.name`,
        },
        receivingTenant: {
          id: sql<string>`rt.id`,
          name: sql<string>`rt.name`,
        },
        requestedByUser: {
          id: sql<string>`ru.id`,
          name: sql<string>`COALESCE(ru.first_name || ' ' || ru.last_name, ru.email)`,
        },
      })
      .from(tenantTransfers)
      .innerJoin(animals, eq(tenantTransfers.animalId, animals.id))
      .innerJoin(sql`tenants st`, sql`st.id = ${tenantTransfers.sendingTenantId}`)
      .innerJoin(sql`tenants rt`, sql`rt.id = ${tenantTransfers.receivingTenantId}`)
      .innerJoin(sql`users ru`, sql`ru.id = ${tenantTransfers.requestedBy}`)
      .where(whereClause!)
      .orderBy(desc(tenantTransfers.createdAt));

    res.json({ transfers });
  } catch (error) {
    console.error(`[TRANSFERS] GET / (list transfers) failed for tenant "${req.tenant?.name}" (${req.tenant?.id}), direction=${req.query.direction}:`, error);
    next(error);
  }
});

router.get('/:id/preview', requireTenant, requireAuth, requireRole('admin', 'owner', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const transferId = req.params.id;

    const transfer = await db.query.tenantTransfers.findFirst({
      where: and(
        eq(tenantTransfers.id, transferId),
        eq(tenantTransfers.receivingTenantId, tenantId),
      ),
    });
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });

    const animal = await db.query.animals.findFirst({
      where: eq(animals.id, transfer.animalId),
    });
    if (!animal) return res.status(404).json({ error: 'Animal not found' });

    const vaccines = await db
      .select()
      .from(vaccineRecords)
      .where(eq(vaccineRecords.animalId, animal.id))
      .orderBy(desc(vaccineRecords.dateGiven));

    const preventativeCare = await db
      .select()
      .from(preventativeCareRecords)
      .where(eq(preventativeCareRecords.animalId, animal.id))
      .orderBy(desc(preventativeCareRecords.dateAdministered));

    const microchips = await db
      .select()
      .from(microchipRecords)
      .where(eq(microchipRecords.animalId, animal.id));

    const medFiles = await db
      .select()
      .from(medicalFiles)
      .where(eq(medicalFiles.animalId, animal.id))
      .orderBy(desc(medicalFiles.uploadDate));

    res.json({
      animal: {
        name: animal.name,
        species: animal.species,
        breed: animal.breed,
        age: animal.age,
        sex: animal.sex,
        weight: animal.weight,
        dateOfBirth: animal.dateOfBirth,
        microchipNumber: animal.microchipNumber,
        neuterStatus: animal.neuterStatus,
        medicalStatus: animal.medicalStatus,
        photoUrls: animal.photoUrls,
        bio: animal.bio,
        intakeDate: animal.intakeDate,
        intakeSource: animal.intakeSource,
        heartwormPositive: animal.heartwormPositive,
        biteHistory: animal.biteHistory,
        specialDiet: animal.specialDiet,
        needsSpayNeuter: animal.needsSpayNeuter,
        isFlightRisk: animal.isFlightRisk,
        catFriendly: animal.catFriendly,
        dogFriendly: animal.dogFriendly,
        childFriendly: animal.childFriendly,
        behaviorColor: animal.behaviorColor,
        behaviorRestrictionReason: animal.behaviorRestrictionReason,
      },
      vaccines: vaccines.map(v => ({
        itemName: v.itemName,
        dateGiven: v.dateGiven,
        dateDue: v.dateDue,
        manufacturer: v.manufacturer,
        lotNumber: v.lotNumber,
        administeredBy: v.administeredBy,
        clinicName: v.clinicName,
      })),
      preventativeCare: preventativeCare.map(pc => ({
        careName: pc.careName,
        careCategory: pc.careCategory,
        status: pc.status,
        dateAdministered: pc.dateAdministered,
        nextDueDate: pc.nextDueDate,
        administeredBy: pc.administeredBy,
        clinicName: pc.clinicName,
        testResult: pc.testResult,
        notes: pc.notes,
      })),
      microchips: microchips.map(mc => ({
        microchipNumber: mc.microchipNumber,
        manufacturer: mc.manufacturer,
        implantDate: mc.implantDate,
      })),
      medicalFiles: medFiles.map(mf => ({
        fileName: mf.fileName,
        mimeType: mf.mimeType,
        fileSize: mf.fileSize,
        description: mf.description,
        uploadDate: mf.uploadDate,
      })),
    });
  } catch (error) {
    console.error(`[TRANSFERS] GET /${req.params.id}/preview failed for tenant "${req.tenant?.name}" (${req.tenant?.id}):`, error);
    next(error);
  }
});

const respondSchema = z.object({
  responseNotes: z.string().optional(),
});

router.patch('/:id/accept', requireTenant, requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const transferId = req.params.id;
    const parsed = respondSchema.parse(req.body);

    const transfer = await db.query.tenantTransfers.findFirst({
      where: and(
        eq(tenantTransfers.id, transferId),
        eq(tenantTransfers.receivingTenantId, tenantId),
        eq(tenantTransfers.status, 'pending'),
      ),
    });
    if (!transfer) return res.status(404).json({ error: 'Pending transfer not found' });

    const sourceAnimal = await db.query.animals.findFirst({
      where: eq(animals.id, transfer.animalId),
    });
    if (!sourceAnimal) return res.status(404).json({ error: 'Source animal no longer exists' });

    const newAnimalId = await generateAnimalId();

    const [clonedAnimal] = await db.insert(animals).values({
      tenantId,
      animalId: newAnimalId,
      name: sourceAnimal.name,
      species: sourceAnimal.species,
      breed: sourceAnimal.breed,
      age: sourceAnimal.age,
      sex: sourceAnimal.sex,
      neuterStatus: sourceAnimal.neuterStatus,
      dateOfBirth: sourceAnimal.dateOfBirth,
      microchipNumber: sourceAnimal.microchipNumber,
      medicalAlertMemo: sourceAnimal.medicalAlertMemo,
      medicalStatus: sourceAnimal.medicalStatus,
      photoUrls: sourceAnimal.photoUrls,
      bio: sourceAnimal.bio,
      petfinderType: sourceAnimal.petfinderType,
      petfinderBreed: sourceAnimal.petfinderBreed,
      petfinderBreedSecondary: sourceAnimal.petfinderBreedSecondary,
      petfinderAge: sourceAnimal.petfinderAge,
      petfinderSize: sourceAnimal.petfinderSize,
      petfinderGender: sourceAnimal.petfinderGender,
      houseTrained: sourceAnimal.houseTrained,
      declawed: sourceAnimal.declawed,
      specialNeeds: sourceAnimal.specialNeeds,
      shotsCurrent: sourceAnimal.shotsCurrent,
      heartwormPositive: sourceAnimal.heartwormPositive,
      childFriendly: sourceAnimal.childFriendly,
      catFriendly: sourceAnimal.catFriendly,
      dogFriendly: sourceAnimal.dogFriendly,
      needsFence: sourceAnimal.needsFence,
      biteHistory: sourceAnimal.biteHistory,
      specialDiet: sourceAnimal.specialDiet,
      needsSpayNeuter: sourceAnimal.needsSpayNeuter,
      isFlightRisk: sourceAnimal.isFlightRisk,
      status: 'available',
      intakeDate: new Date(),
      intakeSource: 'transfer',
      weight: sourceAnimal.weight,
      activityLevel: sourceAnimal.activityLevel,
      dietaryRestrictions: sourceAnimal.dietaryRestrictions,
      behaviorColor: sourceAnimal.behaviorColor,
      behaviorRestrictionReason: sourceAnimal.behaviorRestrictionReason,
      scheduledSurgeryDate: sourceAnimal.scheduledSurgeryDate,
      locationType: 'shelter',
      medicalHold: sourceAnimal.medicalHold,
    }).returning();

    const sourceVaccines = await db
      .select()
      .from(vaccineRecords)
      .where(eq(vaccineRecords.animalId, sourceAnimal.id));

    if (sourceVaccines.length > 0) {
      await db.insert(vaccineRecords).values(
        sourceVaccines.map(v => ({
          animalId: clonedAnimal.id,
          tenantId,
          itemName: v.itemName,
          dateGiven: v.dateGiven,
          dateDue: v.dateDue,
          validDurationMonths: v.validDurationMonths,
          manufacturer: v.manufacturer,
          lotNumber: v.lotNumber,
          administeredBy: v.administeredBy,
          clinicName: v.clinicName,
          anatomicalSite: v.anatomicalSite,
        }))
      );
    }

    const sourcePrevCare = await db
      .select()
      .from(preventativeCareRecords)
      .where(eq(preventativeCareRecords.animalId, sourceAnimal.id));

    if (sourcePrevCare.length > 0) {
      await db.insert(preventativeCareRecords).values(
        sourcePrevCare.map(pc => ({
          animalId: clonedAnimal.id,
          tenantId,
          careName: pc.careName,
          careCategory: pc.careCategory,
          status: pc.status,
          dateAdministered: pc.dateAdministered,
          nextDueDate: pc.nextDueDate,
          administeredBy: pc.administeredBy,
          clinicName: pc.clinicName,
          manufacturer: pc.manufacturer,
          lotNumber: pc.lotNumber,
          anatomicalSite: pc.anatomicalSite,
          testResult: pc.testResult,
          notes: pc.notes,
        }))
      );
    }

    const sourceMicrochips = await db
      .select()
      .from(microchipRecords)
      .where(eq(microchipRecords.animalId, sourceAnimal.id));

    if (sourceMicrochips.length > 0) {
      await db.insert(microchipRecords).values(
        sourceMicrochips.map(mc => ({
          animalId: clonedAnimal.id,
          tenantId,
          microchipNumber: mc.microchipNumber,
          manufacturer: mc.manufacturer,
          implantDate: mc.implantDate,
          implantLocation: mc.implantLocation,
          registrationStatus: mc.registrationStatus === 'registered_rescue' ? 'transferred' as const : mc.registrationStatus,
          chipOrigin: 'transferred_in' as const,
          transferNotes: mc.transferNotes,
        }))
      );
    }

    const sourceMedFiles = await db
      .select()
      .from(medicalFiles)
      .where(eq(medicalFiles.animalId, sourceAnimal.id));

    if (sourceMedFiles.length > 0) {
      await db.insert(medicalFiles).values(
        sourceMedFiles.map(mf => ({
          animalId: clonedAnimal.id,
          tenantId,
          fileName: mf.fileName,
          fileUrl: mf.fileUrl,
          mimeType: mf.mimeType,
          fileSize: mf.fileSize,
          description: mf.description,
        }))
      );
    }

    await db.update(animals)
      .set({ status: 'transported', updatedAt: new Date() })
      .where(eq(animals.id, sourceAnimal.id));

    const activeFosters = await db
      .select()
      .from(fosterAnimals)
      .where(and(
        eq(fosterAnimals.animalId, sourceAnimal.id),
        eq(fosterAnimals.status, 'active'),
      ));

    if (activeFosters.length > 0) {
      await db.update(fosterAnimals)
        .set({ status: 'completed', endDate: new Date() })
        .where(and(
          eq(fosterAnimals.animalId, sourceAnimal.id),
          eq(fosterAnimals.status, 'active'),
        ));
    }

    const activeMedPlans = await db
      .select()
      .from(medicationPlans)
      .where(and(
        eq(medicationPlans.animalId, sourceAnimal.id),
        eq(medicationPlans.isActive, true),
      ));

    if (activeMedPlans.length > 0) {
      await db.update(medicationPlans)
        .set({ isActive: false })
        .where(and(
          eq(medicationPlans.animalId, sourceAnimal.id),
          eq(medicationPlans.isActive, true),
        ));
    }

    await db.update(tenantTransfers).set({
      status: 'accepted',
      responseNotes: parsed.responseNotes || null,
      respondedBy: req.user!.id,
      respondedAt: new Date(),
      clonedAnimalId: clonedAnimal.id,
      updatedAt: new Date(),
    }).where(eq(tenantTransfers.id, transferId));

    try {
      const { dispatchEventNotification } = await import('../services/notification-dispatcher');
      const receivingTenant = req.tenant!;
      await dispatchEventNotification({
        tenantId: transfer.sendingTenantId,
        eventKey: 'animal_transfer_accepted',
        subject: `Transfer Accepted: ${sourceAnimal.name} accepted by ${receivingTenant.name}`,
        htmlBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Animal Transfer Accepted</h2>
            <p><strong>${receivingTenant.name}</strong> has accepted the transfer of <strong>${sourceAnimal.name}</strong>.</p>
            <p>${sourceAnimal.name}'s status has been updated to <strong>Transported</strong> in your records.</p>
            ${parsed.responseNotes ? `<p><strong>Notes from receiving organization:</strong> ${parsed.responseNotes}</p>` : ''}
            <p style="color: #888; font-size: 12px;">This is an automated notification from your iRescue platform.</p>
          </div>
        `,
        textBody: `Transfer Accepted: ${receivingTenant.name} has accepted ${sourceAnimal.name}. Status updated to Transported. ${parsed.responseNotes ? `Notes: ${parsed.responseNotes}` : ''}`,
      });
    } catch (notifError) {
      console.error('[TRANSFERS] Failed to dispatch acceptance notification:', notifError);
    }

    res.json({
      transfer: { id: transferId, status: 'accepted' },
      clonedAnimal,
    });
  } catch (error) {
    console.error(`[TRANSFERS] PATCH /${req.params.id}/accept failed for tenant "${req.tenant?.name}" (${req.tenant?.id}), user ${req.user?.id}:`, error);
    next(error);
  }
});

router.patch('/:id/reject', requireTenant, requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const transferId = req.params.id;
    const parsed = respondSchema.parse(req.body);

    const transfer = await db.query.tenantTransfers.findFirst({
      where: and(
        eq(tenantTransfers.id, transferId),
        eq(tenantTransfers.receivingTenantId, tenantId),
        eq(tenantTransfers.status, 'pending'),
      ),
    });
    if (!transfer) return res.status(404).json({ error: 'Pending transfer not found' });

    await db.update(tenantTransfers).set({
      status: 'rejected',
      responseNotes: parsed.responseNotes || null,
      respondedBy: req.user!.id,
      respondedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tenantTransfers.id, transferId));

    res.json({ transfer: { id: transferId, status: 'rejected' } });
  } catch (error) {
    console.error(`[TRANSFERS] PATCH /${req.params.id}/reject failed for tenant "${req.tenant?.name}" (${req.tenant?.id}), user ${req.user?.id}:`, error);
    next(error);
  }
});

router.patch('/:id/cancel', requireTenant, requireAuth, requireRole('admin', 'owner', 'staff'), async (req, res, next) => {
  try {
    const tenantId = req.tenant!.id;
    const transferId = req.params.id;

    const transfer = await db.query.tenantTransfers.findFirst({
      where: and(
        eq(tenantTransfers.id, transferId),
        eq(tenantTransfers.sendingTenantId, tenantId),
        eq(tenantTransfers.status, 'pending'),
      ),
    });
    if (!transfer) return res.status(404).json({ error: 'Pending transfer not found or not yours to cancel' });

    await db.update(tenantTransfers).set({
      status: 'cancelled',
      updatedAt: new Date(),
    }).where(eq(tenantTransfers.id, transferId));

    res.json({ transfer: { id: transferId, status: 'cancelled' } });
  } catch (error) {
    console.error(`[TRANSFERS] PATCH /${req.params.id}/cancel failed for tenant "${req.tenant?.name}" (${req.tenant?.id}), user ${req.user?.id}:`, error);
    next(error);
  }
});

export default router;
