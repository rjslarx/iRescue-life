import { test } from "node:test";
import assert from "node:assert/strict";
import { vendingCart, verifiedVendingSession, VENDING_ITEMS } from "../shared/rescue-vend";
import { StripeService } from "../server/lib/stripe-service";
import { calculateDestinationChargeEconomics } from "../server/config/platform";

const selection = [{ id: "treats", quantity: 2 }, { id: "toy", quantity: 1 }];
const session = {
  metadata: { tenantId: "rescue-a", type: "rescue_vend", vendingCatalogVersion: "1", vendingItems: JSON.stringify(selection) },
  mode: "payment", currency: "usd", amount_total: 1800, payment_status: "paid",
};

test("vending totals use the server catalog and integer cents", () => {
  assert.equal(vendingCart({ items: selection }).totalCents, 1800);
  assert.equal(VENDING_ITEMS.length, 8);
  assert.equal(new Set(VENDING_ITEMS.map(item => item.id)).size, 8);
  assert.equal(VENDING_ITEMS.find(item => item.id === "heartworm")?.name, "Heartworm Prevention");
});

test("reject invalid, oversized, duplicate and tampered carts", () => {
  for (const items of [
    [], [{ id: "missing", quantity: 1 }], [{ id: "treats", quantity: -1 }],
    [{ id: "treats", quantity: 0 }], [{ id: "treats", quantity: 1.1 }],
    [{ id: "treats", quantity: "1" }], [{ id: "treats", quantity: 11 }],
    [{ id: "treats", quantity: 1, priceCents: 1 }],
    [{ id: "treats", quantity: 1 }, { id: "treats", quantity: 1 }],
    [{ id: "treats", quantity: 10 }, { id: "toy", quantity: 10 }, { id: "hay", quantity: 1 }],
  ]) assert.throws(() => vendingCart({ items }));
  assert.throws(() => vendingCart({ items: selection, totalCents: 1 }));
  assert.throws(() => vendingCart({ items: selection, donorCoversFees: true }));
});

test("payment confirmation is tenant scoped, amount checked and server paid only", () => {
  const paid = verifiedVendingSession(session, "rescue-a");
  assert.equal(paid.status, "paid");
  assert.equal(paid.totalCents, 1800);
  assert.equal(verifiedVendingSession({ ...session, payment_status: "unpaid" }, "rescue-a").status, "pending");
  assert.equal(verifiedVendingSession({ ...session, payment_status: "no_payment_required" }, "rescue-a").status, "pending");
  assert.throws(() => verifiedVendingSession(session, "rescue-b"));
  for (const change of [
    { metadata: null }, { amount_total: 1 }, { currency: "eur" }, { mode: "subscription" },
    { metadata: { ...session.metadata, type: "donation" } },
    { metadata: { ...session.metadata, vendingCatalogVersion: "2" } },
    { metadata: { ...session.metadata, vendingItems: "invalid" } },
  ]) assert.throws(() => verifiedVendingSession({ ...session, ...change }, "rescue-a"));
  assert.deepEqual(Object.keys(paid).sort(), ["items", "status", "totalCents"]);
});

test("Stripe charges exactly the selection total and deducts fees within it", async () => {
  const calls: any[] = [];
  class FakeService extends StripeService {
    getPlatformStripeClient(): any {
      return { checkout: { sessions: { create: async (params: any, options: any) => {
        calls.push({ params, options });
        return { url: "https://checkout.stripe.com/test" };
      } } } };
    }
  }
  for (const fee of [0, 36]) {
    const total = vendingCart({ items: selection }).totalCents;
    await new FakeService().createCheckoutSession({ id: "rescue-a", name: "Rescue A" } as any, {
      amount: total, currency: "usd", isRecurring: false, forceCardOnly: true,
      connectedAccountId: "acct_rescue", platformFeeAmount: fee,
      successUrl: "https://example.org/rescue-vend?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://example.org/rescue-vend?cancelled=1",
      idempotencyKey: "test-vend-key", metadata: session.metadata,
    });
    const call = calls.at(-1);
    const economics = calculateDestinationChargeEconomics(total, fee);
    assert.equal(call.params.line_items.length, 1);
    assert.equal(call.params.line_items[0].price_data.unit_amount, 1800);
    assert.deepEqual(call.params.payment_intent_data.transfer_data, { destination: "acct_rescue" });
    assert.equal(call.params.payment_intent_data.application_fee_amount, economics.applicationFeeTotalCents);
    assert.equal(total - economics.applicationFeeTotalCents, economics.rescueProceedsCents);
    assert.deepEqual(call.params.payment_method_types, ["card"]);
    assert.equal(call.options.idempotencyKey, "test-vend-key");
    assert.equal(call.params.metadata.tenantId, "rescue-a");
  }
});
