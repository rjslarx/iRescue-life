import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  animals,
  fosterAnimals,
  fosterBioSubmissions,
  fosterPhotos,
  fosterWeightLogs,
  fosterBehaviorNotes,
  fosterSupplyRequestBundles,
  preventativeCareRecords,
  preventativeCareTypes,
  placementAgreementSessions,
  tenants,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { EmailService } from '../lib/email-service';

const router = Router();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

async function verifyFosterOwnsAnimal(userId: string, tenantId: string, animalId: string): Promise<boolean> {
  const [assignment] = await db
    .select({ id: fosterAnimals.id })
    .from(fosterAnimals)
    .where(
      and(
        eq(fosterAnimals.tenantId, tenantId),
        eq(fosterAnimals.fosterId, userId),
        eq(fosterAnimals.animalId, animalId),
        eq(fosterAnimals.status, 'active')
      )
    )
    .limit(1);
  return !!assignment;
}

router.get('/animals/:animalId', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const [assignment] = await db
      .select({
        animalId: animals.id,
        name: animals.name,
        species: animals.species,
        breed: animals.breed,
        photoUrls: animals.photoUrls,
        birthDate: animals.birthDate,
        sex: animals.sex,
        description: animals.description,
        fosterStartDate: fosterAnimals.startDate,
      })
      .from(fosterAnimals)
      .leftJoin(animals, eq(fosterAnimals.animalId, animals.id))
      .where(
        and(
          eq(fosterAnimals.tenantId, tenantId),
          eq(fosterAnimals.fosterId, userId),
          eq(fosterAnimals.animalId, animalId),
          eq(fosterAnimals.status, 'active')
        )
      )
      .limit(1);

    if (!assignment) return res.status(404).json({ error: 'Animal not found' });

    res.json({
      id: assignment.animalId,
      name: assignment.name || 'Unknown',
      species: assignment.species || 'Unknown',
      breed: assignment.breed || '',
      primaryImageUrl: assignment.photoUrls && assignment.photoUrls.length > 0 ? assignment.photoUrls[0] : null,
      birthDate: assignment.birthDate?.toISOString() || null,
      sex: assignment.sex || 'unknown',
      description: assignment.description || null,
      fosterStartDate: assignment.fosterStartDate?.toISOString() || new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Foster Portal] Error fetching animal:', error);
    res.status(500).json({ error: 'Failed to fetch animal' });
  }
});

router.get('/animals/:animalId/medical', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const records = await db
      .select()
      .from(preventativeCareRecords)
      .where(
        and(
          eq(preventativeCareRecords.tenantId, tenantId),
          eq(preventativeCareRecords.animalId, animalId)
        )
      )
      .orderBy(desc(preventativeCareRecords.dateAdministered));

    const vaccines = records
      .filter(r => r.careCategory === 'vaccine')
      .map(r => ({
        id: r.id,
        vaccineName: r.careName,
        type: r.careName,
        administeredAt: r.dateAdministered.toISOString(),
        nextDueDate: r.nextDueDate?.toISOString() || null,
        administeredBy: r.administeredBy,
      }));

    const procedures = records
      .filter(r => r.careCategory !== 'vaccine')
      .map(r => ({
        id: r.id,
        procedureName: r.careName,
        type: r.careName,
        performedAt: r.dateAdministered.toISOString(),
        notes: r.notes,
      }));

    res.json({ vaccines, procedures });
  } catch (error) {
    console.error('[Foster Portal] Error fetching medical records:', error);
    res.status(500).json({ error: 'Failed to fetch medical records' });
  }
});

router.get('/animals/:animalId/bio', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const [bio] = await db
      .select()
      .from(fosterBioSubmissions)
      .where(
        and(
          eq(fosterBioSubmissions.tenantId, tenantId),
          eq(fosterBioSubmissions.animalId, animalId),
          eq(fosterBioSubmissions.fosterId, userId)
        )
      )
      .orderBy(desc(fosterBioSubmissions.createdAt))
      .limit(1);

    if (!bio) return res.json(null);

    res.json({
      id: bio.id,
      status: bio.status,
      generatedBio: bio.generatedBio,
      isPottyTrained: bio.isPottyTrained,
      isCrateTrained: bio.isCrateTrained,
      isGoodWithKids: bio.isGoodWithKids,
      isGoodWithCats: bio.isGoodWithCats,
      isGoodWithDogs: bio.isGoodWithDogs,
      energyLevel: bio.energyLevel,
      funniestQuirk: bio.funniestQuirk,
      favoriteActivity: bio.favoriteActivity,
      idealHome: bio.idealHome,
      additionalNotes: bio.additionalNotes,
      createdAt: bio.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[Foster Portal] Error fetching bio:', error);
    res.status(500).json({ error: 'Failed to fetch bio' });
  }
});

