import { db } from '../db';
import {
  tenants,
  animals,
  users,
  fosterAnimals,
  medicationTasks,
  medicationPlans,
  medicalDoses,
  medicalPrescriptions,
  medicalExams,
  diagnosticTests,
  procedureLogs,
  preventativeCareRecords,
  complianceReminders,
  calendarEvents,
  calendars,
} from '@shared/schema';
import { eq, and, or, sql, inArray, lt, isNotNull } from 'drizzle-orm';
import { EmailService } from '../lib/email-service';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface MissedFosterMed {
  animalName: string;
  animalId: string;
  drugName: string;
  fosterName: string;
  scheduledTime?: string;
}

interface SurgeryItem {
  animalName: string;
  animalId: string;
  species: string;
  neuterStatus: string;
}

interface ExamItem {
  animalName: string;
  animalId: string;
  examType: string;
  performedBy: string;
}

interface DiagnosticItem {
  animalName: string;
  animalId: string;
  testName: string;
}

interface ProcedureItem {
  animalName: string;
  animalId: string;
  procedureName: string;
  veterinarian: string | null;
}

interface OverdueCareItem {
  animalName: string;
  animalId: string;
  careName: string;
  nextDueDate: string;
}

interface ComplianceAlert {
  animalName: string;
  animalId: string;
  careName: string;
  fosterName: string;
  state: string;
}

interface CalendarItem {
  title: string;
  startTime: string;
  location: string | null;
}

interface BriefingData {
  tenantName: string;
  date: string;
  missedFosterMeds: MissedFosterMed[];
  surgeries: SurgeryItem[];
  exams: ExamItem[];
  diagnostics: DiagnosticItem[];
  procedures: ProcedureItem[];
  overdueCare: OverdueCareItem[];
  complianceAlerts: ComplianceAlert[];
  calendarItems: CalendarItem[];
}

