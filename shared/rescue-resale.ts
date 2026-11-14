import { z } from "zod";

export const resalePickupSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(2).max(100),
  kind: z.enum(["shelter_meetup", "public_meetup"]),
  address: z.string().trim().min(5).max(250),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).refine(p => Date.parse(p.endsAt) > Date.parse(p.startsAt), "Pickup must end after it starts");
export const resaleSettingsSchema = z.object({
  pickupOptions: z.array(resalePickupSchema).max(50),
  allowSplit: z.boolean().optional(),
}).strict();
export const resaleItemSchema = z.object({
  donorName: z.string().trim().min(2).max(100),
  donorEmail: z.string().email().max(200),
  zip: z.string().regex(/^\d{5}$/, "Enter a five-digit ZIP code"),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(15).max(3000),
  category: z.enum(["Home", "Furniture", "Clothing", "Electronics", "Pet supplies", "Other"]),
  askingCents: z.number().int().min(100).max(500000),
  minCents: z.number().int().min(100).max(500000).nullable().default(null),
  photos: z.array(z.string().max(500)).min(1).max(6),
  fulfillment: z.array(z.enum(["shelter_meetup", "public_meetup"])).min(1).max(2),
  consent: z.literal(true),
  ownership: z.literal(true),
  proceedsMode: z.enum(["donate_all", "split_50"]).default("donate_all"),
  splitConsent: z.boolean().default(false),
}).strict().refine(i => i.minCents === null || i.minCents <= i.askingCents, "Minimum cannot exceed asking price")
  .refine(i => i.proceedsMode !== "split_50" || i.splitConsent, "Agree to the 50/50 net-proceeds terms before submitting.");
export type ResaleItemInput = z.infer<typeof resaleItemSchema>;
export type ResalePickup = z.infer<typeof resalePickupSchema>;
export function resalePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  throw new Error("Enter a valid US phone number");
}
/** Conservative filter, not a promise that free text can never reveal identity. */
export function resaleMessageAllowed(body: string): boolean {
  return body.length > 0 && body.length <= 1000 &&
    !/https?:|www\.|[\w.+-]+@[\w.-]+|\+?\d[\d\s().-]{6,}\d|\b\d+\s+\w+(?:\s+\w+){0,3}\s+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd)\b|\b(?:venmo|cash\s?app|paypal|text me|call me)\b/i.test(body);
}
export function resaleCsvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
}
