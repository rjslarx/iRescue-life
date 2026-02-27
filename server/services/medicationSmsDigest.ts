import { db } from '../db';
import {
  tenants,
  animals,
  users,
  fosterAnimals,
  medicationTasks,
  medicationPlans,
  smsMessageLogs,
} from '@shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { sendSms, isTwilioEnabled } from '../lib/twilio-service';

interface AnimalBatch {
  name: string;
  drugs: string[];
  taskIds: string[];
}

interface FosterBatch {
  fosterId: string;
  fosterFirstName: string;
  fosterPhone: string;
  tenantId: string;
  primaryAnimalId: string;
  animals: Map<string, AnimalBatch>;
}

function composeDigestMessage(fosterFirstName: string, animalBatches: Map<string, AnimalBatch>): string {
  const entries = Array.from(animalBatches.entries());

  if (entries.length === 1) {
    const [, batch] = entries[0];
    const drugList = batch.drugs.join(', ');
    if (batch.drugs.length === 1) {
      return `Hi ${fosterFirstName}! ${batch.name} is due for their ${drugList} now. Reply DONE when given.`;
    } else {
      return `Hi ${fosterFirstName}! ${batch.name} has ${batch.drugs.length} items due now: ${drugList}. Reply DONE when all administered.`;
    }
  }

  const parts = entries.map(([, batch]) => `${batch.name}: ${batch.drugs.join(', ')}`);
  return `Hi ${fosterFirstName}! Multiple animals need meds now: ${parts.join(' | ')}. Reply DONE when all administered.`;
}

export async function sendMedicationDigestForTenant(tenantId: string): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    const twilioEnabled = await isTwilioEnabled(tenantId);
    if (!twilioEnabled) return { sent: 0, errors: [] };

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const hourPrefix = String(now.getUTCHours()).padStart(2, '0') + ':';

    const activeFosters = await db
      .select({ animalId: fosterAnimals.animalId, fosterId: fosterAnimals.fosterId })
      .from(fosterAnimals)
      .where(and(eq(fosterAnimals.tenantId, tenantId), eq(fosterAnimals.status, 'active')));

    if (activeFosters.length === 0) return { sent: 0, errors: [] };

    const fosterAnimalIds = activeFosters.map(f => f.animalId);
    const fosterByAnimal = new Map(activeFosters.map(f => [f.animalId, f.fosterId]));

    const dueTasks = await db
      .select({
        taskId: medicationTasks.id,
        animalId: medicationTasks.animalId,
        planId: medicationTasks.planId,
        scheduledTime: medicationTasks.scheduledTime,
      })
      .from(medicationTasks)
      .where(and(
        eq(medicationTasks.tenantId, tenantId),
        eq(medicationTasks.status, 'pending'),
        eq(medicationTasks.scheduledDate, today),
        inArray(medicationTasks.animalId, fosterAnimalIds),
        sql`${medicationTasks.scheduledTime} LIKE ${hourPrefix + '%'}`
      ));

    if (dueTasks.length === 0) return { sent: 0, errors: [] };

    const planIds = [...new Set(dueTasks.map(t => t.planId))];
    const plans = await db
      .select({ id: medicationPlans.id, drugName: medicationPlans.drugName })
      .from(medicationPlans)
      .where(inArray(medicationPlans.id, planIds));
    const planMap = new Map(plans.map(p => [p.id, p.drugName]));

    const animalIds = [...new Set(dueTasks.map(t => t.animalId))];
    const animalRows = await db
      .select({ id: animals.id, name: animals.name })
      .from(animals)
      .where(inArray(animals.id, animalIds));
    const animalMap = new Map(animalRows.map(a => [a.id, a.name]));

    const fosterIds = [...new Set(activeFosters.filter(f => fosterAnimalIds.includes(f.animalId)).map(f => f.fosterId))];
    const fosterRows = await db
      .select({ id: users.id, fullName: users.fullName, phone: users.phone })
      .from(users)
      .where(inArray(users.id, fosterIds));
    const fosterMap = new Map(fosterRows.map(f => [f.id, f]));

    const batchesByFoster = new Map<string, FosterBatch>();

    for (const task of dueTasks) {
      const fosterId = fosterByAnimal.get(task.animalId);
      if (!fosterId) continue;

      const foster = fosterMap.get(fosterId);
      if (!foster?.phone) continue;

      const animalName = animalMap.get(task.animalId) || 'your animal';
      const drugName = planMap.get(task.planId) || 'medication';

      if (!batchesByFoster.has(fosterId)) {
        batchesByFoster.set(fosterId, {
          fosterId,
          fosterFirstName: foster.fullName?.split(' ')[0] || 'Foster',
          fosterPhone: foster.phone,
          tenantId,
          primaryAnimalId: task.animalId,
          animals: new Map(),
        });
      }

      const fosterBatch = batchesByFoster.get(fosterId)!;
      if (!fosterBatch.animals.has(task.animalId)) {
        fosterBatch.animals.set(task.animalId, { name: animalName, drugs: [], taskIds: [] });
      }

      const animalBatch = fosterBatch.animals.get(task.animalId)!;
      if (!animalBatch.drugs.includes(drugName)) {
        animalBatch.drugs.push(drugName);
      }
      animalBatch.taskIds.push(task.taskId);
    }

    for (const [fosterId, fosterBatch] of batchesByFoster.entries()) {
      const message = composeDigestMessage(fosterBatch.fosterFirstName, fosterBatch.animals).substring(0, 160);
      const allTaskIds = Array.from(fosterBatch.animals.values()).flatMap(b => b.taskIds);

      try {
        const [tenant] = await db
          .select({ twilioPhoneNumber: tenants.twilioPhoneNumber })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);

        const result = await sendSms(tenantId, fosterBatch.fosterPhone, message, 'reminder', {
          recipientUserId: fosterId,
          relatedAnimalId: fosterBatch.primaryAnimalId,
        });

        if (result.status === 'sent') {
          await db.insert(smsMessageLogs).values({
            tenantId,
            twilioMessageSid: result.sid || null,
            direction: 'outbound',
            fromNumber: tenant?.twilioPhoneNumber || '',
            toNumber: fosterBatch.fosterPhone,
            body: message,
            messageType: 'reminder',
            status: 'sent',
            recipientUserId: fosterId,
            relatedAnimalId: fosterBatch.primaryAnimalId,
            relatedTaskIds: allTaskIds,
          });
          sent++;
        } else {
          errors.push(`Failed to SMS ${fosterBatch.fosterPhone}: ${result.error}`);
        }
      } catch (err) {
        errors.push(`Error SMSing ${fosterBatch.fosterPhone}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    return { sent, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { sent, errors };
  }
}

export async function sendMedicationDigestForAllTenants(): Promise<{ sent: number; errors: string[] }> {
  let sent = 0;
  const errors: string[] = [];

  try {
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    for (const tenant of activeTenants) {
      const result = await sendMedicationDigestForTenant(tenant.id);
      sent += result.sent;
      errors.push(...result.errors.map(e => `[${tenant.id}] ${e}`));
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return { sent, errors };
}
