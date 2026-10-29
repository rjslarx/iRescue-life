import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { preventativeCareRecords, vaccineRecords } from "@shared/schema";
import { latestRabiesExpiry } from "../lib/current-rabies-coverage";
import { latestVaccineExpiries } from "../lib/vaccine-renewal-coverage";

export async function getPortalRabiesExpiry(tenantId: string, animalId: string): Promise<Date | null> {
  const now = new Date();
  const expiry = await getLatestRabiesExpiry(tenantId, animalId, now);
  return expiry && expiry > now ? expiry : null;
}

// Shared by outbound reminders. Unlike the portal's current-coverage filter,
// retain expired evidence to avoid resurrecting obsolete contractual deadlines.
export async function getLatestRabiesExpiry(tenantId: string, animalId: string, now = new Date()): Promise<Date | null> {
  return latestRabiesExpiry(await getVaccineEvidence(tenantId, animalId), now);
}

export async function getLatestVaccineExpiries(tenantId: string, animalId: string, now = new Date()): Promise<Map<string, Date>> {
  return latestVaccineExpiries(await getVaccineEvidence(tenantId, animalId), now);
}

async function getVaccineEvidence(tenantId: string, animalId: string) {
  return getVaccineEvidenceForAnimals(tenantId, [animalId]);
}

/** Batch evidence lookup for staff dashboards; both sources stay tenant-scoped. */
export async function getLatestVaccineExpiriesForAnimals(tenantId: string, animalIds: string[], now = new Date()) {
  const rows = await getVaccineEvidenceForAnimals(tenantId, [...new Set(animalIds)]);
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = grouped.get(row.animalId) || [];
    group.push(row);
    grouped.set(row.animalId, group);
  }
  return new Map([...grouped].map(([animalId, evidence]) => [animalId, latestVaccineExpiries(evidence, now)]));
}

async function getVaccineEvidenceForAnimals(tenantId: string, animalIds: string[]) {
  if (!animalIds.length) return [];
  const [vaccines, care] = await Promise.all([
    db.select({
      animalId: vaccineRecords.animalId,
      name: vaccineRecords.itemName,
      administeredAt: vaccineRecords.dateGiven,
      expiresAt: vaccineRecords.dateDue,
    }).from(vaccineRecords).where(and(eq(vaccineRecords.tenantId, tenantId), inArray(vaccineRecords.animalId, animalIds))),
    db.select({
      animalId: preventativeCareRecords.animalId,
      name: preventativeCareRecords.careName,
      administeredAt: preventativeCareRecords.dateAdministered,
      expiresAt: preventativeCareRecords.nextDueDate,
      administeredBy: preventativeCareRecords.administeredBy,
      status: preventativeCareRecords.status,
    }).from(preventativeCareRecords).where(and(eq(preventativeCareRecords.tenantId, tenantId), inArray(preventativeCareRecords.animalId, animalIds), eq(preventativeCareRecords.careCategory, "vaccine"))),
  ]);
  return [...vaccines, ...care];
}
