/**
 * Isolated HTTP harness: execute the checked-in webhook registration and resale
 * services, not a copied router. Only persistence and external services are fake.
 * No application bootstrap, credentials, database connection or Twilio client.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import ts from "typescript";
import express from "express";
import twilio from "twilio";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";

export const tenants = [
  { id: "rescue-a", subdomain: "alpha", twilioPhoneNumber: "+12025550100", twilioAuthTokenEncrypted: "encrypted-a" },
  { id: "rescue-b", subdomain: "beta", twilioPhoneNumber: "+12025550200", twilioAuthTokenEncrypted: "encrypted-b" },
];
export const tokens = { "encrypted-a": "test-only-token-a", "encrypted-b": "test-only-token-b" };
export const buyer = "+12025550101";
export const donor = "+12025550102";

// AST extraction keeps both actual registrations (including the alias) intact,
// without bootstrapping the enormous routes module and its unrelated services.
const source = readFileSync("server/routes.ts", "utf8");
const ast = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest, true);
const registrations: string[] = [];
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "app.post" &&
      ts.isStringLiteral(node.arguments[0]) &&
      ["/api/webhooks/twilio/incoming", "/api/webhooks/twilio/inbound"].includes(node.arguments[0].text)) {
    registrations.push(node.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (registrations.length !== 2) throw new Error("Expected both production inbound webhook registrations");

export async function compileWebhook() {
  const mocks: Record<string, string> = {
    "../db": "export const db=globalThis.fixture.db; export const pool=globalThis.fixture.pool;",
    "@shared/schema": "export const tenants={id:'id',twilioPhoneNumber:'twilioPhoneNumber',twilioAuthTokenEncrypted:'twilioAuthTokenEncrypted'};",
    "drizzle-orm": "export const eq=(column,value)=>({column,value});",
    "./lib/twilio-service": "export const sendSms=(...a)=>globalThis.fixture.sendSms(...a); export const isTwilioEnabled=(id)=>globalThis.fixture.enabled; export const handleIncomingSms=(...a)=>globalThis.fixture.incoming(...a); export const getTwilioConfigForTenant=()=>{throw Error('Unexpected status lookup')};",
    "./lib/encryption": "export const decrypt=(v)=>globalThis.fixture.decrypt(v);",
    "../lib/stripe-service": "export const stripeService=new Proxy({}, {get(){throw Error('Stripe forbidden in SMS tests')}});",
    "../lib/app-base-url": "export const getAppBaseUrl=()=> 'https://rescue.example';",
    "twilio": "export default {validateRequest:(...a)=>globalThis.fixture.validate(...a)};",
  };
  const result = await build({
    stdin: { contents: `import {db} from './db'; import {tenants} from '@shared/schema'; import {eq} from 'drizzle-orm'; export function register(app) {${registrations.join(";\n")}}`, resolveDir: `${process.cwd()}/server`, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{
      name: "isolated-boundaries",
      setup(b) {
        b.onResolve({ filter: /.*/ }, args => {
          let key = args.path;
          if (key === "./db") key = "../db";
          if (key === "../lib/twilio-service") key = "./lib/twilio-service";
          if (key in mocks) return { path: key, namespace: "mock" };
        });
        b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

export interface PersistenceOptions {
  pool?: any;
  tenants?: typeof tenants;
}

