import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import pg from "pg";
import { communityResaleSchemaSql } from "../../server/lib/community-resale-schema";

// Bundle the actual services and lock; replace only the DB entry point (to
// avoid application startup) and provider factory. Every SQL query is real.
const compiled = build({
  stdin: {
    contents: `export * from './community-resale-refunds'; export {settleResaleSplit} from './resale-split-settlement';`,
    resolveDir: `${process.cwd()}/server/services`, loader: "ts",
  },
  bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
  plugins: [{
    name: "isolated-refund-boundaries",
    setup(b) {
      b.onResolve({ filter: /^(\.\.\/db|\.\.\/lib\/stripe-service|\.\/resale-payout-accounts)$/ },
        args => ({ path: args.path, namespace: "boundary" }));
      b.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({
        contents: args.path === "../db" ? "export const pool = globalThis.testPool;"
          : args.path === "./resale-payout-accounts" ? "export const bankAccountReady = () => { throw Error('Unexpected payout eligibility check'); };"
          : "export const stripeService = {getPlatformStripeClient(){throw Error('Real Stripe forbidden');}};",
        loader: "js",
      }));
    },
  }],
});

export function gate() {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(r => { enter = r; });
  const released = new Promise<void>(r => { release = r; });
  return { entered, release, async hold() { enter(); await released; } };
}

