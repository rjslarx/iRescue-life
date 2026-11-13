import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateVendingCents, createVendingResults, isTenantVendingCharge } from "../shared/rescue-vend-report";
import { collectStripeEconomicsReport } from "../server/lib/stripe-economics-report";

const metadata = {
  tenantId: "rescue-a", type: "rescue_vend", vendingCatalogVersion: "1",
  vendingItems: JSON.stringify([{ id: "treats", quantity: 2 }, { id: "toy", quantity: 1 }]),
  economicsVersion: "1", iRescueRevenueCents: "36", processingRecoveryCents: "82",
};
const money = {
  grossCents: 1800, refundCents: 900, netGiftCents: 900,
  platformRevenueCents: 36, processingRecoveryCents: 82, rescueProceedsCents: 782,
};

test("only successful USD vending charges for this tenant qualify", () => {
  const paid = { paid: true, captured: true, status: "succeeded", currency: "usd", metadata };
  assert.equal(isTenantVendingCharge(paid, "rescue-a"), true);
  for (const changes of [
    { paid: false }, { captured: false }, { status: "pending" }, { currency: "eur" }, { metadata: null },
    { metadata: { ...metadata, type: "donation" } },
    { metadata: { ...metadata, tenantId: "rescue-b" } },
  ]) assert.equal(isTenantVendingCharge({ ...paid, ...changes }, "rescue-a"), false);
  assert.equal(isTenantVendingCharge({ metadata }, "rescue-a"), false);
});

test("mixed carts preserve cents, quantities, distinct gifts and refund-adjusted rank", () => {
  const report = createVendingResults(30);
  report.add("ch_1", metadata, money);
  report.add("ch_1", metadata, money);
  const result = report.finish();
  assert.equal(result.chargeCount, 1);
  assert.equal(result.items[0].id, "treats");
  assert.equal(result.items[0].quantity, 2);
  assert.deepEqual(result.totals, money);
  for (const key of Object.keys(money) as (keyof typeof money)[]) {
    assert.equal(result.items.reduce((sum, item) => sum + item[key]!, 0), money[key]);
  }
  assert.deepEqual(allocateVendingCents(-7, [1, 1, 1]), [-3, -2, -2]);
});

test("unknown catalog, bad metadata and mismatched totals retain unattributed gifts", () => {
  for (const changes of [
    { vendingCatalogVersion: "unknown" }, { vendingItems: "bad json" },
    { vendingItems: JSON.stringify([{ id: "treats", quantity: 1 }]) },
  ]) {
    const report = createVendingResults(30);
    report.add("ch_1", { ...metadata, ...changes }, { ...money, platformRevenueCents: null, rescueProceedsCents: null });
    const result = report.finish();
    assert.equal(result.unattributedChargeCount, 1);
    assert.equal(result.items[0].id, "unattributed");
    assert.equal(result.items[0].quantity, null);
    assert.equal(result.totals.platformRevenueCents, null);
    assert.equal(result.totals.rescueProceedsCents, null);
    assert.equal(result.totals.grossCents, 1800);
  }
});

test("Stripe collection paginates, excludes other tenants/unpaid attempts, includes refunds and actual transfers", async () => {
  const charge = {
    id: "ch_1", paid: true, captured: true, status: "succeeded", currency: "usd", metadata,
    created: Math.floor(Date.now() / 1000), amount: 1800, amount_refunded: 900,
    balance_transaction: { fee: 82, net: 1718 },
    transfer: { id: "tr_1", destination: "acct_a", amount: 1800, amount_reversed: 900,
      balance_transaction: { net: -1800 }, reversals: { data: [] } },
    application_fee: { amount: 118, amount_refunded: 0, balance_transaction: { net: 118 } },
    refunds: { data: [{ balance_transaction: { fee: 0, net: -900 } }], has_more: false },
  };
  const calls: any[] = [];
  const stripe: any = {
    transfers: { list: async () => ({ data: [], has_more: false }) },
    disputes: { list: async () => ({ data: [], has_more: false }) },
    charges: { list: async (params: any) => {
      calls.push(params);
      return params.starting_after ? {
        data: [{ ...charge, id: "ch_full", amount_refunded: 1800,
          transfer: { ...charge.transfer, amount_reversed: 1800 } },
          { ...charge, id: "ch_missing", transfer: null }], has_more: false,
      } : {
        data: [charge, { ...charge, id: "ch_other", metadata: { ...metadata, tenantId: "rescue-b" } },
          { ...charge, id: "ch_unpaid", paid: false },
          { ...charge, id: "ch_conflict", transfer: { ...charge.transfer, destination: "acct_b" } }],
        has_more: true,
      };
    } },
  };
  const result = await collectStripeEconomicsReport(stripe, [
    { id: "rescue-a", name: "A", subdomain: "a", accountId: "acct_a" },
    { id: "rescue-b", name: "B", subdomain: "b", accountId: "acct_b" },
  ], 30, 0, "rescue-a");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].starting_after, "ch_conflict");
  assert.equal(result.rows.length, 0); // Display cap never truncates aggregate.
  assert.equal(result.vendingResults?.chargeCount, 3);
  assert.equal(result.vendingResults?.totals.grossCents, 5400);
  assert.equal(result.vendingResults?.totals.refundCents, 3600);
  assert.equal(result.vendingResults?.totals.rescueProceedsCents, null);
  assert.equal(result.categories[0].category, "Virtual vending");
  // Original fee components are not fabricated as net retained fees.
  assert.equal(result.vendingResults?.totals.platformRevenueCents, 108);
  assert.equal(result.vendingResults?.totals.processingRecoveryCents, 246);
  stripe.charges.list = async () => ({ data: [charge], has_more: false });
  const actual = await collectStripeEconomicsReport(stripe, [
    { id: "rescue-a", name: "A", subdomain: "a", accountId: "acct_a" },
  ], 30, 0, "rescue-a");
  assert.equal(actual.vendingResults?.totals.rescueProceedsCents, 782);
  assert.equal(actual.vendingResults?.totals.netGiftCents, 900);
  // Refunding retained application fees returns money to the rescue.
  stripe.charges.list = async () => ({
    data: [{ ...charge, application_fee: { ...charge.application_fee, amount_refunded: 59 } }],
    has_more: false,
  });
  const feeRefund = await collectStripeEconomicsReport(stripe, [
    { id: "rescue-a", name: "A", subdomain: "a", accountId: "acct_a" },
  ], 30, 0, "rescue-a");
  assert.equal(feeRefund.vendingResults?.totals.rescueProceedsCents, 841);
});
