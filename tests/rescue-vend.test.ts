import { test } from "node:test";
import assert from "node:assert/strict";
import { vendingCart, verifiedVendingSession, VENDING_ITEMS, DEFAULT_VENDING_MENU, vendingMenuSchema, vendingMachineTitle } from "../shared/rescue-vend";
import { StripeService } from "../server/lib/stripe-service";
import { calculateDestinationChargeEconomics } from "../server/config/platform";

const selection = [{ id: "treats", quantity: 2 }, { id: "toy", quantity: 1 }];
const session = {
  metadata: { tenantId: "rescue-a", type: "rescue_vend", vendingCatalogVersion: "1", vendingItems: JSON.stringify(selection) },
  mode: "payment", currency: "usd", amount_total: 1800, payment_status: "paid",
};

test("machine styles preserve legacy menus and use short rescue branding", () => {
  const { machineStyle, shortName, ...legacy } = DEFAULT_VENDING_MENU;
  assert.equal(vendingMenuSchema.parse(legacy).machineStyle, "classic");
  assert.equal(vendingMenuSchema.parse({ ...legacy, machineStyle: "photorealistic" }).machineStyle, "photorealistic");
  assert.equal(vendingMenuSchema.safeParse({ ...legacy, machineStyle: "unknown" }).success, false);
  assert.equal(vendingMenuSchema.safeParse({ ...legacy, shortName: "Three Word Name" }).success, false);
  assert.equal(vendingMachineTitle("Haseya's New Beginning Animal Rescue"), "Haseya's Rescue Vend");
  assert.equal(vendingMachineTitle("Southern Pets Animal Rescue"), "Southern Pets Rescue Vend");
  assert.equal(vendingMachineTitle("Long formal rescue name", "Our Pets"), "Our Pets Rescue Vend");
  assert.equal(vendingMachineTitle(""), "Rescue Vend");
});

test("custom menu validates fixed slots, cent amounts and descriptions", () => {
  assert.ok(vendingMenuSchema.safeParse(DEFAULT_VENDING_MENU).success);
  for (const patch of [{ priceCents: 0 }, { priceCents: 100001 }, { priceCents: 100.5 },
    { name: " " }, { impactNote: "" }, { enabled: "yes" }, { id: "unknown" }]) {
    assert.equal(vendingMenuSchema.safeParse({
      ...DEFAULT_VENDING_MENU, items: DEFAULT_VENDING_MENU.items.map((item, i) => i ? item : { ...item, ...patch }),
    }).success, false);
  }
  assert.equal(vendingMenuSchema.safeParse({ ...DEFAULT_VENDING_MENU, items: Array(8).fill(DEFAULT_VENDING_MENU.items[0]) }).success, false);
});

test("custom menu pricing is authoritative and disabled supplies cannot be selected", () => {
  const menu = structuredClone(DEFAULT_VENDING_MENU);
  menu.version = "custom-v2";
  menu.items[0].priceCents = 1234;
  menu.items[0].name = "Rescue snacks";
  assert.equal(vendingCart({ items: selection }, menu).totalCents, 3268);
  menu.items[0].enabled = false;
  assert.throws(() => vendingCart({ items: selection }, menu));
  menu.items.forEach(item => { item.enabled = false; });
  assert.throws(() => vendingCart({ items: [{ id: "toy", quantity: 1 }] }, menu));
});

test("old sessions retain original names, descriptions and prices after edits", () => {
  const historical = structuredClone(DEFAULT_VENDING_MENU);
  historical.version = "historical-version";
  historical.items[0].name = "Original supply";
  historical.items[0].impactNote = "Original symbolic purpose";
  const paidSession = { ...session, metadata: { ...session.metadata, vendingCatalogVersion: historical.version } };
  const current = structuredClone(historical);
  current.version = "new-version";
  current.items[0].priceCents = 9999;
  current.items[0].enabled = false;
  assert.throws(() => verifiedVendingSession(paidSession, "rescue-a", current));
  assert.throws(() => verifiedVendingSession(paidSession, "rescue-b", historical));
  const receipt = verifiedVendingSession(paidSession, "rescue-a", historical);
  assert.equal(receipt.totalCents, 1800);
  assert.equal(receipt.items[0].name, "Original supply");
  assert.equal(receipt.items[0].impactNote, "Original symbolic purpose");
  assert.equal(verifiedVendingSession(session, "rescue-a").totalCents, 1800);
});

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
