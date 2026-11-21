import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { build } from "esbuild";
import * as schema from "../shared/schema";

// Extract the actual registered callback, not a copy of its implementation.
// This avoids booting the enormous routes module (and its unrelated services).
// Parsing the AST makes a moved/renamed/duplicate route fail loudly.
function checkoutHandler(file: string, route: string) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const handlers: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "post"
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === route) {
      const handler = node.arguments[node.arguments.length - 1];
      assert.ok(ts.isArrowFunction(handler), `Expected inline handler for ${route}`);
      handlers.push(handler.getText(source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(handlers.length, 1, `Expected exactly one ${route}`);
  return handlers[0];
}

const compiled = build({
  stdin: {
    contents: `
      import {z} from 'zod';
      import {and, eq, sql} from 'drizzle-orm';
      import {db} from './db';
      import {expenseCampaigns, tenants} from '@shared/schema';
      import {expenseCampaignCheckoutSchema} from '../shared/expense-campaign-fees';
      import {fundraisingFeeQuote} from './services/fundraising-fee-quote';
      const toStripeStatementDescriptor = () => 'TEST RESCUE';
      export const expense = ${checkoutHandler("server/routes/expenseCampaigns.ts", "/:id/checkout")};
      export const product = ${checkoutHandler("server/routes.ts", "/api/fundraiser-events/:id/checkout")};
    `,
    resolveDir: `${process.cwd()}/server`, loader: "ts",
  },
  bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
  plugins: [{
    name: "synthetic-payment-boundaries",
    setup(b) {
      b.onResolve({ filter: /^(stripe|@shared\/schema|\.\/db|\.\.\/db)$/ },
        args => ({ path: args.path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        contents: args.path === "stripe" ? "export default globalThis.MockStripe;"
          : args.path === "@shared/schema"
            ? "export const {expenseCampaigns, tenants, fundraiserEvents, fundraiserOrders} = globalThis.schema;"
            : "export const db = globalThis.db;",
        loader: "js",
      }));
    },
  }],
});

type Surface = "expense" | "product";
type Policy = "rescue" | "optional" | "required";
const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const accountId = "acct_synthetic_rescue";
const base = 3000;

async function checkout(surface: Surface, policy: Policy, coverFees: boolean, rate: number) {
  const stripeCalls: any[][] = [];
  const updates: any[] = [];
  const reads: any[] = [];
  const tenant = { id: tenantId, name: "Synthetic Rescue", subdomain: "synthetic",
    stripeConnectedAccountId: accountId, tier: "starter", platformFeePercent: rate };
  const campaign = { id: eventId, title: "Synthetic fundraiser", slug: "synthetic",
    feePolicy: policy, priceCents: 1000, inventoryCap: null, passFeesToBuyer: policy !== "required" };
  const expectedTables = surface === "expense"
    ? [schema.expenseCampaigns, schema.tenants, schema.tenants]
    : [schema.fundraiserEvents, schema.tenants];
  const rows = surface === "expense" ? [[campaign], [tenant], [tenant]] : [[campaign], [tenant]];
  const db = {
    select() {
      return { from(table: unknown) {
        const i = reads.length;
        assert.equal(table, expectedTables[i], "Unexpected database read");
        reads.push(table);
        return { where() { return { limit: async () => rows[i] }; } };
      } };
    },
    insert(table: unknown) {
      assert.equal(table, schema.fundraiserOrders);
      return { values(value: any) {
        assert.equal(value.quantity, 3);
        assert.equal(value.eventId, eventId);
        return { returning: async () => [{ id: "synthetic-order" }] };
      } };
    },
    update(table: unknown) {
      assert.equal(table, schema.fundraiserOrders);
      return { set(value: any) {
        updates.push(value);
        return { where: async () => undefined };
      } };
    },
  };
  class MockStripe {
    constructor(key: string) { assert.equal(key, "sk_test_synthetic_only"); }
    checkout = { sessions: { create: async (...args: any[]) => {
      stripeCalls.push(args);
      return { id: "cs_synthetic", url: "https://checkout.example.test/synthetic" };
    } } };
  }
  const module: { exports: any } = { exports: {} };
  runInNewContext((await compiled).outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url),
    schema, db, MockStripe,
    // Never expose workspace credentials or the real Stripe SDK to this bundle.
    process: { env: { PLATFORM_STRIPE_SECRET_KEY: "sk_test_synthetic_only" } },
  });
  let response: any;
  let status = 200;
  const req = {
    params: { id: eventId },
    // Deliberately stale request settings: the quote must load saved settings.
    tenant: { ...tenant, platformFeePercent: 99 },
    protocol: "https", hostname: "example.test", get: () => "example.test",
    body: { amountCents: base, quantity: 3, coverFees,
      customerName: "Synthetic Buyer", customerEmail: "buyer@example.test",
      feePolicy: policy === "required" ? "rescue" : "required",
      totalCents: 1, platformFeeCents: 0, feeContributionCents: 0 },
  };
  await module.exports[surface](req, {
    status(code: number) { status = code; return this; },
    json(value: any) { response = value; },
  }, (error: unknown) => { throw error; });
  assert.equal(status, 200);
  assert.equal(response.url, "https://checkout.example.test/synthetic");
  assert.equal(reads.length, expectedTables.length);
  assert.equal(stripeCalls.length, 1);
  return { params: stripeCalls[0][0], options: stripeCalls[0][1], updates };
}

