import { Router, Request, Response } from 'express';
import { db } from '../db';
import { medicationPlans, medicationTasks, fosterAnimals, animals } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { generateMedicationTasks } from '../services/medicationTaskGenerator';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireStaff(req: Request, res: Response, next: Function) {
  if (!req.user || !req.user.roles?.some((r: string) => ['admin', 'staff', 'owner'].includes(r))) {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
}

router.post('/plans', requireAuth, requireStaff, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { animalId, drugName, dosage, frequency, instructions, startDate, endDate, active } = req.body;

    if (!animalId || !drugName || !dosage || !frequency || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields: animalId, drugName, dosage, frequency, startDate, endDate' });
    }

    const validFrequencies = ['SID', 'BID', 'TID', 'QID'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: 'Frequency must be SID, BID, TID, or QID' });
    }

    const [plan] = await db
      .insert(medicationPlans)
      .values({
        tenantId,
        animalId,
        createdBy: userId,
        drugName,
        dosage,
        frequency,
        instructions: instructions || null,
        startDate,
        endDate,
        active: active !== undefined ? active : true,
      })
      .returning();

    try {
      await generateMedicationTasks(plan.id);
    } catch (genError) {
      console.error('[Medication] Error generating tasks for plan:', genError);
    }

    const [updatedPlan] = await db
      .select()
      .from(medicationPlans)
      .where(eq(medicationPlans.id, plan.id))
      .limit(1);

    res.json(updatedPlan || plan);
  } catch (error) {
    console.error('[Medication] Error creating plan:', error);
    res.status(500).json({ error: 'Failed to create medication plan' });
  }
});

router.get('/plans/:animalId', requireAuth, requireStaff, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const { animalId } = req.params;

    const plans = await db
      .select()
      .from(medicationPlans)
      .where(
        and(
          eq(medicationPlans.tenantId, tenantId),
          eq(medicationPlans.animalId, animalId)
        )
      )
      .orderBy(desc(medicationPlans.createdAt));

    res.json(plans);
  } catch (error) {
    console.error('[Medication] Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch medication plans' });
  }
});

router.patch('/plans/:planId', requireAuth, requireStaff, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const { planId } = req.params;
    const { drugName, dosage, frequency, instructions, startDate, endDate, active } = req.body;

    const [existingPlan] = await db
      .select()
      .from(medicationPlans)
      .where(
        and(
          eq(medicationPlans.id, planId),
          eq(medicationPlans.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!existingPlan) {
      return res.status(404).json({ error: 'Medication plan not found' });
    }

    if (frequency && !['SID', 'BID', 'TID', 'QID'].includes(frequency)) {
      return res.status(400).json({ error: 'Frequency must be SID, BID, TID, or QID' });
    }

    const needsRegeneration =
      (frequency && frequency !== existingPlan.frequency) ||
      (startDate && startDate !== existingPlan.startDate) ||
      (endDate && endDate !== existingPlan.endDate);

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (drugName !== undefined) updateData.drugName = drugName;
    if (dosage !== undefined) updateData.dosage = dosage;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (instructions !== undefined) updateData.instructions = instructions;
    if (startDate !== undefined) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;
    if (active !== undefined) updateData.active = active;

    const [updatedPlan] = await db
      .update(medicationPlans)
      .set(updateData)
      .where(eq(medicationPlans.id, planId))
      .returning();

    if (needsRegeneration) {
      await db
        .delete(medicationTasks)
        .where(
          and(
            eq(medicationTasks.planId, planId),
            eq(medicationTasks.status, 'pending')
          )
        );

      try {
        await generateMedicationTasks(planId);
      } catch (genError) {
        console.error('[Medication] Error regenerating tasks:', genError);
      }
    }

    res.json(updatedPlan);
  } catch (error) {
    console.error('[Medication] Error updating plan:', error);
    res.status(500).json({ error: 'Failed to update medication plan' });
  }
});

