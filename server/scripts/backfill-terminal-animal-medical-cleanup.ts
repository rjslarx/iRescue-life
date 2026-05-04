import { db } from "../db";
import { sql } from "drizzle-orm";

const MARKER_KEY = "backfill:terminal_animal_medical_cleanup_v1";

function rowCount(result: unknown): number {
  if (result && typeof result === "object" && "rowCount" in result) {
    const rc = (result as { rowCount?: number | null }).rowCount;
    return typeof rc === "number" ? rc : 0;
  }
  return 0;
}

function hasAnyRows(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const obj = result as { rows?: unknown[]; rowCount?: number | null };
  if (Array.isArray(obj.rows) && obj.rows.length > 0) return true;
  if (typeof obj.rowCount === "number" && obj.rowCount > 0) return true;
  return false;
}

const TERMINAL_STATUSES_SQL = sql`('adopted','deceased','transported','returned_to_owner','returned_to_field')`;

/**
 * One-time cleanup (Task #163): for every animal whose status is already
 * terminal (adopted, deceased, transported, returned_to_owner,
 * returned_to_field), null out lingering pending medical work that was
 * created before the write-time cleanup branches (PATCH /api/animals/:id and
 * /api/animals/:id/deceased) were extended to cancel CPOE doses, end open
 * prescriptions, and clear pending PCR next_due_date. Idempotent and guarded
 * by a platform_settings marker so it only does meaningful work once per DB.
 */
export async function backfillTerminalAnimalMedicalCleanup(): Promise<void> {
  try {
    const existing = await db.execute(sql`
      SELECT 1 FROM platform_settings WHERE key = ${MARKER_KEY} LIMIT 1
    `);
    if (hasAnyRows(existing)) {
      console.log(
        "[Startup] Terminal-animal medical cleanup backfill already applied (marker present); skipping",
      );
      return;
    }
  } catch (err) {
    console.warn(
      "[Startup] Could not read terminal-animal cleanup marker, proceeding:",
      (err as { message?: string })?.message ?? String(err),
    );
  }

  let dosesSkipped = 0;
  let prescriptionsEnded = 0;
  let pcrCleared = 0;
  let medPlansDeactivated = 0;
  let medTasksSkipped = 0;

  try {
    // 1. medical_doses: pending 'due' doses whose prescription belongs to a
    // terminal-status animal in the same tenant → 'skipped' with note.
    const doseRes = await db.execute(sql`
      UPDATE medical_doses md
      SET status = 'skipped',
          notes = COALESCE(md.notes, '') ||
                  CASE WHEN md.notes IS NULL OR md.notes = '' THEN '' ELSE ' | ' END ||
                  'Backfill #163: animal status is ' || a.status
      FROM medical_prescriptions mp
      JOIN animals a ON a.id = mp.animal_id AND a.tenant_id = mp.tenant_id
      WHERE md.prescription_id = mp.id
        AND md.tenant_id = mp.tenant_id
        AND md.status = 'due'
        AND a.status IN ${TERMINAL_STATUSES_SQL}
    `);
    dosesSkipped = rowCount(doseRes);

    // 2. medical_prescriptions: open prescriptions for terminal animals →
    // null next_scheduled_dose, set end_date = NOW() so the daily briefing
    // and dosing scheduler stop generating new doses.
    const prescRes = await db.execute(sql`
      UPDATE medical_prescriptions mp
      SET next_scheduled_dose = NULL,
          end_date = COALESCE(mp.end_date, NOW())
      FROM animals a
      WHERE a.id = mp.animal_id
        AND a.tenant_id = mp.tenant_id
        AND a.status IN ${TERMINAL_STATUSES_SQL}
        AND (mp.end_date IS NULL OR mp.next_scheduled_dose IS NOT NULL)
    `);
    prescriptionsEnded = rowCount(prescRes);

    // 3. preventative_care_records: pending PCRs with a next_due_date for
    // terminal animals → null next_due_date so the briefing's coming-due
    // path drops them.
    const pcrRes = await db.execute(sql`
      UPDATE preventative_care_records pcr
      SET next_due_date = NULL,
          updated_at = NOW()
      FROM animals a
      WHERE a.id = pcr.animal_id
        AND a.tenant_id = pcr.tenant_id
        AND a.status IN ${TERMINAL_STATUSES_SQL}
        AND pcr.status = 'pending'
        AND pcr.next_due_date IS NOT NULL
    `);
    pcrCleared = rowCount(pcrRes);

    // 4. medication_plans (foster CPMT plans): deactivate plans whose animal
    // is terminal — same defense the runtime endpoints already apply.
    const planRes = await db.execute(sql`
      UPDATE medication_plans mp
      SET active = false
      FROM animals a
      WHERE a.id = mp.animal_id
        AND a.tenant_id = mp.tenant_id
        AND a.status IN ${TERMINAL_STATUSES_SQL}
        AND mp.active = true
    `);
    medPlansDeactivated = rowCount(planRes);

    // 5. medication_tasks: pending tasks for terminal animals → 'skipped'.
    const taskRes = await db.execute(sql`
      UPDATE medication_tasks mt
      SET status = 'skipped',
          skip_reason = COALESCE(mt.skip_reason, 'Backfill #163: animal status is ' || a.status)
      FROM animals a
      WHERE a.id = mt.animal_id
        AND a.tenant_id = mt.tenant_id
        AND a.status IN ${TERMINAL_STATUSES_SQL}
        AND mt.status = 'pending'
    `);
    medTasksSkipped = rowCount(taskRes);

    console.log(
      `[Startup] Terminal-animal medical cleanup: dosesSkipped=${dosesSkipped}, prescriptionsEnded=${prescriptionsEnded}, pcrCleared=${pcrCleared}, plansDeactivated=${medPlansDeactivated}, tasksSkipped=${medTasksSkipped}`,
    );

    try {
      const payload = JSON.stringify({
        appliedAt: new Date().toISOString(),
        dosesSkipped,
        prescriptionsEnded,
        pcrCleared,
        medPlansDeactivated,
        medTasksSkipped,
      }).replace(/'/g, "''");
      await db.execute(sql`
        INSERT INTO platform_settings (key, value, description, category, is_public)
        VALUES (
          ${MARKER_KEY},
          ${sql.raw(`'${payload}'::jsonb`)},
          'Marker: one-time cleanup of pending medical work for terminal-status animals (Task #163)',
          'general',
          false
        )
        ON CONFLICT (key) DO NOTHING
      `);
    } catch (markerErr) {
      console.warn(
        "[Startup] Could not write terminal-animal cleanup marker (will re-run next boot, still idempotent):",
        (markerErr as { message?: string })?.message ?? String(markerErr),
      );
    }
  } catch (err) {
    console.error(
      "[Startup] Terminal-animal medical cleanup backfill failed:",
      err,
    );
  }
}
