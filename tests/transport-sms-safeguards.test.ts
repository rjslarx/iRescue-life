/**
 * scripts/run-tests.sh tests/transport-sms-safeguards.test.ts
 * Real broadcast -> sendSms -> fallback; no database, credentials or network.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

let code: string;
before(async () => {
  const tables = "tenants smsMessageLogs smsProxySessions transportEvents users fosterAnimals supplyRequests fosterUpdates medicationTasks complianceReminders animals contacts adoptionCheckoutSessions adopterHelpRequests calendars calendarEvents adoptions happyTails".split(" ");
  const mocks: Record<string, string> = {
    "../db": "export const db=globalThis.fixture.db;",
    "@shared/schema": tables.map(name => `export const ${name}=new Proxy({}, {get:(_,key)=>'${name}.'+key});`).join("\n"),
    "drizzle-orm": "export const eq=(...args)=>args; export const isNotNull=column=>({notNull:column}); export const and=eq,desc=eq,gte=eq,lte=eq,inArray=eq,or=eq,sql=eq;",
    "date-fns": "export const startOfDay=()=>{throw Error('Unexpected date helper')}; export const endOfDay=startOfDay,eachDayOfInterval=startOfDay,addDays=startOfDay,format=startOfDay,parseISO=startOfDay;",
    "./encryption": "export const decrypt=x=>x; export const encrypt=decrypt;",
    "./app-base-url": "export const getAppBaseUrl=()=> 'https://transport.example.test';",
    "twilio": "export default ()=>globalThis.fixture.client;",
  };
  const result = await build({
    entryPoints: ["server/lib/twilio-service.ts"],
    bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{
      name: "isolated-transport-sms",
      setup(b) {
        b.onResolve({ filter: /.*/ }, args => {
          if (args.kind === "dynamic-import") return { path: args.path, external: true };
          if (args.path in mocks) return { path: args.path, namespace: "mock" };
        });
        b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
      },
    }],
  });
  code = result.outputFiles[0].text;
});

const first = "+12025550101", second = "+12025550102", third = "+12025550103";
function harness(options: {
  paused?: boolean; enabled?: boolean; logFails?: boolean; readFails?: boolean;
  optedOut?: { phone: string; tenantId: string }[];
  errors?: Record<string, { message: string; status?: number; code?: number }>;
} = {}) {
  const calls: any[] = [], logs: any[] = [];
  const fixture = {
    db: {
      select() {
        return { from(table: any) { return { async where(condition: any) {
          if (table.id === "users.id") {
            if (options.readFails) throw Error("Opt-out lookup unavailable");
            assert.deepEqual(Array.from(condition[0]), ["users.tenantId", "rescue"]);
            assert.equal(condition[1].notNull, "users.smsOptOutAt");
            return (options.optedOut ?? []).filter(u => u.tenantId === condition[0][1]);
          }
          assert.equal(table.id, "tenants.id");
          assert.deepEqual(Array.from(condition), ["tenants.id", "rescue"]);
          return [{
            commsPaused: options.paused, timezone: "America/Chicago",
            twilioEnabled: options.enabled ?? true,
            twilioAccountSidEncrypted: "fake", twilioAuthTokenEncrypted: "fake",
            twilioPhoneNumber: "+12025550999", twilioMessagingServiceSid: "fake-service",
            name: "Example Rescue",
          }];
        } }; } };
      },
      insert(table: any) {
        assert.equal(table.id, "smsMessageLogs.id");
        return { async values(row: any) {
          logs.push(row);
          if (options.logFails) throw Error("Audit unavailable");
        } };
      },
    },
    client: { messages: { async create(input: any) {
      calls.push(input);
      const error = options.errors?.[input.to];
      if (error && (!input.from || error.code !== 21704)) throw error;
      return { sid: `SM-${input.to}`, from: "+12025550999" };
    } } },
  };
  // 21:00 CST: prove the transport exception is intentional, not clock-dependent.
  class Clock extends Date { constructor() { super("2026-11-13T03:00:00Z"); } }
  const module = { exports: {} as any };
  runInNewContext(code, {
    module, exports: module.exports, fixture, Date: Clock,
    console: { warn() {}, error() {}, log() {} },
    require(name: string) { throw Error(`External dependency forbidden: ${name}`); },
  });
  return { calls, logs, send: (numbers = [first]) =>
    module.exports.broadcastTransportUpdate("rescue", "trip", "Arriving soon", numbers, { id: "staff", name: "Coordinator" }) };
}

