import { and, asc, desc, eq, gte, sql, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  adopterComplianceConfirmations,
  animals,
  complianceObligations,
  medicalExams,
  microchipRecords,
  preventativeCareRecords,
  preventativeCareTypes,
  vaccineRecords,
  type ComplianceObligation,
} from "@shared/schema";
import { vaccineFamily } from "./medical-supersession";

/**
 * Auto-resolution engine for `compliance_obligations`.
 *
 * Each obligation row created at adoption time (e.g. "Heartworm Prevention by
 * 2026-04-03", "Spay/Neuter Certificate") is matched against the live medical
 * + animal-profile state every time staff log a new PCR / vaccine / exam, OR
 * approve an adopter-uploaded confirmation, OR change the animal's
 * neuter/microchip fields. Satisfied obligations flip to `completed` so the
 * adopter portal stops showing them as "Nd overdue" once the underlying
 * record is actually present.
 *
 * The same logic runs in a one-time startup backfill so historical state
 * (e.g. Pogo's heartworm obligation that was already satisfied by a Bravecto
 * confirmation that did NOT cover heartworm) gets reconciled correctly.
 */

const SLACK_DAYS_BEFORE_OBLIGATION = 30;
const RECENT_EXAM_DAYS = 365;

type ObligationRow = ComplianceObligation;

type AnimalSnapshot = {
  id: string;
  status: string | null;
  neuterStatus: string | null;
  microchipNumber: string | null;
  /** True when at least one row exists in microchip_records for this animal
   *  with a non-empty microchipNumber. Some tenants record microchips via
   *  the dedicated microchip_records table without also writing back the
   *  denormalized animals.microchipNumber field, so the matcher treats
   *  EITHER signal as satisfying a microchip_registration obligation. */
  hasMicrochipRecord: boolean;
};

type PcrEvent = {
  id: string;
  careCategory: string | null;
  careName: string | null;
  dateAdministered: Date;
  nextDueDate: Date | null;
  coversHeartworm: boolean;
  coversFleaTick: boolean;
};

type VaccineEvent = {
  id: string;
  itemName: string;
  family: string;
  dateGiven: Date;
};

type ExamEvent = {
  id: string;
  examDate: Date;
  status: string | null;
};

/**
 * Approved adopter-uploaded compliance confirmation. These rows live in
 * `adopter_compliance_confirmations` and represent proof the adopter
 * uploaded (e.g. a Bravecto receipt photo, a rabies certificate PDF).
 *
 * `coversHeartworm` / `coversFleaTick` are resolved at load time via a
 * fuzzy match of `careName` against `preventative_care_types.name` so that
 * combo-safety holds: an approved Bravecto confirmation (flea/tick only)
 * MUST NOT close a heartworm obligation, even though the adopter uploaded
 * "parasite_prevention" as the category.
 */
type ConfirmationEvent = {
  id: string;
  careCategory: "vaccine" | "parasite_prevention" | "test" | "other";
  careName: string;
  vaccineFamily: string;
  dateAdministered: Date;
  fileUrl: string | null;
  reviewedAt: Date | null;
  /** True only when careName resolves to a PCR type with covers_heartworm. */
  coversHeartworm: boolean;
  /** True only when careName resolves to a PCR type with covers_flea_tick. */
  coversFleaTick: boolean;
};

