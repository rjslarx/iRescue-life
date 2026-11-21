import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { calculateDonorCoversFees, estimateStripeProcessingFee, calculatePlatformFee } from "../server/config/platform";

test("coverage funds platform and processing, including fees on the added amount", () => {
  for (const rate of [0, 1, 3, 5, 7.5]) {
    for (const amount of [100, 1000, 3000, 10000, 123456]) {
      const q = calculateDonorCoversFees(amount, "starter", rate);
      assert.equal(q.platformFee, calculatePlatformFee(q.totalAmount, "starter", rate));
      assert.equal(q.stripeFee, estimateStripeProcessingFee(q.totalAmount));
      assert.ok(q.rescueProceeds >= amount);
      assert.equal(q.totalAmount, amount + q.feesCovered);
    }
  }
});

test("quotes use each tenant's real fee override and enforce all policies", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const { pool } = await import("../server/db");
  const { fundraisingFeeQuote } = await import("../server/services/fundraising-fee-quote");
  const id = randomUUID(), other = randomUUID();
  try {
    for (const [tid, rate] of [[id, 5], [other, 0]] as const) {
      await pool.query("INSERT INTO tenants(id,name,subdomain,platform_fee_percent) VALUES($1,'Fee quote test',$2,$3)", [tid, `fee-test-${tid}`, rate]);
    }
    const rescue = await fundraisingFeeQuote(id, 1000, "rescue", true);
    assert.equal(rescue.totalCents, 1000);
    assert.equal(rescue.platformFeeCents, 50);
    assert.equal(rescue.covered, false);
    const required = await fundraisingFeeQuote(id, 1000, "required", false);
    assert.equal(required.covered, true);
    assert.ok(required.estimatedRescueProceedsCents >= 1000);
    assert.equal((await fundraisingFeeQuote(id, 1000, "optional", true)).totalCents, required.totalCents);
    assert.equal((await fundraisingFeeQuote(id, 1000, "optional", false)).totalCents, 1000);
    assert.equal((await fundraisingFeeQuote(other, 1000, "required", false)).platformFeeCents, 0);
    await assert.rejects(fundraisingFeeQuote(id, 99_999_999, "required", false));
    await assert.rejects(fundraisingFeeQuote(id, 1.5, "required", false));
  } finally {
    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[id, other]]);
    await pool.end();
  }
});
