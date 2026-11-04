import { z } from "zod";

// Broad enough for historical animal records, but catches truncated/extra-digit years.
export const MEDICAL_DATE_ERROR = "Enter a valid medical date with a four-digit year between 1900 and 2100.";

export function isValidMedicalDate(value: unknown): boolean {
  if (!(value instanceof Date) && typeof value !== "string") return false;
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 2100) return false;
  // Reject dates JavaScript silently normalizes, e.g. February 30.
  if (typeof value === "string") {
    const day = value.slice(0, 10);
    const parsedDay = new Date(`${day}T12:00:00Z`);
    if (!Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) return false;
  }
  return true;
}

export const medicalDateSchema = z.unknown()
  .refine(isValidMedicalDate, MEDICAL_DATE_ERROR)
  .transform(value => new Date(value as string | Date));

export const medicalDateInputSchema = z.string().refine(isValidMedicalDate, MEDICAL_DATE_ERROR);
export const optionalMedicalDateInputSchema = z.union([z.literal(""), medicalDateInputSchema]).optional();

export function medicalDateInput(value: unknown): string {
  return isValidMedicalDate(value) ? new Date(value as string | Date).toISOString().slice(0, 10) : "";
}
