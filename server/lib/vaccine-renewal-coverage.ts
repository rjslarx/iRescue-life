export type VaccineEvidence = {
  name: string;
  administeredAt: Date | string | null;
  expiresAt: Date | string | null;
  administeredBy?: string | null;
  status?: string | null;
};

/** Conservative matching: single-antigen doses must not clear combination vaccines. */
export function reminderVaccineFamily(name: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (/rabies/.test(n)) return "rabies";
  if (/\b(dhpp|dapp|da2pp|da2p)\b/.test(n)) return "dhpp";
  if (/\b(fvrcp|hcp)\b/.test(n)) return "fvrcp";
  if (/felv|feline leukemia/.test(n)) return "felv";
  if (/bordetella|bordatella|kennel cough/.test(n)) return "bordetella";
  if (/leptospirosis|\blepto\b/.test(n)) return "lepto";
  if (/lyme/.test(n)) return "lyme";
  if (/canine influenza|\bciv\b/.test(n)) return "influenza";
  return `other:${n}`;
}

export function latestVaccineExpiries(records: VaccineEvidence[], now = new Date()): Map<string, Date> {
  const latest = new Map<string, { given: number; expires: number }>();
  for (const record of records) {
    if (!record.name.trim() || record.status === "pending" ||
      record.administeredBy === "Set at adoption" ||
      record.administeredBy === "Set during backfill import") continue;
    const given = record.administeredAt ? new Date(record.administeredAt).getTime() : NaN;
    const expires = record.expiresAt ? new Date(record.expiresAt).getTime() : NaN;
    if (!Number.isFinite(given) || !Number.isFinite(expires) || given > now.getTime() || expires <= given) continue;
    const family = reminderVaccineFamily(record.name);
    const previous = latest.get(family);
    if (!previous || given > previous.given || (given === previous.given && expires > previous.expires)) {
      latest.set(family, { given, expires });
    }
  }
  // Keep expired evidence, so the original obsolete deadline never reappears.
  return new Map([...latest].map(([family, record]) => [family, new Date(record.expires)]));
}

export function vaccineReminderDeadline(name: string, due: Date, expiries: Map<string, Date>): Date {
  const expiry = expiries.get(reminderVaccineFamily(name));
  return expiry && due < expiry ? new Date(expiry) : due;
}

export function vaccineReminderCovered(name: string, due: Date | string | null, expiries: Map<string, Date>): boolean {
  if (!due) return false;
  const date = new Date(due);
  return vaccineReminderDeadline(name, date, expiries).getTime() > date.getTime();
}
