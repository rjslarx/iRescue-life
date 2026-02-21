import { db } from '../db';
import { medicationPlans, medicationTasks } from '@shared/schema';
import { eq } from 'drizzle-orm';

const FREQUENCY_CONFIG: Record<string, { times: string[]; labels: string[] }> = {
  SID: { times: ['08:00'], labels: ['Morning'] },
  BID: { times: ['08:00', '20:00'], labels: ['Morning', 'Evening'] },
  TID: { times: ['08:00', '14:00', '20:00'], labels: ['Morning', 'Afternoon', 'Evening'] },
  QID: { times: ['06:00', '12:00', '18:00', '22:00'], labels: ['Early Morning', 'Midday', 'Evening', 'Night'] },
};

export async function generateMedicationTasks(planId: string): Promise<void> {
  const [plan] = await db
    .select()
    .from(medicationPlans)
    .where(eq(medicationPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error(`Medication plan ${planId} not found`);
  }

  const config = FREQUENCY_CONFIG[plan.frequency];
  if (!config) {
    throw new Error(`Unknown frequency: ${plan.frequency}`);
  }

  const startDate = new Date(plan.startDate + 'T00:00:00');
  const endDate = new Date(plan.endDate + 'T00:00:00');

  const tasksToInsert: {
    tenantId: string;
    planId: string;
    animalId: string;
    scheduledDate: string;
    scheduledTime: string;
    roundLabel: string;
    status: 'pending';
  }[] = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    for (let i = 0; i < config.times.length; i++) {
      tasksToInsert.push({
        tenantId: plan.tenantId,
        planId: plan.id,
        animalId: plan.animalId,
        scheduledDate: dateStr,
        scheduledTime: config.times[i],
        roundLabel: config.labels[i],
        status: 'pending',
      });
    }
  }

  if (tasksToInsert.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < tasksToInsert.length; i += BATCH_SIZE) {
      const batch = tasksToInsert.slice(i, i + BATCH_SIZE);
      await db.insert(medicationTasks).values(batch);
    }
  }

  await db
    .update(medicationPlans)
    .set({ tasksGenerated: true })
    .where(eq(medicationPlans.id, planId));
}
