import { Router } from "express";
import { db } from "../db";
import { 
  animals, 
  users,
  fosterAgreementSessions,
  fosterContracts,
  fosterTasks,
  fosterWeightLogs,
  fosterBehaviorNotes,
  fosterSupplyRequests,
  fosterBioSubmissions,
  fosterPhotoUploads,
  magicLinks,
  vaccineRecords,
  procedureLogs
} from "@shared/schema";
import { eq, and, desc, asc, gte, lte, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import crypto from "crypto";

const router = Router();

const requireFosterRole = (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const userRoles = req.user.roles?.map((r: string) => r.toLowerCase()) || [];
  if (!userRoles.includes("foster")) {
    return res.status(403).json({ message: "Foster role required" });
  }
  next();
};

const requireStaffRole = (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const userRoles = req.user.roles?.map((r: string) => r.toLowerCase()) || [];
  const staffRoles = ["admin", "staff", "manager", "owner"];
  const hasStaffRole = staffRoles.some(role => userRoles.includes(role));
  if (!hasStaffRole) {
    return res.status(403).json({ message: "Staff access required" });
  }
  next();
};

async function getFosterAnimals(userId: string, tenantId: string) {
  const activeFosterSessions = await db
    .select({
      session: fosterAgreementSessions,
      animal: animals,
    })
    .from(fosterAgreementSessions)
    .innerJoin(animals, eq(fosterAgreementSessions.animalId, animals.id))
    .where(
      and(
        eq(fosterAgreementSessions.tenantId, tenantId),
        eq(fosterAgreementSessions.status, "completed"),
        eq(animals.status, "foster"),
        eq(animals.tenantId, tenantId),
        sql`EXISTS (
          SELECT 1 FROM users u 
          WHERE u.id = ${userId} 
          AND u.tenant_id = ${tenantId}
          AND LOWER(u.email) = LOWER(${fosterAgreementSessions.fosterEmail})
        )`
      )
    )
    .orderBy(desc(fosterAgreementSessions.signedAt));

  return activeFosterSessions;
}

router.get("/my-animals", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);

    res.json(fosterAnimals.map(({ animal, session }) => ({
      ...animal,
      fosterStartDate: session.signedAt,
      sessionId: session.id,
    })));
  } catch (error) {
    console.error("Error fetching foster animals:", error);
    res.status(500).json({ message: "Failed to fetch foster animals" });
  }
});

router.get("/animals/:animalId", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    
    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    const fosterAnimal = fosterAnimals.find(fa => fa.animal.id === animalId);

    if (!fosterAnimal) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const animal = await db
      .select()
      .from(animals)
      .where(
        and(
          eq(animals.id, animalId),
          eq(animals.tenantId, req.tenant!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }

    res.json({
      ...animal,
      fosterStartDate: fosterAnimal.session.signedAt,
    });
  } catch (error) {
    console.error("Error fetching foster animal:", error);
    res.status(500).json({ message: "Failed to fetch animal details" });
  }
});

