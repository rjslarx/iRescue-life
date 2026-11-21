import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFundraiserNumbers } from "../client/src/lib/fundraiser-form";

test("blank inventory remains unlimited", () => {
  for (const inventory of ["", "   "]) {
    assert.deepEqual(validateFundraiserNumbers("12.34", inventory), { success: true, priceCents: 1234, inventoryCap: null });
  }
});

test("inventory rejects fractions, negatives, zero, overflow and partial numbers", () => {
  for (const inventory of ["1.5", "0.5", "-1", "0", "2147483648", "999999999999999999999999", "Infinity", "NaN", "2items", "1e3"]) {
    const result = validateFundraiserNumbers("1", inventory);
    assert.equal(result.success, false, inventory);
    if (!result.success) {
      assert.match(result.errors.inventoryCapStr!, /Inventory cap.*whole number/);
      assert.equal(result.errors.priceStr, undefined);
    }
  }
});

test("valid values include both integer bounds and exact cent conversions", () => {
  assert.deepEqual(validateFundraiserNumbers("0.01", "1"), { success: true, priceCents: 1, inventoryCap: 1 });
  assert.deepEqual(validateFundraiserNumbers("21474836.47", "2147483647"), { success: true, priceCents: 2147483647, inventoryCap: 2147483647 });
  assert.deepEqual(validateFundraiserNumbers("1.13", " 20 "), { success: true, priceCents: 113, inventoryCap: 20 });
});

test("price rejects blank, negative, sub-cent, overflow and malformed values", () => {
  for (const price of ["", " ", "0", "-1", "1.001", "0.001", "21474836.48", "99999999999999999999999", "Infinity", "NaN", "12dollars", "1e2"]) {
    const result = validateFundraiserNumbers(price, "");
    assert.equal(result.success, false, price);
    if (!result.success) {
      assert.match(result.errors.priceStr!, /Price per item/);
      assert.equal(result.errors.inventoryCapStr, undefined);
    }
  }
});

test("both invalid fields have their own message", () => {
  const result = validateFundraiserNumbers("-1", "2.5");
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(Object.keys(result.errors), ["priceStr", "inventoryCapStr"]);
});

test("create and edit share validation before mutations without resetting input", () => {
  const page = readFileSync("client/src/pages/FundraisersPage.tsx", "utf8");
  const save = page.slice(page.indexOf("  function handleSave()"), page.indexOf("  function copyPublicLink"));
  assert.match(save, /validateFundraiserNumbers\(form.priceStr, form.inventoryCapStr\)/);
  assert.match(save, /if \(!numbers.success\)[\s\S]*?return;/);
  assert.ok(save.indexOf("if (!numbers.success)") < save.indexOf("updateMutation.mutate"));
  assert.ok(save.indexOf("if (!numbers.success)") < save.indexOf("createMutation.mutate"));
  assert.doesNotMatch(save, /setForm|setDialogOpen|parseInt|parseFloat/);
  for (const id of ["event-price-error", "event-cap-error"]) assert.ok(page.includes(`id="${id}" role="alert"`));
});