// Independent integer-cent oracle: do not use the production quote helper to
// calculate expected values, or a shared regression could make this test pass.
function expected(covered: boolean, rate: number) {
  let total = base;
  const platform = (n: number) => Math.round(n * rate / 100);
  const processing = (n: number) => Math.round(n * 0.029 + 30);
  if (covered) {
    while (total - platform(total) - processing(total) < base) total++;
  }
  return { total, platform: platform(total), processing: processing(total), contribution: total - base };
}

for (const surface of ["expense", "product"] as const) {
  for (const rate of [5, 0]) {
    for (const policy of ["rescue", "optional", "required"] as const) {
      for (const coverFees of [false, true]) {
        test(`${surface}: ${policy}, buyer coverage ${coverFees}, saved override ${rate}%`, async () => {
          const covered = policy === "required" || (policy === "optional" && coverFees);
          const e = expected(covered, rate);
          const { params: p, options, updates } = await checkout(surface, policy, coverFees, rate);
          assert.equal(p.mode, "payment");
          assert.deepEqual(Array.from(p.payment_method_types), ["card"]);
          assert.equal(p.line_items.length, covered ? 2 : 1);
          assert.equal(p.line_items[0].price_data.unit_amount, surface === "expense" ? base : 1000);
          assert.equal(p.line_items[0].quantity, surface === "expense" ? 1 : 3);
          assert.equal(p.line_items.reduce((sum: number, item: any) =>
            sum + item.price_data.unit_amount * item.quantity, 0), e.total);
          if (covered) {
            assert.equal(p.line_items[1].price_data.unit_amount, e.contribution);
            assert.equal(p.line_items[1].quantity, 1, "coverage added once, not per product");
          }
          assert.equal(p.metadata.baseAmount, String(base));
          assert.equal(p.metadata.feesCovered, String(e.contribution));
          assert.equal(p.metadata.feePolicy, policy);
          const pi = p.payment_intent_data;
          assert.equal(pi.metadata.tenantId, tenantId);
          if (surface === "expense") {
            assert.equal(options.stripeAccount, accountId, "direct charge belongs to rescue");
            assert.equal(pi.transfer_data, undefined);
            assert.equal(pi.on_behalf_of, undefined);
            assert.equal(pi.application_fee_amount, e.platform, "direct charge collects only platform fee");
            assert.equal(pi.metadata.baseAmount, String(base));
            assert.equal(p.metadata.platformFeeCents, String(e.platform));
            assert.equal(p.metadata.totalAmount, String(e.total));
            assert.equal(p.metadata.donorCoveredFees, String(covered));
          } else {
            assert.equal(options, undefined, "destination charge belongs to platform");
            assert.equal(pi.transfer_data.destination, accountId, "route even with 0% override");
            assert.equal(pi.on_behalf_of, accountId);
            assert.equal(pi.application_fee_amount, e.platform + e.processing);
            for (const metadata of [p.metadata, pi.metadata]) {
              assert.equal(metadata.iRescueRevenueCents, String(e.platform));
              assert.equal(metadata.processingRecoveryCents, String(e.processing));
              assert.equal(metadata.buyerCoveredFees, String(covered));
              assert.equal(metadata.feePolicy, policy);
            }
            assert.equal(updates.length, 2);
            assert.deepEqual(JSON.parse(JSON.stringify(updates[0])), {
              feePolicy: policy, baseAmountCents: base, totalAmountCents: e.total,
              feeContributionCents: e.contribution, platformFeeCents: e.platform,
            });
            assert.equal(updates[1].stripeSessionId, "cs_synthetic");
          }
        });
      }
    }
  }
}
