import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "../db";
import {
  preventativeCareRecords,
  preventativeCareTypes,
  vaccineRecords,
} from "@shared/schema";

/**
 * Canonical helpers for the "latest-record-per-series-wins" supersession
 * model. Used by:
 *   - The /api/medical/preventative-care/coming-due endpoint (read-time
 *     filter so older same-series records do not show as overdue).
 *   - Every write path that inserts a preventative_care_record or
 *     vaccine_record (write-time cleanup so the underlying tables are
 *     consistent with what coming-due surfaces).
 *   - The startup backfill in server/scripts/backfill-superseded-
 *     preventative-care.ts (one-time historical cleanup).
 *
 * If you change vaccineFamily / seriesKeysForPcr here, also update the
 * inline copies in those two sites.
 */

export function vaccineFamily(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  const n = raw.trim().toLowerCase();
  if (/rabies/.test(n)) return "rabies";
  if (/bordet|bordat|brachy|kennel\s*cough/.test(n)) return "bordetella";
  if (/dapp|dhpp|da2p|distemper|parvo/.test(n)) return "dhpp";
  if (/lepto/.test(n)) return "lepto";
  if (/canine\s*influenza|civ\b|\bflu\b/.test(n)) return "influenza";
  if (/lyme/.test(n)) return "lyme";
  if (/fvrcp|hcp|panleuk/.test(n)) return "fvrcp";
  if (/felv|feline\s*leukemia/.test(n)) return "felv";
  if (/heartworm.*test|hw.*test|antigen/.test(n)) return "hw_test";
  return `other:${n.replace(/\s+/g, " ")}`;
}

export type PcrSeriesRecord = {
  careCategory: string | null;
  careTypeId: string | null;
  careName: string | null;
};

export type PcrCareTypeCovers = {
  coversHeartworm: boolean | null;
  coversFleaTick: boolean | null;
} | null;

export function seriesKeysForPcr(
  record: PcrSeriesRecord,
  careType: PcrCareTypeCovers,
): string[] {
  const cat = (record.careCategory || "other").toLowerCase();
  if (
    cat === "parasite_prevention" &&
    careType &&
    (careType.coversHeartworm !== null || careType.coversFleaTick !== null)
  ) {
    const keys: string[] = [];
    if (careType.coversHeartworm) keys.push("pp|hw");
    if (careType.coversFleaTick) keys.push("pp|ft");
    if (keys.length === 0) keys.push("pp|other");
    return keys;
  }
  if (record.careTypeId) {
    return [`${cat}|type:${record.careTypeId}`];
  }
  const name = (record.careName || "").trim().toLowerCase().replace(/\s+/g, " ");
  return [`${cat}|name:${name}`];
}

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * After inserting a new vaccine_record with a date_due, null `date_due` on
 * any older same-family record for the same animal so the new record becomes
 * the sole winner for that vaccine series. Strict inequality on date_due
 * means ties are preserved.
 *
 * Returns the count of records that were superseded.
 */
export async function supersedeOlderVaccineRecords(
  animalId: string,
  tenantId: string,
  newRecord: {
    id: string;
    itemName: string | null;
    dateDue: Date | string | null;
  },
): Promise<number> {
  const newDueMs = toMs(newRecord.dateDue);
  if (newDueMs == null || !newRecord.itemName) return 0;
  const family = vaccineFamily(newRecord.itemName);

  const candidates = await db
    .select({
      id: vaccineRecords.id,
      itemName: vaccineRecords.itemName,
      dateDue: vaccineRecords.dateDue,
    })
    .from(vaccineRecords)
    .where(
      and(
        eq(vaccineRecords.animalId, animalId),
        eq(vaccineRecords.tenantId, tenantId),
        isNotNull(vaccineRecords.dateDue),
        ne(vaccineRecords.id, newRecord.id),
      ),
    );

  const supersededIds = candidates
    .filter((c) => {
      if (vaccineFamily(c.itemName) !== family) return false;
      const candMs = toMs(c.dateDue);
      return candMs != null && candMs < newDueMs;
    })
    .map((c) => c.id);

  if (supersededIds.length === 0) return 0;

  const result = await db
    .update(vaccineRecords)
    .set({ dateDue: null })
    .where(
      and(
        eq(vaccineRecords.tenantId, tenantId),
        inArray(vaccineRecords.id, supersededIds),
      ),
    );
  const rc = (result as { rowCount?: number | null }).rowCount;
  return typeof rc === "number" ? rc : supersededIds.length;
}

