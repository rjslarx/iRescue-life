export type PreventionEvidence = {
  animalId: string;
  dateAdministered: Date;
  nextDueDate: Date | null;
  status: string;
  administeredBy: string | null;
  coversHeartworm: boolean | null;
  coversFleaTick: boolean | null;
};

/** Evaluate heartworm and flea/tick separately, including combination products.
 * An unknown expiry on the latest dose is not evidence of ongoing protection.
 */
export function preventionExpiries(rows: PreventionEvidence[], now = new Date()) {
  const latest = new Map<string, Map<string, { given: number; expiry: Date | null }>>();
  for (const row of rows) {
    const given = row.dateAdministered.getTime();
    if (row.status !== "given" || !Number.isFinite(given) || given > now.getTime() ||
      ["Set at adoption", "Set during backfill import"].includes(row.administeredBy || "")) continue;
    for (const [key, covers] of [["prevention:heartworm", row.coversHeartworm], ["prevention:flea_tick", row.coversFleaTick]] as const) {
      if (covers !== true) continue;
      const byKey = latest.get(row.animalId) || new Map();
      const previous = byKey.get(key);
      const expiry = row.nextDueDate && row.nextDueDate.getTime() > given ? row.nextDueDate : null;
      if (!previous || given > previous.given ||
        (given === previous.given && (expiry?.getTime() || 0) > (previous.expiry?.getTime() || 0))) {
        byKey.set(key, { given, expiry });
      }
      latest.set(row.animalId, byKey);
    }
  }
  return new Map([...latest].map(([animal, values]) => [
    animal, new Map([...values].flatMap(([key, value]) => value.expiry ? [[key, value.expiry] as const] : [])),
  ] as const));
}
