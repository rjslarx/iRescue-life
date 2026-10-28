type VaccineEvidence = {
  name: string;
  administeredAt: Date | string | null;
  expiresAt: Date | string | null;
  administeredBy?: string | null;
};

/** Adoption date placeholders are reminders, not evidence of a vaccination. */
export function currentRabiesExpiry(records: VaccineEvidence[], now = new Date()): Date | null {
  const candidates = records.flatMap(record => {
    if (!/rabies/i.test(record.name) || record.administeredBy === "Set at adoption") return [];
    const given = record.administeredAt ? new Date(record.administeredAt).getTime() : NaN;
    const expires = record.expiresAt ? new Date(record.expiresAt).getTime() : NaN;
    if (!Number.isFinite(given) || !Number.isFinite(expires) || given > now.getTime() || expires <= given) return [];
    return [{ given, expires }];
  }).sort((a, b) => b.given - a.given || b.expires - a.expires);
  const latest = candidates[0];
  return latest && latest.expires > now.getTime() ? new Date(latest.expires) : null;
}

export function rabiesReminderCovered(name: string, due: Date | string | null, expiry: Date | null): boolean {
  if (!expiry || !/rabies/i.test(name) || !due) return false;
  // A renewal on/after the expiration remains actionable.
  const time = new Date(due).getTime();
  return Number.isFinite(time) && time < expiry.getTime();
}
