import { z } from "zod";

export const courierProviderSchema = z.enum(["uber", "doordash"]);
export type CourierProvider = z.infer<typeof courierProviderSchema>;
export const courierAddressSchema = z.object({
  street: z.string().trim().min(3).max(180),
  unit: z.string().trim().max(60).default(""),
  city: z.string().trim().min(2).max(100),
  state: z.string().regex(/^[A-Z]{2}$/),
  zip: z.string().regex(/^\d{5}(?:-\d{4})?$/),
  country: z.literal("US"),
}).strict();

// Conservative pilot limits, not a statement of either provider's general limits.
// Live eligibility additionally requires approval for the specific account/use case.
export const courierPackageSchema = z.object({
  weightLb: z.number().positive().max(20),
  lengthIn: z.number().positive().max(24),
  widthIn: z.number().positive().max(18),
  heightIn: z.number().positive().max(18),
  safePackagedGoods: z.literal(true),
}).strict();
export const courierRequestSchema = z.object({
  tenantId: z.string().uuid(),
  itemId: z.string().uuid(),
  requestId: z.string().uuid(),
  pickup: courierAddressSchema,
  dropoff: courierAddressSchema,
  pickupPhone: z.string().regex(/^\+1\d{10}$/),
  dropoffPhone: z.string().regex(/^\+1\d{10}$/),
  pickupStartsAt: z.string().datetime(),
  pickupEndsAt: z.string().datetime(),
  dropoffEndsAt: z.string().datetime(),
  itemValueCents: z.number().int().min(100).max(500000),
  category: z.enum(["Home", "Clothing", "Pet supplies", "Other"]),
  package: courierPackageSchema,
}).strict().superRefine((r, ctx) => {
  if (Date.parse(r.pickupEndsAt) - Date.parse(r.pickupStartsAt) < 30 * 60000)
    ctx.addIssue({ code: "custom", message: "Provide a pickup window of at least 30 minutes." });
  if (Date.parse(r.dropoffEndsAt) < Date.parse(r.pickupEndsAt) + 30 * 60000)
    ctx.addIssue({ code: "custom", message: "Allow at least 30 minutes after pickup for delivery." });
  if (r.pickup.state !== r.dropoff.state)
    ctx.addIssue({ code: "custom", message: "Interstate delivery is not available in this pilot." });
});
export type CourierRequest = z.infer<typeof courierRequestSchema>;
export type CourierAddress = z.infer<typeof courierAddressSchema>;

/** Internal provider IDs must not be accepted as buyer-supplied checkout authority. */
export const courierQuoteSchema = z.object({
  provider: courierProviderSchema,
  providerQuoteId: z.string().min(1).max(200),
  feeCents: z.number().int().nonnegative().max(100000),
  currency: z.literal("usd"),
  expiresAt: z.string().datetime(),
  pickupAt: z.string().datetime(),
  dropoffAt: z.string().datetime(),
}).strict();
export type CourierQuote = z.infer<typeof courierQuoteSchema>;

/** Only the percentage fee increment belongs to delivery on a combined charge.
 * The existing sale already carries the fixed processing fee. This is an estimate,
 * not a replacement for actual Stripe balance-transaction reconciliation.
 */
export function courierBuyerPrice(providerFeeCents: number, processingBasisPoints: number) {
  if (!Number.isSafeInteger(providerFeeCents) || providerFeeCents < 0 || providerFeeCents > 100000 ||
      !Number.isSafeInteger(processingBasisPoints) || processingBasisPoints < 0 || processingBasisPoints > 1000)
    throw new Error("Invalid delivery pricing inputs");
  const buyerDeliveryCents = Math.ceil(providerFeeCents * 10000 / (10000 - processingBasisPoints));
  return { providerFeeCents, processingRecoveryCents: buyerDeliveryCents - providerFeeCents, buyerDeliveryCents };
}

export function usableCourierQuote(quote: CourierQuote, request: CourierRequest, now: number) {
  return Date.parse(quote.expiresAt) > now + 30000 &&
    Date.parse(quote.pickupAt) >= Date.parse(request.pickupStartsAt) &&
    Date.parse(quote.pickupAt) <= Date.parse(request.pickupEndsAt) &&
    Date.parse(quote.dropoffAt) >= Date.parse(quote.pickupAt) &&
    Date.parse(quote.dropoffAt) <= Date.parse(request.dropoffEndsAt);
}
