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
  adopterHelpRequests,
  complianceObligations,
  fosterUpdates,
  fosterPhotos,
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

interface HelpRequestItem {
  adopterName: string;
  animalName: string | null;
  message: string;
  createdAt: string;
}

interface OverdueObligationItem {
  adopterName: string;
  animalName: string;
  obligationType: string;
  label: string;
  contractualDueDate: string;
}

interface FosterUpdateItem {
  animalName: string;
  fosterName: string;
  updateType: string;
  priority: string;
  description: string;
}

interface FosterPhotoItem {
  animalName: string;
  fosterName: string;
  caption: string | null;
}

interface BriefingData {
  tenantName: string;
  date: string;
  missedFosterMeds: MissedFosterMed[];
  surgeries: SurgeryItem[];
  exams: ExamItem[];
  diagnostics: DiagnosticItem[];
  procedures: ProcedureItem[];
  shelterOverdueCare: OverdueCareItem[];
  fosterOverdueCare: OverdueCareItem[];
  complianceAlerts: ComplianceAlert[];
  calendarItems: CalendarItem[];
  helpRequests: HelpRequestItem[];
  overdueObligations: OverdueObligationItem[];
  recentFosterUpdates: FosterUpdateItem[];
  recentFosterPhotos: FosterPhotoItem[];
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
    .limit(30);

  const fosterAnimalIdSet = new Set(fosterAnimalIds);
  const shelterOverdueCare: OverdueCareItem[] = [];
  const fosterOverdueCare: OverdueCareItem[] = [];

  for (const r of overdueRows) {
    const item: OverdueCareItem = {
      animalName: r.animalName,
      animalId: r.animalId,
      careName: r.careName,
      nextDueDate: r.nextDueDate?.toISOString().split('T')[0] || '',
    };
    if (fosterAnimalIdSet.has(r.animalId)) {
      fosterOverdueCare.push(item);
    } else {
      shelterOverdueCare.push(item);
    }
  }

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

  const helpRequestRows = await db
    .select({
      adopterName: adopterHelpRequests.adopterName,
      animalName: adopterHelpRequests.animalName,
      message: adopterHelpRequests.message,
      createdAt: adopterHelpRequests.createdAt,
    })
    .from(adopterHelpRequests)
    .where(and(
      eq(adopterHelpRequests.tenantId, tenantId),
      eq(adopterHelpRequests.status, 'pending')
    ))
    .limit(20);

  const helpRequests: HelpRequestItem[] = helpRequestRows.map(r => ({
    adopterName: r.adopterName,
    animalName: r.animalName,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
  }));

  const overdueObligationRows = await db
    .select({
      adopterName: complianceObligations.adopterName,
      obligationType: complianceObligations.obligationType,
      label: complianceObligations.label,
      contractualDueDate: complianceObligations.contractualDueDate,
      animalId: complianceObligations.animalId,
    })
    .from(complianceObligations)
    .where(and(
      eq(complianceObligations.tenantId, tenantId),
      eq(complianceObligations.status, 'overdue')
    ))
    .limit(20);

  let obligationAnimalMap = new Map<string, string>();
  if (overdueObligationRows.length > 0) {
    const oblAnimalIds = [...new Set(overdueObligationRows.map(r => r.animalId))];
    const oblAnimalRows = await db
      .select({ id: animals.id, name: animals.name })
      .from(animals)
      .where(inArray(animals.id, oblAnimalIds));
    obligationAnimalMap = new Map(oblAnimalRows.map(a => [a.id, a.name]));
  }

  const overdueObligations: OverdueObligationItem[] = overdueObligationRows.map(r => ({
    adopterName: r.adopterName,
    animalName: obligationAnimalMap.get(r.animalId) || 'Unknown',
    obligationType: r.obligationType,
    label: r.label,
    contractualDueDate: r.contractualDueDate,
  }));

  const yesterdayStartTime = new Date(yesterdayStr + 'T00:00:00.000Z');
  const yesterdayEndTime = new Date(yesterdayStr + 'T23:59:59.999Z');

  const fosterUpdateRows = await db
    .select({
      animalId: fosterUpdates.animalId,
      fosterId: fosterUpdates.fosterId,
      updateType: fosterUpdates.updateType,
      priority: fosterUpdates.priority,
      description: fosterUpdates.description,
    })
    .from(fosterUpdates)
    .where(and(
      eq(fosterUpdates.tenantId, tenantId),
      sql`${fosterUpdates.createdAt} >= ${yesterdayStartTime}`,
      sql`${fosterUpdates.createdAt} <= ${yesterdayEndTime}`
    ))
    .limit(20);

