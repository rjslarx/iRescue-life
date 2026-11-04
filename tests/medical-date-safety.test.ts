import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidMedicalDate, medicalDateInput, medicalDateInputSchema, optionalMedicalDateInputSchema } from "../shared/medical-dates";
import { insertMedicalPrescriptionSchema } from "../shared/schema";
import { formatMedicalDate, formatMedicalDateOnly } from "../client/src/lib/medical-date-display";

describe("medical date safety", () => {
  const prescription = { medicationName: "Tri-wormer", dosage: "2 tablets", frequency: "ONCE", route: "PO", startDate: "2026-07-26" };
  for (const value of ["0026-07-26", "2026-02-30", "not a date", "", null, undefined, new Date(NaN), "12026-07-26"]) {
    it(`rejects invalid input ${String(value)} without crashing display`, () => {
      assert.equal(isValidMedicalDate(value), false);
      assert.equal(medicalDateInput(value), "");
      assert.match(formatMedicalDate(value), /Invalid date/);
      assert.match(formatMedicalDateOnly(value), /Invalid date/);
      assert.equal(insertMedicalPrescriptionSchema.safeParse({ ...prescription, startDate: value }).success, false);
    });
  }
  for (const field of ["startDate", "endDate", "nextScheduledDose"]) {
    it(`validates ${field} on create and partial edits`, () => {
      assert.equal(insertMedicalPrescriptionSchema.safeParse({ ...prescription, [field]: "0026-07-26" }).success, false);
      assert.equal(insertMedicalPrescriptionSchema.partial().safeParse({ [field]: "0026-07-26" }).success, false);
      assert.equal(insertMedicalPrescriptionSchema.partial().safeParse({ [field]: "2026-07-26" }).success, true);
    });
  }
  it("accepts historical dates, leap days, future dates and optional blanks in forms", () => {
    for (const value of ["1995-07-26", "2024-02-29", "2029-07-26"]) {
      assert.equal(medicalDateInputSchema.safeParse(value).success, true);
      assert.equal(isValidMedicalDate(new Date(value)), true);
    }
    assert.equal(optionalMedicalDateInputSchema.safeParse("").success, true);
    assert.equal(optionalMedicalDateInputSchema.safeParse(undefined).success, true);
    assert.equal(insertMedicalPrescriptionSchema.safeParse(prescription).success, true);
    assert.equal(formatMedicalDateOnly("2026-07-26T00:00:00.000Z"), "Jul 26, 2026");
  });
});