async function gatherBriefingData(tenantId: string): Promise<BriefingData | null> {
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return null;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const todayStart = new Date(todayStr + 'T00:00:00.000Z');
  const todayEnd = new Date(todayStr + 'T23:59:59.999Z');

  const activeFosters = await db
    .select({ animalId: fosterAnimals.animalId, fosterId: fosterAnimals.fosterId })
    .from(fosterAnimals)
    .where(and(eq(fosterAnimals.tenantId, tenantId), eq(fosterAnimals.status, 'active')));

  const fosterAnimalIds = activeFosters.map(f => f.animalId);
  const fosterByAnimal = new Map(activeFosters.map(f => [f.animalId, f.fosterId]));

  const missedFosterMeds: MissedFosterMed[] = [];

  if (fosterAnimalIds.length > 0) {
    const missedTasks = await db
      .select({
        animalId: medicationTasks.animalId,
        planId: medicationTasks.planId,
        scheduledTime: medicationTasks.scheduledTime,
      })
      .from(medicationTasks)
      .where(and(
        eq(medicationTasks.tenantId, tenantId),
        eq(medicationTasks.status, 'pending'),
        eq(medicationTasks.scheduledDate, yesterdayStr),
        inArray(medicationTasks.animalId, fosterAnimalIds)
      ));

    if (missedTasks.length > 0) {
      const planIds = [...new Set(missedTasks.map(t => t.planId))];
      const plans = await db
        .select({ id: medicationPlans.id, drugName: medicationPlans.drugName })
        .from(medicationPlans)
        .where(inArray(medicationPlans.id, planIds));
      const planMap = new Map(plans.map(p => [p.id, p.drugName]));

      const animalIds = [...new Set(missedTasks.map(t => t.animalId))];
      const animalRows = await db
        .select({ id: animals.id, name: animals.name })
        .from(animals)
        .where(inArray(animals.id, animalIds));
      const animalMap = new Map(animalRows.map(a => [a.id, a.name]));

      const fosterIds = [...new Set(missedTasks.map(t => fosterByAnimal.get(t.animalId)).filter(Boolean) as string[])];
      const fosterRows = await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, fosterIds));
      const fosterMap = new Map(fosterRows.map(f => [f.id, f.fullName || 'Unknown']));

      for (const task of missedTasks) {
        const fosterId = fosterByAnimal.get(task.animalId);
        missedFosterMeds.push({
          animalName: animalMap.get(task.animalId) || 'Unknown',
          animalId: task.animalId,
          drugName: planMap.get(task.planId) || 'medication',
          fosterName: fosterId ? (fosterMap.get(fosterId) || 'Unknown') : 'Unknown',
          scheduledTime: task.scheduledTime,
        });
      }
    }

    const yesterdayStart = new Date(yesterdayStr + 'T00:00:00.000Z');
    const yesterdayEnd = new Date(yesterdayStr + 'T23:59:59.999Z');

    const missedDoses = await db
      .select({
        prescriptionId: medicalDoses.prescriptionId,
        tenantId: medicalDoses.tenantId,
        dueDate: medicalDoses.dueDate,
      })
      .from(medicalDoses)
      .where(and(
        eq(medicalDoses.tenantId, tenantId),
        eq(medicalDoses.status, 'due'),
        sql`${medicalDoses.dueDate} >= ${yesterdayStart}`,
        sql`${medicalDoses.dueDate} < ${yesterdayEnd}`
      ));

    if (missedDoses.length > 0) {
      const prescIds = [...new Set(missedDoses.map(d => d.prescriptionId))];
      const prescRows = await db
        .select({
          id: medicalPrescriptions.id,
          animalId: medicalPrescriptions.animalId,
          medicationName: medicalPrescriptions.medicationName,
        })
        .from(medicalPrescriptions)
        .where(inArray(medicalPrescriptions.id, prescIds));

      const fosterPrescriptions = prescRows.filter(p => fosterAnimalIds.includes(p.animalId));
      const doseByPresc = new Map<string, Date | null>();
      for (const dose of missedDoses) {
        if (!doseByPresc.has(dose.prescriptionId)) {
          doseByPresc.set(dose.prescriptionId, dose.dueDate);
        }
      }

      if (fosterPrescriptions.length > 0) {
        const doseAnimalIds = [...new Set(fosterPrescriptions.map(p => p.animalId))];
        const doseAnimalRows = await db
          .select({ id: animals.id, name: animals.name })
          .from(animals)
          .where(inArray(animals.id, doseAnimalIds));
        const doseAnimalMap = new Map(doseAnimalRows.map(a => [a.id, a.name]));

        const doseFosterIds = [...new Set(fosterPrescriptions.map(p => fosterByAnimal.get(p.animalId)).filter(Boolean) as string[])];
        const doseFosterRows = await db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, doseFosterIds));
        const doseFosterMap = new Map(doseFosterRows.map(f => [f.id, f.fullName || 'Unknown']));

        for (const presc of fosterPrescriptions) {
          const fosterId = fosterByAnimal.get(presc.animalId);
          const alreadyListed = missedFosterMeds.some(m => m.animalId === presc.animalId && m.drugName === presc.medicationName);
          if (!alreadyListed) {
            const dueDate = doseByPresc.get(presc.id);
            let timeStr: string | undefined;
            if (dueDate) {
              const h = dueDate.getUTCHours();
              const m = dueDate.getUTCMinutes();
              if (h !== 0 || m !== 0) {
                const ampm = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 || 12;
                timeStr = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
              }
            }
            missedFosterMeds.push({
              animalName: doseAnimalMap.get(presc.animalId) || 'Unknown',
              animalId: presc.animalId,
              drugName: presc.medicationName,
              fosterName: fosterId ? (doseFosterMap.get(fosterId) || 'Unknown') : 'Unknown',
              scheduledTime: timeStr,
            });
          }
        }
      }
    }
  }

  const surgeryRows = await db
    .select({
      id: animals.id,
      name: animals.name,
      species: animals.species,
      neuterStatus: animals.neuterStatus,
    })
    .from(animals)
    .where(and(
      eq(animals.tenantId, tenantId),
      sql`DATE(${animals.scheduledSurgeryDate}) = ${todayStr}`
    ));

  const surgeries: SurgeryItem[] = surgeryRows.map(r => ({
    animalName: r.name,
    animalId: r.id,
    species: r.species || '',
    neuterStatus: r.neuterStatus || '',
  }));

  const examRows = await db
    .select({
      animalId: medicalExams.animalId,
      examType: medicalExams.examType,
      performedBy: medicalExams.performedBy,
      animalName: animals.name,
    })
    .from(medicalExams)
    .innerJoin(animals, eq(medicalExams.animalId, animals.id))
    .where(and(
      eq(medicalExams.tenantId, tenantId),
      eq(medicalExams.status, 'pending'),
      sql`${medicalExams.examDate} >= ${todayStart}`,
      sql`${medicalExams.examDate} <= ${todayEnd}`
    ));

  const exams: ExamItem[] = examRows.map(r => ({
    animalName: r.animalName,
    animalId: r.animalId,
    examType: r.examType,
    performedBy: r.performedBy,
  }));

  const diagRows = await db
    .select({
      animalId: diagnosticTests.animalId,
      testName: diagnosticTests.testName,
      animalName: animals.name,
    })
    .from(diagnosticTests)
    .innerJoin(animals, eq(diagnosticTests.animalId, animals.id))
    .where(and(
      eq(diagnosticTests.tenantId, tenantId),
      sql`${diagnosticTests.testDate} >= ${todayStart}`,
      sql`${diagnosticTests.testDate} <= ${todayEnd}`
    ));

  const diagnostics: DiagnosticItem[] = diagRows.map(r => ({
    animalName: r.animalName,
    animalId: r.animalId,
    testName: r.testName,
  }));

  const procRows = await db
    .select({
      animalId: procedureLogs.animalId,
      procedureName: procedureLogs.procedureName,
      veterinarian: procedureLogs.veterinarian,
      animalName: animals.name,
    })
    .from(procedureLogs)
    .innerJoin(animals, eq(procedureLogs.animalId, animals.id))
    .where(and(
      eq(procedureLogs.tenantId, tenantId),
      eq(procedureLogs.status, 'pending'),
      sql`${procedureLogs.procedureDate} >= ${todayStart}`,
      sql`${procedureLogs.procedureDate} <= ${todayEnd}`
    ));

  const procedures: ProcedureItem[] = procRows.map(r => ({
    animalName: r.animalName,
    animalId: r.animalId,
    procedureName: r.procedureName,
    veterinarian: r.veterinarian,
  }));

  const overdueRows = await db
    .select({
      animalId: preventativeCareRecords.animalId,
      careName: preventativeCareRecords.careName,
      nextDueDate: preventativeCareRecords.nextDueDate,
      animalName: animals.name,
    })
    .from(preventativeCareRecords)
    .innerJoin(animals, eq(preventativeCareRecords.animalId, animals.id))
    .where(and(
      eq(preventativeCareRecords.tenantId, tenantId),
      eq(preventativeCareRecords.status, 'pending'),
      isNotNull(preventativeCareRecords.nextDueDate),
      sql`${preventativeCareRecords.nextDueDate} < ${todayStart}`
    ))
    .limit(20);

  const overdueCare: OverdueCareItem[] = overdueRows.map(r => ({
    animalName: r.animalName,
    animalId: r.animalId,
    careName: r.careName,
    nextDueDate: r.nextDueDate?.toISOString().split('T')[0] || '',
  }));

  const complianceRows = await db
    .select({
      animalId: complianceReminders.animalId,
      careName: complianceReminders.careName,
      state: complianceReminders.state,
      fosterId: complianceReminders.fosterId,
      animalName: animals.name,
    })
    .from(complianceReminders)
    .innerJoin(animals, eq(complianceReminders.animalId, animals.id))
    .where(and(
      eq(complianceReminders.tenantId, tenantId),
      or(
        eq(complianceReminders.state, 'overdue'),
        eq(complianceReminders.state, 'requires_intervention')
      )
    ))
    .limit(20);

  let complianceFosterMap = new Map<string, string>();
  const complianceFosterIds = [...new Set(complianceRows.map(r => r.fosterId).filter(Boolean) as string[])];
  if (complianceFosterIds.length > 0) {
    const cfRows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, complianceFosterIds));
    complianceFosterMap = new Map(cfRows.map(f => [f.id, f.fullName || 'Unknown']));
  }

  const complianceAlerts: ComplianceAlert[] = complianceRows.map(r => ({
    animalName: r.animalName,
    animalId: r.animalId,
    careName: r.careName,
    fosterName: r.fosterId ? (complianceFosterMap.get(r.fosterId) || 'Unknown') : 'N/A',
    state: r.state,
  }));

  const volunteerCalendarIds = await db
    .select({ id: calendars.id })
    .from(calendars)
    .where(and(eq(calendars.tenantId, tenantId), eq(calendars.type, 'volunteer')));
  const volCalIds = volunteerCalendarIds.map(c => c.id);

  let calendarQuery = db
    .select({
      title: calendarEvents.title,
      startTime: calendarEvents.startTime,
      location: calendarEvents.location,
      calendarId: calendarEvents.calendarId,
    })
    .from(calendarEvents)
    .where(and(
      eq(calendarEvents.tenantId, tenantId),
      sql`${calendarEvents.startTime} >= ${todayStart}`,
      sql`${calendarEvents.startTime} <= ${todayEnd}`
    ));

  const calendarRows = await calendarQuery;
  const filteredCalendar = calendarRows.filter(e => !volCalIds.includes(e.calendarId));

  const calendarItems: CalendarItem[] = filteredCalendar.map(r => ({
    title: r.title,
    startTime: r.startTime.toISOString(),
    location: r.location,
  }));

  return {
    tenantName: tenant.name,
    date: todayStr,
    missedFosterMeds,
    surgeries,
    exams,
    diagnostics,
    procedures,
    overdueCare,
    complianceAlerts,
    calendarItems,
  };
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch {
    return '';
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  } catch {
    return dateStr;
  }
}

