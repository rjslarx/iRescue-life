import test from "node:test";
import assert from "node:assert/strict";
import { wildHorseFields, usesWildHorseApplication, validateWildHorseResponses } from "../shared/wild-horse-application";

test("wild form is specific to Haseyas wild horses", () => {
  assert.equal(usesWildHorseApplication("haseyas", {species:"Horse", horseType:"wild"}), true);
  for (const [tenant, species, horseType] of [["southernpets","Horse","wild"],["haseyas","Dog","wild"],["haseyas","Horse","domesticated"],["haseyas","Horse",undefined]]) {
    assert.equal(usesWildHorseApplication(tenant!, {species,horseType}), false);
  }
});
test("required screening, acknowledgments, choice types and dates are enforced", () => {
  const responses: Record<string, unknown> = {};
  for (const field of wildHorseFields("test")) responses[field.id] = field.fieldType === "checkbox" ? [field.options![0]] : field.options?.[0] || "Applicant response";
  responses.wild_horse_v1_date = "2026-11-18";
  assert.deepEqual(validateWildHorseResponses(responses), []);
  for (const key of ["scenario_gate","signature","ack_screening"]) {
    assert.ok(validateWildHorseResponses({...responses,[`wild_horse_v1_${key}`]:""}).length);
  }
  assert.ok(validateWildHorseResponses({...responses,wild_horse_v1_ack_screening:true}).length);
  assert.ok(validateWildHorseResponses({...responses,wild_horse_v1_date:"2026-02-30"}).length);
  assert.ok(validateWildHorseResponses({...responses,wild_horse_v1_capacity:"Other",wild_horse_v1_capacity_other:""}).length);
  assert.ok(validateWildHorseResponses({...responses,wild_horse_v1_property_status:"Boarding arrangement",wild_horse_v1_boarding:""}).length);
  assert.equal(new Set(wildHorseFields("").map(f=>f.id)).size, wildHorseFields("").length);
});