/**
 * After inserting a new preventative_care_record with a next_due_date, null
 * `next_due_date` on any older same-series record for the same animal.
 *
 * Combo-safe: a candidate is only superseded if it loses to the new record
 * in EVERY series it participates in. A combo product (e.g. heartworm +
 * flea/tick) that wins in one series is preserved even if the new record
 * wins another.
 *
 * Returns the count of records that were superseded.
 */
export async function supersedeOlderPreventativeCareRecords(
  animalId: string,
  tenantId: string,
  newRecord: {
    id: string;
    careCategory: string | null;
    careTypeId: string | null;
    careName: string | null;
    nextDueDate: Date | string | null;
  },
): Promise<number> {
  const newDueMs = toMs(newRecord.nextDueDate);
  if (newDueMs == null) return 0;

  let newCovers: PcrCareTypeCovers = null;
  if (
    newRecord.careTypeId &&
    (newRecord.careCategory || "").toLowerCase() === "parasite_prevention"
  ) {
    const [t] = await db
      .select({
        coversHeartworm: preventativeCareTypes.coversHeartworm,
        coversFleaTick: preventativeCareTypes.coversFleaTick,
      })
      .from(preventativeCareTypes)
      .where(eq(preventativeCareTypes.id, newRecord.careTypeId))
      .limit(1);
    if (t) newCovers = t;
  }

  const newKeys = new Set(seriesKeysForPcr(newRecord, newCovers));
  if (newKeys.size === 0) return 0;

  const rows = await db
    .select({
      id: preventativeCareRecords.id,
      careCategory: preventativeCareRecords.careCategory,
      careTypeId: preventativeCareRecords.careTypeId,
      careName: preventativeCareRecords.careName,
      nextDueDate: preventativeCareRecords.nextDueDate,
      coversHeartworm: preventativeCareTypes.coversHeartworm,
      coversFleaTick: preventativeCareTypes.coversFleaTick,
    })
    .from(preventativeCareRecords)
    .leftJoin(
      preventativeCareTypes,
      eq(preventativeCareTypes.id, preventativeCareRecords.careTypeId),
    )
    .where(
      and(
        eq(preventativeCareRecords.animalId, animalId),
        eq(preventativeCareRecords.tenantId, tenantId),
        isNotNull(preventativeCareRecords.nextDueDate),
        ne(preventativeCareRecords.id, newRecord.id),
      ),
    );

  const supersededIds: string[] = [];
  for (const r of rows) {
    const candMs = toMs(r.nextDueDate);
    if (candMs == null || candMs >= newDueMs) continue;
    const candKeys = seriesKeysForPcr(r, {
      coversHeartworm: r.coversHeartworm,
      coversFleaTick: r.coversFleaTick,
    });
    if (candKeys.length === 0) continue;
    // Only supersede if every bucket the candidate is in is also covered by
    // the new record's buckets — preserves combo products that still win in
    // a series the new record doesn't touch.
    if (candKeys.every((k) => newKeys.has(k))) {
      supersededIds.push(r.id);
    }
  }

  if (supersededIds.length === 0) return 0;

  const result = await db
    .update(preventativeCareRecords)
    .set({ nextDueDate: null })
    .where(
      and(
        eq(preventativeCareRecords.tenantId, tenantId),
        inArray(preventativeCareRecords.id, supersededIds),
      ),
    );
  const rc = (result as { rowCount?: number | null }).rowCount;
  return typeof rc === "number" ? rc : supersededIds.length;
}