function renderSection(title: string, icon: string, color: string, badgeColor: string, count: number, rowsHtml: string): string {
  if (count === 0) return '';
  return `
    <tr><td style="padding: 0 0 16px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <tr>
          <td style="background-color: ${color}; padding: 12px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size: 15px; font-weight: 600; color: #1f2937;">
                ${icon} ${title}
              </td>
              <td align="right">
                <span style="display: inline-block; background-color: ${badgeColor}; color: #fff; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 10px;">
                  ${count}
                </span>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="padding: 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            ${rowsHtml}
          </table>
        </td></tr>
      </table>
    </td></tr>
  `;
}

function renderRow(cells: string[], isAlt: boolean): string {
  const bg = isAlt ? '#f9fafb' : '#ffffff';
  return `<tr style="background-color: ${bg};">
    ${cells.map(c => `<td style="padding: 8px 16px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${c}</td>`).join('')}
  </tr>`;
}

function composeHtmlEmail(data: BriefingData): string {
  const dateDisplay = formatDate(data.date);

  let missedRows = '';
  data.missedFosterMeds.forEach((m, i) => {
    missedRows += renderRow([
      `<strong>${escapeHtml(m.animalName)}</strong>`,
      escapeHtml(m.drugName),
      escapeHtml(m.fosterName),
      m.scheduledTime ? escapeHtml(m.scheduledTime) : '--',
    ], i % 2 === 1);
  });
  const missedHeader = data.missedFosterMeds.length > 0
    ? `<tr style="background-color: #fef2f2;">
        <td style="padding: 6px 16px; font-size: 12px; font-weight: 600; color: #991b1b; text-transform: uppercase; border-bottom: 1px solid #fecaca;">Animal</td>
        <td style="padding: 6px 16px; font-size: 12px; font-weight: 600; color: #991b1b; text-transform: uppercase; border-bottom: 1px solid #fecaca;">Medication</td>
        <td style="padding: 6px 16px; font-size: 12px; font-weight: 600; color: #991b1b; text-transform: uppercase; border-bottom: 1px solid #fecaca;">Foster</td>
        <td style="padding: 6px 16px; font-size: 12px; font-weight: 600; color: #991b1b; text-transform: uppercase; border-bottom: 1px solid #fecaca;">Time</td>
      </tr>`
    : '';

  let surgeryRows = '';
  data.surgeries.forEach((s, i) => {
    const label = s.neuterStatus === 'intact' ? 'Spay/Neuter' : 'Surgery';
    surgeryRows += renderRow([
      `<strong>${escapeHtml(s.animalName)}</strong>`,
      label,
      escapeHtml(s.species),
    ], i % 2 === 1);
  });

  let examRows = '';
  data.exams.forEach((e, i) => {
    const examType = e.examType.charAt(0).toUpperCase() + e.examType.slice(1);
    examRows += renderRow([
      `<strong>${escapeHtml(e.animalName)}</strong>`,
      escapeHtml(examType),
      escapeHtml(e.performedBy),
    ], i % 2 === 1);
  });

  let diagRows = '';
  data.diagnostics.forEach((d, i) => {
    diagRows += renderRow([
      `<strong>${escapeHtml(d.animalName)}</strong>`,
      escapeHtml(d.testName),
    ], i % 2 === 1);
  });

  let procRows = '';
  data.procedures.forEach((p, i) => {
    procRows += renderRow([
      `<strong>${escapeHtml(p.animalName)}</strong>`,
      escapeHtml(p.procedureName),
      p.veterinarian ? escapeHtml(p.veterinarian) : '--',
    ], i % 2 === 1);
  });

  let overdueRows = '';
  data.overdueCare.forEach((o, i) => {
    overdueRows += renderRow([
      `<strong>${escapeHtml(o.animalName)}</strong>`,
      escapeHtml(o.careName),
      o.nextDueDate,
    ], i % 2 === 1);
  });

  let complianceRows = '';
  data.complianceAlerts.forEach((c, i) => {
    const stateLabel = c.state === 'requires_intervention' ? 'Needs Intervention' : 'Overdue';
    complianceRows += renderRow([
      `<strong>${escapeHtml(c.animalName)}</strong>`,
      escapeHtml(c.careName),
      escapeHtml(c.fosterName),
      `<span style="color: ${c.state === 'requires_intervention' ? '#dc2626' : '#d97706'}; font-weight: 600;">${stateLabel}</span>`,
    ], i % 2 === 1);
  });

  let calendarRowsHtml = '';
  data.calendarItems.forEach((e, i) => {
    calendarRowsHtml += renderRow([
      `<strong>${escapeHtml(e.title)}</strong>`,
      formatTime(e.startTime),
      e.location ? escapeHtml(e.location) : '--',
    ], i % 2 === 1);
  });

  const totalItems = data.missedFosterMeds.length + data.surgeries.length + data.exams.length +
    data.diagnostics.length + data.procedures.length + data.overdueCare.length +
    data.complianceAlerts.length + data.calendarItems.length;

  const summaryItems: string[] = [];
  if (data.missedFosterMeds.length > 0) summaryItems.push(`${data.missedFosterMeds.length} missed foster med(s)`);
  if (data.surgeries.length > 0) summaryItems.push(`${data.surgeries.length} surgery(ies)`);
  if (data.exams.length > 0) summaryItems.push(`${data.exams.length} exam(s)`);
  if (data.diagnostics.length > 0) summaryItems.push(`${data.diagnostics.length} diagnostic(s)`);
  if (data.procedures.length > 0) summaryItems.push(`${data.procedures.length} procedure(s)`);
  if (data.overdueCare.length > 0) summaryItems.push(`${data.overdueCare.length} overdue care item(s)`);
  if (data.complianceAlerts.length > 0) summaryItems.push(`${data.complianceAlerts.length} compliance alert(s)`);
  if (data.calendarItems.length > 0) summaryItems.push(`${data.calendarItems.length} event(s)`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Briefing - ${escapeHtml(data.tenantName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
        <!-- Header -->
        <tr><td style="background-color: #1e3a5f; padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">Daily Briefing</h1>
              <p style="margin: 4px 0 0 0; font-size: 14px; color: #94a3b8;">${escapeHtml(data.tenantName)} &middot; ${dateDisplay}</p>
            </td>
            <td align="right" style="vertical-align: top;">
              <span style="display: inline-block; background-color: rgba(255,255,255,0.15); color: #ffffff; font-size: 13px; padding: 4px 12px; border-radius: 16px;">
                ${totalItems} item${totalItems !== 1 ? 's' : ''}
              </span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Quick Summary -->
        <tr><td style="background-color: #ffffff; padding: 16px 32px; border-bottom: 1px solid #e5e7eb;">
          <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
            ${totalItems === 0
              ? 'All clear today -- no urgent items.'
              : `Today's overview: ${summaryItems.join(', ')}.`
            }
          </p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background-color: #ffffff; padding: 24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${renderSection(
              'Missed Foster Medications (Yesterday)',
              '[!]',
              '#fef2f2',
              '#dc2626',
              data.missedFosterMeds.length,
              missedHeader + missedRows
            )}
            ${renderSection(
              'Surgeries Today',
              '[S]',
              '#fefce8',
              '#d97706',
              data.surgeries.length,
              surgeryRows
            )}
            ${renderSection(
              'Medical Exams Today',
              '[E]',
              '#f0fdf4',
              '#16a34a',
              data.exams.length,
              examRows
            )}
            ${renderSection(
              'Diagnostics & Labs Today',
              '[D]',
              '#eff6ff',
              '#2563eb',
              data.diagnostics.length,
              diagRows
            )}
            ${renderSection(
              'Procedures Today',
              '[P]',
              '#fdf4ff',
              '#9333ea',
              data.procedures.length,
              procRows
            )}
            ${renderSection(
              'Overdue Preventative Care',
              '[OD]',
              '#fff7ed',
              '#ea580c',
              data.overdueCare.length,
              overdueRows
            )}
            ${renderSection(
              'Foster Compliance Alerts',
              '[!]',
              '#fef2f2',
              '#dc2626',
              data.complianceAlerts.length,
              complianceRows
            )}
            ${renderSection(
              'Calendar Events Today',
              '[C]',
              '#f5f3ff',
              '#7c3aed',
              data.calendarItems.length,
              calendarRowsHtml
            )}
            ${totalItems === 0 ? `
            <tr><td style="padding: 32px 0; text-align: center;">
              <p style="font-size: 16px; color: #6b7280;">All clear for today!</p>
              <p style="font-size: 13px; color: #9ca3af;">No urgent items or scheduled tasks.</p>
            </td></tr>` : ''}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color: #f9fafb; padding: 16px 32px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
            This is an automated daily briefing from ${escapeHtml(data.tenantName)}. Log in to your dashboard for full details.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function composePlainTextEmail(data: BriefingData): string {
  const lines: string[] = [];
  lines.push(`DAILY BRIEFING - ${data.tenantName}`);
  lines.push(`${formatDate(data.date)}`);
  lines.push('');

  if (data.missedFosterMeds.length > 0) {
    lines.push(`--- MISSED FOSTER MEDICATIONS (Yesterday) [${data.missedFosterMeds.length}] ---`);
    data.missedFosterMeds.forEach(m => {
      lines.push(`  ${m.animalName} - ${m.drugName} (Foster: ${m.fosterName})${m.scheduledTime ? ` at ${m.scheduledTime}` : ''}`);
    });
    lines.push('');
  }

  if (data.surgeries.length > 0) {
    lines.push(`--- SURGERIES TODAY [${data.surgeries.length}] ---`);
    data.surgeries.forEach(s => {
      lines.push(`  ${s.animalName} - ${s.neuterStatus === 'intact' ? 'Spay/Neuter' : 'Surgery'} (${s.species})`);
    });
    lines.push('');
  }

  if (data.exams.length > 0) {
    lines.push(`--- MEDICAL EXAMS TODAY [${data.exams.length}] ---`);
    data.exams.forEach(e => {
      lines.push(`  ${e.animalName} - ${e.examType} (${e.performedBy})`);
    });
    lines.push('');
  }

  if (data.diagnostics.length > 0) {
    lines.push(`--- DIAGNOSTICS & LABS TODAY [${data.diagnostics.length}] ---`);
    data.diagnostics.forEach(d => {
      lines.push(`  ${d.animalName} - ${d.testName}`);
    });
    lines.push('');
  }

  if (data.procedures.length > 0) {
    lines.push(`--- PROCEDURES TODAY [${data.procedures.length}] ---`);
    data.procedures.forEach(p => {
      lines.push(`  ${p.animalName} - ${p.procedureName}${p.veterinarian ? ` (Dr. ${p.veterinarian})` : ''}`);
    });
    lines.push('');
  }

  if (data.overdueCare.length > 0) {
    lines.push(`--- OVERDUE PREVENTATIVE CARE [${data.overdueCare.length}] ---`);
    data.overdueCare.forEach(o => {
      lines.push(`  ${o.animalName} - ${o.careName} (due: ${o.nextDueDate})`);
    });
    lines.push('');
  }

  if (data.complianceAlerts.length > 0) {
    lines.push(`--- FOSTER COMPLIANCE ALERTS [${data.complianceAlerts.length}] ---`);
    data.complianceAlerts.forEach(c => {
      const stateLabel = c.state === 'requires_intervention' ? 'NEEDS INTERVENTION' : 'OVERDUE';
      lines.push(`  ${c.animalName} - ${c.careName} (Foster: ${c.fosterName}) [${stateLabel}]`);
    });
    lines.push('');
  }

  if (data.calendarItems.length > 0) {
    lines.push(`--- CALENDAR EVENTS TODAY [${data.calendarItems.length}] ---`);
    data.calendarItems.forEach(e => {
      lines.push(`  ${e.title} at ${formatTime(e.startTime)}${e.location ? ` - ${e.location}` : ''}`);
    });
    lines.push('');
  }

  const totalItems = data.missedFosterMeds.length + data.surgeries.length + data.exams.length +
    data.diagnostics.length + data.procedures.length + data.overdueCare.length +
    data.complianceAlerts.length + data.calendarItems.length;

  if (totalItems === 0) {
    lines.push('All clear for today! No urgent items or scheduled tasks.');
  }

  lines.push('---');
  lines.push(`Automated daily briefing from ${data.tenantName}.`);

  return lines.join('\n');
}

