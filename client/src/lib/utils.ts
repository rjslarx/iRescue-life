import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns today's date as YYYY-MM-DD in the USER'S LOCAL timezone.
 *
 * Never use `new Date().toISOString().split('T')[0]` for "today" defaults in
 * date inputs: toISOString() is UTC, so in the evening (US timezones) it
 * returns TOMORROW's date — staff entering vaccines at night saw dates shift
 * forward by one day.
 */
export function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
