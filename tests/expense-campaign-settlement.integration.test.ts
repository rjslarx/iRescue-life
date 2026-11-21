/**
 * Execute the actual /api/stripe/webhook callback and receipt service.
 * Only external boundaries are mocked; matching arithmetic and SQL expressions
 * come from production. No database, Stripe, storage, or email connection exists.
 * Run: scripts/run-tests.sh tests/expense-campaign-settlement.integration.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { build } from "esbuild";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import * as schema from "../shared/schema";
import * as pdfLib from "pdf-lib";

const source = ts.createSourceFile("routes.ts", readFileSync("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);
const handlers: string[] = [];
let escapeHtml = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "escapeHtml") escapeHtml = node.getText(source);
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "post" && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === "/api/stripe/webhook") {
    handlers.push(node.arguments[node.arguments.length - 1].getText(source));
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(handlers.length, 1);
assert.ok(escapeHtml);

const compiled = build({
  stdin: { contents: `
    import {db} from './db';
    import {tenants} from '@shared/schema';
    import {eq, and, or, sql, inArray} from 'drizzle-orm';
    ${escapeHtml}
    export const webhook = ${handlers[0]};
  `, resolveDir: `${process.cwd()}/server`, loader: "ts" },
  bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
  logLevel: "silent",
  plugins: [{
    name: "isolated-settlement",
    setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        if (/^(drizzle-orm|zod)(\/|$)/.test(args.path)
          || /expense-campaign-match|matching-milestones|donation-receipt-service|stripe-dispute-handling/.test(args.path)) return;
        return { path: args.path, namespace: "isolated" };
      });
      b.onLoad({ filter: /.*/, namespace: "isolated" }, args => {
        const mocks: Record<string, string> = {
          "pdf-lib": "export const {PDFDocument, rgb, StandardFonts} = globalThis.pdfLib;",
          "@shared/schema": `export const {${Object.keys(schema).join(",")}} = globalThis.schema;`,
          "./db": "export const db = globalThis.db;",
          "../db": "export const db = globalThis.db;",
          "./lib/encryption": "export const decrypt = () => { throw Error('Unexpected decryption'); };",
          "./lib/stripe-service": "export const stripeService = globalThis.stripeService;",
          "./services/contacts": "export const createContactFromDonation = globalThis.contact;",
          "./lib/email-service": "export const EmailService = globalThis.EmailService;",
          "../lib/email-service": "export const EmailService = globalThis.EmailService;",
          "../lib/tenantFileStorage": "export const TenantFileStorage = globalThis.TenantFileStorage;",
          "../objectStorage": "export const objectStorageClient = {};",
        };
        // Unrelated branches stay inert. Any newly reached dependency fails,
        // and captured console errors also fail the test (even if swallowed).
        return { contents: mocks[args.path] ?? `throw Error(${JSON.stringify(`Unexpected dependency: ${args.path}`)});`, loader: "js" };
      });
    },
  }],
});

const dialect = new PgDialect();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

