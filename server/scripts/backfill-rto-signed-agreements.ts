import { db } from "../db";
import { sql, and, eq, ilike, isNull } from "drizzle-orm";
import { animals, contacts, tenants, medicalFiles, documents } from "@shared/schema";
import { ObjectStorageService } from "../objectStorage";
import { generateReclaimAgreementPdfBuffer } from "../services/reclaim-agreement-pdf";

const MARKER_KEY = "backfill:rto_signed_agreements_v1";

function hasAnyRows(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const obj = result as { rows?: unknown[]; rowCount?: number | null };
  if (Array.isArray(obj.rows) && obj.rows.length > 0) return true;
  if (typeof obj.rowCount === "number" && obj.rowCount > 0) return true;
  return false;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * One-time backfill: for every animal in `returned_to_owner` status that has a
 * "RTO - Owner Signature on Waiver" medical file but no "RTO - Signed Reclaim
 * Agreement" yet, regenerate the full signed waiver PDF from the data still on
 * record (animal + reclaimed-by contact + reclaim date/fee + signature image)
 * and save it as both a medical_files row and a tenant documents row, with a
 * "(backfilled)" suffix so it's clear it wasn't captured at signing time.
 *
 * Idempotent: skips any animal that already has a "RTO - Signed Reclaim
 * Agreement" medical file. Guarded by a platform_settings marker so it only
 * runs once per DB after success.
 */
export async function backfillRtoSignedAgreements(): Promise<void> {
  try {
    const existing = await db.execute(sql`
      SELECT 1 FROM platform_settings WHERE key = ${MARKER_KEY} LIMIT 1
    `);
    if (hasAnyRows(existing)) {
      console.log("[Startup] RTO signed-agreement backfill already applied (marker present); skipping");
      return;
    }
  } catch (err) {
    console.warn("[Startup] Could not read RTO backfill marker, proceeding:", (err as any)?.message);
  }

  const objectStorage = new ObjectStorageService();
  let processed = 0;
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let allTenantsOk = true;

  try {
    const rtoAnimals = await db.select()
      .from(animals)
      .where(eq(animals.status, "returned_to_owner"));

    for (const animal of rtoAnimals) {
      processed += 1;
      try {
        const existingPdf = await db.select({ id: medicalFiles.id })
          .from(medicalFiles)
          .where(and(
            eq(medicalFiles.animalId, animal.id),
            eq(medicalFiles.tenantId, animal.tenantId),
            ilike(medicalFiles.description, "RTO - Signed Reclaim Agreement%"),
          ))
          .limit(1);
        if (existingPdf.length > 0) {
          skipped += 1;
          continue;
        }

        const sigRows = await db.select()
          .from(medicalFiles)
          .where(and(
            eq(medicalFiles.animalId, animal.id),
            eq(medicalFiles.tenantId, animal.tenantId),
            ilike(medicalFiles.description, "RTO - Owner Signature%"),
          ))
          .limit(1);
        if (sigRows.length === 0) {
          skipped += 1;
          continue;
        }
        const signatureRow = sigRows[0];

        let signatureDataUrl: string;
        if (signatureRow.fileUrl?.startsWith("data:image/")) {
          signatureDataUrl = signatureRow.fileUrl;
        } else if (signatureRow.fileUrl?.startsWith("/objects/")) {
          try {
            const file = await objectStorage.getObjectEntityFile(signatureRow.fileUrl);
            const buf = await streamToBuffer(file.createReadStream());
            signatureDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
          } catch (sigErr: any) {
            console.warn(`[Startup] RTO backfill: signature unreadable for animal ${animal.id}: ${sigErr?.message || sigErr}`);
            failed += 1;
            allTenantsOk = false;
            continue;
          }
        } else {
          skipped += 1;
          continue;
        }

        let ownerName = "";
        let ownerEmail: string | null = null;
        let ownerPhone: string | null = null;
        let ownerAddress: string | null = null;
        if (animal.reclaimedByContactId) {
          const [c] = await db.select()
            .from(contacts)
            .where(eq(contacts.id, animal.reclaimedByContactId))
            .limit(1);
          if (c) {
            ownerName = c.name || "";
            ownerEmail = c.email && !c.email.endsWith("@placeholder.local") ? c.email : null;
            ownerPhone = c.phone || null;
            ownerAddress = c.address || null;
          }
        }
        if (!ownerName) ownerName = "Owner";

        const [tenant] = await db.select()
          .from(tenants)
          .where(eq(tenants.id, animal.tenantId))
          .limit(1);
        const tenantName = tenant?.name || "the rescue organization";

        const feeStr = animal.reclaimFeePaid?.toString() || "0.00";
        const feeWaived = Number(feeStr) === 0;
        const signedAt = animal.reclaimDate ? new Date(animal.reclaimDate) : (signatureRow.createdAt || new Date());

        const pdfBuffer = await generateReclaimAgreementPdfBuffer({
          tenantName,
          animalName: animal.name,
          animalSpecies: (animal as any).species ?? null,
          animalBreed: (animal as any).breed ?? null,
          ownerName,
          ownerEmail,
          ownerPhone,
          ownerAddress,
          reclaimFeePaid: feeStr,
          feeWaived,
          ownershipVerified: true,
          signatureDataUrl,
          signedAt,
          ipAddress: null,
          staffName: null,
        });

        const pdfFilename = `rto-agreement-backfill-${animal.id}-${Date.now()}.pdf`;
        const uploaded = await objectStorage.uploadTenantFile(
          animal.tenantId,
          "rto-documents",
          pdfBuffer,
          "application/pdf",
          pdfFilename,
        );

        const desc = "RTO - Signed Reclaim Agreement (backfilled)";
        await db.insert(medicalFiles).values({
          animalId: animal.id,
          tenantId: animal.tenantId,
          fileName: desc,
          fileUrl: uploaded.objectPath,
          mimeType: "application/pdf",
          description: desc,
          uploadedBy: signatureRow.uploadedBy,
        });

        const dateLabel = signedAt.toISOString().split("T")[0];
        try {
          await db.insert(documents).values({
            tenantId: animal.tenantId,
            title: `${desc} - ${animal.name} (${dateLabel})`,
            description: `Return to Owner agreement for ${animal.name}, signed ${dateLabel}. Regenerated from existing signature and contact data.`,
            category: "forms" as const,
            fileUrl: uploaded.objectPath,
            fileSize: pdfBuffer.length,
            fileName: desc,
            uploadedBy: signatureRow.uploadedBy,
            storageType: "replit_object_storage" as const,
          });
        } catch (docErr: any) {
          console.warn(`[Startup] RTO backfill: tenant document insert failed for animal ${animal.id}: ${docErr?.message || docErr}`);
        }

        generated += 1;
      } catch (perAnimalErr: any) {
        failed += 1;
        allTenantsOk = false;
        console.warn(`[Startup] RTO backfill: failed for animal ${animal.id}: ${perAnimalErr?.message || perAnimalErr}`);
      }
    }

    console.log(`[Startup] RTO signed-agreement backfill complete (processed=${processed}, generated=${generated}, skipped=${skipped}, failed=${failed})`);

    if (allTenantsOk) {
      try {
        await db.execute(sql`
          INSERT INTO platform_settings (key, value, description, category, is_public)
          VALUES (
            ${MARKER_KEY},
            ${sql.raw(`'${JSON.stringify({ appliedAt: new Date().toISOString(), processed, generated, skipped, failed }).replace(/'/g, "''")}'::jsonb`)},
            'Marker: one-time backfill that regenerates signed Reclaim Agreement PDFs for historical RTOs',
            'general',
            false
          )
          ON CONFLICT (key) DO NOTHING
        `);
      } catch (markerErr: any) {
        console.warn("[Startup] Could not write RTO backfill marker (will re-run next boot, still idempotent):", markerErr?.message);
      }
    } else {
      console.warn("[Startup] RTO backfill had failures; not writing marker so it will retry next boot");
    }
  } catch (err: any) {
    console.error("[Startup] RTO signed-agreement backfill failed:", err?.message || err);
  }
}
