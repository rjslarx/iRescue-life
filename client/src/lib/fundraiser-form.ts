export const FUNDRAISER_MAX_INTEGER = 2147483647;

type NumericErrors = { priceStr?: string; inventoryCapStr?: string };
type NumericResult =
  | { success: false; errors: NumericErrors }
  | { success: true; priceCents: number; inventoryCap: number | null };

export function validateFundraiserNumbers(priceInput: string, inventoryInput: string): NumericResult {
  const errors: NumericErrors = {};
  const price = priceInput.trim();
  const inventory = inventoryInput.trim();
  const priceCents = Math.round(Number(price) * 100);
  // Validate the complete dollar amount, not a parseFloat prefix or rounded fraction of a cent.
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(price) ||
      !Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > FUNDRAISER_MAX_INTEGER) {
    errors.priceStr = "Price per item must be between $0.01 and $21,474,836.47, with no more than two decimal places.";
  }
  const inventoryCap = inventory === "" ? null : Number(inventory);
  if (inventoryCap !== null && (!/^\d+$/.test(inventory) ||
      !Number.isSafeInteger(inventoryCap) || inventoryCap < 1 || inventoryCap > FUNDRAISER_MAX_INTEGER)) {
    errors.inventoryCapStr = "Inventory cap must be a whole number from 1 to 2,147,483,647, or left blank for unlimited.";
  }
  return Object.keys(errors).length ? { success: false, errors } : { success: true, priceCents, inventoryCap };
}