async function fixture(initialDonor: boolean, poolKind: "none" | "legacy" | "milestones" | "capped") {
  const tenant = { id: "tenant-test", name: "Synthetic Rescue", subdomain: "synthetic",
    stripeEnabled: true, autoSendTaxReceipts: true };
  const pool = poolKind === "none" ? undefined : {
    id: "pool-test", tenant_id: tenant.id, expense_campaign_id: "campaign-test",
    status: "active", pledged_cap_cents: poolKind === "capped" ? 2500 : 20000,
    total_matched_cents: 1000, ratio_numerator: 1, ratio_denominator: 1,
    per_gift_cap_cents: null, starts_at: null, ends_at: null,
    tiers: poolKind === "milestones" ? [
      { id: "sponsor-one", publicSponsorName: "First Sponsor", showSponsorPublicly: true, pledgedCapCents: 2000 },
      { id: "sponsor-two", publicSponsorName: "Second Sponsor", showSponsorPublicly: true, pledgedCapCents: 18000 },
    ] : null,
  };
  const rows = new Map<any, any[]>([
    [schema.tenants, [tenant]], [schema.payments, []], [schema.donations, []],
    [schema.donors, initialDonor ? [{ id: "donor-existing", tenantId: tenant.id, email: "donor@example.test", totalDonated: 700 }] : []],
    [schema.adoptionCheckoutSessions, []], [schema.shopOrders, []],
    [schema.campaignMatchPools, pool ? [{ id: pool.id, tenantId: tenant.id, expenseCampaignId: "campaign-test",
      publicSponsorName: "Sponsor", showSponsorPublicly: true }] : []],
  ]);
  let raised = 1200;
  let transactions = 0;
  const emails: any[] = [], backups: any[] = [], contacts: any[] = [], errors: any[] = [];
  const pdfText: string[] = [];
  function tableRows(table: any) {
    assert.ok(rows.has(table), `Unexpected table ${getTableName(table)}`);
    return rows.get(table)!;
  }
  function matches(table: any, row: any, where: any) {
    const query = dialect.sqlToQuery(where);
    const comparisons = [...query.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
    assert.ok(comparisons.length, `Unsupported predicate ${query.sql}`);
    const results = comparisons.map(([, column, index]) => {
      const key = Object.keys(table).find(key => table[key]?.name === column);
      assert.ok(key, column);
      return row[key] === query.params[Number(index) - 1];
    });
    return query.sql.includes(" or ") ? results.some(Boolean) : results.every(Boolean);
  }
  const db: any = {
    select() { return { from(table: any) { return { where(where: any) {
      const result = tableRows(table).filter(row => matches(table, row, where));
      return Object.assign(Promise.resolve(result), { limit: async (n: number) => result.slice(0, n) });
    } }; } }; },
    insert(table: any) { return { values(value: any) {
      const record = { id: `${getTableName(table)}-${tableRows(table).length}`, ...value };
      tableRows(table).push(record);
      return { returning: async () => [record] };
    } }; },
    update(table: any) { return { set(value: any) { return { where: async (where: any) => {
      const found = tableRows(table).filter(row => matches(table, row, where));
      found.forEach(row => Object.assign(row, value));
      if (table === schema.campaignMatchPools) {
        assert.ok(pool);
        pool.total_matched_cents = value.totalMatchedCents;
        pool.status = value.status;
      }
      return found;
    } }; } }; },
    async execute(statement: any) {
      const { sql, params } = dialect.sqlToQuery(statement);
      if (/SELECT id FROM expense_campaigns/.test(sql)) {
        assert.deepEqual(params, ["campaign-test", tenant.id]);
        return { rows: [{ id: "campaign-test" }] };
      }
      if (/SELECT \* FROM campaign_match_pools/.test(sql)) {
        assert.deepEqual(params, ["campaign-test", tenant.id]);
        return { rows: pool ? [pool] : [] };
      }
      assert.match(sql, /SET raised_amount_cents = raised_amount_cents \+ \$1/);
      assert.deepEqual(params.slice(1), ["campaign-test", tenant.id]);
      raised += Number(params[0]);
      return { rows: [] };
    },
    async transaction(fn: any) { transactions++; return fn(db); },
  };
  // Drizzle update().where().returning() is thenable as well.
  const update = db.update;
  db.update = (table: any) => ({ set: (value: any) => ({ where: (where: any) => {
    const result = update(table).set(value).where(where);
    return Object.assign(result, { returning: () => result });
  } }) });
  let verifications = 0;
  const module = { exports: {} as any };
  const require = createRequire(import.meta.url);
  runInNewContext((await compiled).outputFiles[0].text, {
    module, exports: module.exports, schema, db, Buffer,
    pdfLib: { ...pdfLib, PDFDocument: { async create() {
      const doc = await pdfLib.PDFDocument.create();
      const addPage = doc.addPage.bind(doc);
      doc.addPage = ((size: any) => {
        // pdf-lib uses instanceof Array; normalize dimensions across VM realms.
        const page = addPage(Array.isArray(size) ? Array.from(size) as [number, number] : size);
        const drawText = page.drawText.bind(page);
        page.drawText = (text, options) => { pdfText.push(text); drawText(text, options); };
        const drawLine = page.drawLine.bind(page);
        page.drawLine = options => drawLine({ ...options, start: { ...options.start }, end: { ...options.end } });
        return page;
      }) as typeof doc.addPage;
      return doc;
    } } },
    require: (name: string) => {
      assert.match(name, /^(drizzle-orm|pdf-lib|zod)(\/|$)/, "No network-capable dependency permitted");
      return require(name);
    },
    console: { log() {}, warn: (...args: any[]) => errors.push(args), error: (...args: any[]) => errors.push(args) },
    process: { env: { PLATFORM_STRIPE_WEBHOOK_SECRET: "whsec_synthetic_only" } },
    stripeService: { async handleWebhook(body: Buffer, signature: string, secret: string) {
      assert.equal(signature, "synthetic-signature");
      assert.equal(secret, "whsec_synthetic_only");
      verifications++;
      return JSON.parse(body.toString());
    } },
    contact: async (...args: any[]) => contacts.push(args),
    EmailService: { forTenant: async () => ({ send: async (email: any) => { emails.push(email); return { success: true }; } }) },
    TenantFileStorage: class { async uploadFile(file: any) { backups.push(file); return { success: true }; } },
  });
  async function deliver(session: any, eventId: string) {
    let status = 200, response: any;
    await module.exports.webhook({
      headers: { "stripe-signature": "synthetic-signature" },
      rawBody: Buffer.from(JSON.stringify({ id: eventId, type: "checkout.session.completed",
        account: "acct_synthetic", data: { object: session } })),
      protocol: "https", get: () => "example.test",
    }, {
      status(code: number) { status = code; return this; },
      json(value: any) { response = value; }, send(value: any) { response = value; },
    });
    assert.equal(status, 200, JSON.stringify({ response, errors }));
    assert.deepEqual(errors, []);
    return response;
  }
  return { rows, emails, backups, contacts, pdfText, deliver,
    snapshot: () => clone({ rows: [...rows.values()], raised, pool, transactions, emails, contacts, backupCount: backups.length }),
    counters: () => ({ raised, pool, transactions, verifications }) };
}

for (const covered of [false, true]) {
  for (const initialDonor of [false, true]) {
    for (const poolKind of ["none", "legacy", "milestones", "capped"] as const) {
      test(`expense settlement: coverage=${covered}, existing donor=${initialDonor}, pool=${poolKind}`, async () => {
        const f = await fixture(initialDonor, poolKind);
        const gift = 3000, fee = covered ? 290 : 0;
        const session = { id: "cs_synthetic", payment_intent: "pi_synthetic", mode: "payment",
          payment_status: "paid", amount_total: gift + fee, currency: "usd",
          customer_email: "donor@example.test", customer_details: { name: "Synthetic Donor" },
          metadata: { tenantId: "tenant-test", expenseCampaignId: "campaign-test",
            baseAmount: String(gift), feesCovered: String(fee), donorCoveredFees: String(covered) } };
        await f.deliver(session, "evt_first");
        const donation = f.rows.get(schema.donations)![0];
        const matched = poolKind === "none" ? 0 : poolKind === "capped" ? 1500 : gift;
        assert.equal(f.rows.get(schema.donations)!.length, 1);
        assert.equal(donation.amount, gift);
        assert.equal(donation.netAmount, gift);
        assert.equal(donation.grossAmount, gift + fee);
        assert.equal(donation.feesCovered, covered);
        assert.equal(donation.matchedAmountCents, matched);
        assert.equal(f.counters().raised, 1200 + gift);
        assert.equal(f.counters().transactions, 1);
        if (poolKind !== "none") {
          assert.equal(f.counters().pool!.total_matched_cents, 1000 + matched);
          assert.equal(f.counters().pool!.status, poolKind === "capped" ? "exhausted" : "active");
        }
        if (poolKind === "milestones") assert.deepEqual(clone(donation.matchAllocations), [
          { tierId: "sponsor-one", sponsorLabel: "First Sponsor", matchedCents: 1000 },
          { tierId: "sponsor-two", sponsorLabel: "Second Sponsor", matchedCents: 2000 },
        ]);
        assert.equal(f.rows.get(schema.payments)!.length, 1);
        assert.equal(f.rows.get(schema.payments)![0].amount, gift + fee, "payment preserves actual charge");
        assert.equal(f.rows.get(schema.donors)![0].totalDonated, (initialDonor ? 700 : 0) + gift);
        assert.equal(f.contacts.length, 1);
        assert.equal(f.contacts[0][3], gift);
        assert.equal(f.emails.length, 2, "official receipt and thank-you both sent");
        const receipt = f.emails.find(email => email.subject.startsWith("Official Tax Receipt"));
        assert.ok(receipt);
        assert.match(receipt.html, /<strong>Amount:<\/strong> \$30\.00/);
        assert.match(f.emails.find(email => email !== receipt).html, /<strong>Amount:<\/strong> \$30\.00/);
        assert.equal(receipt.attachments.length, 1);
        assert.equal(receipt.attachments[0].content.subarray(0, 4).toString(), "%PDF");
        assert.equal(f.backups.length, 1);
        assert.deepEqual(f.pdfText.filter(text => text.startsWith("Amount:")), ["Amount: $30.00"]);
        assert.ok(donation.receiptNumber);
        assert.ok(donation.receiptSentAt);
        const settled = f.snapshot();
        assert.equal((await f.deliver(session, "evt_first")).idempotent, true);
        assert.deepEqual(f.snapshot(), settled);
        assert.equal((await f.deliver(session, "evt_redelivery")).idempotent, true);
        assert.deepEqual(f.snapshot(), settled);
        // Payment-intent identity must also prevent credit if the session ID differs.
        assert.equal((await f.deliver({ ...session, id: "cs_alias" }, "evt_alias")).idempotent, true);
        assert.deepEqual(f.snapshot(), settled);
        assert.equal(f.counters().verifications, 4);
      });
    }
  }
}