test("paused tenants cannot send transport alerts, including during quiet hours", async () => {
  const h = harness({ paused: true });
  const results = await h.send([first, second]);
  assert.ok(results.every((r: any) => r.status === "failed" && /paused/.test(r.error)));
  assert.equal(h.calls.length, 0);
  assert.equal(h.logs.length, 0);
});

test("normalized recorded unsubscribe blocks only that tenant's recipient", async () => {
  const h = harness({ optedOut: [
    { phone: "(202) 555-0101", tenantId: "rescue" },
    { phone: second, tenantId: "other-rescue" },
  ] });
  const results = await h.send([first, second]);
  assert.match(results[0].error, /opted out/);
  assert.equal(results[1].status, "sent");
  assert.deepEqual(h.calls.map(c => c.to), [second]);
});

test("all-hours transport delivery preserves one prefix, callback and audit fields", async () => {
  const h = harness();
  const [result] = await h.send();
  assert.equal(result.status, "sent");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].body, "Example: Transport Update: Arriving soon");
  assert.equal(h.calls[0].statusCallback, "https://transport.example.test/api/webhooks/twilio/status");
  assert.equal(h.logs.length, 1);
  const log = h.logs[0];
  for (const [key, value] of Object.entries({
    tenantId: "rescue", transportId: "trip", messageType: "transport_alert",
    sentBy: "staff", sentByName: "Coordinator", status: "sent",
    toNumber: first, fromNumber: "+12025550999", direction: "outbound",
    twilioMessageSid: result.sid, body: h.calls[0].body,
  })) assert.equal(log[key], value, key);
});

test("partial outcomes retain input order and failure audit without retrying", async () => {
  const h = harness({ errors: { [second]: { message: "Unsubscribed", status: 400, code: 21610 } } });
  const results = await h.send([first, second, third]);
  assert.deepEqual(Array.from(results, (r: any) => r.status), ["sent", "failed", "sent"]);
  assert.equal(results[1].uncertain, false);
  assert.equal(h.calls.length, 3);
  assert.equal(h.logs.length, 3);
  const failed = h.logs.find(l => l.status === "failed");
  assert.equal(failed.transportId, "trip");
  assert.equal(failed.sentBy, "staff");
  assert.equal(failed.errorMessage, "Unsubscribed");
});

test("duplicate recipient spellings share one send and one audit", async () => {
  const h = harness();
  const numbers = [first, "(202) 555-0101", first];
  const results = await h.send(numbers);
  assert.deepEqual(Array.from(results, (r: any) => r.number), numbers);
  assert.ok(results.every((r: any) => r.sid === `SM-${first}`));
  assert.equal(h.calls.length, 1);
  assert.equal(h.logs.length, 1);
});

test("audit failure after provider acceptance stays sent without duplicate attempts", async () => {
  const h = harness({ logFails: true });
  assert.equal((await h.send())[0].status, "sent");
  assert.equal(h.calls.length, 1);
  assert.equal(h.logs.length, 1);
});

test("provider and audit failures do not discard successful recipient outcomes", async () => {
  const h = harness({ logFails: true, errors: { [second]: { message: "Response lost" } } });
  const results = await h.send([first, second]);
  assert.equal(results[0].status, "sent");
  assert.equal(results[1].status, "failed");
  assert.equal(results[1].uncertain, true);
  assert.equal(h.calls.length, 2);
});

test("lookup errors fail closed per recipient without rejecting the batch", async () => {
  const h = harness({ readFails: true });
  const results = await h.send([first, second]);
  assert.ok(results.every((r: any) => r.status === "failed" && r.uncertain));
  assert.equal(h.calls.length, 0);
});

test("disabled configuration sends nothing", async () => {
  const h = harness({ enabled: false });
  assert.match((await h.send())[0].error, /not configured/);
  assert.equal(h.calls.length, 0);
});

test("known messaging-service rejection permits exactly one direct fallback", async () => {
  const h = harness({ errors: { [first]: { message: "Service unavailable", code: 21704, status: 400 } } });
  assert.equal((await h.send())[0].status, "sent");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].from, "+12025550999");
  assert.equal(h.logs.length, 1);
});

test("ambiguous provider failures are never retried", async () => {
  const h = harness({ errors: { [first]: { message: "Response lost" } } });
  const [result] = await h.send();
  assert.equal(result.status, "failed");
  assert.equal(result.uncertain, true);
  assert.equal(h.calls.length, 1);
});
