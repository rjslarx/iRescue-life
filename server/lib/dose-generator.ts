import { db } from "../db";
import { medicalDoses, type MedicalPrescription, type Tenant } from "@shared/schema";
import { and, eq } from "drizzle-orm";

interface GeneratedDose {
  prescriptionId: string;
  tenantId: string;
  dueDate: Date;
  status: "due" | "given";
  givenAt?: Date;
}

interface DoseGeneratorOptions {
  prescription: MedicalPrescription;
  tenant: Tenant;
  tenantId: string;
}

/**
 * Generate doses for a prescription based on frequency and date range.
 * This is used both when creating and updating prescriptions.
 */
export function generateDosesForPrescription(options: DoseGeneratorOptions): GeneratedDose[] {
  const { prescription, tenant, tenantId } = options;
  
  const doses: GeneratedDose[] = [];
  const freq = prescription.frequency.toUpperCase();
  
  console.log(`[DOSE-GEN] Generating doses for prescription ${prescription.id}:`);
  console.log(`[DOSE-GEN]   medication: ${prescription.medicationName}`);
  console.log(`[DOSE-GEN]   frequency raw: "${prescription.frequency}", normalized: "${freq}"`);
  console.log(`[DOSE-GEN]   startDate: ${prescription.startDate}`);
  console.log(`[DOSE-GEN]   endDate: ${prescription.endDate}`);
  console.log(`[DOSE-GEN]   nextScheduledDose: ${prescription.nextScheduledDose}`);
  
  // For ONE TIME medications, always use startDate (when it was given)
  // nextScheduledDose is just informational for when to schedule the next vet appointment
  const isOneTime = freq === 'ONCE' || freq.includes('ONE TIME');
  
  const doseStartDate = isOneTime
    ? new Date(prescription.startDate)  // One-time: use the date it was given
    : (prescription.nextScheduledDose 
        ? new Date(prescription.nextScheduledDose) 
        : new Date(prescription.startDate));
  const start = doseStartDate;
  
  // Calculate end date:
  // - If endDate exists AND is after start, use it
  // - If endDate is before start (backlogged prescription with nextScheduledDose), generate single dose
  // - If no endDate, default to start + 30 days
  let end: Date;
  let endDateIsBacklogged = false;  // Track if endDate was invalid (before start)
  if (prescription.endDate) {
    const prescEndDate = new Date(prescription.endDate);
    if (prescEndDate >= start) {
      end = prescEndDate;
    } else {
      // endDate is before start - this is a backlogged prescription
      // For this scenario (e.g., monthly med with past endDate but future nextScheduledDose),
      // we want to generate just one dose at nextScheduledDose
      console.log(`[DOSE-GEN]   Note: endDate ${prescEndDate.toISOString()} is before start ${start.toISOString()}, generating single dose (backlogged)`);
      endDateIsBacklogged = true;
      // Set end = start so loop generates exactly one dose
      end = new Date(start.getTime());
    }
  } else {
    end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
  }
  
  // Limit max duration to 90 days to prevent timeout from generating too many doses
  const maxEndDate = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
  const effectiveEnd = end > maxEndDate ? maxEndDate : end;
  
  // Get tenant's configured medication rounds times (or use defaults)
  const parseTime = (timeStr: string): { hour: number; minute: number } => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hour: hours, minute: minutes || 0 };
  };
  const morningTime = parseTime(tenant.defaultMorningRounds || '08:00');
  const middayTime = parseTime(tenant.defaultMiddayRounds || '13:00');
  const eveningTime = parseTime(tenant.defaultEveningRounds || '17:00');
  
  // Parse frequency and determine dose generation strategy
  type DoseTimeSlot = { hour: number; minute: number };
  let doseTimes: DoseTimeSlot[] = [morningTime]; // Default: once daily at morning rounds
  
  // Determine if this is an interval-based frequency (days between doses)
  let intervalDays: number | null = null; // null means daily dosing with doseTimes array
  
  if (freq === 'ONCE' || freq.includes('ONE TIME')) {
    intervalDays = 0; // Special: single dose only
  } else if (freq === 'ANNUALLY' || freq.includes('ANNUAL') || freq.includes('YEARLY')) {
    intervalDays = 365;
  } else if (freq === 'Q8M' || freq.includes('8 MONTH') || freq.includes('SERESTO')) {
    intervalDays = 240;
  } else if (freq === 'Q6M' || freq.includes('6 MONTH') || freq.includes('PROHEART')) {
    intervalDays = 180;
  } else if (freq === 'Q3M' || freq.includes('3 MONTH') || freq.includes('BRAVECTO')) {
    intervalDays = 90;
  } else if (freq === 'MONTHLY' || freq.includes('MONTH')) {
    intervalDays = 30;
  } else if (freq === 'WEEKLY' || freq.includes('WEEK')) {
    intervalDays = 7;
  } else if (freq.includes('EOD') || freq.includes('EVERY OTHER')) {
    intervalDays = 2;
  } else if (freq.includes('HS') || freq.includes('BEDTIME')) {
    doseTimes = [{ hour: 21, minute: 0 }]; // 9 PM (bedtime) - fixed time
  } else if (freq.includes('BID') || freq.includes('TWICE') || freq.includes('2X')) {
    doseTimes = [morningTime, eveningTime]; // Morning + Evening
  } else if (freq.includes('TID') || freq.includes('THREE') || freq.includes('3X')) {
    doseTimes = [morningTime, middayTime, eveningTime]; // Morning + Midday + Evening
  } else if (freq.includes('QID') || freq.includes('FOUR') || freq.includes('4X')) {
    const lateHour = Math.min(eveningTime.hour + 4, 22);
    doseTimes = [morningTime, middayTime, eveningTime, { hour: lateHour, minute: 0 }];
  }
  // Default: SID (once daily at morning) - already set
  
  console.log(`[DOSE-GEN]   isOneTime: ${isOneTime}, intervalDays: ${intervalDays}, endDateIsBacklogged: ${endDateIsBacklogged}`);
  console.log(`[DOSE-GEN]   start: ${start.toISOString()}, effectiveEnd: ${effectiveEnd.toISOString()}`);

  // Safety limit: max 500 doses to prevent timeout
  const MAX_DOSES = 500;
  const now = new Date();
  const isFirstDay = (d: Date) => 
    d.getFullYear() === start.getFullYear() && 
    d.getMonth() === start.getMonth() && 
    d.getDate() === start.getDate();
  
  // Determine if this is a historical prescription
  // For One Time meds: historical if startDate is in the past (the dose was already given)
  // For other meds: historical if endDate is in the past AND not a backlogged prescription
  //   (backlogged = endDate < start, meaning we're generating future doses from nextScheduledDose)
  const isHistorical = isOneTime
    ? new Date(prescription.startDate) < now  // One-time: given date in past = historical
    : (prescription.endDate && new Date(prescription.endDate) < now && !endDateIsBacklogged);
  
  console.log(`[DOSE-GEN]   isHistorical: ${isHistorical}`);
  
  // Helper to get first-day adjusted time (avoid immediate overdue for same-day prescriptions)
  const getFirstDayAdjustedTime = (d: Date): { hour: number; minute: number } => {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const morningMinutes = morningTime.hour * 60 + morningTime.minute;
    
    // If start date is today and current time is past morning rounds, use current time
    if (!isHistorical && isFirstDay(d) && nowMinutes >= morningMinutes) {
      return { hour: now.getHours(), minute: now.getMinutes() };
    }
    return morningTime;
  };
  
  // Generate doses based on frequency type
  if (intervalDays === 0) {
    console.log(`[DOSE-GEN]   PATH: ONE TIME (single dose)`);
    // ONE TIME: Single dose only
    const doseTime = new Date(start);
    const adjustedTime = getFirstDayAdjustedTime(start);
    doseTime.setHours(adjustedTime.hour, adjustedTime.minute, 0, 0);
    const doseStatus = isHistorical ? 'given' as const : 'due' as const;
    doses.push({
      prescriptionId: prescription.id,
      tenantId,
      dueDate: doseTime,
      status: doseStatus,
      ...(isHistorical ? { givenAt: doseTime } : {}),
    });
  } else if (intervalDays !== null && intervalDays > 1) {
    console.log(`[DOSE-GEN]   PATH: INTERVAL-BASED (every ${intervalDays} days)`);
    // INTERVAL-BASED: Generate doses at specified day intervals (weekly, monthly, etc.)
    let isFirst = true;
    for (let d = new Date(start); d <= effectiveEnd && doses.length < MAX_DOSES; d.setDate(d.getDate() + intervalDays)) {
      const doseTime = new Date(d);
      if (isFirst && isFirstDay(d)) {
        const adjustedTime = getFirstDayAdjustedTime(d);
        doseTime.setHours(adjustedTime.hour, adjustedTime.minute, 0, 0);
      } else {
        doseTime.setHours(morningTime.hour, morningTime.minute, 0, 0);
      }
      isFirst = false;
      const doseStatus = isHistorical ? 'given' as const : 'due' as const;
      doses.push({
        prescriptionId: prescription.id,
        tenantId,
        dueDate: doseTime,
        status: doseStatus,
        ...(isHistorical ? { givenAt: doseTime } : {}),
      });
    }
  } else {
    console.log(`[DOSE-GEN]   PATH: DAILY-BASED (${doseTimes.length} times/day)`);
    // DAILY-BASED: Generate doses each day with multiple times per day if needed
    for (let d = new Date(start); d <= effectiveEnd && doses.length < MAX_DOSES; d.setDate(d.getDate() + 1)) {
      for (let i = 0; i < doseTimes.length && doses.length < MAX_DOSES; i++) {
        const doseTime = new Date(d);
        let { hour, minute } = doseTimes[i];
        
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const morningMinutes = morningTime.hour * 60 + morningTime.minute;
        if (!isHistorical && isFirstDay(d) && doseTimes.length === 1 && nowMinutes >= morningMinutes) {
          hour = now.getHours();
          minute = now.getMinutes();
        }
        
        doseTime.setHours(hour, minute, 0, 0);
        
        const doseStatus = isHistorical ? 'given' as const : 'due' as const;
        
        doses.push({
          prescriptionId: prescription.id,
          tenantId,
          dueDate: doseTime,
          status: doseStatus,
          ...(isHistorical ? { givenAt: doseTime } : {}),
        });
      }
    }
  }
  
  console.log(`[DOSE-GEN]   RESULT: Generated ${doses.length} doses`);
  if (doses.length > 0) {
    console.log(`[DOSE-GEN]   First dose: ${doses[0].dueDate.toISOString()}, status: ${doses[0].status}`);
    console.log(`[DOSE-GEN]   Last dose: ${doses[doses.length - 1].dueDate.toISOString()}, status: ${doses[doses.length - 1].status}`);
  }
  
  return doses;
}