type AnimalState = {
  animal: AnimalSnapshot;
  pcrs: PcrEvent[];
  vaccines: VaccineEvent[];
  exams: ExamEvent[];
  confirmations: ConfirmationEvent[];
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function obligationFloor(obl: ObligationRow): Date {
  const created = toDate(obl.createdAt) ?? new Date(0);
  const floor = new Date(created.getTime());
  floor.setDate(floor.getDate() - SLACK_DAYS_BEFORE_OBLIGATION);
  return floor;
}

function recentExamFloor(): Date {
  const d = new Date();
  d.setDate(d.getDate() - RECENT_EXAM_DAYS);
  return d;
}

async function loadState(
  tenantId: string,
  animalId: string,
): Promise<AnimalState | null> {
  const [animalRow] = await db
    .select({
      id: animals.id,
      status: animals.status,
      neuterStatus: animals.neuterStatus,
      microchipNumber: animals.microchipNumber,
    })
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)))
    .limit(1);
  if (!animalRow) return null;

  const pcrRows = await db
    .select({
      id: preventativeCareRecords.id,
      careCategory: preventativeCareRecords.careCategory,
      careName: preventativeCareRecords.careName,
      dateAdministered: preventativeCareRecords.dateAdministered,
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
        eq(preventativeCareRecords.tenantId, tenantId),
        eq(preventativeCareRecords.animalId, animalId),
      ),
    )
    .orderBy(desc(preventativeCareRecords.dateAdministered));

  const pcrs: PcrEvent[] = [];
  for (const row of pcrRows) {
    const dt = toDate(row.dateAdministered);
    if (!dt) continue;
    pcrs.push({
      id: row.id,
      careCategory: row.careCategory ?? null,
      careName: row.careName ?? null,
      dateAdministered: dt,
      nextDueDate: toDate(row.nextDueDate),
      coversHeartworm: row.coversHeartworm === true,
      coversFleaTick: row.coversFleaTick === true,
    });
  }

  const vaxRows = await db
    .select({
      id: vaccineRecords.id,
      itemName: vaccineRecords.itemName,
      dateGiven: vaccineRecords.dateGiven,
    })
    .from(vaccineRecords)
    .where(
      and(
        eq(vaccineRecords.tenantId, tenantId),
        eq(vaccineRecords.animalId, animalId),
      ),
    )
    .orderBy(desc(vaccineRecords.dateGiven));

  const vaccines: VaccineEvent[] = [];
  for (const row of vaxRows) {
    const dt = toDate(row.dateGiven);
    if (!dt) continue;
    vaccines.push({
      id: row.id,
      itemName: row.itemName,
      family: vaccineFamily(row.itemName),
      dateGiven: dt,
    });
  }

  const examRows = await db
    .select({
      id: medicalExams.id,
      examDate: medicalExams.examDate,
      status: medicalExams.status,
    })
    .from(medicalExams)
    .where(
      and(
        eq(medicalExams.tenantId, tenantId),
        eq(medicalExams.animalId, animalId),
        gte(medicalExams.examDate, recentExamFloor()),
      ),
    )
    .orderBy(desc(medicalExams.examDate));

  const exams: ExamEvent[] = [];
  for (const row of examRows) {
    const dt = toDate(row.examDate);
    if (!dt) continue;
    exams.push({ id: row.id, examDate: dt, status: row.status ?? null });
  }

  // Load approved adopter compliance confirmations. These need their PCR
  // coverage flags (heartworm / flea-tick) resolved by fuzzy-matching
  // careName against preventativeCareTypes for combo-safety. We pull the
  // tenant's PCR types AND platform defaults (tenantId IS NULL) once and
  // build a lowercase-name lookup.
  const confirmationRows = await db
    .select({
      id: adopterComplianceConfirmations.id,
      careCategory: adopterComplianceConfirmations.careCategory,
      careName: adopterComplianceConfirmations.careName,
      dateAdministered: adopterComplianceConfirmations.dateAdministered,
      fileUrl: adopterComplianceConfirmations.fileUrl,
      reviewedAt: adopterComplianceConfirmations.reviewedAt,
    })
    .from(adopterComplianceConfirmations)
    .where(
      and(
        eq(adopterComplianceConfirmations.tenantId, tenantId),
        eq(adopterComplianceConfirmations.animalId, animalId),
        eq(adopterComplianceConfirmations.status, "approved"),
      ),
    )
    .orderBy(desc(adopterComplianceConfirmations.dateAdministered));

  const confirmations: ConfirmationEvent[] = [];
  if (confirmationRows.length > 0) {
    // Pull platform-default PCR types first, then tenant-specific PCR
    // types, so tenant rows deterministically override platform defaults
    // for the same name (last write to the Map wins).
    const platformTypes = await db
      .select({
        name: preventativeCareTypes.name,
        coversHeartworm: preventativeCareTypes.coversHeartworm,
        coversFleaTick: preventativeCareTypes.coversFleaTick,
      })
      .from(preventativeCareTypes)
      .where(isNull(preventativeCareTypes.tenantId));
    const tenantTypes = await db
      .select({
        name: preventativeCareTypes.name,
        coversHeartworm: preventativeCareTypes.coversHeartworm,
        coversFleaTick: preventativeCareTypes.coversFleaTick,
      })
      .from(preventativeCareTypes)
      .where(eq(preventativeCareTypes.tenantId, tenantId));
    type Coverage = { hw: boolean; ft: boolean };
    const typeCoverage = new Map<string, Coverage>();
    // Platform first, tenant overrides last — tenant wins on key collision.
    for (const t of [...platformTypes, ...tenantTypes]) {
      const key = (t.name ?? "").trim().toLowerCase();
      if (!key) continue;
      typeCoverage.set(key, {
        hw: t.coversHeartworm === true,
        ft: t.coversFleaTick === true,
      });
    }
    function resolveCoverage(careName: string): Coverage {
      const cn = (careName ?? "").trim().toLowerCase();
      if (!cn) return { hw: false, ft: false };
      // Direct exact match first.
      const direct = typeCoverage.get(cn);
      if (direct) return direct;
      // Then containment in either direction (handles "Bravecto Plus 500mg"
      // matching the platform "Bravecto Plus" type, etc.).
      let hw = false;
      let ft = false;
      for (const [k, cov] of typeCoverage) {
        if (cn.includes(k) || k.includes(cn)) {
          if (cov.hw) hw = true;
          if (cov.ft) ft = true;
        }
      }
      return { hw, ft };
    }

    for (const row of confirmationRows) {
      const dt = toDate(row.dateAdministered);
      if (!dt) continue;
      const careName = row.careName ?? "";
      const cat = (row.careCategory ?? "other") as ConfirmationEvent["careCategory"];
      const coverage = cat === "parasite_prevention" ? resolveCoverage(careName) : { hw: false, ft: false };
      confirmations.push({
        id: row.id,
        careCategory: cat,
        careName,
        vaccineFamily: vaccineFamily(careName),
        dateAdministered: dt,
        fileUrl: row.fileUrl ?? null,
        reviewedAt: toDate(row.reviewedAt),
        coversHeartworm: coverage.hw,
        coversFleaTick: coverage.ft,
      });
    }
  }

  // microchip_records: any row with a non-empty number counts as a
  // satisfying signal for microchip_registration obligations.
  const [chipRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(microchipRecords)
    .where(
      and(
        eq(microchipRecords.tenantId, tenantId),
        eq(microchipRecords.animalId, animalId),
        sql`COALESCE(TRIM(${microchipRecords.microchipNumber}), '') <> ''`,
      ),
    );
  const hasMicrochipRecord = (chipRow?.count ?? 0) > 0;

  return {
    animal: {
      id: animalRow.id,
      status: animalRow.status ?? null,
      neuterStatus: animalRow.neuterStatus ?? null,
      microchipNumber: animalRow.microchipNumber ?? null,
      hasMicrochipRecord,
    },
    pcrs,
    vaccines,
    exams,
    confirmations,
  };
}

