import { z } from "zod";

// Stable tenant IDs, not editable names/slugs. This is intentionally not a
// platform-wide entitlement or a payment/fundraising feature.
export const FREE_SQUARES_TENANTS = [
  "3a4c2321-6a54-41a4-acf3-a7f2ffe0c051",
  "87f318e1-ffe9-4cc1-9911-633336446f1f",
] as const;
export function hasFreeSquaresAccess(tenantId?: string | null) {
  return FREE_SQUARES_TENANTS.some(id => id === tenantId);
}
export const SQUARE_SMS_CONSENT = "I agree to receive texts from this rescue about my square reservation and event updates. Consent is optional and is not required to reserve. Message and data rates may apply. Message frequency varies. Reply STOP to unsubscribe.";
export const DEFAULT_SQUARE_EMAIL_SUBJECT = "Your squares for {event}";
export const DEFAULT_SQUARE_MESSAGE = "Hi {name}, your squares for {event} are {squares}. Thank you for joining us!";
export function renderSquareMessage(template: string, data: { name: string; event: string; squares: number[] }) {
  const replacements: Record<string, string> = {
    name: data.name, event: data.event, squares: data.squares.map(n => `#${n}`).join(", "),
  };
  return template.replace(/\{(name|event|squares)\}/g, (_, key: string) => replacements[key]);
}
const shortText = (max: number) => z.string().trim().min(1).max(max);
export const freeSquareBoardSchema = z.object({
  title: shortText(120),
  description: z.string().trim().max(2000).default(""),
  status: z.enum(["draft", "open", "closed", "archived"]).default("draft"),
  home_team: shortText(80).default("Home"),
  away_team: shortText(80).default("Away"),
  home_score: z.number().int().min(0).max(999).nullable().default(null),
  away_score: z.number().int().min(0).max(999).nullable().default(null),
  email_subject: shortText(200).default(DEFAULT_SQUARE_EMAIL_SUBJECT),
  email_template: shortText(5000).default(DEFAULT_SQUARE_MESSAGE),
  sms_template: shortText(1000).default(DEFAULT_SQUARE_MESSAGE),
}).strict();
export const freeSquareReservationSchema = z.object({
  requestKey: z.string().uuid(),
  name: shortText(100),
  displayName: z.string().trim().min(1, "Enter a display name").max(30, "Display name must be 30 characters or fewer")
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Display name must be a single line"),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  phone: z.string().trim().max(32).optional(),
  smsConsent: z.boolean().default(false),
  squares: z.array(z.number().int().min(1).max(100)).min(1).max(10)
    .refine(values => new Set(values).size === values.length, "Choose distinct squares"),
}).strict().refine(v => !!v.email || !!v.phone, "Provide an email address or phone number")
  .refine(v => !v.smsConsent || !!v.phone, "A phone number is required for text consent");
export const freeSquareMessageSchema = z.object({
  requestKey: z.string().uuid(),
  channel: z.enum(["email", "sms"]),
  subject: z.string().trim().max(200).optional(),
  body: shortText(5000),
}).strict().refine(v => v.channel !== "sms" || v.body.length <= 1000, "Texts must be 1,000 characters or fewer")
  .refine(v => v.channel !== "email" || !!v.subject, "An email subject is required");

export type FreeSquareBoard = z.infer<typeof freeSquareBoardSchema> & {
  id: string; tenant_id: string; created_at: string; reservation_count?: number; claimed_count?: number;
  row_digits: number[] | null; column_digits: number[] | null; digits_assigned_at: string | null;
};
export type FreeSquareReservation = {
  id: string; name: string; display_name: string | null; email: string | null; phone: string | null;
  sms_consent_at: string | null; sms_revoked_at: string | null; email_revoked_at: string | null; squares: number[];
  cancelled_at: string | null; created_at: string;
};
export type FreeSquareMessage = {
  id: string; reservation_id: string; channel: "email" | "sms"; subject: string | null;
  body: string; status: "sending" | "accepted" | "failed" | "unknown";
  error: string | null; created_at: string;
};