export function fixture(code: string, persistence: PersistenceOptions = {}) {
  const tenantRecords = persistence.tenants ?? tenants;
  const conversations = tenantRecords.map(t => ({
    id: `conversation-${t.id}`, tenant_id: t.id, code: "123456",
    buyer_phone: buyer, donor_phone: donor, item_status: "active",
    offer_status: "pending", offer_cents: 1500, unexpired: true,
  }));
  const messages: any[] = [], deliveries: any[] = [], sent: any[][] = [], fallback: any[][] = [], queries: any[] = [];
  const unexpected: string[] = [];
  function fail(message: string): never {
    unexpected.push(message);
    throw new Error(message);
  }
  const state = {
    enabled: true, routedAs: "foster_update", decryptFails: false,
    conversations, messages, deliveries, sent, fallback, queries, unexpected,
    decrypt(value: keyof typeof tokens) {
      if (state.decryptFails) throw new Error("fake decryption failure");
      return tokens[value];
    },
    validate: twilio.validateRequest,
    async sendSms(...args: any[]) { sent.push(args); return { status: "sent", sid: `SM-out-${sent.length}` }; },
    async incoming(...args: any[]) { fallback.push(args); return { routedAs: state.routedAs }; },
    db: {
      select() { return { from() { return { where(predicate: any) {
        return { async limit() { return tenantRecords.filter(t => (t as any)[predicate.column] === predicate.value); } };
      } }; } }; },
    },
    pool: persistence.pool ?? { query, async connect() { return { query, release() {} }; } },
  };
  async function query(raw: string, p: any[] = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    queries.push({ sql, p });
    const rows = (values: any[]) => ({ rows: values });
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return rows([]);
    if (sql.startsWith("SELECT c.") || sql.startsWith("SELECT i.id")) {
      let c;
      if (sql.includes("c.code=$2")) {
        if (!sql.includes("c.tenant_id=$1") || !sql.includes("(c.buyer_phone=$3 OR i.phone=$3)")) fail("Missing ownership guard");
        c = conversations.find(c => c.tenant_id === p[0] && c.code === p[1] &&
          [c.buyer_phone, c.donor_phone].includes(p[2]) &&
          ["active", "reserved", "paid", "completed"].includes(c.item_status));
      } else {
        if (!sql.includes("c.tenant_id=$2")) fail("Missing tenant guard");
        c = conversations.find(c => c.id === p[0] && c.tenant_id === p[1] &&
          (!p[2] || [c.buyer_phone, c.donor_phone].includes(p[2])));
      }
      return rows(c ? [sql.startsWith("SELECT i.id") ? { id: "item", status: c.item_status } : { ...c }] : []);
    }
    if (sql.startsWith("SELECT count(*)")) return rows([{ n: 0 }]);
    if (sql.startsWith("INSERT INTO rescue_resale_deliveries")) {
      deliveries.push({ id: p[0], tenant: p[1], message: p[2], order: p[3], recipient: p[4], status: "unknown" });
      return rows([]);
    }
    if (sql.startsWith("UPDATE rescue_resale_deliveries")) {
      const delivery = deliveries.find(d => d.id === p[0]);
      if (!delivery) fail("Unknown delivery");
      delivery.sid ??= p[1];
      if (delivery.status === "unknown") delivery.status = p[2];
      return rows([]);
    }
    if (sql.startsWith("INSERT INTO rescue_resale_messages")) {
      if (!sql.includes("ON CONFLICT(inbound_sid) DO NOTHING")) fail("Missing replay guard");
      const rejected = sql.includes("'rejected'");
      const command = sql.includes("'command'");
      const sid = p[rejected ? 3 : command ? 4 : 5];
      if (sid && messages.some(m => m.sid === sid)) return rows([]);
      messages.push({ id: p[0], conversation: p[1], sender: p[2],
        body: rejected ? "Invalid SMS offer command" : p[3],
        status: rejected ? "rejected" : command ? "command" : p[4], sid });
      return rows([{ id: p[0] }]);
    }
    if (sql.startsWith("UPDATE rescue_resale_messages")) {
      const m = messages.find(m => m.id === p[0]);
      if (!m) fail("Unknown message");
      m.status = sql.includes("status='rejected'") ? "rejected" : p[1];
      return rows([]);
    }
    if (sql.startsWith("UPDATE rescue_resale_conversations")) {
      const c = conversations.find(c => c.id === p[0])!;
      c.offer_status = p[1]; c.offer_cents = p[2];
      return rows([]);
    }
    return fail(`Unmocked database operation: ${sql}`);
  }
  const module = { exports: {} as any };
  runInNewContext(code, {
    module, exports: module.exports, fixture: state,
    process: { env: { APP_BASE_URL: "https://rescue.example" } }, console, URL,
    require(name: string) {
      if (name === "node:crypto") return { randomUUID, createHash };
      if (name === "zod") return { z };
      throw new Error(`External module forbidden: ${name}`);
    },
  });
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  module.exports.register(app);
  return { ...state, state, app };
}

export async function withWebhook(code: string, run: (h: ReturnType<typeof fixture>, post: any) => Promise<void>, persistence: PersistenceOptions = {}) {
  const h = fixture(code, persistence);
  const server = h.app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  let sequence = 0;
  async function post(body: string, options: any = {}) {
    const path = options.path || "/api/webhooks/twilio/incoming";
    const params = { From: donor, To: tenants[0].twilioPhoneNumber, Body: body, MessageSid: `SM-test-${++sequence}`, ...options.params };
    if (options.omitSid) delete params.MessageSid;
    const signature = twilio.getExpectedTwilioSignature(options.token || tokens["encrypted-a"], `https://rescue.example${options.signPath || path}`, params);
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded",
        ...(options.noSignature ? {} : { "x-twilio-signature": options.signature || signature }) },
      body: new URLSearchParams(params),
    });
    return { status: response.status, type: response.headers.get("content-type"), text: await response.text() };
  }
  try {
    await run(h, post);
    // Production catches relay errors: do not let those catches hide a broken mock
    // or a newly added persistence operation from the regression suite.
    assert.deepEqual(h.unexpected, []);
  }
  finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
