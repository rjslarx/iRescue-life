import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptionContractForSpecies } from "../shared/adoption-contract-species";

const tenant = "87f318e1-ffe9-4cc1-9911-633336446f1f";
const template = `<ol><li><strong>Medical Care:</strong> Keep veterinary appointments.
<ul><li>Rabies vaccine due by: <strong>{{rabies_due_date}}</strong></li>
<li>DHPP vaccine due by: <strong><u>{{dhpp_due_date}}</u></strong></li>
<li>Heartworm prevention: {{heartworm_due_date}}</li></ul></li>
<li>Return policy: contact the rescue.</li></ol>`;

test("Southern Pets cat contract omits only the DHPP deadline, preserving surrounding clauses", () => {
  const result = adoptionContractForSpecies(template, tenant, "Cat");
  assert.ok(!result.includes("DHPP"));
  assert.ok(!result.includes("dhpp_due_date"));
  assert.ok(result.includes("Medical Care:"));
  assert.ok(result.includes("{{rabies_due_date}}"));
  assert.ok(result.includes("{{heartworm_due_date}}"));
  assert.ok(result.includes("Return policy:"));
  assert.equal((result.match(/<li>/g) || []).length, 4);
  assert.equal(adoptionContractForSpecies(result, tenant, "cat"), result);
});

test("dogs, unknown species, and other tenants are unchanged byte-for-byte", () => {
  for (const species of ["Dog", null, "", "rabbit"]) {
    assert.equal(adoptionContractForSpecies(template, tenant, species), template);
  }
  assert.equal(adoptionContractForSpecies(template, "another-tenant", "cat"), template);
});

test("cat normalization and formatted lowercase DHPP text are supported", () => {
  assert.equal(adoptionContractForSpecies('<li class="due"><b>dhpp</b> due {{dhpp_due_date}}</li>', tenant, " FELINE "), "");
});
