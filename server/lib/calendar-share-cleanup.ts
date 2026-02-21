import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq } from "drizzle-orm";
import { objectStorageClient, parseObjectPath } from "../objectStorage";

const RETENTION_DAYS = 14;

export async function runCalendarShareCleanup(): Promise<{
  tenantsProcessed: number;
  totalFilesDeleted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let tenantsProcessed = 0;
  let totalFilesDeleted = 0;

  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateObjectDir) {
    errors.push("PRIVATE_OBJECT_DIR not set, skipping cleanup");
    return { tenantsProcessed, totalFilesDeleted, errors };
  }

  try {
    const activeTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    for (const tenant of activeTenants) {
      try {
        const folderPrefix = `${privateObjectDir}/${tenant.id}/calendar-shares/`;
        const { bucketName, objectName } = parseObjectPath(folderPrefix);
        const bucket = objectStorageClient.bucket(bucketName);
        const [files] = await bucket.getFiles({ prefix: objectName });

        let tenantDeleted = 0;
        for (const file of files) {
          let updatedAt: Date | null = null;

          if (file.metadata.updated) {
            updatedAt = new Date(file.metadata.updated);
          } else {
            const [metadata] = await file.getMetadata();
            if (metadata.updated) {
              updatedAt = new Date(metadata.updated);
            }
          }

          if (updatedAt && updatedAt < cutoffDate) {
            await file.delete();
            tenantDeleted++;
          }
        }

        totalFilesDeleted += tenantDeleted;
        tenantsProcessed++;
      } catch (tenantError) {
        const msg = tenantError instanceof Error ? tenantError.message : "Unknown error";
        if (!msg.includes("No such object") && !msg.includes("Not Found")) {
          errors.push(`Tenant ${tenant.name}: ${msg}`);
        }
        tenantsProcessed++;
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Global error: ${msg}`);
  }

  return { tenantsProcessed, totalFilesDeleted, errors };
}