function findCoveringPcrForOngoing(
  state: AnimalState,
  obl: ObligationRow,
  predicate: (e: PcrEvent) => boolean,
): PcrEvent | null {
  const floor = obligationFloor(obl);
  const dueBy = toDate(obl.contractualDueDate);
  // Pick the latest dose administered on/after the obligation's floor that
  // also covers the contractual due date.
  //
  // When the obligation HAS a contractualDueDate, an ongoing-prevention dose
  // must come with a `next_due_date` that lands on/after the due date — a
  // dose with no follow-up scheduled is by definition not "ongoing", so it
  // can't satisfy a prevention-by-X-date contract. When the obligation has
  // no due-by, we accept any dose that covers the obligation type — the
  // contract is open-ended.
  for (const e of state.pcrs) {
    if (!predicate(e)) continue;
    if (e.dateAdministered < floor) continue;
    if (dueBy) {
      if (!e.nextDueDate) continue;
      if (e.nextDueDate < dueBy) continue;
    }
    return e;
  }
  return null;
}

function findCoveringPcrOneShot(
  state: AnimalState,
  obl: ObligationRow,
  predicate: (e: PcrEvent) => boolean,
): PcrEvent | null {
  const floor = obligationFloor(obl);
  for (const e of state.pcrs) {
    if (!predicate(e)) continue;
    if (e.dateAdministered < floor) continue;
    return e;
  }
  return null;
}