router.get('/tasks/today', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;

    const fosterAssignments = await db
      .select({ animalId: fosterAnimals.animalId })
      .from(fosterAnimals)
      .where(
        and(
          eq(fosterAnimals.tenantId, tenantId),
          eq(fosterAnimals.fosterId, userId),
          eq(fosterAnimals.status, 'active')
        )
      );

    if (fosterAssignments.length === 0) {
      return res.json([]);
    }

    const animalIds = fosterAssignments.map(a => a.animalId);
    const today = new Date().toISOString().split('T')[0];

    const tasks = await db
      .select({
        id: medicationTasks.id,
        planId: medicationTasks.planId,
        animalId: medicationTasks.animalId,
        scheduledDate: medicationTasks.scheduledDate,
        scheduledTime: medicationTasks.scheduledTime,
        roundLabel: medicationTasks.roundLabel,
        status: medicationTasks.status,
        completedAt: medicationTasks.completedAt,
        completedBy: medicationTasks.completedBy,
        skipReason: medicationTasks.skipReason,
        drugName: medicationPlans.drugName,
        dosage: medicationPlans.dosage,
        instructions: medicationPlans.instructions,
        animalName: animals.name,
      })
      .from(medicationTasks)
      .innerJoin(medicationPlans, eq(medicationTasks.planId, medicationPlans.id))
      .innerJoin(animals, eq(medicationTasks.animalId, animals.id))
      .where(
        and(
          eq(medicationTasks.tenantId, tenantId),
          eq(medicationTasks.scheduledDate, today),
          sql`${medicationTasks.animalId} IN (${sql.join(animalIds.map(id => sql`${id}`), sql`, `)})`
        )
      )
      .orderBy(medicationTasks.scheduledTime);

    const grouped: Record<string, { animalId: string; animalName: string; tasks: typeof tasks }> = {};
    for (const task of tasks) {
      if (!grouped[task.animalId]) {
        grouped[task.animalId] = {
          animalId: task.animalId,
          animalName: task.animalName || 'Unknown',
          tasks: [],
        };
      }
      grouped[task.animalId].tasks.push(task);
    }

    res.json(Object.values(grouped));
  } catch (error) {
    console.error('[Medication] Error fetching today tasks:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s medication tasks' });
  }
});

router.patch('/tasks/:taskId/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const { taskId } = req.params;
    const { status, skipReason } = req.body;

    if (!status || !['given', 'skipped'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "given" or "skipped"' });
    }

    const [task] = await db
      .select()
      .from(medicationTasks)
      .where(
        and(
          eq(medicationTasks.id, taskId),
          eq(medicationTasks.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const [fosterAssignment] = await db
      .select({ id: fosterAnimals.id })
      .from(fosterAnimals)
      .where(
        and(
          eq(fosterAnimals.tenantId, tenantId),
          eq(fosterAnimals.fosterId, userId),
          eq(fosterAnimals.animalId, task.animalId),
          eq(fosterAnimals.status, 'active')
        )
      )
      .limit(1);

    const isStaff = req.user!.roles?.some((r: string) => ['admin', 'staff', 'owner'].includes(r));
    if (!fosterAssignment && !isStaff) {
      return res.status(403).json({ error: 'You do not have access to this task' });
    }

    if (status === 'given') {
      const now = new Date();
      const [hours, minutes] = task.scheduledTime.split(':').map(Number);
      const scheduledDateTime = new Date(task.scheduledDate + 'T00:00:00');
      scheduledDateTime.setHours(hours, minutes, 0, 0);

      const diffMs = scheduledDateTime.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours > 4) {
        return res.status(403).json({ error: 'Cannot mark a task as given more than 4 hours before its scheduled time' });
      }
    }

    const [updatedTask] = await db
      .update(medicationTasks)
      .set({
        status,
        completedAt: new Date(),
        completedBy: userId,
        skipReason: status === 'skipped' ? (skipReason || null) : null,
      })
      .where(eq(medicationTasks.id, taskId))
      .returning();

    res.json(updatedTask);
  } catch (error) {
    console.error('[Medication] Error updating task status:', error);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

export default router;