/**
 * Delete all pending (due) doses for a prescription and regenerate them.
 * Used when updating frequency or nextScheduledDose on a prescription.
 */
export async function regeneratePrescriptionDoses(options: DoseGeneratorOptions): Promise<{ deletedCount: number; createdCount: number }> {
  const { prescription, tenant, tenantId } = options;
  
  console.log(`[DOSE-REGEN] Starting regeneration for prescription ${prescription.id}`);
  console.log(`[DOSE-REGEN]   medication: ${prescription.medicationName}, frequency: ${prescription.frequency}`);
  
  // Delete all existing 'due' status doses for this prescription
  const deleteResult = await db
    .delete(medicalDoses)
    .where(and(
      eq(medicalDoses.prescriptionId, prescription.id),
      eq(medicalDoses.tenantId, tenantId),
      eq(medicalDoses.status, 'due')
    ));
  
  const deletedCount = (deleteResult as any).rowCount || 0;
  console.log(`[DOSE-REGEN]   Deleted ${deletedCount} existing 'due' doses`);
  
  // Generate new doses based on updated prescription
  const newDoses = generateDosesForPrescription(options);
  
  // Insert new doses
  if (newDoses.length > 0) {
    await db.insert(medicalDoses).values(newDoses);
    console.log(`[DOSE-REGEN]   Inserted ${newDoses.length} new doses`);
  } else {
    console.log(`[DOSE-REGEN]   No new doses to insert`);
  }
  
  return {
    deletedCount,
    createdCount: newDoses.length,
  };
}
