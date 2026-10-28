import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { preventativeCareRecords, vaccineRecords } from "@shared/schema";
import { latestRabiesExpiry } from "../lib/current-rabies-coverage";

export async function getPortalRabiesExpiry(tenantId: string, animalId: string): Promise<Date | null> {
  const now = new Date();
  const expiry = await getLatestRabiesExpiry(tenantId, animalId, now);
  return expiry && expiry > now ? expiry : null;
}

// Shared by outbound reminders. Unlike the portal's current-coverage filter,
// retain expired evidence to avoid resurrecting obsolete contractual deadlines.
export async function getLatestRabiesExpiry(tenantId: string, animalId: string, now = new Date()): Promise<Date | null> {
  const [vaccines, care] = await Promise.all([
    db.select({
      name: vaccineRecords.itemName,
      administeredAt: vaccineRecords.dateGiven,
      expiresAt: vaccineRecords.dateDue,
    }).from(vaccineRecords).where(and(eq(vaccineRecords.tenantId, tenantId), eq(vaccineRecords.animalId, animalId))),
    db.select({
      name: preventativeCareRecords.careName,
      administeredAt: preventativeCareRecords.dateAdministered,
      expiresAt: preventativeCareRecords.nextDueDate,
      administeredBy: preventativeCareRecords.administeredBy,
    }).from(preventativeCareRecords).where(and(eq(preventativeCareRecords.tenantId, tenantId), eq(preventativeCareRecords.animalId, animalId), eq(preventativeCareRecords.careCategory, "vaccine"))),
  ]);
  return latestRabiesExpiry([...vaccines, ...care], now);
}
