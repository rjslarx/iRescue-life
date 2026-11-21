import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customerCoversFundraisingFees, fundraiserEventFeePolicy, fundraisingFeePolicySchema } from "../shared/fundraising-fee-policy";

test("stored policy overrides tampered buyer choices", () => {
  assert.equal(customerCoversFundraisingFees("required", false), true);
  assert.equal(customerCoversFundraisingFees("rescue", true), false);
  assert.equal(customerCoversFundraisingFees("optional", true), true);
  assert.equal(customerCoversFundraisingFees("optional", false), false);
});

test("legacy fundraiser choices remain intact", () => {
  assert.equal(fundraiserEventFeePolicy(null, true), "required");
  assert.equal(fundraiserEventFeePolicy(null, false), "rescue");
  assert.equal(fundraiserEventFeePolicy("optional", true), "optional");
  assert.equal(fundraisingFeePolicySchema.safeParse("free").success, false);
});

test("expense checkout collects platform fees without changing direct-charge ownership", () => {
  const code = readFileSync("server/routes/expenseCampaigns.ts", "utf8").split('publicRouter.post("/:id/checkout"')[1];
  assert.ok(code.includes("fundraisingFeeQuote(tenantId, amountCents, campaign.feePolicy, coverFees)"));
  assert.ok(code.includes("application_fee_amount: platformFeeCents"));
  assert.ok(code.includes("stripeAccount: tenant.stripeConnectedAccountId"));
  assert.ok(code.includes("baseAmount: String(amountCents)"));
  assert.ok(!code.includes("transfer_data"));
});

test("product checkout snapshots actual fee choice instead of rereading mutable settings for new sales", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  const code = routes.split("app.post('/api/fundraiser-events/:id/checkout'")[1].split("app.get('/api/fundraiser-orders'")[0];
  assert.ok(code.includes("fundraiserEventFeePolicy(event.feePolicy, event.passFeesToBuyer), body.coverFees"));
  assert.ok(code.includes("feePolicy: quote.policy"));
  assert.ok(code.includes("totalAmountCents: totalCents"));
  assert.ok(code.includes("feeContributionCents: feesCoveredCents"));
  assert.ok(code.includes("application_fee_amount: economics.applicationFeeTotalCents"));
  assert.ok(routes.includes("fo.feeContributionCents != null ? fo.feeContributionCents > 0"));
});
