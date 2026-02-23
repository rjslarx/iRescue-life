import { db } from '../db';
import { preventativeCareRecords, preventativeCareTypes, animals } from '@shared/schema';
import { eq, and, or, isNull, inArray } from 'drizzle-orm';

interface ProtocolEntry {
  name: string;
  category: 'vaccine' | 'parasite_prevention' | 'test' | 'other';
  target_age_weeks: number;
  seriesGroup?: string;
  seriesInterval_weeks?: number;
}

const PUPPY_PROTOCOL_TEMPLATE: ProtocolEntry[] = [
  { name: 'Dewormer (Pyrantel)', category: 'parasite_prevention', target_age_weeks: 2 },
  { name: 'DHPP (DA2PP)', category: 'vaccine', target_age_weeks: 6, seriesGroup: 'DHPP', seriesInterval_weeks: 3 },
  { name: 'Flea & Tick Prevention', category: 'parasite_prevention', target_age_weeks: 8 },
  { name: 'Heartworm Prevention', category: 'parasite_prevention', target_age_weeks: 8 },
  { name: 'Bordetella', category: 'vaccine', target_age_weeks: 8 },
  { name: 'Rabies (1-Year)', category: 'vaccine', target_age_weeks: 12 },
];

const SERIES_COMPLETION_WEEKS = 16;

function weeksOld(dob: Date, referenceDate: Date = new Date()): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.floor((referenceDate.getTime() - dob.getTime()) / msPerWeek);
}

function addWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

export interface PuppyProtocolResult {
  scheduled: number;
  skipped: number;
  catchUp: number;
  records: any[];
  details: { name: string; action: string; date?: string }[];
}