router.get("/tasks/today", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = await db
      .select({
        task: fosterTasks,
        animal: animals,
      })
      .from(fosterTasks)
      .innerJoin(animals, eq(fosterTasks.animalId, animals.id))
      .where(
        and(
          eq(fosterTasks.fosterUserId, req.user!.id),
          eq(fosterTasks.tenantId, req.tenant!.id),
          eq(fosterTasks.isActive, true)
        )
      )
      .orderBy(asc(fosterTasks.dueTime), asc(fosterTasks.dueDate));

    const todaysTasks = tasks.filter(({ task }) => {
      if (task.frequency === 'daily') return true;
      if (task.dueDate) {
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === today.getTime();
      }
      return false;
    });

    res.json(todaysTasks.map(({ task, animal }) => ({
      ...task,
      animalName: animal.name,
      animalPhoto: animal.primaryImageUrl,
    })));
  } catch (error) {
    console.error("Error fetching today's tasks:", error);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

router.get("/tasks/all", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const tasks = await db
      .select({
        task: fosterTasks,
        animal: animals,
      })
      .from(fosterTasks)
      .innerJoin(animals, eq(fosterTasks.animalId, animals.id))
      .where(
        and(
          eq(fosterTasks.fosterUserId, req.user!.id),
          eq(fosterTasks.tenantId, req.tenant!.id),
          eq(fosterTasks.isActive, true)
        )
      )
      .orderBy(desc(fosterTasks.createdAt));

    res.json(tasks.map(({ task, animal }) => ({
      ...task,
      animalName: animal.name,
      animalPhoto: animal.primaryImageUrl,
    })));
  } catch (error) {
    console.error("Error fetching all tasks:", error);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

router.post("/tasks/:taskId/complete", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { notes } = req.body;

    const task = await db
      .select()
      .from(fosterTasks)
      .where(
        and(
          eq(fosterTasks.id, taskId),
          eq(fosterTasks.fosterUserId, req.user!.id),
          eq(fosterTasks.tenantId, req.tenant!.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const now = new Date();
    
    if (task.frequency === 'once') {
      await db
        .update(fosterTasks)
        .set({
          completedAt: now,
          completedNotes: notes || null,
          isActive: false,
          updatedAt: now,
        })
        .where(eq(fosterTasks.id, taskId));
    } else {
      await db
        .update(fosterTasks)
        .set({
          completedAt: now,
          completedNotes: notes || null,
          updatedAt: now,
        })
        .where(eq(fosterTasks.id, taskId));
    }

    res.json({ success: true, completedAt: now });
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(500).json({ message: "Failed to complete task" });
  }
});

router.get("/animals/:animalId/weight-logs", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    if (!fosterAnimals.find(fa => fa.animal.id === animalId)) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const logs = await db
      .select()
      .from(fosterWeightLogs)
      .where(
        and(
          eq(fosterWeightLogs.animalId, animalId),
          eq(fosterWeightLogs.tenantId, req.tenant!.id)
        )
      )
      .orderBy(desc(fosterWeightLogs.loggedAt));

    res.json(logs);
  } catch (error) {
    console.error("Error fetching weight logs:", error);
    res.status(500).json({ message: "Failed to fetch weight logs" });
  }
});

router.post("/animals/:animalId/weight-logs", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const { weight, unit, notes } = req.body;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    if (!fosterAnimals.find(fa => fa.animal.id === animalId)) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const [log] = await db
      .insert(fosterWeightLogs)
      .values({
        tenantId: req.tenant!.id,
        animalId,
        fosterUserId: req.user!.id,
        weight: parseFloat(weight),
        unit: unit || 'lbs',
        notes,
      })
      .returning();

    res.json(log);
  } catch (error) {
    console.error("Error logging weight:", error);
    res.status(500).json({ message: "Failed to log weight" });
  }
});

router.get("/animals/:animalId/behavior-notes", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    if (!fosterAnimals.find(fa => fa.animal.id === animalId)) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const notes = await db
      .select()
      .from(fosterBehaviorNotes)
      .where(
        and(
          eq(fosterBehaviorNotes.animalId, animalId),
          eq(fosterBehaviorNotes.tenantId, req.tenant!.id)
        )
      )
      .orderBy(desc(fosterBehaviorNotes.createdAt));

    res.json(notes);
  } catch (error) {
    console.error("Error fetching behavior notes:", error);
    res.status(500).json({ message: "Failed to fetch behavior notes" });
  }
});

router.post("/animals/:animalId/behavior-notes", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const { noteType, content, isFlagged } = req.body;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    if (!fosterAnimals.find(fa => fa.animal.id === animalId)) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const [note] = await db
      .insert(fosterBehaviorNotes)
      .values({
        tenantId: req.tenant!.id,
        animalId,
        fosterUserId: req.user!.id,
        noteType: noteType || 'observation',
        content,
        isFlagged: isFlagged || false,
      })
      .returning();

    res.json(note);
  } catch (error) {
    console.error("Error creating behavior note:", error);
    res.status(500).json({ message: "Failed to create behavior note" });
  }
});

