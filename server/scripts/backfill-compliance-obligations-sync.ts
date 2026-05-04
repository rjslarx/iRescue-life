import { db } from "../db";
import { sql } from "drizzle-orm";
import { runComplianceObligationBackfill } from "../services/compliance-obligation-matcher";

const MARKER_KEY = "backfill:compliance_obligations_sync_v1";

function hasAnyRows(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const obj = result as { rows?: unknown[]; rowCount?: number | null };
  if (Array.isArray(obj.rows) && obj.rows.length > 0) return true;
  if (typeof obj.rowCount === "number" && obj.rowCount > 0) return true;
  return false;
}

/**
 * One-time sync: walk every pending/overdue compliance_obligations
 * row and close any that are already satisfied by existing PCR/vaccine/exam/
 * animal-field state. The runtime hooks in PATCH /api/animals/:id, vaccine
 * create, PCR create, exam create, and confirmation approve handle going
 * forward — this backfill resolves the historical backlog (e.g. obligations
 * that were created at adoption time but were already covered by a record
 * the staff had logged before adoption finalized).
 *
 * Idempotent and gated by a platform_settings marker so it only does
 * meaningful work once per database.
 */
export async function backfillComplianceObligationsSync(): Promise<void> {
  try {
    const existing = await db.execute(sql`
      SELECT 1 FROM platform_settings WHERE key = ${MARKER_KEY} LIMIT 1
    `);
    if (hasAnyRows(existing)) {
      console.log(
        "[Startup] Compliance-obligation sync backfill already applied (marker present); skipping",
      );
      return;
    }
  } catch (err) {
    console.warn(
      "[Startup] Could not read compliance-obligation sync marker, proceeding:",
      (err as { message?: string })?.message ?? String(err),
    );
  }

  let scanned = 0;
  let completed = 0;
  let perTenant: Record<string, number> = {};

  try {
    const result = await runComplianceObligationBackfill();
    scanned = result.scanned;
    completed = result.completed;
    perTenant = result.perTenant;

    for (const [tenantId, count] of Object.entries(perTenant)) {
      console.log(
        `[Startup] Compliance-obligation sync (tenant=${tenantId}): closed ${count} obligation(s)`,
      );
    }
    console.log(
      `[Startup] Compliance-obligation sync TOTAL: scanned ${scanned} animal(s) with pending obligations, closed ${completed}`,
    );

    try {
      const payload = JSON.stringify({
        appliedAt: new Date().toISOString(),
        scanned,
        completed,
        perTenant,
      }).replace(/'/g, "''");
      await db.execute(sql`
        INSERT INTO platform_settings (key, value, description, category, is_public)
        VALUES (
          ${MARKER_KEY},
          ${sql.raw(`'${payload}'::jsonb`)},
          'Marker: one-time sync of compliance_obligations against existing medical state',
          'general',
          false
        )
        ON CONFLICT (key) DO NOTHING
      `);
    } catch (markerErr) {
      console.warn(
        "[Startup] Could not write compliance-obligation sync marker (will re-run next boot, still idempotent):",
        (markerErr as { message?: string })?.message ?? String(markerErr),
      );
    }
  } catch (err) {
    console.error(
      "[Startup] Compliance-obligation sync backfill failed:",
      err,
    );
  }
}
