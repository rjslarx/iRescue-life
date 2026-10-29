import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDashboardComplianceDeadlines } from "../server/lib/dashboard-compliance-deadlines";
import { latestVaccineExpiries } from "../server/lib/vaccine-renewal-coverage";

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
