import { test } from "node:test";
import assert from "node:assert/strict";
import { courierBuyerPrice, courierRequestSchema, type CourierQuote, type CourierRequest } from "../shared/resale-courier";
import { compareCourierQuotes, courierRequestFingerprint, uberQuoteSource, doorDashQuoteSource } from "../server/services/resale-courier-quotes";

const now = Date.parse("2026-11-16T12:00:00Z");
const address = { street: "100 Test Street", unit: "", city: "Test City", state: "LA", zip: "70501", country: "US" as const };
const input: CourierRequest = {
  tenantId: "11111111-1111-4111-8111-111111111111", itemId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333", pickup: address, dropoff: { ...address, street: "200 Test Street" },
  pickupPhone: "+15555550101", dropoffPhone: "+15555550102", pickupStartsAt: "2026-11-16T13:00:00Z",
  pickupEndsAt: "2026-11-16T14:00:00Z", dropoffEndsAt: "2026-11-16T15:00:00Z",
  itemValueCents: 2500, category: "Home",
  package: { weightLb: 5, lengthIn: 10, widthIn: 10, heightIn: 10, safePackagedGoods: true },
};
const quote = (provider: "uber" | "doordash", feeCents: number): CourierQuote => ({
  provider, providerQuoteId: "quote", feeCents, currency: "usd", expiresAt: "2026-11-16T12:05:00Z",
  pickupAt: "2026-11-16T13:15:00Z", dropoffAt: "2026-11-16T14:30:00Z",
});
const options = { now: () => now, timeoutMs: 20 };

test("delivery pricing separates pass-through and processing without sale fees", () => {
  assert.deepEqual(courierBuyerPrice(1000, 290), { providerFeeCents: 1000, buyerDeliveryCents: 1030, processingRecoveryCents: 30 });
  for (let fee = 0; fee < 50000; fee += 37) {
    const total = courierBuyerPrice(fee, 290);
    assert.ok(total.buyerDeliveryCents - Math.round(total.buyerDeliveryCents * .029) >= fee);
    assert.equal(total.buyerDeliveryCents, total.providerFeeCents + total.processingRecoveryCents);
  }
  assert.throws(() => courierBuyerPrice(-1, 290));
  assert.throws(() => courierBuyerPrice(1000, 10000));
});
test("package, scope and window validation fail closed", () => {
  assert.equal(courierRequestSchema.safeParse({ ...input, category: "Furniture" }).success, false);
  assert.equal(courierRequestSchema.safeParse({ ...input, package: { ...input.package, weightLb: 100 } }).success, false);
  assert.equal(courierRequestSchema.safeParse({ ...input, dropoff: { ...input.dropoff, state: "TX" } }).success, false);
  assert.equal(courierRequestSchema.safeParse({ ...input, pickupEndsAt: input.pickupStartsAt }).success, false);
});
test("bind quotes to buyer, tenant, address, item value and readiness, not retry ID", () => {
  const key = courierRequestFingerprint(input, input.dropoffPhone);
  assert.equal(key, courierRequestFingerprint({ ...input, requestId: "44444444-4444-4444-8444-444444444444" }, input.dropoffPhone));
  for (const change of [
    { tenantId: "44444444-4444-4444-8444-444444444444" }, { itemValueCents: 4000 },
    { dropoff: { ...input.dropoff, street: "300 Test Street" } }, { pickupStartsAt: "2026-11-16T13:10:00Z" },
  ]) assert.notEqual(key, courierRequestFingerprint({ ...input, ...change }, input.dropoffPhone));
  assert.notEqual(key, courierRequestFingerprint(input, "+15555550103"));
});
test("both quotes sort by total; a timeout never hides the usable provider", async () => {
  const both = await compareCourierQuotes(input, [
    { provider: "uber", quote: async () => quote("uber", 1000) },
    { provider: "doordash", quote: async () => quote("doordash", 900) },
  ], 290, options);
  assert.equal(both.cheapestProvider, "doordash");
  const one = await compareCourierQuotes(input, [
    { provider: "uber", quote: async () => quote("uber", 1000) },
    { provider: "doordash", quote: () => new Promise(() => {}) },
  ], 290, options);
  assert.equal(one.quotes.length, 1);
  assert.deepEqual(one.unavailable, ["doordash"]);
  assert.equal(one.cheapestProvider, "uber");
});
test("expired, foreign currency, wrong-provider and late estimates never become quotes", async () => {
  for (const invalid of [
    { expiresAt: "2026-11-16T12:00:05Z" }, { currency: "cad" }, { provider: "doordash" },
    { dropoffAt: "2026-11-16T16:00:00Z" }, { feeCents: -1 },
  ]) {
    const result = await compareCourierQuotes(input, [
      { provider: "uber", quote: async () => ({ ...quote("uber", 100), ...invalid } as CourierQuote) },
    ], 290, options);
    assert.deepEqual(result.quotes, []);
    assert.equal(result.cheapestProvider, null);
  }
});
test("provider payloads request quotes only and normalize cents and expiration", async () => {
  const calls: { url: string; body: any }[] = [];
  const http = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: init.body instanceof URLSearchParams ? null : JSON.parse(init.body) });
    if (String(url).includes("oauth")) return Response.json({ access_token: "test-token-not-real" });
    if (String(url).includes("uber.com")) return Response.json({
      id: "dqt_test", created: "2026-11-16T12:00:00Z", pickup_duration: 75,
      expires: "2026-11-16T12:15:00Z", fee: 900, currency: "USD", dropoff_eta: "2026-11-16T14:30:00Z",
    });
    return Response.json({
      external_delivery_id: `resale-${input.requestId}`, delivery_status: "quote", fee: 1000, currency: "USD",
      pickup_time_estimated: "2026-11-16T13:15:00Z", dropoff_time_estimated: "2026-11-16T14:30:00Z",
    });
  }) as typeof fetch;
  const result = await compareCourierQuotes(input, [
    uberQuoteSource({ clientId: "test", clientSecret: "test", customerId: "test" }, http),
    doorDashQuoteSource({ developerId: "test", keyId: "test", signingSecret: Buffer.from("test-only").toString("base64") }, http, () => now),
  ], 290, options);
  assert.equal(result.cheapestProvider, "uber");
  assert.equal(result.quotes[1].expiresAt, "2026-11-16T12:05:00.000Z");
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => /oauth\/v2\/token$|delivery_quotes$|drive\/v2\/quotes$/.test(c.url)));
  assert.equal(calls.find(c => c.url.includes("doordash"))!.body.dropoff_contact_send_notifications, false);
  assert.deepEqual(JSON.parse(calls.find(c => c.url.includes("delivery_quotes"))!.body.pickup_address).street_address, [address.street]);
});
test("provider failures do not leak addresses or credentials", async () => {
  const result = await compareCourierQuotes(input, [
    { provider: "uber", quote: async () => { throw new Error("private-address-private-credential"); } },
  ], 290, options);
  assert.doesNotMatch(JSON.stringify(result), /private-address|private-credential/);
});
