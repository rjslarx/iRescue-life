import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { versionFundraisingQuote, fundraisingQuoteConflict } from "../server/lib/fundraising-quote-version";

const base = { policy: "optional", covered: false, baseAmountCents: 1000, totalCents: 1000, platformFeeCents: 50 };
test("unchanged quotes proceed; missing and malformed versions require review", () => {
  const q = versionFundraisingQuote("tenant", "expense:one", base);
  assert.equal(fundraisingQuoteConflict(q.quoteVersion, q), null);
  for (const version of [undefined, null, 1000, {}, "", "bad"]) {
    assert.equal(fundraisingQuoteConflict(version, q)?.code, "FUNDRAISING_QUOTE_CHANGED");
  }
});

test("price, policy, platform fee, coverage, tenant, resource and quantity changes require review", () => {
  const q = versionFundraisingQuote("tenant", "event:one:1", base);
  const changes = [
    versionFundraisingQuote("other", "event:one:1", base),
    versionFundraisingQuote("tenant", "event:two:1", base),
    versionFundraisingQuote("tenant", "event:one:2", base),
    ...[{ policy: "rescue" }, { covered: true }, { baseAmountCents: 1200, totalCents: 1200 }, { platformFeeCents: 0 }]
      .map(change => versionFundraisingQuote("tenant", "event:one:1", { ...base, ...change })),
  ];
  for (const revised of changes) {
    const conflict = fundraisingQuoteConflict(q.quoteVersion, revised);
    assert.equal(conflict?.quote, revised);
    assert.equal(fundraisingQuoteConflict(revised.quoteVersion, revised), null);
  }
});

test("each checkout guard runs before payment side effects", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  const expense = readFileSync("server/routes/expenseCampaigns.ts", "utf8");
  for (const [source, start, sideEffect] of [
    [routes, "app.post('/api/fundraiser-events/:id/checkout'", "db.insert(fundraiserOrders)"],
    [routes, "app.post('/api/peer-campaigns/:slug/checkout'", "db.insert(peerCampaignDonations)"],
    [expense, 'publicRouter.post("/:id/checkout"', "stripe.checkout.sessions.create"],
  ]) {
    const route = source.slice(source.indexOf(start));
    assert.ok(route.indexOf("fundraisingQuoteConflict(req.body.quoteVersion, quote)") > 0);
    assert.ok(route.indexOf("if (conflict) return res.status(409).json(conflict)") < route.indexOf(sideEffect));
  }
});

test("all public campaign checkout pages submit the displayed quote", () => {
  for (const page of ["PublicExpenseCampaignPage", "FundraiserEventPage", "PeerCampaignPage", "P2PCampaignLandingPage", "ParticipantSubPage"]) {
    const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8");
    assert.ok(source.includes("feeQuote.checkout("), page);
    assert.ok(source.includes("totalCents"), page);
    assert.ok(source.includes("feeQuote.isFetching"), page);
    assert.doesNotMatch(source, /apiRequest\("POST", `\/api\/(?:peer-campaigns|fundraiser-events|public\/expense-campaigns)\/[^`]+\/checkout`/);
  }
});