router.post('/animals/:animalId/bio', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const {
      isPottyTrained, isCrateTrained, isGoodWithKids, isGoodWithCats, isGoodWithDogs,
      energyLevel, funniestQuirk, favoriteActivity, idealHome, additionalNotes
    } = req.body;

    const [animal] = await db
      .select({ name: animals.name, species: animals.species, breed: animals.breed })
      .from(animals)
      .where(eq(animals.id, animalId))
      .limit(1);

    const traits: string[] = [];
    if (isPottyTrained) traits.push('potty trained');
    if (isCrateTrained) traits.push('crate trained');
    if (isGoodWithKids) traits.push('good with kids');
    if (isGoodWithCats) traits.push('good with cats');
    if (isGoodWithDogs) traits.push('good with dogs');

    const energyMap = { low: 'low-energy couch potato', medium: 'moderately active', high: 'very active and energetic' };
    const energyDesc = energyMap[energyLevel as keyof typeof energyMap] || 'moderately active';

    let generatedBio = `Meet ${animal?.name || 'this wonderful pet'}! `;
    if (animal?.breed) generatedBio += `This ${animal.breed} is `;
    else generatedBio += `This ${animal?.species || 'pet'} is `;
    generatedBio += `a ${energyDesc} companion`;
    if (traits.length > 0) generatedBio += ` who is ${traits.join(', ')}`;
    generatedBio += '. ';
    if (funniestQuirk) generatedBio += `${funniestQuirk} `;
    if (favoriteActivity) generatedBio += `They love ${favoriteActivity}. `;
    if (idealHome) generatedBio += `Their ideal home would be ${idealHome}. `;
    if (additionalNotes) generatedBio += additionalNotes;

    const [bio] = await db
      .insert(fosterBioSubmissions)
      .values({
        tenantId,
        animalId,
        fosterId: userId,
        isPottyTrained: !!isPottyTrained,
        isCrateTrained: !!isCrateTrained,
        isGoodWithKids: !!isGoodWithKids,
        isGoodWithCats: !!isGoodWithCats,
        isGoodWithDogs: !!isGoodWithDogs,
        energyLevel: energyLevel || 'medium',
        funniestQuirk: funniestQuirk || null,
        favoriteActivity: favoriteActivity || null,
        idealHome: idealHome || null,
        additionalNotes: additionalNotes || null,
        generatedBio,
        status: 'pending',
      })
      .returning();

    res.json({
      id: bio.id,
      status: bio.status,
      generatedBio: bio.generatedBio,
      createdAt: bio.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[Foster Portal] Error submitting bio:', error);
    res.status(500).json({ error: 'Failed to submit bio' });
  }
});

