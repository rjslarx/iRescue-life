import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expenseCampaignCharge, expenseCampaignCheckoutSchema } from "../shared/expense-campaign-fees";

describe("expense campaign processing-fee choice", () => {
  it("defaults to the rescue paying and never adds fees without consent", () => {
    assert.deepEqual(expenseCampaignCheckoutSchema.parse({ amountCents: 5000 }), { amountCents: 5000, coverFees: false });
    assert.deepEqual(expenseCampaignCharge(5000, false), { totalCents: 5000, feeContributionCents: 0 });
  });
  it("grosses up using integer cents, including processing on the contribution", () => {
    assert.deepEqual(expenseCampaignCharge(5000, true), { totalCents: 5181, feeContributionCents: 181 });
    for (const amount of [100, 2500, 5000, 10000, 25000, 12345, 5000000]) {
      const { totalCents, feeContributionCents } = expenseCampaignCharge(amount, true);
      assert.equal(totalCents, amount + feeContributionCents);
      assert.ok(totalCents - Math.round(totalCents * .029 + 30) >= amount);
      assert.ok(Number.isSafeInteger(totalCents));
    }
  });
  it("rejects invalid input and Stripe totals over the limit", () => {
    for (const amountCents of [NaN, Infinity, -1, 0, 99, 100.5, 100000000]) {
      assert.equal(expenseCampaignCheckoutSchema.safeParse({ amountCents }).success, false);
    }
    assert.equal(expenseCampaignCheckoutSchema.safeParse({ amountCents: 5000, coverFees: "true" }).success, false);
    assert.equal(expenseCampaignCheckoutSchema.safeParse({ amountCents: 99999999, coverFees: true }).success, false);
    assert.equal(expenseCampaignCheckoutSchema.safeParse({ amountCents: 99999999, coverFees: false }).success, true);
    assert.deepEqual(expenseCampaignCheckoutSchema.parse({ amountCents: 5000, coverFees: true, totalCents: 1 }), { amountCents: 5000, coverFees: true });
  });
  it("keeps checkout direct to the rescue and separates the gift from the fee", () => {
    const route = readFileSync("server/routes/expenseCampaigns.ts", "utf8").split('publicRouter.post("/:id/checkout"')[1];
    assert.match(route, /expenseCampaignCheckoutSchema\.parse\(req\.body\)/);
    assert.match(route, /expenseCampaignCharge\(amountCents, coverFees\)/);
    assert.match(route, /unit_amount: amountCents/);
    assert.match(route, /unit_amount: feeContributionCents/);
    assert.match(route, /baseAmount: String\(amountCents\)/);
    assert.match(route, /donorCoveredFees: String\(coverFees\)/);
    assert.match(route, /feesCovered: String\(feeContributionCents\)/);
    assert.match(route, /stripeAccount: tenant\.stripeConnectedAccountId/);
    assert.doesNotMatch(route, /application_fee_amount|transfer_data/);
    const webhook = readFileSync("server/routes.ts", "utf8");
    assert.match(webhook, /calculateMatch\(baseAmountCents,/);
    assert.match(webhook, /raised_amount_cents = raised_amount_cents \+ \$\{baseAmountCents\}/);
  });
});
