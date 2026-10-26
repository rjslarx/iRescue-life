import assert from "node:assert/strict";
import { test } from "node:test";
import { currentHeartwormRecordIds, protectedHeartwormAnimalIds, type HeartwormRecord } from "../server/lib/heartworm-warning-eligibility";

const today = new Date("2026-10-25T12:00:00Z");
const record = (id: string, date: string, extra: Partial<HeartwormRecord> = {}): HeartwormRecord => ({
  id, animalId: "animal-a", status: "given", dateAdministered: new Date(date),
  nextDueDate: new Date("2026-09-01"), coversHeartworm: true, ...extra,
});

test("new ProHeart replaces old monthly products even though it is not overdue", () => {
  const rows = [
    record("old-combination", "2025-08-04"),
    record("monthly", "2026-06-18", { nextDueDate: null }),
    record("proheart", "2026-07-16", { nextDueDate: new Date("2027-01-16") }),
  ];
  assert.deepEqual([...currentHeartwormRecordIds(rows, today)], ["proheart"]);
  assert.equal(rows[0].nextDueDate?.toISOString(), "2026-09-01T00:00:00.000Z");
});
test("flea-only products neither trigger heartworm warnings nor suppress them", () => {
  assert.deepEqual([...currentHeartwormRecordIds([
    record("hw", "2026-06-01"),
    record("flea", "2026-10-01", { coversHeartworm: false }),
    record("unknown", "2026-10-02", { coversHeartworm: null }),
  ], today)], ["hw"]);
});
test("pending and future doses do not suppress genuine overdue heartworm care", () => {
  assert.deepEqual([...currentHeartwormRecordIds([
    record("overdue", "2026-06-01"),
    record("pending", "2026-10-01", { status: "pending" }),
    record("future", "2027-01-01"),
  ], today)], ["overdue"]);
});
test("missing next due date does not revive older product reminders", () => {
  assert.deepEqual([...currentHeartwormRecordIds([
    record("old", "2026-06-01"),
    record("new", "2026-10-01", { nextDueDate: null }),
  ], today)], ["new"]);
});
test("newest overdue dose remains eligible; animals and same-day ties stay independent", () => {
  assert.deepEqual([...currentHeartwormRecordIds([
    record("old", "2026-05-01"),
    record("latest", "2026-06-01"),
    record("tie", "2026-06-01"),
    record("other-animal", "2026-04-01", { animalId: "animal-b" }),
  ], today)], ["latest", "tie", "other-animal"]);
});

test("open proof obligations do not produce overdue-treatment warnings during confirmed coverage", () => {
  assert.deepEqual([...protectedHeartwormAnimalIds([
    record("active", "2026-07-16", { nextDueDate: new Date("2027-01-16") }),
    record("expired", "2026-07-16", { animalId: "expired" }),
    record("flea-only", "2026-07-16", {
      animalId: "flea-only", coversHeartworm: false, nextDueDate: new Date("2027-01-16"),
    }),
    record("scheduled", "2026-07-16", {
      animalId: "scheduled", status: "pending", nextDueDate: new Date("2027-01-16"),
    }),
  ], today, new Date("2026-10-25"))], ["animal-a"]);
});