router.get('/animals/:animalId/photos', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const photos = await db
      .select()
      .from(fosterPhotos)
      .where(
        and(
          eq(fosterPhotos.tenantId, tenantId),
          eq(fosterPhotos.animalId, animalId),
          eq(fosterPhotos.fosterId, userId)
        )
      )
      .orderBy(desc(fosterPhotos.createdAt));

    res.json(photos.map(p => ({
      id: p.id,
      photoUrl: p.photoUrl,
      caption: p.caption,
      isApproved: p.isApproved,
      createdAt: p.createdAt.toISOString(),
    })));
  } catch (error) {
    console.error('[Foster Portal] Error fetching photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

router.post('/animals/:animalId/photos', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const { photoUrl, caption } = req.body;
    if (!photoUrl || typeof photoUrl !== 'string') {
      return res.status(400).json({ error: 'Photo URL is required' });
    }

    const [photo] = await db
      .insert(fosterPhotos)
      .values({
        tenantId,
        animalId,
        fosterId: userId,
        photoUrl,
        caption: caption || null,
      })
      .returning();

    res.json({
      id: photo.id,
      photoUrl: photo.photoUrl,
      caption: photo.caption,
      isApproved: photo.isApproved,
      createdAt: photo.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[Foster Portal] Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

router.get('/animals/:animalId/weight-logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const logs = await db
      .select()
      .from(fosterWeightLogs)
      .where(
        and(
          eq(fosterWeightLogs.tenantId, tenantId),
          eq(fosterWeightLogs.animalId, animalId)
        )
      )
      .orderBy(desc(fosterWeightLogs.loggedAt));

    res.json(logs.map(l => ({
      id: l.id,
      weight: parseFloat(l.weight),
      unit: l.weightUnit,
      notes: l.notes,
      loggedAt: l.loggedAt.toISOString(),
    })));
  } catch (error) {
    console.error('[Foster Portal] Error fetching weight logs:', error);
    res.status(500).json({ error: 'Failed to fetch weight logs' });
  }
});

router.post('/animals/:animalId/weight-logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const { weight, unit, notes } = req.body;
    if (!weight || isNaN(parseFloat(weight))) {
      return res.status(400).json({ error: 'Valid weight is required' });
    }

    const validUnits = ['lbs', 'kg', 'oz', 'g'];
    const safeUnit = validUnits.includes(unit) ? unit : 'lbs';

    const [log] = await db
      .insert(fosterWeightLogs)
      .values({
        tenantId,
        animalId,
        fosterId: userId,
        weight: String(weight),
        weightUnit: safeUnit,
        notes: notes || null,
      })
      .returning();

    res.json({
      id: log.id,
      weight: parseFloat(log.weight),
      unit: log.weightUnit,
      notes: log.notes,
      loggedAt: log.loggedAt.toISOString(),
    });
  } catch (error) {
    console.error('[Foster Portal] Error logging weight:', error);
    res.status(500).json({ error: 'Failed to log weight' });
  }
});

router.get('/animals/:animalId/behavior-notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const notes = await db
      .select()
      .from(fosterBehaviorNotes)
      .where(
        and(
          eq(fosterBehaviorNotes.tenantId, tenantId),
          eq(fosterBehaviorNotes.animalId, animalId),
          eq(fosterBehaviorNotes.fosterId, userId)
        )
      )
      .orderBy(desc(fosterBehaviorNotes.createdAt));

    res.json(notes.map(n => ({
      id: n.id,
      noteType: n.noteType,
      content: n.content,
      isFlagged: n.isFlagged,
      staffReviewedAt: n.staffReviewedAt?.toISOString() || null,
      createdAt: n.createdAt.toISOString(),
    })));
  } catch (error) {
    console.error('[Foster Portal] Error fetching behavior notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.post('/animals/:animalId/behavior-notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const { noteType, content, isFlagged } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const validTypes = ['observation', 'concern', 'milestone', 'medical'];
    const finalNoteType = validTypes.includes(noteType) ? noteType : 'observation';

    const [note] = await db
      .insert(fosterBehaviorNotes)
      .values({
        tenantId,
        animalId,
        fosterId: userId,
        noteType: finalNoteType,
        content: content.trim(),
        isFlagged: !!isFlagged,
      })
      .returning();

    res.json({
      id: note.id,
      noteType: note.noteType,
      content: note.content,
      isFlagged: note.isFlagged,
      staffReviewedAt: null,
      createdAt: note.createdAt.toISOString(),
    });

    if (isFlagged) {
      try {
        const [tenant] = await db
          .select({ contactEmail: tenants.contactEmail, name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);

        if (tenant?.contactEmail) {
          const [animal] = await db
            .select({ name: animals.name })
            .from(animals)
            .where(eq(animals.id, animalId))
            .limit(1);

          const emailService = await EmailService.forTenant(tenantId);
          if (emailService) {
            const fosterName = req.user!.fullName || req.user!.email;
            const animalName = animal?.name || 'Unknown';
            const typeLabel = finalNoteType.charAt(0).toUpperCase() + finalNoteType.slice(1);

            await emailService.send({
              to: tenant.contactEmail,
              subject: `Flagged Foster Note: ${animalName} - ${typeLabel}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #ef4444;">Flagged Foster Note</h2>
                  <p>A foster parent has flagged a note for staff attention.</p>
                  
                  <div style="background-color: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #ef4444;">
                    <p><strong>Animal:</strong> ${escapeHtml(animalName)}</p>
                    <p><strong>Foster:</strong> ${escapeHtml(fosterName)}</p>
                    <p><strong>Type:</strong> ${escapeHtml(typeLabel)}</p>
                    <p><strong>Note:</strong></p>
                    <p style="color: #374151;">${escapeHtml(content.trim().substring(0, 500))}</p>
                  </div>
                  
                  <p style="color: #9ca3af; font-size: 12px;">
                    Sent by ${tenant.name} via iRescue
                  </p>
                </div>
              `,
            });
            console.log(`[Foster Portal] Sent flagged note notification to ${tenant.contactEmail}`);
          }
        }
      } catch (emailError) {
        console.error('[Foster Portal] Failed to send flagged note notification:', emailError);
      }
    }
  } catch (error) {
    console.error('[Foster Portal] Error saving behavior note:', error);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

router.get('/supply-requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    const requests = await db
      .select()
      .from(fosterSupplyRequestBundles)
      .where(
        and(
          eq(fosterSupplyRequestBundles.tenantId, tenantId),
          eq(fosterSupplyRequestBundles.fosterId, userId)
        )
      )
      .orderBy(desc(fosterSupplyRequestBundles.createdAt));

    res.json(requests.map(r => ({
      id: r.id,
      items: r.items,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (error) {
    console.error('[Foster Portal] Error fetching supply requests:', error);
    res.status(500).json({ error: 'Failed to fetch supply requests' });
  }
});

router.post('/supply-requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const validatedItems = items.map((item: any) => ({
      item: String(item.item || ''),
      quantity: Number(item.quantity) || 1,
    })).filter((item: any) => item.item.length > 0);

    if (validatedItems.length === 0) {
      return res.status(400).json({ error: 'At least one valid item is required' });
    }

    const [request] = await db
      .insert(fosterSupplyRequestBundles)
      .values({
        tenantId,
        fosterId: userId,
        items: validatedItems,
      })
      .returning();

    res.json({
      id: request.id,
      items: request.items,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
    });

    try {
      const [tenant] = await db
        .select({ contactEmail: tenants.contactEmail, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (tenant?.contactEmail) {
        const emailService = await EmailService.forTenant(tenantId);
        if (emailService) {
          const fosterName = req.user!.fullName || req.user!.email;
          const itemList = validatedItems.map((i: any) => `${i.quantity}x ${escapeHtml(i.item)}`).join(', ');

          await emailService.send({
            to: tenant.contactEmail,
            subject: `Supply Request from ${fosterName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #10b981;">New Supply Request</h2>
                <p>A foster parent has requested supplies.</p>
                
                <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                  <p><strong>Foster:</strong> ${escapeHtml(fosterName)}</p>
                  <p><strong>Items:</strong> ${itemList}</p>
                </div>
                
                <p style="color: #9ca3af; font-size: 12px;">
                  Sent by ${tenant.name} via iRescue
                </p>
              </div>
            `,
          });
          console.log(`[Foster Portal] Sent supply request notification to ${tenant.contactEmail}`);
        }
      }
    } catch (emailError) {
      console.error('[Foster Portal] Failed to send supply request notification:', emailError);
    }
  } catch (error) {
    console.error('[Foster Portal] Error submitting supply request:', error);
    res.status(500).json({ error: 'Failed to submit supply request' });
  }
});

router.get('/animals/:animalId/placement-agreement', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId } = req.params;

    const owns = await verifyFosterOwnsAnimal(userId, tenantId, animalId);
    if (!owns) return res.status(404).json({ error: 'Animal not found' });

    const agreements = await db
      .select({
        id: placementAgreementSessions.id,
        status: placementAgreementSessions.status,
        animalName: placementAgreementSessions.animalName,
        fosterName: placementAgreementSessions.fosterName,
        signedAt: placementAgreementSessions.signedAt,
        contractPdfUrl: placementAgreementSessions.contractPdfUrl,
        carePriorities: placementAgreementSessions.carePriorities,
        createdAt: placementAgreementSessions.createdAt,
      })
      .from(placementAgreementSessions)
      .where(
        and(
          eq(placementAgreementSessions.tenantId, tenantId),
          eq(placementAgreementSessions.animalId, animalId),
          eq(placementAgreementSessions.fosterId, userId),
          eq(placementAgreementSessions.status, 'signed')
        )
      )
      .orderBy(desc(placementAgreementSessions.signedAt));

    res.json({ agreements });
  } catch (error) {
    console.error('[Foster Portal] Error fetching placement agreements:', error);
    res.status(500).json({ error: 'Failed to fetch placement agreements' });
  }
});

export default router;