router.get("/supply-requests", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const requests = await db
      .select()
      .from(fosterSupplyRequests)
      .where(
        and(
          eq(fosterSupplyRequests.fosterUserId, req.user!.id),
          eq(fosterSupplyRequests.tenantId, req.tenant!.id)
        )
      )
      .orderBy(desc(fosterSupplyRequests.createdAt));

    res.json(requests);
  } catch (error) {
    console.error("Error fetching supply requests:", error);
    res.status(500).json({ message: "Failed to fetch supply requests" });
  }
});

router.post("/supply-requests", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { items, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items are required" });
    }

    const [request] = await db
      .insert(fosterSupplyRequests)
      .values({
        tenantId: req.tenant!.id,
        fosterUserId: req.user!.id,
        items,
        notes,
        status: 'pending',
      })
      .returning();

    res.json(request);
  } catch (error) {
    console.error("Error creating supply request:", error);
    res.status(500).json({ message: "Failed to create supply request" });
  }
});

router.get("/animals/:animalId/bio", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    if (!fosterAnimals.find(fa => fa.animal.id === animalId)) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const bio = await db
      .select()
      .from(fosterBioSubmissions)
      .where(
        and(
          eq(fosterBioSubmissions.animalId, animalId),
          eq(fosterBioSubmissions.tenantId, req.tenant!.id)
        )
      )
      .orderBy(desc(fosterBioSubmissions.createdAt))
      .limit(1)
      .then(rows => rows[0]);

    res.json(bio || null);
  } catch (error) {
    console.error("Error fetching bio:", error);
    res.status(500).json({ message: "Failed to fetch bio" });
  }
});

router.post("/animals/:animalId/bio", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const {
      isPottyTrained,
      isCrateTrained,
      isGoodWithKids,
      isGoodWithCats,
      isGoodWithDogs,
      energyLevel,
      funniestQuirk,
      favoriteActivity,
      idealHome,
      additionalNotes,
    } = req.body;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    const fosterAnimal = fosterAnimals.find(fa => fa.animal.id === animalId);
    if (!fosterAnimal) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    let generatedBio = '';
    const animal = fosterAnimal.animal;
    
    const traits: string[] = [];
    if (isPottyTrained) traits.push('fully potty trained');
    if (isCrateTrained) traits.push('crate trained');
    if (isGoodWithKids) traits.push('great with kids');
    if (isGoodWithCats) traits.push('cat-friendly');
    if (isGoodWithDogs) traits.push('dog-friendly');

    const energyDesc = energyLevel === 'low' ? 'laid-back' : energyLevel === 'high' ? 'energetic and playful' : 'well-balanced';

    generatedBio = `Meet ${animal.name}, a ${energyDesc} ${animal.breed || animal.species || 'pet'} looking for their forever home! `;
    
    if (traits.length > 0) {
      generatedBio += `${animal.name} is ${traits.join(', ')}. `;
    }
    
    if (funniestQuirk) {
      generatedBio += `One thing you should know: ${funniestQuirk} `;
    }
    
    if (favoriteActivity) {
      generatedBio += `Their favorite thing to do is ${favoriteActivity}. `;
    }
    
    if (idealHome) {
      generatedBio += `${animal.name} would thrive in ${idealHome}. `;
    }
    
    if (additionalNotes) {
      generatedBio += additionalNotes;
    }

    const [bio] = await db
      .insert(fosterBioSubmissions)
      .values({
        tenantId: req.tenant!.id,
        animalId,
        fosterUserId: req.user!.id,
        isPottyTrained,
        isCrateTrained,
        isGoodWithKids,
        isGoodWithCats,
        isGoodWithDogs,
        energyLevel,
        funniestQuirk,
        favoriteActivity,
        idealHome,
        additionalNotes,
        generatedBio,
        status: 'pending',
      })
      .returning();

    res.json(bio);
  } catch (error) {
    console.error("Error submitting bio:", error);
    res.status(500).json({ message: "Failed to submit bio" });
  }
});

