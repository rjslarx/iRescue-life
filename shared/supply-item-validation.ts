import { z } from "zod";

// Forms submit optional price inputs as "". Persist NULL, not an invalid numeric
// string; on PATCH this also lets staff clear a previously entered price.
export const supplyItemUnitPriceSchema = z.preprocess(
  value => typeof value === "string"
    ? (value.trim() === "" ? null : value.trim())
    : value,
  z.string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a price such as 12.50, or leave it blank")
    .nullable()
    .optional(),
);
