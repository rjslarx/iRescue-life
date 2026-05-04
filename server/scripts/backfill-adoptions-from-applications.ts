import { db } from "../db";
import { sql } from "drizzle-orm";

const MARKER_KEY = "backfill:adoptions_from_adopted_applications_v1";

function hasAnyRows(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const obj = result as { rows?: unknown[]; rowCount?: number | null };
  if (Array.isArray(obj.rows) && obj.rows.length > 0) return true;
  if (typeof obj.rowCount === "number" && obj.rowCount > 0) return true;
  return false;
}

/**
 * Task #164: One-time backfill that creates `adoptions` rows for animals
 * whose status is already `adopted` but never got a row inserted (because
 * they were transitioned via the Kanban "drag to Adopted" path or via
 * direct PATCH /api/animals/:id, neither of which used to insert into
 * `adoptions`). Without this row the heartworm/parasite-prevention
 * compliance warning engine (which inner-joins on `adoptions` for adopter
 * contact info) silently skips the animal.
 *
 * Strategy per tenant: for every animals row with status='adopted' and no
 * matching adoptions row, find the most-recently-updated applications row
 * for that animal whose stage IN ('adopted','approved','trial') and copy
 * applicant_name/email/phone (+ application_id) into a new adoptions row.
 * Idempotent: gated by a platform_settings marker AND by a NOT EXISTS
 * subquery so re-runs (or partial failures) won't double-insert.
 */
export async function backfillAdoptionsFromApplications(): Promise<void> {
  try {
    const existing = await db.execute(sql`
      SELECT 1 FROM platform_settings WHERE key = ${MARKER_KEY} LIMIT 1
    `);
    if (hasAnyRows(existing)) {
      console.log(
        "[Startup] Adoptions-from-applications backfill already applied (marker present); skipping",
      );
      return;
    }
  } catch (err) {
    console.warn(
      "[Startup] Could not read adoptions-backfill marker, proceeding:",
      (err as { message?: string })?.message ?? String(err),
    );
  }

  let totalInserted = 0;
  let totalOrphans = 0;

  try {
    // Per-tenant insert. We use DISTINCT ON to keep just the most-recently-
    // updated application per animal. Filter to (adopted | approved | trial)
    // so we still capture animals that flipped to adopted via Path C while
    // their application stage lagged behind.
    const insertRes = await db.execute(sql`
      WITH candidates AS (
        SELECT DISTINCT ON (a.id)
          a.tenant_id,
          a.id           AS animal_id,
          app.id         AS application_id,
          app.applicant_name,
          app.applicant_email,
          app.applicant_phone,
          COALESCE(a.adoption_date, NOW()) AS adoption_date
        FROM animals a
        JOIN applications app
          ON app.animal_id = a.id
         AND app.tenant_id = a.tenant_id
         AND app.stage IN ('adopted','approved','trial')
        WHERE a.status = 'adopted'
          AND NOT EXISTS (
            SELECT 1 FROM adoptions ad
            WHERE ad.animal_id = a.id
              AND ad.tenant_id = a.tenant_id
          )
        ORDER BY a.id, app.updated_at DESC
      )
      INSERT INTO adoptions (
        tenant_id, animal_id, application_id,
        adopter_name, adopter_email, adopter_phone, adoption_date
      )
      SELECT
        tenant_id, animal_id, application_id,
        applicant_name, applicant_email, applicant_phone, adoption_date
      FROM candidates
      RETURNING tenant_id
    `);
    const rows = ((insertRes as { rows?: Array<{ tenant_id: string }> }).rows) ?? [];
    totalInserted = rows.length;

    const perTenant = new Map<string, number>();
    for (const r of rows) {
      perTenant.set(r.tenant_id, (perTenant.get(r.tenant_id) ?? 0) + 1);
    }
    for (const [tenantId, count] of perTenant.entries()) {
      console.log(
        `[Startup] Adoptions backfill (tenant=${tenantId}): inserted ${count} adoptions row(s)`,
      );
    }

    // Detect remaining orphans (adopted animals with no application at all)
    // so staff can resolve them manually via the "Record Adoption" form.
    try {
      const orphanRes = await db.execute(sql`
        SELECT a.tenant_id::text AS tenant_id,
               a.id::text         AS animal_id,
               a.name             AS animal_name
        FROM animals a
        WHERE a.status = 'adopted'
          AND NOT EXISTS (
            SELECT 1 FROM adoptions ad
            WHERE ad.animal_id = a.id
              AND ad.tenant_id = a.tenant_id
          )
      `);
      const orphanRows =
        ((orphanRes as { rows?: Array<{ tenant_id: string; animal_id: string; animal_name: string | null }> }).rows) ?? [];
      totalOrphans = orphanRows.length;
      if (totalOrphans > 0) {
        const sample = orphanRows
          .slice(0, 10)
          .map((o) => `${o.animal_name ?? "?"} (${o.animal_id} / tenant ${o.tenant_id})`)
          .join("; ");
        console.warn(
          `[Startup] Adoptions backfill: ${totalOrphans} adopted animal(s) have no linked application — staff must add adopter info manually. Sample: ${sample}${totalOrphans > 10 ? " (…)" : ""}`,
        );
      }
    } catch (orphanErr) {
      console.warn(
        "[Startup] Could not enumerate orphan adopted animals:",
        (orphanErr as { message?: string })?.message ?? String(orphanErr),
      );
    }

    console.log(
      `[Startup] Adoptions-from-applications backfill TOTAL: inserted=${totalInserted}, orphansRemaining=${totalOrphans}`,
    );

    try {
      const payload = JSON.stringify({
        appliedAt: new Date().toISOString(),
        totalInserted,
        totalOrphans,
      }).replace(/'/g, "''");
      await db.execute(sql`
        INSERT INTO platform_settings (key, value, description, category, is_public)
        VALUES (
          ${MARKER_KEY},
          ${sql.raw(`'${payload}'::jsonb`)},
          'Marker: one-time backfill of adoptions rows from adopted/approved/trial applications (Task #164)',
          'general',
          false
        )
        ON CONFLICT (key) DO NOTHING
      `);
    } catch (markerErr) {
      console.warn(
        "[Startup] Could not write adoptions-backfill marker (will re-run next boot, still idempotent):",
        (markerErr as { message?: string })?.message ?? String(markerErr),
      );
    }
  } catch (err) {
    console.error(
      "[Startup] Adoptions-from-applications backfill failed:",
      err,
    );
  }
}
