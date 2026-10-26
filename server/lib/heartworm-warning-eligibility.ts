export interface HeartwormRecord {
  id: string;
  animalId: string;
  status: string;
  dateAdministered: Date;
  nextDueDate: Date | null;
  coversHeartworm: boolean | null;
}

/**
 * Heartworm notices are coverage-specific, not product-specific. A newer
 * administered HW dose replaces earlier HW products, including combination
 * products. Do not erase their dates: flea/tick reminders may still need them.
 * A scheduled/pending or future administration is not evidence of protection.
 */
export function currentHeartwormRecordIds(
  records: HeartwormRecord[],
  today: Date,
): Set<string> {
  const latest = new Map<string, number>();
  const eligible = records.filter(r =>
    r.coversHeartworm === true &&
    r.status === "given" &&
    Number.isFinite(r.dateAdministered.getTime()) &&
    r.dateAdministered.getTime() <= today.getTime()
  );
  for (const r of eligible) {
    latest.set(r.animalId, Math.max(latest.get(r.animalId) ?? -Infinity, r.dateAdministered.getTime()));
  }
  return new Set(eligible.filter(r => r.dateAdministered.getTime() === latest.get(r.animalId)).map(r => r.id));
}

export function protectedHeartwormAnimalIds(records: HeartwormRecord[], now: Date, dayStart: Date): Set<string> {
  const currentIds = currentHeartwormRecordIds(records, now);
  return new Set(records.filter(r =>
    currentIds.has(r.id) && r.nextDueDate && r.nextDueDate.getTime() >= dayStart.getTime()
  ).map(r => r.animalId));
}