  const fosterPhotoRows = await db
    .select({
      animalId: fosterPhotos.animalId,
      fosterId: fosterPhotos.fosterId,
      caption: fosterPhotos.caption,
    })
    .from(fosterPhotos)
    .where(and(
      eq(fosterPhotos.tenantId, tenantId),
      sql`${fosterPhotos.createdAt} >= ${yesterdayStartTime}`,
      sql`${fosterPhotos.createdAt} <= ${yesterdayEndTime}`
    ))
    .limit(20);

  const allFosterActivityAnimalIds = [...new Set([
    ...fosterUpdateRows.map(r => r.animalId),
    ...fosterPhotoRows.map(r => r.animalId),
  ])];
  const allFosterActivityUserIds = [...new Set([
    ...fosterUpdateRows.map(r => r.fosterId),
    ...fosterPhotoRows.map(r => r.fosterId),
  ])];

  let fosterActivityAnimalMap = new Map<string, string>();
  let fosterActivityUserMap = new Map<string, string>();

  if (allFosterActivityAnimalIds.length > 0) {
    const faAnimals = await db
      .select({ id: animals.id, name: animals.name })
      .from(animals)
      .where(inArray(animals.id, allFosterActivityAnimalIds));
    fosterActivityAnimalMap = new Map(faAnimals.map(a => [a.id, a.name]));
  }