function findCoveringVaccine(
  state: AnimalState,
  obl: ObligationRow,
  family: string,
): VaccineEvent | null {
  const floor = obligationFloor(obl);
  for (const v of state.vaccines) {
    if (v.family !== family) continue;
    if (v.dateGiven < floor) continue;
    return v;
  }
  return null;
}

function findCoveringExam(
  state: AnimalState,
  obl: ObligationRow,
): ExamEvent | null {
  const floor = obligationFloor(obl);
  for (const e of state.exams) {
    if (e.examDate < floor) continue;
    if (e.status && e.status !== "completed") continue;
    return e;
  }
  return null;
}

function nameMatches(careName: string | null, regex: RegExp): boolean {
  if (!careName) return false;
  return regex.test(careName.toLowerCase());
}

/** Window during which a single dose's confirmation is treated as still
 * "covering" an ongoing-prevention obligation, since adopter confirmations
 * have no `next_due_date` to inspect. 90 days comfortably covers monthly
 * (Heartgard, NexGard, Credelio) and 1-month/3-month products
 * (Bravecto/ProHeart 6 are PCR-based not confirmation-based, so we don't
 * need 6+ month windows here).
 */
const CONFIRMATION_ONGOING_WINDOW_DAYS = 90;

/**
 * Find an approved adopter confirmation that satisfies an ongoing-prevention
 * obligation. Confirmations have no `next_due_date`, so when the obligation
 * has a `contractualDueDate` we require the confirmation to fall within
 * `dateAdministered + CONFIRMATION_ONGOING_WINDOW_DAYS >= dueBy`. This
 * mirrors the PCR ongoing semantics ("prevention is in effect through the
 * due date") instead of accepting any pre-deadline dose. When the
 * obligation is open-ended (no due-by), any confirmation past the floor
 * counts.
 */
function findCoveringConfirmationOngoing(
  state: AnimalState,
  obl: ObligationRow,
  predicate: (c: ConfirmationEvent) => boolean,
): ConfirmationEvent | null {
  const floor = obligationFloor(obl);
  const dueBy = toDate(obl.contractualDueDate);
  for (const c of state.confirmations) {
    if (!predicate(c)) continue;
    if (c.dateAdministered < floor) continue;
    if (dueBy) {
      const inferredCoverEnd = new Date(c.dateAdministered.getTime());
      inferredCoverEnd.setDate(inferredCoverEnd.getDate() + CONFIRMATION_ONGOING_WINDOW_DAYS);
      if (inferredCoverEnd < dueBy) continue;
    }
    return c;
  }
  return null;
}

function findCoveringConfirmationOneShot(
  state: AnimalState,
  obl: ObligationRow,
  predicate: (c: ConfirmationEvent) => boolean,
): ConfirmationEvent | null {
  const floor = obligationFloor(obl);
  for (const c of state.confirmations) {
    if (!predicate(c)) continue;
    if (c.dateAdministered < floor) continue;
    return c;
  }
  return null;
}

type Match =
  | { kind: "pcr"; eventId: string }
  | { kind: "vaccine"; eventId: string }
  | { kind: "exam"; eventId: string }
  | { kind: "confirmation"; eventId: string; fileUrl: string | null }
  | { kind: "animal"; field: "neuterStatus" | "microchipNumber" };

