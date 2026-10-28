import { and, eq, or, isNull } from "drizzle-orm";
import { db } from "../db";
import { preventativeCareRecords, preventativeCareTypes, vaccineRecords, tenants } from "@shared/schema";
import { resolveMedicalDeadlines } from "@shared/adoption-medical-dates";

export async function getAdoptionMedicalDates(tenantId: string, animalId: string) {
  const [vaccines, care, [tenant]] = await Promise.all([
    db.select({ name: vaccineRecords.itemName, administeredAt: vaccineRecords.dateGiven,
      expiresAt: vaccineRecords.dateDue, administeredBy: vaccineRecords.administeredBy })
      .from(vaccineRecords).where(and(eq(vaccineRecords.tenantId, tenantId), eq(vaccineRecords.animalId, animalId))),
    db.select({ name: preventativeCareRecords.careName, administeredAt: preventativeCareRecords.dateAdministered,
      expiresAt: preventativeCareRecords.nextDueDate, administeredBy: preventativeCareRecords.administeredBy,
      status: preventativeCareRecords.status, category: preventativeCareRecords.careCategory,
      coversHeartworm: preventativeCareTypes.coversHeartworm, coversFleaTick: preventativeCareTypes.coversFleaTick })
      .from(preventativeCareRecords)
      .leftJoin(preventativeCareTypes, and(
        eq(preventativeCareRecords.careTypeId, preventativeCareTypes.id),
        or(eq(preventativeCareTypes.tenantId, tenantId), isNull(preventativeCareTypes.tenantId)),
      ))
      .where(and(eq(preventativeCareRecords.tenantId, tenantId), eq(preventativeCareRecords.animalId, animalId),
        eq(preventativeCareRecords.status, "given"))),
    db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tenant?.timezone || "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return { dates: resolveMedicalDeadlines([
    ...vaccines.map(record => ({ ...record, category: "vaccine", status: "given" })), ...care,
  ]), today };
}
