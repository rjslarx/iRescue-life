import { test } from "node:test";
import assert from "node:assert/strict";
import { currentRabiesExpiry, rabiesReminderCovered } from "../server/lib/current-rabies-coverage";

const now = new Date("2026-10-28T12:00:00Z");
const valid = { name: "Rabies (3-Year)", administeredAt: "2026-08-24", expiresAt: "2029-08-24" };

test("Leslie: valid vaccination overrides erroneous adoption reminder, not unrelated care", () => {
  const expiry = currentRabiesExpiry([
    valid, valid,
    { name: "Rabies (1-Year)", administeredAt: "2026-10-21", expiresAt: "2009-08-24", administeredBy: "Set at adoption" },
  ], now);
  assert.equal(expiry?.toISOString(), "2029-08-24T00:00:00.000Z");
  assert.equal(rabiesReminderCovered("rabies", "2009-08-24", expiry), true);
  assert.equal(rabiesReminderCovered("Rabies (1-Year)", "2009-08-24", expiry), true);
  assert.equal(rabiesReminderCovered("dhpp_booster", "2027-08-17", expiry), false);
  assert.equal(rabiesReminderCovered("heartworm_prevention_proof", "2026-11-11", expiry), false);
  assert.equal(rabiesReminderCovered("rabies", "2029-08-24", expiry), false);
});

test("expired, future, invalid and placeholder records do not establish coverage", () => {
  for (const record of [
    { ...valid, administeredAt: "2030-01-01", expiresAt: "2033-01-01" },
    { ...valid, expiresAt: "2009-08-24" },
    { ...valid, expiresAt: null },
    { ...valid, administeredBy: "Set at adoption" },
    { ...valid, administeredAt: "bad" },
    { ...valid, name: "DHPP" },
    { ...valid, administeredAt: "2020-01-01", expiresAt: "2023-01-01" },
  ]) assert.equal(currentRabiesExpiry([record], now), null);
  assert.equal(rabiesReminderCovered("rabies", "2009-08-24", null), false);
});

test("latest actual vaccination wins instead of choosing longest historical expiration", () => {
  assert.equal(currentRabiesExpiry([
    valid, { ...valid, administeredAt: "2026-09-01", expiresAt: "2027-09-01" },
  ], now)?.toISOString(), "2027-09-01T00:00:00.000Z");
});
