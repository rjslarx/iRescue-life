export const medicalDeadlineFields = [
  { key: "rabiesDueDate", label: "Rabies", terms: ["rabies"] },
  { key: "dhppDueDate", label: "DHPP", terms: ["dhpp", "da2pp", "dapp", "distemper"] },
  { key: "bordetellaDueDate", label: "Bordetella", terms: ["bordetella", "kennel cough"] },
  { key: "heartwormDueDate", label: "Heartworm prevention", terms: ["heartworm"] },
  { key: "fleaTickDueDate", label: "Flea/tick prevention", terms: ["flea", "tick"] },
] as const;
export type MedicalDeadlineKey = typeof medicalDeadlineFields[number]["key"];
export type MedicalDeadlines = Partial<Record<MedicalDeadlineKey, string>>;
export type MedicalDateEvidence = {
  name: string; administeredAt: Date | string | null;
  expiresAt: Date | string | null; administeredBy?: string | null;
  status: string;
  category: string;
  coversHeartworm?: boolean | null;
  coversFleaTick?: boolean | null;
};

export function resolveMedicalDeadlines(records: MedicalDateEvidence[], now = new Date()): MedicalDeadlines {
  const result: MedicalDeadlines = {};
  for (const field of medicalDeadlineFields) {
    const valid = records.filter(record => {
      const given = record.administeredAt ? new Date(record.administeredAt).getTime() : NaN;
      const due = record.expiresAt ? new Date(record.expiresAt).getTime() : NaN;
      const matches = field.key === "heartwormDueDate"
        ? record.category === "parasite_prevention" && record.coversHeartworm === true
        : field.key === "fleaTickDueDate"
          ? record.category === "parasite_prevention" && record.coversFleaTick === true
          : record.category === "vaccine" && field.terms.some(term => record.name.toLowerCase().includes(term));
      return record.status === "given" && !/set at adoption/i.test(record.administeredBy || "") && matches &&
        Number.isFinite(given) && Number.isFinite(due) && given <= now.getTime() && due > given;
    }).sort((a, b) => new Date(b.administeredAt!).getTime() - new Date(a.administeredAt!).getTime()
      || new Date(b.expiresAt!).getTime() - new Date(a.expiresAt!).getTime());
    if (valid[0]) result[field.key] = new Date(valid[0].expiresAt!).toISOString().slice(0, 10);
  }
  return result;
}

export function medicalDeadlineWarnings(dates: MedicalDeadlines, evidence: MedicalDeadlines, today: string): string[] {
  const warnings: string[] = [];
  for (const { key, label } of medicalDeadlineFields) {
    const date = dates[key];
    if (!date) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date) {
      throw Object.assign(new Error(`${label} deadline must be a valid calendar date`), { status: 400 });
    }
    if (date < today) warnings.push(`${label}: ${date} is in the past.`);
    if (evidence[key] && date !== evidence[key]) {
      warnings.push(`${label}: deadline ${date} differs from the recorded medical due date ${evidence[key]}.`);
    }
  }
  return warnings;
}

export function validateMedicalDeadlines(dates: MedicalDeadlines, evidence: MedicalDeadlines, today: string, confirmed = false) {
  const warnings = medicalDeadlineWarnings(dates, evidence, today);
  if (warnings.length && !confirmed) {
    throw Object.assign(new Error(`Confirm medical deadlines before continuing. ${warnings.join(" ")}`), { status: 400 });
  }
  return warnings;
}
