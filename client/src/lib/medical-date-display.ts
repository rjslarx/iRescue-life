import { format } from "date-fns";
import { isValidMedicalDate, medicalDateInput } from "@shared/medical-dates";

export function formatMedicalDate(value: unknown, pattern = "MMM d, yyyy"): string {
  if (!isValidMedicalDate(value)) return "Invalid date — please correct";
  return format(new Date(value as string | Date), pattern);
}

export function formatMedicalDateOnly(value: unknown, pattern = "MMM d, yyyy"): string {
  const day = medicalDateInput(value);
  if (!day) return "Invalid date — please correct";
  return format(new Date(`${day}T12:00:00`), pattern);
}