router.get("/animals/:animalId/photos", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    if (!fosterAnimals.find(fa => fa.animal.id === animalId)) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const photos = await db
      .select()
      .from(fosterPhotoUploads)
      .where(
        and(
          eq(fosterPhotoUploads.animalId, animalId),
          eq(fosterPhotoUploads.tenantId, req.tenant!.id)
        )
      )
      .orderBy(desc(fosterPhotoUploads.createdAt));

    res.json(photos);
  } catch (error) {
    console.error("Error fetching photos:", error);
    res.status(500).json({ message: "Failed to fetch photos" });
  }
});

router.post("/animals/:animalId/photos", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;
    const { photoUrl, caption, photoType } = req.body;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    if (!fosterAnimals.find(fa => fa.animal.id === animalId)) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    if (!photoUrl) {
      return res.status(400).json({ message: "Photo URL is required" });
    }

    const [photo] = await db
      .insert(fosterPhotoUploads)
      .values({
        tenantId: req.tenant!.id,
        animalId,
        fosterUserId: req.user!.id,
        photoUrl,
        caption,
        photoType: photoType || 'other',
      })
      .returning();

    res.json(photo);
  } catch (error) {
    console.error("Error uploading photo:", error);
    res.status(500).json({ message: "Failed to upload photo" });
  }
});

router.get("/animals/:animalId/medical", requireAuth, requireFosterRole, async (req, res) => {
  try {
    const { animalId } = req.params;

    const fosterAnimals = await getFosterAnimals(req.user!.id, req.tenant!.id);
    if (!fosterAnimals.find(fa => fa.animal.id === animalId)) {
      return res.status(403).json({ message: "You don't have access to this animal" });
    }

    const [vaccines, procedures] = await Promise.all([
      db
        .select()
        .from(vaccineRecords)
        .where(
          and(
            eq(vaccineRecords.animalId, animalId),
            eq(vaccineRecords.tenantId, req.tenant!.id)
          )
        )
        .orderBy(desc(vaccineRecords.administeredAt)),
      db
        .select()
        .from(procedureLogs)
        .where(
          and(
            eq(procedureLogs.animalId, animalId),
            eq(procedureLogs.tenantId, req.tenant!.id)
          )
        )
        .orderBy(desc(procedureLogs.performedAt)),
    ]);

    res.json({ vaccines, procedures });
  } catch (error) {
    console.error("Error fetching medical records:", error);
    res.status(500).json({ message: "Failed to fetch medical records" });
  }
});

router.get("/staff/supply-requests", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const requests = await db
      .select({
        request: fosterSupplyRequests,
        user: users,
      })
      .from(fosterSupplyRequests)
      .innerJoin(users, eq(fosterSupplyRequests.fosterUserId, users.id))
      .where(eq(fosterSupplyRequests.tenantId, req.tenant!.id))
      .orderBy(desc(fosterSupplyRequests.createdAt));

    res.json(requests.map(({ request, user }) => ({
      ...request,
      fosterName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      fosterEmail: user.email,
    })));
  } catch (error) {
    console.error("Error fetching supply requests:", error);
    res.status(500).json({ message: "Failed to fetch supply requests" });
  }
});

router.patch("/staff/supply-requests/:requestId", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const now = new Date();
    const updates: any = { status, updatedAt: now };
    
    if (status === 'completed') {
      updates.fulfilledAt = now;
      updates.fulfilledBy = req.user!.id;
    }

    const [updated] = await db
      .update(fosterSupplyRequests)
      .set(updates)
      .where(
        and(
          eq(fosterSupplyRequests.id, requestId),
          eq(fosterSupplyRequests.tenantId, req.tenant!.id)
        )
      )
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating supply request:", error);
    res.status(500).json({ message: "Failed to update supply request" });
  }
});

