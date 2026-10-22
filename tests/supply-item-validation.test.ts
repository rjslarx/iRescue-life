import assert from "node:assert/strict";
import { test } from "node:test";
import { insertSupplyItemSchema } from "../shared/schema";
import { supplyItemUnitPriceSchema } from "../shared/supply-item-validation";
import { z } from "zod";

test("create wishlist items with retailer URLs and no price", () => {
  for (const unitPrice of ["", "   ", null, undefined]) {
    const parsed = insertSupplyItemSchema.parse({
      title: "Wishlist supplies",
      quantityNeeded: 1,
      unitPrice,
      amazonUrl: "https://www.amazon.com/hz/wishlist/ls/example",
      chewyUrl: "https://www.chewy.com/g/example",
    });
    assert.equal(parsed.unitPrice, unitPrice === undefined ? undefined : null);
    assert.ok(parsed.amazonUrl);
    assert.ok(parsed.chewyUrl);
  }
});

test("price edits distinguish clearing a value from leaving it unchanged", () => {
  const patch = z.object({ unitPrice: supplyItemUnitPriceSchema });
  assert.deepEqual(patch.parse({}), {});
  assert.deepEqual(patch.parse({ unitPrice: "" }), { unitPrice: null });
  assert.deepEqual(patch.parse({ unitPrice: null }), { unitPrice: null });
  assert.deepEqual(patch.parse({ unitPrice: " 12.50 " }), { unitPrice: "12.50" });
});

test("valid prices remain valid and malformed prices still fail", () => {
  for (const value of ["0", "0.00", "12", "12.5", "12.50"]) {
    assert.equal(supplyItemUnitPriceSchema.parse(value), value);
  }
  for (const value of ["-1", "$12.50", "12.345", "abc", 12, false]) {
    assert.equal(supplyItemUnitPriceSchema.safeParse(value).success, false);
  }
});
