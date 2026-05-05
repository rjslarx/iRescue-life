export interface DueCareItem {
  id: string;
  careName: string;
  careCategory: string;
  nextDueDate: string;
  dateAdministered: string;
  isOverdue: boolean;
}

export interface ComplianceConfirmation {
  id: string;
  careName: string;
  careCategory: string;
  dateAdministered: string;
  clinicName?: string;
  status: string;
  createdAt: string;
}

export interface ComplianceObligation {
  id: string;
  obligationType: string;
  label: string;
  contractualDueDate: string | null;
  status: string;
  proofDocumentUrl: string | null;
  notes?: string | null;
  completedAt?: string | null;
}

export interface HeartwormAppointment {
  type: 'start_doxy' | 'first_injection' | 'second_third_injection' | 'recheck' | 'proheart';
  label: string;
  scheduledDate: string;
  completedDate?: string | null;
  notes?: string | null;
  adopterNotes?: string | null;
  receiptObjectPath?: string | null;
  completedByAdopter?: boolean;
}

export interface HeartwormTreatmentPlan {
  id: string;
  appointments: HeartwormAppointment[];
  locationName: string;
  locationAddress: string;
  locationPhone: string;
  notes?: string | null;
  contractSentAt: string | null;
  adopterName: string;
  createdAt: string;
}

export const COMPLIANCE_OBLIGATION_LABEL_MAP: Record<string, string> = {
  spay_neuter: 'Spay/Neuter Certificate',
  rabies: 'Rabies Vaccination',
  rabies_booster: 'Rabies Booster',
  dhpp_booster: 'DHPP Booster',
  vet_checkup: 'Vet Check-Up',
  microchip_registration: 'Microchip Registration',
  heartworm_test: 'Heartworm Test',
  heartworm_prevention_proof: 'Heartworm Prevention Proof',
  flea_tick_prevention: 'Flea & Tick Prevention',
  fecal_test: 'Fecal Test',
  obedience_training: 'Obedience Training',
  ongoing_treatment: 'Ongoing Treatment',
  custom: 'Requirement',
};

export const HW_INJECTION_REST_DAYS = 30;

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Parse pure YYYY-MM-DD strings as LOCAL midnight (not UTC) so day-boundary
  // comparisons against startOfToday() are timezone-safe.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function obligationDisplayLabel(obl: ComplianceObligation): string {
  if (obl.label) return obl.label;
  if (COMPLIANCE_OBLIGATION_LABEL_MAP[obl.obligationType]) {
    return COMPLIANCE_OBLIGATION_LABEL_MAP[obl.obligationType];
  }
  return (obl.obligationType || 'Requirement')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function obligationDaysOverdue(obl: ComplianceObligation): {
  daysOverdue: number;
  isOverdue: boolean;
  isDueSoon: boolean;
  dueDate: Date | null;
} {
  // contractual_due_date is a PG `date` column and arrives as a
  // "YYYY-MM-DD" string. Parsing it with `new Date(s)` interprets it as
  // UTC midnight which then shifts to the previous calendar day for any
  // timezone west of UTC, producing off-by-one overdue counts. Reuse the
  // timezone-safe parseISODate helper.
  const dueDate =
    typeof obl.contractualDueDate === 'string'
      ? parseISODate(obl.contractualDueDate)
      : obl.contractualDueDate
        ? new Date(obl.contractualDueDate)
        : null;
  if (!dueDate) {
    return { daysOverdue: 0, isOverdue: false, isDueSoon: false, dueDate: null };
  }
  const todayMidnight = startOfToday();
  const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const daysOverdue = Math.floor(
    (todayMidnight.getTime() - dueMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = daysOverdue > 0;
  const isDueSoon = !isOverdue && daysOverdue >= -7;
  return { daysOverdue, isOverdue, isDueSoon, dueDate };
}

export type HwApptStatus = 'completed' | 'overdue' | 'today' | 'upcoming';

export function getHwApptStatus(appt: HeartwormAppointment): HwApptStatus {
  if (appt.completedDate) return 'completed';
  const today = startOfToday();
  const scheduled = parseISODate(appt.scheduledDate);
  if (!scheduled) return 'upcoming';
  if (scheduled.getTime() === today.getTime()) return 'today';
  if (scheduled.getTime() < today.getTime()) return 'overdue';
  return 'upcoming';
}

export function getExerciseRestriction(appointments: HeartwormAppointment[]): {
  active: boolean;
  endDate: Date | null;
  daysRemaining: number;
  startedFromLabel: string | null;
} {
  const today = startOfToday();
  let latestEnd: Date | null = null;
  let label: string | null = null;
  for (const appt of appointments) {
    if (appt.type !== 'first_injection' && appt.type !== 'second_third_injection') continue;
    // Only confirmed-completed injections trigger an active rest window. A
    // missed/scheduled-but-not-given injection MUST NOT activate strict rest.
    if (!appt.completedDate) continue;
    const start = parseISODate(appt.completedDate);
    if (!start) continue;
    const end = addDays(start, HW_INJECTION_REST_DAYS);
    if (start.getTime() <= today.getTime() && today.getTime() <= end.getTime()) {
      if (!latestEnd || end.getTime() > latestEnd.getTime()) {
        latestEnd = end;
        label = appt.label;
      }
    }
  }
  // Days remaining is inclusive of today: if end == today there is 1 more day of rest.
  const daysRemaining = latestEnd
    ? Math.max(0, Math.round((latestEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 0;
  return { active: !!latestEnd, endDate: latestEnd, daysRemaining, startedFromLabel: label };
}
