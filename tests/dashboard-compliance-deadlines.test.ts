import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDashboardComplianceDeadlines } from "../server/lib/dashboard-compliance-deadlines";
import { latestVaccineExpiries } from "../server/lib/vaccine-renewal-coverage";
import { preventionExpiries, type PreventionEvidence } from "../server/lib/prevention-renewal-coverage";

const now = new Date("2026-10-28T12:00:00Z");
const obligation = { animalId: "animal-a", obligationType: "rabies", status: "pending", contractualDueDate: "2009-08-24" };
const coverage = latestVaccineExpiries([
  { name: "Rabies (3-Year)", administeredAt: "2026-08-24", expiresAt: "2029-08-24" },
  { name: "Rabies (1-Year)", administeredAt: "2026-10-21", expiresAt: "2009-08-24", administeredBy: "Set at adoption" },
], now);
const evidence = new Map([["animal-a", coverage]]);

test("dashboard uses actual renewal date before overdue counts and at-risk grouping", () => {
  const other = { ...obligation, obligationType: "ongoing_treatment", contractualDueDate: "2026-06-12" };
  const rows = resolveDashboardComplianceDeadlines([obligation, other], evidence);
  assert.equal(rows[0].contractualDueDate, "2029-08-24");
  assert.equal(rows[0].status, "pending");
  assert.equal(obligation.contractualDueDate, "2009-08-24", "never mutate signed history");
  const overdue = rows.filter(row => new Date(row.contractualDueDate) < now);
  assert.deepEqual(overdue, [other]);
  assert.equal(overdue.length, 1);
  assert.equal(overdue.length >= 2, false, "no false multi-item at-risk flag");
});

test("scope is animal-specific and preserves other requirements and terminal states", () => {
  const untouched = [
    { ...obligation, animalId: "animal-b" },
    { ...obligation, obligationType: "heartworm_prevention_proof" },
    { ...obligation, obligationType: "dhpp_booster" },
    { ...obligation, obligationType: "custom", label: "Rabies certificate" },
    { ...obligation, status: "completed" },
    { ...obligation, status: "waived" },
    { ...obligation, status: "pending_review" },
    { ...obligation, contractualDueDate: "2030-01-01" },
  ];
  assert.deepEqual(resolveDashboardComplianceDeadlines(untouched, evidence), untouched);
  assert.deepEqual(resolveDashboardComplianceDeadlines([obligation], new Map()), [obligation]);
});

test("expired renewal uses its actual expiration, never resurrects the 2009 deadline", () => {
  const expired = new Map([["animal-a", new Map([["rabies", new Date("2026-10-01")]])]]);
  const [row] = resolveDashboardComplianceDeadlines([obligation], expired);
  assert.equal(row.contractualDueDate, "2026-10-01");
  assert.equal(new Date(row.contractualDueDate) < now, true);
});

test("supported vaccines and exact custom vaccine names use only their matching family", () => {
  const families = new Map([
    ["dhpp", new Date("2027-08-17")], ["fvrcp", new Date("2028-04-01")],
    ["felv", new Date("2027-04-01")], ["bordetella", new Date("2027-02-02")],
    ["lepto", new Date("2027-05-01")], ["lyme", new Date("2027-06-01")],
    ["influenza", new Date("2027-07-01")],
  ]);
  const rows = [
    { ...obligation, obligationType: "dhpp_booster" },
    { ...obligation, obligationType: "fvrcp_booster" },
    ...["FeLV", "Bordetella", "Lepto", "Lyme", "Canine influenza"].map(label => ({ ...obligation, obligationType: "custom", label })),
  ];
  const result = resolveDashboardComplianceDeadlines(rows, new Map([["animal-a", families]]));
  assert.deepEqual(result.map(row => row.contractualDueDate), [...families.values()].map(date => date.toISOString().slice(0, 10)));
  const singleAntigens = latestVaccineExpiries([
    { name: "Distemper", administeredAt: "2026-01-01", expiresAt: "2027-01-01" },
    { name: "Panleukopenia", administeredAt: "2026-01-01", expiresAt: "2027-01-01" },
  ], now);
  assert.deepEqual(resolveDashboardComplianceDeadlines(rows.slice(0, 2), new Map([["animal-a", singleAntigens]])), rows.slice(0, 2));
});

const dose: PreventionEvidence = {
  animalId: "animal-a", dateAdministered: new Date("2026-09-01"),
  nextDueDate: new Date("2026-12-01"), status: "given", administeredBy: "Vet",
  coversHeartworm: true, coversFleaTick: true,
};

test("prevention coverage stays independent across product changes and cannot clear treatment or tests", () => {
  const coverage = preventionExpiries([dose, {
    ...dose, dateAdministered: new Date("2026-10-01"),
    nextDueDate: new Date("2027-04-01"), coversFleaTick: false,
  }], now);
  const rows = [
    { ...obligation, obligationType: "heartworm_prevention_proof" },
    { ...obligation, obligationType: "flea_tick_prevention" },
    { ...obligation, obligationType: "ongoing_treatment", label: "Heartworm Treatment (HW+)" },
    { ...obligation, obligationType: "heartworm_test" },
    { ...obligation, obligationType: "custom", label: "Heartworm test" },
    { ...obligation, obligationType: "custom", label: "Rabies certificate" },
  ];
  const result = resolveDashboardComplianceDeadlines(rows, coverage);
  assert.equal(result[0].contractualDueDate, "2027-04-01");
  assert.equal(result[1].contractualDueDate, "2026-12-01");
  assert.deepEqual(result.slice(2), rows.slice(2));
  assert.ok(result.every(row => row.status === "pending"));
  const fleaOnly = preventionExpiries([{ ...dose, coversHeartworm: false }], now);
  assert.deepEqual(resolveDashboardComplianceDeadlines([rows[0]], fleaOnly), [rows[0]]);
});

test("prevention evidence rejects scheduled, future, placeholder and unknown protection", () => {
  for (const record of [
    { ...dose, status: "pending" }, { ...dose, status: "skipped" },
    { ...dose, dateAdministered: new Date("2027-01-01") },
    { ...dose, administeredBy: "Set at adoption" },
    { ...dose, administeredBy: "Set during backfill import" },
    { ...dose, nextDueDate: null },
    { ...dose, nextDueDate: new Date("2009-01-01") },
    { ...dose, coversHeartworm: false, coversFleaTick: false },
  ]) assert.equal(preventionExpiries([record], now).get("animal-a")?.size || 0, 0);
  const missingExpiry = preventionExpiries([dose, {
    ...dose, dateAdministered: new Date("2026-10-01"), nextDueDate: null,
  }], now);
  assert.equal(missingExpiry.get("animal-a")?.size, 0);
  const expired = preventionExpiries([{ ...dose, nextDueDate: new Date("2026-10-01") }], now);
  assert.equal(expired.get("animal-a")?.get("prevention:heartworm")?.toISOString(), "2026-10-01T00:00:00.000Z");
  const otherAnimal = { ...obligation, animalId: "animal-b", obligationType: "heartworm_prevention_proof" };
  assert.deepEqual(resolveDashboardComplianceDeadlines([otherAnimal], expired), [otherAnimal]);
});
