import { db } from "../db";
import { animalAuditLogs } from "@shared/schema";

export interface LogAnimalAuditParams {
  tenantId: string;
  animalId: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  previousLocationType?: string | null;
  newLocationType?: string | null;
  previousLocationName?: string | null;
  newLocationName?: string | null;
  changedBy?: string | null;
  changedByName?: string | null;
  notes?: string | null;
}

export async function logAnimalAudit(params: LogAnimalAuditParams): Promise<void> {
  try {
    const statusChanged = params.previousStatus !== params.newStatus && 
      (params.previousStatus != null || params.newStatus != null);
    const locationChanged = (params.previousLocationType !== params.newLocationType && 
      (params.previousLocationType != null || params.newLocationType != null)) ||
      (params.previousLocationName !== params.newLocationName && 
      (params.previousLocationName != null || params.newLocationName != null));

    if (!statusChanged && !locationChanged) return;

    const changeType = statusChanged && locationChanged ? 'status_and_location' :
      statusChanged ? 'status' : 'location';

    await db.insert(animalAuditLogs).values({
      tenantId: params.tenantId,
      animalId: params.animalId,
      changeType: changeType as "status" | "location" | "status_and_location",
      previousStatus: statusChanged ? params.previousStatus : null,
      newStatus: statusChanged ? params.newStatus : null,
      previousLocationType: locationChanged ? params.previousLocationType : null,
      newLocationType: locationChanged ? params.newLocationType : null,
      previousLocationName: locationChanged ? params.previousLocationName : null,
      newLocationName: locationChanged ? params.newLocationName : null,
      changedBy: params.changedBy || null,
      changedByName: params.changedByName || null,
      notes: params.notes || null,
    });
  } catch (error) {
    console.error("[Animal Audit Logger] Failed to log audit entry:", error);
  }
}