function obligationMatch(
  obl: ObligationRow,
  state: AnimalState,
): Match | null {
  const labelLower = (obl.label || "").toLowerCase();
  const type = (obl.obligationType || "").toLowerCase();

  // 1. spay_neuter — animal field, OR adopter confirmation w/ matching text
  if (type === "spay_neuter" || /spay|neuter/.test(labelLower)) {
    const ns = (state.animal.neuterStatus || "").toLowerCase();
    if (ns === "spayed" || ns === "neutered") {
      return { kind: "animal", field: "neuterStatus" };
    }
    const c = findCoveringConfirmationOneShot(state, obl, (cf) =>
      nameMatches(cf.careName, /spay|neuter|sterili[sz]/),
    );
    if (c) return { kind: "confirmation", eventId: c.id, fileUrl: c.fileUrl };
    return null;
  }

  // 2. microchip_registration — animal field OR microchip_records row OR
  //    adopter confirmation. Some tenants record chips only via the
  //    microchip_records table without back-filling animals.microchipNumber,
  //    so either signal satisfies the obligation.
  if (type === "microchip_registration" || /microchip/.test(labelLower)) {
    const m = (state.animal.microchipNumber || "").trim();
    if (m.length > 0 || state.animal.hasMicrochipRecord) {
      return { kind: "animal", field: "microchipNumber" };
    }
    const c = findCoveringConfirmationOneShot(state, obl, (cf) =>
      nameMatches(cf.careName, /microchip|chip\b|registration/),
    );
    if (c) return { kind: "confirmation", eventId: c.id, fileUrl: c.fileUrl };
    return null;
  }

  // 3. heartworm_prevention_proof / flea_tick_prevention — ongoing PCR
  //    Combo-safe: confirmation only counts if its careName resolves to a
  //    PCR type whose `covers_heartworm` (or `covers_flea_tick`) is true.
  //    A Bravecto confirmation (covers_flea_tick=true, covers_heartworm=false)
  //    will NEVER close a heartworm obligation through this path.
  if (
    type === "heartworm_prevention_proof" ||
    /heartworm.*(prevent|preventative|prophyla)|hw.*prevent/.test(labelLower)
  ) {
    // If the label explicitly says "test", route to one-shot test instead.
    if (/heartworm.*test|hw.*test/.test(labelLower)) {
      const oneShot = findCoveringPcrOneShot(
        state,
        obl,
        (e) => nameMatches(e.careName, /heartworm.*test|hw.*test|antigen/),
      );
      if (oneShot) return { kind: "pcr", eventId: oneShot.id };
      const vax = findCoveringVaccine(state, obl, "hw_test");
      if (vax) return { kind: "vaccine", eventId: vax.id };
      const c = findCoveringConfirmationOneShot(state, obl, (cf) =>
        cf.careCategory === "test" &&
        nameMatches(cf.careName, /heartworm|hw.*test|antigen/),
      );
      if (c) return { kind: "confirmation", eventId: c.id, fileUrl: c.fileUrl };
      return null;
    }
    const e = findCoveringPcrForOngoing(state, obl, (p) => p.coversHeartworm);
    if (e) return { kind: "pcr", eventId: e.id };
    const cf = findCoveringConfirmationOngoing(state, obl, (c) =>
      c.careCategory === "parasite_prevention" && c.coversHeartworm,
    );
    if (cf) return { kind: "confirmation", eventId: cf.id, fileUrl: cf.fileUrl };
    return null;
  }

  if (type === "flea_tick_prevention" || /flea.*tick|flea\b|tick\b/.test(labelLower)) {
    const e = findCoveringPcrForOngoing(state, obl, (p) => p.coversFleaTick);
    if (e) return { kind: "pcr", eventId: e.id };
    const cf = findCoveringConfirmationOngoing(state, obl, (c) =>
      c.careCategory === "parasite_prevention" && c.coversFleaTick,
    );
    if (cf) return { kind: "confirmation", eventId: cf.id, fileUrl: cf.fileUrl };
    return null;
  }

  // 4. rabies (and rabies_booster legacy)
  if (type === "rabies" || type === "rabies_booster" || /rabies/.test(labelLower)) {
    const v = findCoveringVaccine(state, obl, "rabies");
    if (v) return { kind: "vaccine", eventId: v.id };
    const c = findCoveringConfirmationOneShot(state, obl, (cf) =>
      cf.careCategory === "vaccine" && cf.vaccineFamily === "rabies",
    );
    if (c) return { kind: "confirmation", eventId: c.id, fileUrl: c.fileUrl };
    return null;
  }

  // 5. dhpp_booster
  if (
    type === "dhpp_booster" ||
    /dhpp|dappv|da2pp|distemper|parvo/.test(labelLower)
  ) {
    const v = findCoveringVaccine(state, obl, "dhpp");
    if (v) return { kind: "vaccine", eventId: v.id };
    const c = findCoveringConfirmationOneShot(state, obl, (cf) =>
      cf.careCategory === "vaccine" && cf.vaccineFamily === "dhpp",
    );
    if (c) return { kind: "confirmation", eventId: c.id, fileUrl: c.fileUrl };
    return null;
  }

  // 6. heartworm_test (legacy / label-only)
  if (type === "heartworm_test" || /heartworm.*test|hw.*test/.test(labelLower)) {
    const oneShot = findCoveringPcrOneShot(
      state,
      obl,
      (e) => nameMatches(e.careName, /heartworm.*test|hw.*test|antigen/),
    );
    if (oneShot) return { kind: "pcr", eventId: oneShot.id };
    const vax = findCoveringVaccine(state, obl, "hw_test");
    if (vax) return { kind: "vaccine", eventId: vax.id };
    const c = findCoveringConfirmationOneShot(state, obl, (cf) =>
      cf.careCategory === "test" &&
      nameMatches(cf.careName, /heartworm|hw.*test|antigen/),
    );
    if (c) return { kind: "confirmation", eventId: c.id, fileUrl: c.fileUrl };
    return null;
  }

  // 7. fecal_test
  if (type === "fecal_test" || /fecal|stool|parasite\s*screen/.test(labelLower)) {
    const e = findCoveringPcrOneShot(
      state,
      obl,
      (p) => nameMatches(p.careName, /fecal|stool|parasite.*screen/),
    );
    if (e) return { kind: "pcr", eventId: e.id };
    const c = findCoveringConfirmationOneShot(state, obl, (cf) =>
      cf.careCategory === "test" &&
      nameMatches(cf.careName, /fecal|stool|parasite.*screen/),
    );
    if (c) return { kind: "confirmation", eventId: c.id, fileUrl: c.fileUrl };
    return null;
  }

  // 8. vet_checkup
  if (type === "vet_checkup" || /vet.*check|wellness|check.?up/.test(labelLower)) {
    const e = findCoveringExam(state, obl);
    if (e) return { kind: "exam", eventId: e.id };
    const c = findCoveringConfirmationOneShot(state, obl, (cf) =>
      nameMatches(cf.careName, /vet.*check|wellness|check.?up|exam|physical/),
    );
    if (c) return { kind: "confirmation", eventId: c.id, fileUrl: c.fileUrl };
    return null;
  }

  // 9. obedience_training / ongoing_treatment / custom — no auto-detection.
  return null;
}

