import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import {
  courierRequestSchema, courierQuoteSchema, usableCourierQuote, courierBuyerPrice,
  type CourierRequest, type CourierAddress, type CourierProvider, type CourierQuote,
} from "@shared/resale-courier";

type Http = typeof fetch;
type Clock = () => number;
export interface CourierQuoteSource {
  provider: CourierProvider;
  quote(request: CourierRequest, signal: AbortSignal): Promise<CourierQuote>;
}

// Quotes only: this module has no create/accept/cancel delivery operations.
// Do not log bodies, provider responses or authorization errors: they contain PII.
async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Courier quote request failed (${response.status}).`);
  return response.json();
}
const uberAddress = (a: CourierAddress) => JSON.stringify({
  street_address: [a.street, ...(a.unit ? [a.unit] : [])], city: a.city, state: a.state,
  zip_code: a.zip, country: a.country,
});
const doorDashAddress = (a: CourierAddress) => [a.street, a.unit, a.city, a.state, a.zip, a.country].filter(Boolean).join(", ");

export function uberQuoteSource(
  credentials: { clientId: string; clientSecret: string; customerId: string },
  http: Http = fetch,
): CourierQuoteSource {
  return {
    provider: "uber",
    async quote(request, signal) {
      const token = z.object({ access_token: z.string().min(1) }).parse(await json(await http("https://auth.uber.com/oauth/v2/token", {
        method: "POST", signal, redirect: "error",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret,
          grant_type: "client_credentials", scope: "eats.deliveries" }),
      })));
      const raw = await json(await http(`https://api.uber.com/v1/customers/${encodeURIComponent(credentials.customerId)}/delivery_quotes`, {
        method: "POST", signal, redirect: "error",
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_address: uberAddress(request.pickup), dropoff_address: uberAddress(request.dropoff),
          pickup_phone_number: request.pickupPhone, dropoff_phone_number: request.dropoffPhone,
          pickup_ready_dt: request.pickupStartsAt, pickup_deadline_dt: request.pickupEndsAt,
          dropoff_ready_dt: request.pickupStartsAt, dropoff_deadline_dt: request.dropoffEndsAt,
          manifest_total_value: request.itemValueCents,
        }),
      }));
      const quote = z.object({
        id: z.string(), fee: z.number(), currency: z.string(),
        created: z.string().datetime(), expires: z.string().datetime(),
        pickup_duration: z.number().nonnegative(), dropoff_eta: z.string().datetime(),
      }).parse(raw);
      return courierQuoteSchema.parse({
        provider: "uber", providerQuoteId: quote.id, feeCents: quote.fee,
        currency: quote.currency.toLowerCase(), expiresAt: quote.expires,
        pickupAt: new Date(Date.parse(quote.created) + quote.pickup_duration * 60000).toISOString(),
        dropoffAt: quote.dropoff_eta,
      });
    },
  };
}

export function doorDashQuoteSource(
  credentials: { developerId: string; keyId: string; signingSecret: string },
  http: Http = fetch, now: Clock = Date.now,
): CourierQuoteSource {
  return {
    provider: "doordash",
    async quote(request, signal) {
      const started = now();
      const issued = Math.floor(started / 1000);
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const unsigned = `${encode({ alg: "HS256", typ: "JWT", "dd-ver": "DD-JWT-V1" })}.${encode({
        aud: "doordash", iss: credentials.developerId, kid: credentials.keyId, iat: issued, exp: issued + 300,
      })}`;
      const signature = createHmac("sha256", Buffer.from(credentials.signingSecret, "base64url")).update(unsigned).digest("base64url");
      const externalId = `resale-${request.requestId}`;
      const raw = await json(await http("https://openapi.doordash.com/drive/v2/quotes", {
        method: "POST", signal, redirect: "error",
        headers: { Authorization: `Bearer ${unsigned}.${signature}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          external_delivery_id: externalId, locale: "en-US",
          pickup_address: doorDashAddress(request.pickup), dropoff_address: doorDashAddress(request.dropoff),
          pickup_phone_number: request.pickupPhone, dropoff_phone_number: request.dropoffPhone,
          pickup_window: { start_time: request.pickupStartsAt, end_time: request.pickupEndsAt },
          dropoff_window: { start_time: request.pickupStartsAt, end_time: request.dropoffEndsAt },
          order_value: request.itemValueCents, tip: 0,
          dropoff_contact_send_notifications: false, action_if_undeliverable: "return_to_pickup",
          contactless_dropoff: false,
        }),
      }));
      const quote = z.object({
        external_delivery_id: z.literal(externalId), delivery_status: z.literal("quote"),
        fee: z.number(), currency: z.string(),
        pickup_time_estimated: z.string().datetime(), dropoff_time_estimated: z.string().datetime(),
      }).parse(raw);
      return courierQuoteSchema.parse({
        provider: "doordash", providerQuoteId: externalId, feeCents: quote.fee,
        currency: quote.currency.toLowerCase(), expiresAt: new Date(started + 5 * 60000).toISOString(),
        pickupAt: quote.pickup_time_estimated, dropoffAt: quote.dropoff_time_estimated,
      });
    },
  };
}

/** Bind server-side quote persistence to owner, route, package, value and readiness.
 * This hash is not authorization: persisted rows still require tenant/phone checks.
 */
export function courierRequestFingerprint(request: CourierRequest, buyerPhone: string) {
  const { requestId: _, ...binding } = courierRequestSchema.parse(request);
  return createHash("sha256").update(JSON.stringify({ buyerPhone, ...binding })).digest("hex");
}

export async function compareCourierQuotes(
  input: unknown, sources: CourierQuoteSource[], processingBasisPoints: number,
  options: { now?: Clock; timeoutMs?: number } = {},
) {
  const request = courierRequestSchema.parse(input);
  const now = options.now ?? Date.now;
  courierBuyerPrice(0, processingBasisPoints);
  if (Date.parse(request.pickupStartsAt) < now() + 35 * 60000 || Date.parse(request.pickupStartsAt) > now() + 29 * 86400000)
    throw new Error("Choose pickup between 35 minutes and 29 days from now.");
  if (new Set(sources.map(s => s.provider)).size !== sources.length) throw new Error("Duplicate courier provider");
  const results = await Promise.all(sources.map(async source => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Courier timeout")); }, options.timeoutMs ?? 10000);
      });
      const quote = courierQuoteSchema.parse(await Promise.race([source.quote(request, controller.signal), timeout]));
      if (quote.provider !== source.provider || !usableCourierQuote(quote, request, now())) throw new Error("Quote not eligible");
      return { provider: source.provider, quote: { ...quote, ...courierBuyerPrice(quote.feeCents, processingBasisPoints) } };
    } catch {
      // Do not expose raw third-party errors (which can echo addresses/credentials).
      return { provider: source.provider, quote: null };
    } finally { if (timer) clearTimeout(timer); }
  }));
  const quotes = results.flatMap(r => r.quote ? [r.quote] : [])
    .sort((a, b) => a.buyerDeliveryCents - b.buyerDeliveryCents || Date.parse(a.dropoffAt) - Date.parse(b.dropoffAt));
  return { quotes, unavailable: results.filter(r => !r.quote).map(r => r.provider),
    cheapestProvider: quotes[0]?.provider ?? null };
}
