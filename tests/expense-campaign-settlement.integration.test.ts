/**
 * Execute the actual /api/stripe/webhook callback and receipt service.
 * Only external boundaries are mocked; matching arithmetic and SQL expressions
 * come from production. Stripe, storage, and email never connect externally.
 * RUN_EXPENSE_DB_TEST=1 also runs isolated PostgreSQL concurrency cases.
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
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import { settlementDatabase, gate } from "./helpers/expense-settlement-db";
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

for (const existing of [false, true]) {
  for (const alias of [false, true]) {
    for (const delayedDonorRead of [false, true]) {
      test(`PostgreSQL simultaneous settlement: existing=${existing}, alias=${alias}, delayed donor read=${delayedDonorRead}`, {
        skip: process.env.RUN_EXPENSE_DB_TEST !== "1", timeout: 25000,
      }, async () => {
        const database = await settlementDatabase();
        const clients = await Promise.all([database.pool.connect(), database.pool.connect()]);
        const tenantId = randomUUID(), campaignId = randomUUID();
        const bothChecked = gate(), firstFinished = gate();
        let prechecks = 0;
        try {
          const pids = await Promise.all(clients.map(c => c.query("SELECT pg_backend_pid() AS pid")));
          assert.notEqual(pids[0].rows[0].pid, pids[1].rows[0].pid);
          await database.db.insert(schema.tenants).values({
            id: tenantId, name: "Synthetic Rescue", subdomain: "synthetic",
            stripeEnabled: true, autoSendTaxReceipts: true,
          });
          await database.db.insert(schema.expenseCampaigns).values({
            id: campaignId, tenantId, title: "Synthetic Campaign", slug: "synthetic",
            goalAmountCents: 10000, raisedAmountCents: 1200,
          });
          await database.db.insert(schema.campaignMatchPools).values({
            tenantId, expenseCampaignId: campaignId, internalSponsorName: "Synthetic Sponsor",
            internalSponsorEmail: "sponsor@example.test", publicSponsorName: "Sponsor",
            pledgedCapCents: 10000, totalMatchedCents: 1000,
            tiers: [{ id: "sponsor-one", publicSponsorName: "Sponsor", showSponsorPublicly: true, pledgedCapCents: 10000 }],
          });
          if (existing) {
            await database.db.insert(schema.donors).values({
              tenantId, email: "donor@example.test", name: "Synthetic Donor", totalDonated: 700,
            });
            await database.db.insert(schema.contacts).values({
              tenantId, email: "donor@example.test", name: "Synthetic Donor",
              totalDonated: 700, donationCount: 1,
            });
          }
          // Both deliveries must see the absent payment before either can write.
          // The delayed schedule additionally reproduces a loser reading the
          // winner's credited donor after passing the stale payment precheck.
          clients.forEach((client, index) => {
            const query = client.query.bind(client);
            (client as any).query = async (...args: any[]) => {
              const text = typeof args[0] === "string" ? args[0] : args[0].text;
              if (index === 1 && delayedDonorRead && /^(begin|select .* from "donors")/i.test(text)) {
                await firstFinished.promise;
              }
              const result = await (query as any)(...args);
              if (/^select .* from "payments"/i.test(text) && prechecks < 2) {
                if (++prechecks === 2) bothChecked.release();
                await bothChecked.promise;
              }
              return result;
            };
          });
          const f = await Promise.all(clients.map(c => fixture(existing, "milestones", drizzle(c))));
          const session = {
            id: "cs_synthetic", payment_intent: "pi_synthetic", mode: "payment",
            payment_status: "paid", amount_total: 3290, currency: "usd",
            customer_email: "donor@example.test", customer_details: { name: "Synthetic Donor" },
            metadata: { tenantId, expenseCampaignId: campaignId, baseAmount: "3000",
              feesCovered: "290", donorCoveredFees: "true" },
          };
          const results = await Promise.allSettled([
            f[0].deliver(session, "evt_first").finally(firstFinished.release),
            f[1].deliver({ ...session, id: alias ? "cs_alias" : session.id }, "evt_retry"),
          ]);
          for (const result of results) assert.equal(result.status, "fulfilled",
            result.status === "rejected" ? String(result.reason) : "");
          assert.equal(results.filter(r => r.status === "fulfilled" && r.value.idempotent).length, 1);
          const donations = await database.db.select().from(schema.donations);
          assert.equal(donations.length, 1);
          assert.equal(donations[0].amount, 3000);
          assert.equal(donations[0].grossAmount, 3290);
          assert.equal(donations[0].matchedAmountCents, 3000);
          assert.deepEqual(donations[0].matchAllocations, [
            { tierId: "sponsor-one", sponsorLabel: "Sponsor", matchedCents: 3000 },
          ]);
          const payments = await database.db.select().from(schema.payments);
          assert.equal(payments.length, 1);
          assert.equal(payments[0].amount, 3290);
          const donors = await database.db.select().from(schema.donors);
          assert.equal(donors.length, 1);
          assert.equal(donors[0].totalDonated, (existing ? 700 : 0) + 3000);
          const contacts = await database.db.select().from(schema.contacts);
          assert.equal(contacts.length, 1);
          assert.equal(contacts[0].totalDonated, (existing ? 700 : 0) + 3000);
          assert.equal(contacts[0].donationCount, (existing ? 1 : 0) + 1);
          assert.equal((await database.db.select().from(schema.expenseCampaigns))[0].raisedAmountCents, 4200);
          assert.equal((await database.db.select().from(schema.campaignMatchPools))[0].totalMatchedCents, 4000);
          assert.ok(donations[0].receiptNumber);
          assert.ok(donations[0].receiptSentAt);
          assert.equal(f.flatMap(x => x.emails).filter(e => e.subject.startsWith("Official Tax Receipt")).length, 1);
          assert.equal(f.flatMap(x => x.backups).length, 1);
          assert.equal(f.flatMap(x => x.pdfText).filter(t => t.startsWith("Amount:")).length, 1);
        } finally {
          bothChecked.release();
          firstFinished.release();
          clients.forEach(c => c.release());
          await database.close();
        }
      });
    }
  }
}
visit(source);
assert.equal(handlers.length, 1);
assert.ok(escapeHtml);

const compile = (realContacts = false) => build({
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
          || /expense-campaign-match|matching-milestones|donation-receipt-service|stripe-dispute-handling/.test(args.path)
          || (realContacts && args.path === "./services/contacts")) return;
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
const compiled = compile();
let compiledWithContacts: ReturnType<typeof compile>;

const dialect = new PgDialect();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

type FailurePoint = "payment" | "donation" | "pool" | "campaign" | "commit";

async function fixture(initialDonor: boolean, poolKind: "none" | "legacy" | "milestones" | "capped",
  realDb?: any, failure?: FailurePoint) {
  let pendingFailure = failure;
  function failAt(point: FailurePoint) {
    if (pendingFailure !== point) return;
    pendingFailure = undefined;
    throw new Error(`Injected failure after ${point}`);
  }
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
      if (table === schema.payments) failAt("payment");
      if (table === schema.donations) failAt("donation");
      return { returning: async () => [record] };
    } }; },
    update(table: any) { return { set(value: any) { return { where: async (where: any) => {
      const found = tableRows(table).filter(row => matches(table, row, where));
      found.forEach(row => Object.assign(row, value));
      if (table === schema.campaignMatchPools) {
        assert.ok(pool);
        pool.total_matched_cents = value.totalMatchedCents;
        pool.status = value.status;
        failAt("pool");
      }
      return found;
    } }; } }; },
    async execute(statement: any) {
      const { sql, params } = dialect.sqlToQuery(statement);
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
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
      failAt("campaign");
      return { rows: [] };
    },
    async transaction(fn: any) {
      transactions++;
      const beforeRows = [...rows].map(([table, values]) => [table, clone(values)] as const);
      const beforePool = clone(pool ?? null);
      const beforeRaised = raised;
      try {
        const result = await fn(db);
        failAt("commit");
        return result;
      } catch (error) {
        for (const [table, values] of beforeRows) rows.set(table, values);
        if (pool) Object.assign(pool, beforePool);
        raised = beforeRaised;
        throw error;
      }
    },
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
  runInNewContext((await (realDb ? (compiledWithContacts ??= compile(true)) : compiled)).outputFiles[0].text, {
    module, exports: module.exports, schema, db: realDb || db, Buffer,
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
  async function deliver(session: any, eventId: string, expectedStatus = 200) {
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
    assert.equal(status, expectedStatus, JSON.stringify({ response, errors }));
    if (expectedStatus === 200) assert.deepEqual(errors, []);
    else {
      assert.match(String(errors.flat().join(" ")), /Injected failure after/);
      errors.length = 0;
    }
    return response;
  }
  return { rows, emails, backups, contacts, pdfText, deliver,
    snapshot: () => clone({ rows: [...rows.values()], raised, pool, transactions, emails, contacts, backupCount: backups.length }),
    counters: () => ({ raised, pool, transactions, verifications }) };
}

for (const failure of ["payment", "donation", "pool", "campaign", "commit"] as const) {
  for (const initialDonor of [false, true]) {
    for (const poolKind of ["legacy", "milestones", "capped"] as const) {
      test(`expense settlement rolls back ${failure} failure and retries once: donor=${initialDonor}, pool=${poolKind}`, async () => {
        const f = await fixture(initialDonor, poolKind, undefined, failure);
        const session = { id: "cs_recovery", payment_intent: "pi_recovery", mode: "payment",
          payment_status: "paid", amount_total: 3290, currency: "usd",
          customer_email: "donor@example.test", customer_details: { name: "Synthetic Donor" },
          metadata: { tenantId: "tenant-test", expenseCampaignId: "campaign-test",
            baseAmount: "3000", feesCovered: "290", donorCoveredFees: "true" } };
        const before = f.snapshot();
        await f.deliver(session, "evt_interrupted", 400);
        assert.deepEqual(f.snapshot(), { ...before, transactions: 1 },
          "all financial writes roll back together; no email/contact/storage effects escape");
        await f.deliver(session, "evt_retry");
        const donation = f.rows.get(schema.donations)![0];
        assert.equal(f.rows.get(schema.donations)!.length, 1);
        assert.equal(f.rows.get(schema.payments)!.length, 1);
        assert.equal(f.rows.get(schema.payments)![0].amount, 3290);
        assert.equal(f.rows.get(schema.donors)!.length, 1);
        assert.equal(f.rows.get(schema.donors)![0].totalDonated, (initialDonor ? 700 : 0) + 3000);
        assert.equal(donation.amount, 3000);
        assert.equal(f.counters().raised, 4200);
        const matched = poolKind === "capped" ? 1500 : 3000;
        assert.equal(donation.matchedAmountCents, matched);
        assert.equal(f.counters().pool!.total_matched_cents, 1000 + matched);
        if (poolKind === "milestones") assert.deepEqual(clone(donation.matchAllocations), [
          { tierId: "sponsor-one", sponsorLabel: "First Sponsor", matchedCents: 1000 },
          { tierId: "sponsor-two", sponsorLabel: "Second Sponsor", matchedCents: 2000 },
        ]);
        assert.equal(f.counters().pool!.status, poolKind === "capped" ? "exhausted" : "active");
        assert.equal(f.emails.length, 2);
        assert.equal(f.emails.filter(email => email.subject.startsWith("Official Tax Receipt")).length, 1);
        assert.ok(donation.receiptNumber);
        assert.ok(donation.receiptSentAt);
        assert.equal(f.backups.length, 1);
        assert.equal(f.contacts.length, 1);
        const settled = f.snapshot();
        for (const [id, replaySession] of [
          ["evt_retry", session], ["evt_new_delivery", session],
          ["evt_alias", { ...session, id: "cs_alias" }],
        ] as const) {
          assert.equal((await f.deliver(replaySession, id)).idempotent, true);
          assert.deepEqual(f.snapshot(), settled);
        }
      });
    }
  }
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