router.get("/staff/bio-submissions", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const { status } = req.query;

    let query = db
      .select({
        bio: fosterBioSubmissions,
        animal: animals,
        user: users,
      })
      .from(fosterBioSubmissions)
      .innerJoin(animals, eq(fosterBioSubmissions.animalId, animals.id))
      .innerJoin(users, eq(fosterBioSubmissions.fosterUserId, users.id))
      .where(eq(fosterBioSubmissions.tenantId, req.tenant!.id));

    if (status && typeof status === 'string') {
      query = query.where(
        and(
          eq(fosterBioSubmissions.tenantId, req.tenant!.id),
          eq(fosterBioSubmissions.status, status as any)
        )
      ) as any;
    }

    const submissions = await query.orderBy(desc(fosterBioSubmissions.createdAt));

    res.json(submissions.map(({ bio, animal, user }) => ({
      ...bio,
      animalName: animal.name,
      animalPhoto: animal.primaryImageUrl,
      fosterName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    })));
  } catch (error) {
    console.error("Error fetching bio submissions:", error);
    res.status(500).json({ message: "Failed to fetch bio submissions" });
  }
});

router.patch("/staff/bio-submissions/:bioId", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const { bioId } = req.params;
    const { status, staffNotes, applyToAnimal } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected', 'needs_revision'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const now = new Date();
    const updates: any = { updatedAt: now };
    
    if (status) {
      updates.status = status;
      updates.reviewedAt = now;
      updates.reviewedBy = req.user!.id;
    }
    
    if (staffNotes !== undefined) {
      updates.staffNotes = staffNotes;
    }

    const [updated] = await db
      .update(fosterBioSubmissions)
      .set(updates)
      .where(
        and(
          eq(fosterBioSubmissions.id, bioId),
          eq(fosterBioSubmissions.tenantId, req.tenant!.id)
        )
      )
      .returning();

    if (status === 'approved' && applyToAnimal && updated.generatedBio) {
      await db
        .update(animals)
        .set({ description: updated.generatedBio })
        .where(eq(animals.id, updated.animalId));
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating bio submission:", error);
    res.status(500).json({ message: "Failed to update bio submission" });
  }
});

router.get("/staff/behavior-notes/flagged", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const notes = await db
      .select({
        note: fosterBehaviorNotes,
        animal: animals,
        user: users,
      })
      .from(fosterBehaviorNotes)
      .innerJoin(animals, eq(fosterBehaviorNotes.animalId, animals.id))
      .innerJoin(users, eq(fosterBehaviorNotes.fosterUserId, users.id))
      .where(
        and(
          eq(fosterBehaviorNotes.tenantId, req.tenant!.id),
          eq(fosterBehaviorNotes.isFlagged, true),
          isNull(fosterBehaviorNotes.staffReviewedAt)
        )
      )
      .orderBy(desc(fosterBehaviorNotes.createdAt));

    res.json(notes.map(({ note, animal, user }) => ({
      ...note,
      animalName: animal.name,
      fosterName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    })));
  } catch (error) {
    console.error("Error fetching flagged notes:", error);
    res.status(500).json({ message: "Failed to fetch flagged notes" });
  }
});

router.patch("/staff/behavior-notes/:noteId/review", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const { noteId } = req.params;

    const [updated] = await db
      .update(fosterBehaviorNotes)
      .set({
        staffReviewedAt: new Date(),
        staffReviewedBy: req.user!.id,
      })
      .where(
        and(
          eq(fosterBehaviorNotes.id, noteId),
          eq(fosterBehaviorNotes.tenantId, req.tenant!.id)
        )
      )
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error marking note as reviewed:", error);
    res.status(500).json({ message: "Failed to mark note as reviewed" });
  }
});

