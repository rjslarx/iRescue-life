import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeSurgeryDayRequest } from "../shared/surgery-day-request-kind";

test("Haseyas feral cats need no organization and never link to a partner", () => {
  assert.deepEqual(normalizeSurgeryDayRequest({
    feralCats: true, contactEmail: "applicant@example.org", animals: [{ species: "cat" }], partnerOrganizationId: "stale-selection",
  }, "haseyas"), {
    feralCats: true, contactEmail: "applicant@example.org", animals: [{ species: "cat" }],
    partnerOrganizationId: null, organizationName: "Feral cats",
  });
});

test("ordinary organization requests remain unchanged", () => {
  const input = { organizationName: "", animals: [{ species: "dog" }] };
  assert.equal(normalizeSurgeryDayRequest(input, "haseyas"), input);
  assert.equal(normalizeSurgeryDayRequest(input, "southernpets"), input);
});

test("feral requests reject other tenants, noncats, empty lists, and invalid flags", () => {
  assert.throws(() => normalizeSurgeryDayRequest({ feralCats: true, animals: [{ species: "cat" }] }, "other"));
  assert.throws(() => normalizeSurgeryDayRequest({ feralCats: true, animals: [{ species: "dog" }] }, "haseyas"));
  assert.throws(() => normalizeSurgeryDayRequest({ feralCats: true, animals: [] }, "haseyas"));
  assert.throws(() => normalizeSurgeryDayRequest({ feralCats: "true" }, "haseyas"));
});

test("feral requests require a valid email address", () => {
  for (const contactEmail of [undefined, null, "", "   ", "not-an-email"]) {
    assert.throws(() => normalizeSurgeryDayRequest({
      feralCats: true, contactEmail, animals: [{ species: "cat" }],
    }, "haseyas"));
  }
  assert.doesNotThrow(() => normalizeSurgeryDayRequest({
    feralCats: true, contactEmail: "applicant@example.org", animals: [{ species: "cat" }],
  }, "haseyas"));
});