export async function applyPuppyProtocol(
  animalId: string,
  tenantId: string,
  userId: string,
  estimatedDob: Date
): Promise<PuppyProtocolResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentAgeWeeks = weeksOld(estimatedDob, today);

  const allCareTypeNames = [...new Set(PUPPY_PROTOCOL_TEMPLATE.map(t => t.name))];

  const matchingTypes = await db
    .select()
    .from(preventativeCareTypes)
    .where(and(
      eq(preventativeCareTypes.isActive, true),
      inArray(preventativeCareTypes.name, allCareTypeNames),
      or(
        isNull(preventativeCareTypes.tenantId),
        eq(preventativeCareTypes.tenantId, tenantId)
      ),
      or(
        eq(preventativeCareTypes.targetSpecies, 'Dog'),
        eq(preventativeCareTypes.targetSpecies, 'Both')
      )
    ));

  const careTypeMap = new Map<string, typeof matchingTypes[0]>();
  for (const ct of matchingTypes) {
    if (!careTypeMap.has(ct.name) || ct.tenantId === tenantId) {
      careTypeMap.set(ct.name, ct);
    }
  }

  const existingRecords = await db
    .select({ careTypeId: preventativeCareRecords.careTypeId, careName: preventativeCareRecords.careName })
    .from(preventativeCareRecords)
    .where(and(
      eq(preventativeCareRecords.animalId, animalId),
      eq(preventativeCareRecords.tenantId, tenantId)
    ));

  const existingTypeIds = new Set(existingRecords.map(r => r.careTypeId));
  const existingNames = new Set(existingRecords.map(r => r.careName));

  const hasDHPPRecords = existingRecords.some(r =>
    r.careName === 'DHPP (DA2PP)' || r.careName?.includes('DHPP')
  );

  const recordsToInsert: any[] = [];
  const details: { name: string; action: string; date?: string }[] = [];
  let scheduled = 0;
  let skipped = 0;
  let catchUp = 0;

  const seriesProcessed = new Set<string>();

  for (const entry of PUPPY_PROTOCOL_TEMPLATE) {
    const careType = careTypeMap.get(entry.name);
    if (!careType) {
      details.push({ name: entry.name, action: 'skipped_no_care_type' });
      skipped++;
      continue;
    }

    if (entry.seriesGroup) {
      if (seriesProcessed.has(entry.seriesGroup)) continue;
      seriesProcessed.add(entry.seriesGroup);

      if (hasDHPPRecords) {
        details.push({ name: `${entry.name} series`, action: 'skipped_existing_records' });
        skipped++;
        continue;
      }

      const intervalWeeks = entry.seriesInterval_weeks || 3;
      const sixteenWeekDate = addWeeks(estimatedDob, SERIES_COMPLETION_WEEKS);

      let doseDate = new Date(today);
      let doseNumber = 0;
      let seriesComplete = false;

      while (!seriesComplete) {
        doseNumber++;
        const isFirstDose = doseNumber === 1;
        const isCompletionDose = doseDate >= sixteenWeekDate;

        if (isFirstDose) {
          catchUp++;
          details.push({
            name: `${entry.name} Dose ${doseNumber} (catch-up)`,
            action: 'scheduled_today',
            date: doseDate.toISOString().split('T')[0],
          });
        } else {
          details.push({
            name: `${entry.name} Dose ${doseNumber}${isCompletionDose ? ' (final)' : ''}`,
            action: 'scheduled_future',
            date: doseDate.toISOString().split('T')[0],
          });
          scheduled++;
        }

        recordsToInsert.push({
          tenantId,
          animalId,
          careTypeId: careType.id,
          careName: careType.name,
          careCategory: careType.category,
          status: 'pending',
          dateAdministered: new Date(doseDate),
          nextDueDate: null,
          notes: `Puppy Protocol - ${entry.name} Dose ${doseNumber}${isCompletionDose ? ' (16-week final)' : isFirstDose ? ' (catch-up)' : ''}`,
          createdBy: userId,
        });

        if (isCompletionDose) {
          seriesComplete = true;
        } else {
          doseDate = addWeeks(doseDate, intervalWeeks);
        }
      }

      continue;
    }

    if (existingTypeIds.has(careType.id) || existingNames.has(entry.name)) {
      details.push({ name: entry.name, action: 'skipped_already_exists' });
      skipped++;
      continue;
    }

    if (entry.target_age_weeks < currentAgeWeeks) {
      details.push({ name: entry.name, action: 'skipped_past_age' });
      skipped++;
      continue;
    }

    const scheduledDate = addWeeks(estimatedDob, entry.target_age_weeks);
    const nextDueDate = careType.defaultIntervalDays
      ? new Date(scheduledDate.getTime() + careType.defaultIntervalDays * 24 * 60 * 60 * 1000)
      : null;

    details.push({
      name: entry.name,
      action: 'scheduled_future',
      date: scheduledDate.toISOString().split('T')[0],
    });
    recordsToInsert.push({
      tenantId,
      animalId,
      careTypeId: careType.id,
      careName: careType.name,
      careCategory: careType.category,
      status: 'pending',
      dateAdministered: scheduledDate,
      nextDueDate,
      notes: `Puppy Protocol - scheduled at ${entry.target_age_weeks} weeks`,
      createdBy: userId,
    });
    scheduled++;
  }

  let createdRecords: any[] = [];
  if (recordsToInsert.length > 0) {
    createdRecords = await db
      .insert(preventativeCareRecords)
      .values(recordsToInsert)
      .returning();

    try {
      const dueDateUpdates: Record<string, string> = {};
      for (let i = 0; i < recordsToInsert.length; i++) {
        const inserted = recordsToInsert[i];
        const careType = careTypeMap.get(inserted.careName);
        const nextDue = inserted.nextDueDate;
        if (careType && nextDue) {
          const dueStr = new Date(nextDue).toISOString();
          if (careType.coversHeartworm && (!dueDateUpdates.heartwormDueDate || new Date(dueStr) > new Date(dueDateUpdates.heartwormDueDate))) {
            dueDateUpdates.heartwormDueDate = dueStr;
          }
          if (careType.coversFleaTick && (!dueDateUpdates.fleaTickDueDate || new Date(dueStr) > new Date(dueDateUpdates.fleaTickDueDate))) {
            dueDateUpdates.fleaTickDueDate = dueStr;
          }
        }
      }
      if (Object.keys(dueDateUpdates).length > 0) {
        const [existingAnimal] = await db
          .select({ medicalDueDates: animals.medicalDueDates })
          .from(animals)
          .where(eq(animals.id, animalId))
          .limit(1);
        const merged = { ...((existingAnimal?.medicalDueDates as any) || {}), ...dueDateUpdates };
        await db.update(animals).set({ medicalDueDates: merged }).where(eq(animals.id, animalId));
      }
    } catch (cacheError) {
      console.error('[PuppyProtocol] Failed to update medicalDueDates cache:', cacheError);
    }
  }

  return {
    scheduled,
    skipped,
    catchUp,
    records: createdRecords,
    details,
  };
}