export type ObligationCloseoutResult = {
  completedCount: number;
  completedIds: string[];
};

/**
 * Given an animal that just had a medical event recorded (or an animal field
 * change), close out any pending compliance_obligations whose satisfaction
 * criteria are now met.
 *
 * `proofDocumentUrl` is optional: when staff approves an adopter-uploaded
 * confirmation, the file_url is propagated onto the closed obligation so the
 * audit trail shows the actual proof doc the adopter sent in.
 */
export async function autoCompletePendingObligations(
  tenantId: string,
  animalId: string,
  opts: {
    proofDocumentUrl?: string | null;
    actorNote?: string;
  } = {},
): Promise<ObligationCloseoutResult> {
  try {
    const pending = await db
      .select()
      .from(complianceObligations)
      .where(
        and(
          eq(complianceObligations.tenantId, tenantId),
          eq(complianceObligations.animalId, animalId),
          sql`${complianceObligations.status} IN ('pending', 'overdue')`,
        ),
      )
      .orderBy(asc(complianceObligations.contractualDueDate));

    if (pending.length === 0) {
      return { completedCount: 0, completedIds: [] };
    }

    const state = await loadState(tenantId, animalId);
    if (!state) {
      return { completedCount: 0, completedIds: [] };
    }

    // Compliance obligations only apply to adopted animals. If an
    // obligation row exists for a non-adopted animal (data drift), don't
    // auto-close it here — let staff investigate.
    if ((state.animal.status ?? "").toLowerCase() !== "adopted") {
      return { completedCount: 0, completedIds: [] };
    }

    const completedIds: string[] = [];
    const now = new Date();
    const noteSuffix = opts.actorNote ? ` — ${opts.actorNote}` : "";

    for (const obl of pending) {
      const match = obligationMatch(obl, state);
      if (!match) continue;

      const matchSummary =
        match.kind === "animal"
          ? `animal.${match.field}`
          : `${match.kind}:${match.eventId}`;
      const newNotes = `${obl.notes ? obl.notes + " | " : ""}Auto-completed by matching ${matchSummary}${noteSuffix}`;

      // Proof URL precedence: explicit caller override > the file the
      // matched confirmation pointed at > whatever the obligation already
      // had on it. This way an approved adopter confirmation that closes a
      // *different* obligation (because it satisfies the criteria) still
      // attaches the right proof doc.
      const matchedFileUrl =
        match.kind === "confirmation" ? match.fileUrl : null;
      const finalProofUrl =
        opts.proofDocumentUrl ?? matchedFileUrl ?? obl.proofDocumentUrl;

      await db
        .update(complianceObligations)
        .set({
          status: "completed" as const,
          completedAt: now,
          notes: newNotes,
          proofDocumentUrl: finalProofUrl,
          updatedAt: now,
        })
        .where(eq(complianceObligations.id, obl.id));

      completedIds.push(obl.id);
    }

    if (completedIds.length > 0) {
      console.log(
        `[ComplianceMatcher] Auto-completed ${completedIds.length} obligation(s) for animal ${animalId} (tenant ${tenantId})`,
      );
    }

    return { completedCount: completedIds.length, completedIds };
  } catch (err) {
    console.error(
      "[ComplianceMatcher] autoCompletePendingObligations failed:",
      err,
    );
    return { completedCount: 0, completedIds: [] };
  }
}