export async function fixture() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for opted-in DB tests");
  const schema = `refund_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, max: 5,
    options: `-c search_path=${schema} -c statement_timeout=8000 -c lock_timeout=6000`,
    application_name: schema,
  });
  const tenant = randomUUID(), otherTenant = randomUUID(), order = randomUUID(), item = randomUUID();
  const requestId = randomUUID();
  const raw = JSON.stringify({ requestId, amountCents: "damaged", evidence: "retain exactly" });
  const module = { exports: {} as any };
  runInNewContext((await compiled).outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), testPool: pool,
  });
  const api = module.exports;
  const charge: any = { id: "ch_test", amount: 10000, amount_refunded: 2500, disputed: false,
    balance_transaction: { fee: 1000, status: "available", available_on: 0 } };
  const refund: any = { id: "re_test", charge: charge.id, amount: 2500, status: "succeeded",
    metadata: { communityRefundId: requestId, resaleOrderId: order, tenantId: tenant } };
  const legs = Object.fromEntries(["rescue", "contributor"].map(role => [role, {
    amount: 4000, destination: `${role}_account`, transferId: `tr_${role}`, attemptedAt: "2026-01-01",
  }]));
  const transfers = Object.entries(legs).map(([role, leg]) => ({
    id: leg.transferId, amount: 4000, amount_reversed: 4000, currency: "usd",
    source_transaction: charge.id, destination: leg.destination,
    metadata: { resaleOrderId: order, tenantId: tenant, resaleLeg: role },
  }));
  const calls = { reads: 0, creates: 0, reversals: 0, feeRefunds: 0 };
  const createdRefunds = new Map<string, any>();
  const state = {
    beforePayment: undefined as undefined | (() => Promise<void>),
    refundRead: undefined as undefined | (() => any),
    refundList: undefined as undefined | (() => any[]),
  };
  const stripe = {
    paymentIntents: { retrieve: async () => {
      calls.reads++;
      await state.beforePayment?.();
      return { status: "succeeded", amount: 10000, currency: "usd",
        metadata: { type: "community_resale", resaleOrderId: order, tenantId: tenant },
        latest_charge: structuredClone(charge) };
    } },
    refunds: {
      retrieve: async (id: string) => {
        calls.reads++;
        return structuredClone(createdRefunds.get(id) ?? (state.refundRead ? state.refundRead() : refund));
      },
      list: () => ({ autoPagingToArray: async () => structuredClone(state.refundList ? state.refundList() : [refund]) }),
      create: async (input: any) => {
        calls.creates++;
        const result = { id: "re_new", ...input, status: "pending" };
        createdRefunds.set(result.id, result);
        return structuredClone(result);
      },
    },
    transfers: {
      list: () => ({ autoPagingToArray: async () => structuredClone(transfers) }),
      retrieve: async (id: string) => structuredClone(transfers.find(t => t.id === id)),
      create: async () => { calls.creates++; throw Error("Unexpected transfer"); },
      createReversal: async () => { calls.reversals++; throw Error("Unexpected reversal"); },
    },
    applicationFees: { createRefund: async () => { calls.feeRefunds++; throw Error("Unexpected fee refund"); } },
  };
  async function close() {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query("CREATE TABLE tenants(id uuid PRIMARY KEY)");
    await pool.query(communityResaleSchemaSql);
    await pool.query("INSERT INTO tenants VALUES($1),($2)", [tenant, otherTenant]);
    await pool.query("INSERT INTO community_resale_items(id,tenant_id,seller_email,data) VALUES($1,$2,'seller@example.invalid','{}')", [item, tenant]);
    await pool.query(`INSERT INTO community_resale_orders(id,tenant_id,item_id,buyer_email,token_hash,payment_intent_id,data,status)
      VALUES($1::uuid,$2,$3,'buyer@example.invalid',$1::uuid::text,'pi_test',$4,'paid')`, [order, tenant, item, {
      amountCents: 10000, platformRevenueCents: 1000, proceedsMode: "split_50",
      rescueAccountId: "rescue_account", contributorAccountId: "contributor_account",
      refunds: [{ id: requestId, amountCents: 2500, reason: "Original refund", refund: { id: refund.id },
        status: "succeeded", recoveryStatus: "split_reconciliation" }],
    }]);
    await pool.query("INSERT INTO community_resale_splits(order_id,tenant_id,status,data) VALUES($1,$2,'needs_review',$3)", [order, tenant, legs]);
  } catch (e) { await close(); throw e; }
  return {
    pool, admin, schema, api, tenant, otherTenant, order, requestId, raw, stripe, state, calls, charge, refund, transfers, close,
    recover: (tid = tenant) => api.recoverCommunityRefundIntent(order, tid, "staff", raw, stripe),
    request: (tid = tenant) => api.requestCommunityRefund(order, tid, "staff", {
      requestId, amountCents: 2500, expectedRefundedCents: 2500, reason: "Original refund",
    }, stripe),
    settle: () => api.settleResaleSplit(order, tenant, stripe, "community"),
    audit: async () => (await pool.query("SELECT * FROM community_resale_audit ORDER BY created_at")).rows,
  };
}

export type Fixture = Awaited<ReturnType<typeof fixture>>;

// Observe a real server-side waiter on a separate backend PID. Timing alone or
// Promise.all would not prove either service uses the same advisory lock.
export async function blocked(f: Fixture) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const { rows } = await f.admin.query(`
      SELECT w.pid AS waiter, h.pid AS holder
      FROM pg_stat_activity w JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(w.pid))
      WHERE w.application_name=$1 AND h.application_name=$1
        AND w.wait_event='advisory'`, [f.schema]);
    if (rows.length) {
      assert.notEqual(rows[0].waiter, rows[0].holder);
      return;
    }
    await new Promise(r => setTimeout(r, 20));
  }
  assert.fail("No separate PostgreSQL connection blocked on the shared order lock");
}

export async function race(f: Fixture, first: () => Promise<any>, second: () => Promise<any>,
  whileBlocked?: () => Promise<void>) {
  const barrier = gate();
  let firstRead = true;
  f.state.beforePayment = async () => {
    if (firstRead) { firstRead = false; await barrier.hold(); }
  };
  // Attach rejection handlers immediately, including on expected failures.
  const holder = Promise.allSettled([first()]);
  let waiter: Promise<PromiseSettledResult<any>[]> | undefined;
  try {
    await Promise.race([barrier.entered, new Promise((_, reject) =>
      setTimeout(() => reject(Error("Holder did not reach provider barrier")), 5000).unref())]);
    waiter = Promise.allSettled([second()]);
    await blocked(f);
    await whileBlocked?.();
  } finally {
    barrier.release();
    await Promise.all([holder, waiter]);
  }
  return [(await holder)[0], (await waiter!)[0]];
}