router.get("/staff/photo-uploads", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const { approved } = req.query;

    let whereClause = eq(fosterPhotoUploads.tenantId, req.tenant!.id);
    
    if (approved === 'false') {
      whereClause = and(
        eq(fosterPhotoUploads.tenantId, req.tenant!.id),
        eq(fosterPhotoUploads.isApproved, false)
      ) as any;
    } else if (approved === 'true') {
      whereClause = and(
        eq(fosterPhotoUploads.tenantId, req.tenant!.id),
        eq(fosterPhotoUploads.isApproved, true)
      ) as any;
    }

    const photos = await db
      .select({
        photo: fosterPhotoUploads,
        animal: animals,
        user: users,
      })
      .from(fosterPhotoUploads)
      .innerJoin(animals, eq(fosterPhotoUploads.animalId, animals.id))
      .innerJoin(users, eq(fosterPhotoUploads.fosterUserId, users.id))
      .where(whereClause)
      .orderBy(desc(fosterPhotoUploads.createdAt));

    res.json(photos.map(({ photo, animal, user }) => ({
      ...photo,
      animalName: animal.name,
      fosterName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    })));
  } catch (error) {
    console.error("Error fetching photo uploads:", error);
    res.status(500).json({ message: "Failed to fetch photo uploads" });
  }
});

router.patch("/staff/photo-uploads/:photoId", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const { photoId } = req.params;
    const { isApproved, isFeatured } = req.body;

    const updates: any = {};
    
    if (isApproved !== undefined) {
      updates.isApproved = isApproved;
      if (isApproved) {
        updates.approvedAt = new Date();
        updates.approvedBy = req.user!.id;
      }
    }
    
    if (isFeatured !== undefined) {
      updates.isFeatured = isFeatured;
    }

    const [updated] = await db
      .update(fosterPhotoUploads)
      .set(updates)
      .where(
        and(
          eq(fosterPhotoUploads.id, photoId),
          eq(fosterPhotoUploads.tenantId, req.tenant!.id)
        )
      )
      .returning();

    if (isFeatured && updated.isApproved) {
      await db
        .update(animals)
        .set({ primaryImageUrl: updated.photoUrl })
        .where(eq(animals.id, updated.animalId));
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating photo:", error);
    res.status(500).json({ message: "Failed to update photo" });
  }
});

router.post("/staff/tasks", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const { animalId, fosterUserId, taskType, title, description, dueDate, dueTime, frequency } = req.body;

    if (!animalId || !fosterUserId || !taskType || !title) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [task] = await db
      .insert(fosterTasks)
      .values({
        tenantId: req.tenant!.id,
        animalId,
        fosterUserId,
        taskType,
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        dueTime,
        frequency: frequency || 'once',
        isActive: true,
      })
      .returning();

    res.json(task);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: "Failed to create task" });
  }
});

router.get("/staff/dashboard", requireAuth, requireStaffRole, async (req, res) => {
  try {
    const [
      pendingSupplyRequests,
      pendingBioSubmissions,
      flaggedNotes,
      pendingPhotoApprovals,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fosterSupplyRequests)
        .where(
          and(
            eq(fosterSupplyRequests.tenantId, req.tenant!.id),
            eq(fosterSupplyRequests.status, 'pending')
          )
        )
        .then(rows => rows[0]?.count || 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fosterBioSubmissions)
        .where(
          and(
            eq(fosterBioSubmissions.tenantId, req.tenant!.id),
            eq(fosterBioSubmissions.status, 'pending')
          )
        )
        .then(rows => rows[0]?.count || 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fosterBehaviorNotes)
        .where(
          and(
            eq(fosterBehaviorNotes.tenantId, req.tenant!.id),
            eq(fosterBehaviorNotes.isFlagged, true),
            isNull(fosterBehaviorNotes.staffReviewedAt)
          )
        )
        .then(rows => rows[0]?.count || 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fosterPhotoUploads)
        .where(
          and(
            eq(fosterPhotoUploads.tenantId, req.tenant!.id),
            eq(fosterPhotoUploads.isApproved, false)
          )
        )
        .then(rows => rows[0]?.count || 0),
    ]);

    res.json({
      pendingSupplyRequests,
      pendingBioSubmissions,
      flaggedNotes,
      pendingPhotoApprovals,
    });
  } catch (error) {
    console.error("Error fetching staff dashboard:", error);
    res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
});

export default router;