  if (allFosterActivityUserIds.length > 0) {
    const faUsers = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, allFosterActivityUserIds));
    fosterActivityUserMap = new Map(faUsers.map(u => [u.id, u.fullName || 'Unknown']));
  }

  const recentFosterUpdates: FosterUpdateItem[] = fosterUpdateRows.map(r => ({
    animalName: fosterActivityAnimalMap.get(r.animalId) || 'Unknown',
    fosterName: fosterActivityUserMap.get(r.fosterId) || 'Unknown',
    updateType: r.updateType,
    priority: r.priority,
    description: r.description,
  }));

  const recentFosterPhotos: FosterPhotoItem[] = fosterPhotoRows.map(r => ({
    animalName: fosterActivityAnimalMap.get(r.animalId) || 'Unknown',
    fosterName: fosterActivityUserMap.get(r.fosterId) || 'Unknown',
    caption: r.caption,
  }));

  return {
    tenantName: tenant.name,
    date: todayStr,
    missedFosterMeds,
    surgeries,
    exams,
    diagnostics,
    procedures,
    shelterOverdueCare,
    fosterOverdueCare,
    complianceAlerts,
    calendarItems,
    helpRequests,
    overdueObligations,
    recentFosterUpdates,
    recentFosterPhotos,
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
    <tr><td style="padding: 0 0 12px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <tr>
          <td style="background-color: ${color}; padding: 10px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size: 14px; font-weight: 600; color: #1f2937;">
                ${icon} ${title}
              </td>
              <td align="right">
                <span style="display: inline-block; background-color: ${badgeColor}; color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px;">
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

function renderPillarHeader(title: string, bgColor: string, textColor: string, itemCount: number): string {
  if (itemCount === 0) return '';
  return `
    <tr><td style="padding: 16px 0 8px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 10px 16px; background-color: ${bgColor}; border-radius: 6px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size: 16px; font-weight: 700; color: ${textColor}; letter-spacing: 0.5px;">
                ${title}
              </td>
              <td align="right">
                <span style="font-size: 13px; color: ${textColor}; opacity: 0.8;">
                  ${itemCount} item${itemCount !== 1 ? 's' : ''}
                </span>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function composeHtmlEmail(data: BriefingData): string {
  const dateDisplay = formatDate(data.date);

  // --- SHELTER sections ---
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

  let shelterOverdueRows = '';
  data.shelterOverdueCare.forEach((o, i) => {
    shelterOverdueRows += renderRow([
      `<strong>${escapeHtml(o.animalName)}</strong>`,
      escapeHtml(o.careName),
      o.nextDueDate,
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

  // --- FOSTER sections ---
  let missedRows = '';
  data.missedFosterMeds.forEach((m, i) => {
    missedRows += renderRow([
      `<strong>${escapeHtml(m.animalName)}</strong>`,
      escapeHtml(m.drugName),
      escapeHtml(m.fosterName),
      m.scheduledTime ? escapeHtml(m.scheduledTime) : '--',
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

  let fosterOverdueRows = '';
  data.fosterOverdueCare.forEach((o, i) => {
    fosterOverdueRows += renderRow([
      `<strong>${escapeHtml(o.animalName)}</strong>`,
      escapeHtml(o.careName),
      o.nextDueDate,
    ], i % 2 === 1);
  });

  const updateTypeLabels: Record<string, string> = {
    medical_concern: 'Medical Concern',
    behavioral_note: 'Behavioral Note',
    general_update: 'General Update',
    photo_update: 'Photo Update',
  };

  let fosterUpdateRows = '';
  data.recentFosterUpdates.forEach((u, i) => {
    const typeLabel = updateTypeLabels[u.updateType] || u.updateType;
    const truncDesc = u.description.length > 80 ? u.description.substring(0, 77) + '...' : u.description;
    const isUrgent = u.priority === 'urgent' || u.priority === 'high' || u.updateType === 'medical_concern';
    const priorityStyle = isUrgent ? ' style="color: #dc2626; font-weight: 600;"' : '';
    fosterUpdateRows += renderRow([
      `<strong>${escapeHtml(u.animalName)}</strong>`,
      escapeHtml(u.fosterName),
      `<span${priorityStyle}>${escapeHtml(typeLabel)}</span>`,
      escapeHtml(truncDesc),
    ], i % 2 === 1);
  });

  let fosterPhotoRowsHtml = '';
  data.recentFosterPhotos.forEach((p, i) => {
    fosterPhotoRowsHtml += renderRow([
      `<strong>${escapeHtml(p.animalName)}</strong>`,
      escapeHtml(p.fosterName),
      p.caption ? escapeHtml(p.caption.length > 60 ? p.caption.substring(0, 57) + '...' : p.caption) : '--',
    ], i % 2 === 1);
  });

  // --- ADOPTED sections ---
  let helpRequestRowsHtml = '';
  data.helpRequests.forEach((h, i) => {
    const truncatedMsg = h.message.length > 60 ? h.message.substring(0, 57) + '...' : h.message;
    helpRequestRowsHtml += renderRow([
      `<strong>${escapeHtml(h.adopterName)}</strong>`,
      h.animalName ? escapeHtml(h.animalName) : '--',
      escapeHtml(truncatedMsg),
    ], i % 2 === 1);
  });

  let overdueObligationRowsHtml = '';
  data.overdueObligations.forEach((o, i) => {
    const typeLabel = o.obligationType === 'spay_neuter' ? 'Spay/Neuter' : o.label;
    const isSpayNeuter = o.obligationType === 'spay_neuter';
    overdueObligationRowsHtml += renderRow([
      `<strong>${escapeHtml(o.adopterName)}</strong>`,
      escapeHtml(o.animalName),
      isSpayNeuter
        ? `<span style="color: #dc2626; font-weight: 600;">${escapeHtml(typeLabel)}</span>`
        : escapeHtml(typeLabel),
      o.contractualDueDate,
    ], i % 2 === 1);
  });

  // --- Counts ---
  const shelterCount = data.surgeries.length + data.exams.length + data.diagnostics.length +
    data.procedures.length + data.shelterOverdueCare.length + data.calendarItems.length;
  const fosterCount = data.missedFosterMeds.length + data.complianceAlerts.length + data.fosterOverdueCare.length +
    data.recentFosterUpdates.length + data.recentFosterPhotos.length;
  const adoptedCount = data.helpRequests.length + data.overdueObligations.length;
  const totalItems = shelterCount + fosterCount + adoptedCount;

  // --- Summary ---
  const summaryParts: string[] = [];
  if (shelterCount > 0) summaryParts.push(`${shelterCount} shelter`);
  if (fosterCount > 0) summaryParts.push(`${fosterCount} foster`);
  if (adoptedCount > 0) summaryParts.push(`${adoptedCount} adopted`);

  // --- Shelter pillar HTML ---
  const shelterSectionsHtml =
    renderSection('Surgeries Today', '[S]', '#fefce8', '#ca8a04', data.surgeries.length, surgeryRows) +
    renderSection('Medical Exams Today', '[E]', '#ecfdf5', '#059669', data.exams.length, examRows) +
    renderSection('Diagnostics & Labs Today', '[D]', '#eff6ff', '#2563eb', data.diagnostics.length, diagRows) +
    renderSection('Procedures Today', '[P]', '#fdf4ff', '#9333ea', data.procedures.length, procRows) +
    renderSection('Overdue Preventative Care', '[OD]', '#fff7ed', '#ea580c', data.shelterOverdueCare.length, shelterOverdueRows) +
    renderSection('Calendar Events Today', '[C]', '#f5f3ff', '#7c3aed', data.calendarItems.length, calendarRowsHtml);

  // --- Foster pillar HTML ---
  const fosterSectionsHtml =
    renderSection('Missed Foster Medications (Yesterday)', '[!]', '#fef2f2', '#dc2626', data.missedFosterMeds.length, missedRows) +
    renderSection('Foster Compliance Alerts', '[!]', '#fef2f2', '#dc2626', data.complianceAlerts.length, complianceRows) +
    renderSection('Overdue Preventative Care (Foster)', '[OD]', '#fff7ed', '#ea580c', data.fosterOverdueCare.length, fosterOverdueRows) +
    renderSection('Foster Updates (Yesterday)', '[U]', '#eff6ff', '#2563eb', data.recentFosterUpdates.length, fosterUpdateRows) +
    renderSection('New Foster Photos (Yesterday)', '[P]', '#f0fdf4', '#16a34a', data.recentFosterPhotos.length, fosterPhotoRowsHtml);

  // --- Adopted pillar HTML ---
  const adoptedSectionsHtml =
    renderSection('Pending Help Requests', '[?]', '#fef2f2', '#dc2626', data.helpRequests.length, helpRequestRowsHtml) +
    renderSection('Overdue Compliance Obligations', '[!]', '#fff7ed', '#ea580c', data.overdueObligations.length, overdueObligationRowsHtml);

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
              : `Today's overview: ${summaryParts.join(', ')} item${totalItems !== 1 ? 's' : ''} requiring attention.`
            }
          </p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background-color: #ffffff; padding: 24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${renderPillarHeader('SHELTER', '#e0f2fe', '#0c4a6e', shelterCount)}
            ${shelterSectionsHtml}
            ${renderPillarHeader('FOSTER', '#fce7f3', '#831843', fosterCount)}
            ${fosterSectionsHtml}
            ${renderPillarHeader('ADOPTED', '#fef3c7', '#78350f', adoptedCount)}
            ${adoptedSectionsHtml}
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

  const shelterCount = data.surgeries.length + data.exams.length + data.diagnostics.length +
    data.procedures.length + data.shelterOverdueCare.length + data.calendarItems.length;
  const fosterCount = data.missedFosterMeds.length + data.complianceAlerts.length + data.fosterOverdueCare.length +
    data.recentFosterUpdates.length + data.recentFosterPhotos.length;
  const adoptedCount = data.helpRequests.length + data.overdueObligations.length;

  if (shelterCount > 0) {
    lines.push(`==============================`);
    lines.push(`  SHELTER (${shelterCount} items)`);
    lines.push(`==============================`);
    lines.push('');

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

    if (data.shelterOverdueCare.length > 0) {
      lines.push(`--- OVERDUE PREVENTATIVE CARE [${data.shelterOverdueCare.length}] ---`);
      data.shelterOverdueCare.forEach(o => {
        lines.push(`  ${o.animalName} - ${o.careName} (due: ${o.nextDueDate})`);
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
  }

  if (fosterCount > 0) {
    lines.push(`==============================`);
    lines.push(`  FOSTER (${fosterCount} items)`);
    lines.push(`==============================`);
    lines.push('');

    if (data.missedFosterMeds.length > 0) {
      lines.push(`--- MISSED FOSTER MEDICATIONS (Yesterday) [${data.missedFosterMeds.length}] ---`);
      data.missedFosterMeds.forEach(m => {
        lines.push(`  ${m.animalName} - ${m.drugName} (Foster: ${m.fosterName})${m.scheduledTime ? ` at ${m.scheduledTime}` : ''}`);
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

    if (data.fosterOverdueCare.length > 0) {
      lines.push(`--- OVERDUE PREVENTATIVE CARE (Foster) [${data.fosterOverdueCare.length}] ---`);
      data.fosterOverdueCare.forEach(o => {
        lines.push(`  ${o.animalName} - ${o.careName} (due: ${o.nextDueDate})`);
      });
      lines.push('');
    }

    if (data.recentFosterUpdates.length > 0) {
      lines.push(`--- FOSTER UPDATES (Yesterday) [${data.recentFosterUpdates.length}] ---`);
      const updateLabels: Record<string, string> = {
        medical_concern: 'Medical Concern',
        behavioral_note: 'Behavioral Note',
        general_update: 'General Update',
        photo_update: 'Photo Update',
      };
      data.recentFosterUpdates.forEach(u => {
        const typeLabel = updateLabels[u.updateType] || u.updateType;
        const truncDesc = u.description.length > 60 ? u.description.substring(0, 57) + '...' : u.description;
        const urgentFlag = (u.priority === 'urgent' || u.priority === 'high' || u.updateType === 'medical_concern') ? ' [!]' : '';
        lines.push(`  ${u.animalName} - ${typeLabel}${urgentFlag} (Foster: ${u.fosterName})`);
        lines.push(`    "${truncDesc}"`);
      });
      lines.push('');
    }

    if (data.recentFosterPhotos.length > 0) {
      lines.push(`--- NEW FOSTER PHOTOS (Yesterday) [${data.recentFosterPhotos.length}] ---`);
      data.recentFosterPhotos.forEach(p => {
        const captionStr = p.caption ? ` - "${p.caption.length > 40 ? p.caption.substring(0, 37) + '...' : p.caption}"` : '';
        lines.push(`  ${p.animalName} (Foster: ${p.fosterName})${captionStr}`);
      });
      lines.push('');
    }
  }

  if (adoptedCount > 0) {
    lines.push(`==============================`);
    lines.push(`  ADOPTED (${adoptedCount} items)`);
    lines.push(`==============================`);
    lines.push('');

    if (data.helpRequests.length > 0) {
      lines.push(`--- PENDING HELP REQUESTS [${data.helpRequests.length}] ---`);
      data.helpRequests.forEach(h => {
        const truncatedMsg = h.message.length > 60 ? h.message.substring(0, 57) + '...' : h.message;
        lines.push(`  ${h.adopterName}${h.animalName ? ` (${h.animalName})` : ''} - "${truncatedMsg}"`);
      });
      lines.push('');
    }

    if (data.overdueObligations.length > 0) {
      lines.push(`--- OVERDUE COMPLIANCE OBLIGATIONS [${data.overdueObligations.length}] ---`);
      data.overdueObligations.forEach(o => {
        const typeLabel = o.obligationType === 'spay_neuter' ? 'SPAY/NEUTER' : o.label;
        lines.push(`  ${o.adopterName} - ${o.animalName} - ${typeLabel} (due: ${o.contractualDueDate})`);
      });
      lines.push('');
    }
  }

  const totalItems = shelterCount + fosterCount + adoptedCount;

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

    const [tenantSettings] = await db
      .select({ briefingRecipientRoles: tenants.briefingRecipientRoles })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const recipientRoles = tenantSettings?.briefingRecipientRoles?.length
      ? tenantSettings.briefingRecipientRoles
      : ['admin'];

    const staffUsers = await db
      .select({ email: users.email, fullName: users.fullName, roles: users.roles })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        sql`(${users.roles} && ${sql.raw(`ARRAY[${recipientRoles.map(r => `'${r}'`).join(',')}]::text[]`)})`
      ));

    const uniqueEmails = [...new Set(staffUsers.filter(u => u.email).map(u => u.email))];
    const recipients = uniqueEmails;

    if (recipients.length === 0) {
      return { sent: 0, errors: [] };
    }

    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      return { sent: 0, errors: ['Email service not available for tenant'] };
    }

    const html = composeHtmlEmail(data);
    const text = composePlainTextEmail(data);

    const shelterCount = data.surgeries.length + data.exams.length + data.diagnostics.length +
      data.procedures.length + data.shelterOverdueCare.length + data.calendarItems.length;
    const fosterCount = data.missedFosterMeds.length + data.complianceAlerts.length + data.fosterOverdueCare.length +
      data.recentFosterUpdates.length + data.recentFosterPhotos.length;
    const adoptedCount = data.helpRequests.length + data.overdueObligations.length;
    const totalItems = shelterCount + fosterCount + adoptedCount;

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