/**
 * Used by the startup backfill to iterate every pending obligation across
 * all tenants. Returns total count of obligations newly closed.
 */
export async function runComplianceObligationBackfill(): Promise<{
  scanned: number;
  completed: number;
  perTenant: Record<string, number>;
}> {
  const rows = await db
    .select({
      tenantId: complianceObligations.tenantId,
      animalId: complianceObligations.animalId,
    })
    .from(complianceObligations)
    .where(
      sql`${complianceObligations.status} IN ('pending', 'overdue')`,
    );

  // De-dupe (tenant,animal) so we run the matcher once per animal.
  const seen = new Set<string>();
  const pairs: { tenantId: string; animalId: string }[] = [];
  for (const r of rows) {
    const k = `${r.tenantId}::${r.animalId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pairs.push({ tenantId: r.tenantId, animalId: r.animalId });
  }

  let completed = 0;
  const perTenant: Record<string, number> = {};
  for (const p of pairs) {
    const res = await autoCompletePendingObligations(p.tenantId, p.animalId, {
      actorNote: "Startup backfill: compliance obligations sync",
    });
    completed += res.completedCount;
    if (res.completedCount > 0) {
      perTenant[p.tenantId] = (perTenant[p.tenantId] || 0) + res.completedCount;
    }
  }

  return { scanned: pairs.length, completed, perTenant };
}
