import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { preventativeCareRecords as care, preventativeCareTypes as types } from "@shared/schema";
import { getLatestVaccineExpiriesForAnimals } from "./portal-rabies-coverage";
import { preventionExpiries } from "../lib/prevention-renewal-coverage";

export async function getDashboardComplianceCoverage(tenantId: string, animalIds: string[], now = new Date()) {
  const ids = [...new Set(animalIds)];
  if (!ids.length) return new Map<string, Map<string, Date>>();
  const [vaccines, records] = await Promise.all([
    getLatestVaccineExpiriesForAnimals(tenantId, ids, now),
    db.select({
      animalId: care.animalId, dateAdministered: care.dateAdministered,
      nextDueDate: care.nextDueDate, status: care.status, administeredBy: care.administeredBy,
      coversHeartworm: types.coversHeartworm, coversFleaTick: types.coversFleaTick,
    }).from(care).innerJoin(types, and(eq(care.careTypeId, types.id), or(eq(types.tenantId, tenantId), isNull(types.tenantId))))
      .where(and(eq(care.tenantId, tenantId), inArray(care.animalId, ids), eq(care.careCategory, "parasite_prevention"))),
  ]);
  for (const [animal, expiries] of preventionExpiries(records, now)) {
    const merged = vaccines.get(animal) || new Map<string, Date>();
    for (const [key, date] of expiries) merged.set(key, date);
    vaccines.set(animal, merged);
  }
  return vaccines;
}
