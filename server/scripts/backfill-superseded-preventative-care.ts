import { db } from "../db";
import { sql, eq, and, isNotNull, inArray } from "drizzle-orm";
import {
  preventativeCareRecords,
  preventativeCareTypes,
  vaccineRecords,
  tenants,
} from "@shared/schema";

const MARKER_KEY = "backfill:superseded_preventative_care_v1";

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function rowCountOf(result: unknown): number {
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

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Canonical helpers shared with the /coming-due endpoint and write-time
// supersession in services/medical-supersession.ts. Importing here keeps all
// three sites drift-free.
import { vaccineFamily, seriesKeysForPcr } from "../services/medical-supersession";

type Candidate = { id: string; nextDueMs: number; bucketKeys: string[] };

/**
 * Returns the set of record IDs that are superseded — i.e. not a winner in
 * ANY of the buckets they participate in. This matches the coming-due
 * endpoint's behavior, which surfaces a record if it is the bucket winner
 * for at least one of its series keys (important for combo products that
 * win in one series but not another).
 */
function pickSupersededIds(candidates: Candidate[]): Set<string> {
  const byBucket = new Map<string, Candidate[]>();
  for (const c of candidates) {
    for (const k of c.bucketKeys) {
      const arr = byBucket.get(k) ?? [];
      arr.push(c);
      byBucket.set(k, arr);
    }
  }

  // A record is preserved if it is the strict winner OR tied for the
  // latest nextDueMs in at least one bucket.
  const preserved = new Set<string>();
  for (const cands of byBucket.values()) {
    let maxMs = -Infinity;
    for (const c of cands) if (c.nextDueMs > maxMs) maxMs = c.nextDueMs;
    for (const c of cands) {
      if (c.nextDueMs === maxMs) preserved.add(c.id);
    }
  }

  const superseded = new Set<string>();
  for (const c of candidates) {
    if (!preserved.has(c.id)) superseded.add(c.id);
  }
  return superseded;
}

async function backfillTenant(tenantId: string): Promise<{ pcr: number; vax: number }> {
  // Load all PCR rows with next_due_date set, joined to care types for coverage flags.
  const pcrRows = await db
    .select({
      id: preventativeCareRecords.id,
      animalId: preventativeCareRecords.animalId,
      careTypeId: preventativeCareRecords.careTypeId,
      careName: preventativeCareRecords.careName,
      careCategory: preventativeCareRecords.careCategory,
      nextDueDate: preventativeCareRecords.nextDueDate,
      coversHeartworm: preventativeCareTypes.coversHeartworm,
      coversFleaTick: preventativeCareTypes.coversFleaTick,
    })
    .from(preventativeCareRecords)
    .leftJoin(
      preventativeCareTypes,
      eq(preventativeCareRecords.careTypeId, preventativeCareTypes.id),
    )
    .where(
      and(
        eq(preventativeCareRecords.tenantId, tenantId),
        isNotNull(preventativeCareRecords.nextDueDate),
      ),
    );

  const pcrCandidates: Candidate[] = [];
  for (const r of pcrRows) {
    const nextDueMs = toMs(r.nextDueDate);
    if (nextDueMs == null) continue;
    const careType =
      r.coversHeartworm === null && r.coversFleaTick === null
        ? null
        : { coversHeartworm: r.coversHeartworm, coversFleaTick: r.coversFleaTick };
    const sKeys = seriesKeysForPcr(
      { careCategory: r.careCategory, careTypeId: r.careTypeId, careName: r.careName },
      careType,
    );
    pcrCandidates.push({
      id: r.id,
      nextDueMs,
      bucketKeys: sKeys.map((sk) => `${r.animalId}|pcr|${sk}`),
    });
  }

  const supersededPcrIds = pickSupersededIds(pcrCandidates);

  // Load all vaccine rows with date_due set.
  const vaxRows = await db
    .select({
      id: vaccineRecords.id,
      animalId: vaccineRecords.animalId,
      itemName: vaccineRecords.itemName,
      dateDue: vaccineRecords.dateDue,
    })
    .from(vaccineRecords)
    .where(
      and(
        eq(vaccineRecords.tenantId, tenantId),
        isNotNull(vaccineRecords.dateDue),
      ),
    );

  const vaxCandidates: Candidate[] = [];
  for (const v of vaxRows) {
    const nextDueMs = toMs(v.dateDue);
    if (nextDueMs == null) continue;
    const family = vaccineFamily(v.itemName);
    vaxCandidates.push({
      id: v.id,
      nextDueMs,
      bucketKeys: [`${v.animalId}|vax|${family}`],
    });
  }

  const supersededVaxIds = pickSupersededIds(vaxCandidates);

  let pcrCleared = 0;
  let vaxCleared = 0;

  // Apply updates in batches to avoid huge IN clauses.
  const CHUNK = 500;
  const pcrIds = Array.from(supersededPcrIds);
  for (let i = 0; i < pcrIds.length; i += CHUNK) {
    const slice = pcrIds.slice(i, i + CHUNK);
    const result = await db
      .update(preventativeCareRecords)
      .set({ nextDueDate: null })
      .where(
        and(
          eq(preventativeCareRecords.tenantId, tenantId),
          inArray(preventativeCareRecords.id, slice),
          isNotNull(preventativeCareRecords.nextDueDate),
        ),
      );
    pcrCleared += rowCountOf(result);
  }

  const vaxIds = Array.from(supersededVaxIds);
  for (let i = 0; i < vaxIds.length; i += CHUNK) {
    const slice = vaxIds.slice(i, i + CHUNK);
    const result = await db
      .update(vaccineRecords)
      .set({ dateDue: null })
      .where(
        and(
          eq(vaccineRecords.tenantId, tenantId),
          inArray(vaccineRecords.id, slice),
          isNotNull(vaccineRecords.dateDue),
        ),
      );
    vaxCleared += rowCountOf(result);
  }

  return { pcr: pcrCleared, vax: vaxCleared };
}

// Lightweight self-tests for the supersession logic. Run inline before the
// backfill executes to guard against regressions in the combo-product edge
// case (HW+FT combo vs HW-only newer record). Throws on failure so the
// startup wrapper can log and refuse to write the marker.
function runSelfTests(): void {
  // Case 1: combo (HW+FT) is older; HW-only newer exists; FT-only older exists.
  // - Combo wins FT bucket, loses HW bucket → must be PRESERVED.
  // - HW-only wins HW bucket → preserved.
  // - FT-only loses FT bucket → superseded.
  const combo: Candidate = { id: "combo", nextDueMs: 100, bucketKeys: ["a|pcr|pp|hw", "a|pcr|pp|ft"] };
  const hwOnly: Candidate = { id: "hw", nextDueMs: 200, bucketKeys: ["a|pcr|pp|hw"] };
  const ftOldOnly: Candidate = { id: "ft", nextDueMs: 50, bucketKeys: ["a|pcr|pp|ft"] };
  const r1 = pickSupersededIds([combo, hwOnly, ftOldOnly]);
  if (r1.has("combo")) throw new Error("Self-test failed: combo (HW+FT) wrongly superseded");
  if (r1.has("hw")) throw new Error("Self-test failed: hw-only winner wrongly superseded");
  if (!r1.has("ft")) throw new Error("Self-test failed: ft-only older not superseded");

  // Case 2: solo record in only-bucket → preserved.
  const solo: Candidate = { id: "solo", nextDueMs: 1, bucketKeys: ["b|pcr|x"] };
  const r2 = pickSupersededIds([solo]);
  if (r2.has("solo")) throw new Error("Self-test failed: solo bucket-winner wrongly superseded");

  // Case 3: ties on latest date → both preserved.
  const tie1: Candidate = { id: "t1", nextDueMs: 10, bucketKeys: ["c|pcr|x"] };
  const tie2: Candidate = { id: "t2", nextDueMs: 10, bucketKeys: ["c|pcr|x"] };
  const r3 = pickSupersededIds([tie1, tie2]);
  if (r3.size !== 0) throw new Error("Self-test failed: tied latest records wrongly superseded");
}

export async function backfillSupersededPreventativeCare(): Promise<void> {
  try {
    runSelfTests();
  } catch (err) {
    console.error(
      "[Startup] Superseded preventative-care backfill self-test failed; aborting:",
      errMessage(err),
    );
    return;
  }

  try {
    const existing = await db.execute(sql`
      SELECT 1 FROM platform_settings WHERE key = ${MARKER_KEY} LIMIT 1
    `);
    if (hasAnyRows(existing)) {
      console.log(
        "[Startup] Superseded preventative-care backfill already applied (marker present); skipping",
      );
      return;
    }
  } catch (err) {
    console.warn(
      "[Startup] Could not read superseded-PC backfill marker, proceeding:",
      errMessage(err),
    );
  }

  let totalPcr = 0;
  let totalVax = 0;
  let tenantCount = 0;
  let tenantsFailed = 0;

  try {
    const allTenants = await db.select({ id: tenants.id }).from(tenants);
    for (const t of allTenants) {
      try {
        const { pcr, vax } = await backfillTenant(t.id);
        if (pcr > 0 || vax > 0) {
          console.log(
            `[Startup] Superseded PC backfill (tenant=${t.id}): cleared next_due_date on ${pcr} PCR + ${vax} vaccine record(s)`,
          );
        }
        totalPcr += pcr;
        totalVax += vax;
        tenantCount += 1;
      } catch (tenantErr) {
        tenantsFailed += 1;
        console.error(
          `[Startup] Superseded PC backfill failed for tenant ${t.id}:`,
          tenantErr,
        );
      }
    }

    console.log(
      `[Startup] Superseded preventative-care backfill complete (tenants=${tenantCount}, failed=${tenantsFailed}, pcrCleared=${totalPcr}, vaxCleared=${totalVax})`,
    );

    // Only write the marker when EVERY tenant succeeded. If any tenant
    // failed, leave the marker absent so the next boot retries the whole
    // sweep — the per-tenant logic is idempotent (a winner stays a winner;
    // already-cleared rows are filtered out by the isNotNull guard).
    if (tenantsFailed > 0) {
      console.warn(
        `[Startup] Skipping superseded-PC backfill marker: ${tenantsFailed} tenant(s) failed; will retry on next boot`,
      );
      return;
    }

    try {
      const payload = JSON.stringify({
        appliedAt: new Date().toISOString(),
        tenants: tenantCount,
        pcrCleared: totalPcr,
        vaxCleared: totalVax,
      }).replace(/'/g, "''");
      await db.execute(sql`
        INSERT INTO platform_settings (key, value, description, category, is_public)
        VALUES (
          ${MARKER_KEY},
          ${sql.raw(`'${payload}'::jsonb`)},
          'Marker: one-time backfill clearing next_due_date on superseded preventative-care + vaccine records (Task #159)',
          'general',
          false
        )
        ON CONFLICT (key) DO NOTHING
      `);
    } catch (markerErr) {
      console.warn(
        "[Startup] Could not write superseded-PC backfill marker (will re-run next boot, still idempotent):",
        errMessage(markerErr),
      );
    }
  } catch (err) {
    console.error("[Startup] Superseded preventative-care backfill failed:", err);
  }
}