export async function sendDailyBriefingForTenant(tenantId: string): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    const data = await gatherBriefingData(tenantId);
    if (!data) {
      return { sent: 0, errors: ['Tenant not found'] };
    }

    const staffUsers = await db
      .select({ email: users.email, fullName: users.fullName, roles: users.roles })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        sql`(${users.roles} && ARRAY['admin', 'staff', 'board_member']::text[])`
      ));

    const recipients = staffUsers
      .filter(u => u.email)
      .map(u => u.email);

    if (recipients.length === 0) {
      return { sent: 0, errors: [] };
    }

    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      return { sent: 0, errors: ['Email service not available for tenant'] };
    }

    const html = composeHtmlEmail(data);
    const text = composePlainTextEmail(data);

    const totalItems = data.missedFosterMeds.length + data.surgeries.length + data.exams.length +
      data.diagnostics.length + data.procedures.length + data.overdueCare.length +
      data.complianceAlerts.length + data.calendarItems.length;

    const subject = totalItems > 0
      ? `Daily Briefing: ${totalItems} item${totalItems !== 1 ? 's' : ''} for ${formatDate(data.date)}`
      : `Daily Briefing: All clear for ${formatDate(data.date)}`;

    const result = await emailService.send({
      to: recipients,
      subject,
      html,
      text,
    });

    if (result.success) {
      sent = recipients.length;
      console.log(`[BRIEFING] Sent daily briefing to ${recipients.length} staff at ${data.tenantName}`);
    } else {
      errors.push(`Email send failed: ${result.error}`);
    }

    return { sent, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { sent, errors };
  }
}

export async function sendDailyBriefingForAllTenants(): Promise<{ sent: number; errors: string[] }> {
  let sent = 0;
  const errors: string[] = [];

  try {
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    for (const tenant of activeTenants) {
      const result = await sendDailyBriefingForTenant(tenant.id);
      sent += result.sent;
      errors.push(...result.errors.map(e => `[${tenant.id}] ${e}`));
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return { sent, errors };
}
