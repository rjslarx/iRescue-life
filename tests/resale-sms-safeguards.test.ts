/**
 * scripts/run-tests.sh tests/resale-sms-safeguards.test.ts
 *
 * Exercises real resale-delivery -> sendSms -> sendWithFallback code.
 * Only persistence, encryption, clock, base URL and Twilio transport are faked.
 * No app bootstrap, database connection, credentials, or network access.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";

let code: string;
before(async () => {
  const tables = "tenants smsMessageLogs smsProxySessions transportEvents users fosterAnimals supplyRequests fosterUpdates medicationTasks complianceReminders animals contacts adoptionCheckoutSessions adopterHelpRequests calendars calendarEvents adoptions happyTails".split(" ");
  const mocks: Record<string, string> = {
    "../db": "export const db=globalThis.fixture.db; export const pool=globalThis.fixture.pool;",
    "@shared/schema": tables.map(name => `export const ${name}=new Proxy({}, {get:(_,key)=>'${name}.'+key});`).join("\n"),
    "drizzle-orm": "export const eq=(...args)=>args; export const isNotNull=column=>({notNull:column}); export const and=eq,desc=eq,gte=eq,lte=eq,inArray=eq,or=eq,sql=eq;",
    "date-fns": "export const startOfDay=()=>{throw Error('Unexpected date helper')}; export const endOfDay=startOfDay,eachDayOfInterval=startOfDay,addDays=startOfDay,format=startOfDay,parseISO=startOfDay;",
    "./encryption": "export const decrypt=x=>x; export const encrypt=decrypt;",
    "./app-base-url": "export const getAppBaseUrl=()=> 'https://resale.example.test';",
    "../lib/app-base-url": "export const getAppBaseUrl=()=> 'https://resale.example.test';",
    "twilio": "export default (...args)=>globalThis.fixture.createClient(...args);",
  };
  const result = await build({
    entryPoints: ["server/services/resale-delivery.ts"],
    bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{
      name: "isolated-sms-boundaries",
      setup(b) {
        b.onResolve({ filter: /.*/ }, args => {
          // Inbound handlers are outside this suite. Fail closed if invoked.
          if (args.kind === "dynamic-import") return { path: args.path, external: true };
          if (args.path in mocks) return { path: args.path, namespace: "mock" };
        });
        b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
      },
    }],
  });
  code = result.outputFiles[0].text;
});

const tenantId = "rescue-test";
const number = "+12025550101";
type Options = {
  paused?: boolean;
  timezone?: string | null;
  now?: string;
  enabled?: boolean;
  optedOut?: boolean;
  userPhone?: string | null;
  userTenant?: string;
  optOutReadFails?: boolean;
  providerError?: { message: string; status?: number; code?: number };
  logFails?: boolean;
  readFails?: boolean;
};

function harness(options: Options = {}) {
  const calls: any[] = [], logs: any[] = [], audits: any[] = [], reads: any[] = [];
  let clients = 0;
  const tenant = {
    commsPaused: options.paused ?? false, timezone: options.timezone === undefined ? "America/Chicago" : options.timezone,
    twilioEnabled: options.enabled ?? true, twilioAccountSidEncrypted: "fake-account",
    twilioAuthTokenEncrypted: "fake-token", twilioPhoneNumber: "+12025550102",
    twilioMessagingServiceSid: "fake-service", name: "Example Rescue",
  };
  const user = { tenantId: options.userTenant ?? tenantId,
    phone: options.userPhone === undefined ? number : options.userPhone, smsOptIn: false,
    smsOptOutAt: options.optedOut ? new Date("2026-11-01T12:00:00Z") : null };
  const fixture = {
    db: {
      select(projection: any) {
        return { from(table: any) {
          return { async where(condition: any) {
            reads.push({ projection, condition });
            if (options.readFails) throw Error("Simulated settings read failure");
            if (table.id === "users.id") {
              if (options.optOutReadFails) throw Error("Simulated opt-out read failure");
              assert.deepEqual(Array.from(condition[0]), ["users.tenantId", tenantId]);
              assert.equal(condition[1].notNull, "users.smsOptOutAt");
              assert.equal(projection.phone, "users.phone");
              return user.tenantId === condition[0][1] && user.smsOptOutAt ? [user] : [];
            }
            assert.equal(table.id, "tenants.id");
            assert.deepEqual(Array.from(condition), ["tenants.id", tenantId]);
            return [tenant];
          } };
        } };
      },
      insert(table: any) {
        assert.equal(table.id, "smsMessageLogs.id");
        return { async values(row: any) {
          logs.push(row);
          if (options.logFails) throw Error("Simulated SMS log failure");
        } };
      },
    },
    pool: {
      async query(raw: string, params: any[]) {
        const sql = raw.replace(/\s+/g, " ").trim();
        if (sql.startsWith("INSERT INTO rescue_resale_deliveries")) {
          assert.equal(params[1], tenantId);
          audits.push({ id: params[0], status: "unknown", sid: null });
        } else if (sql.startsWith("UPDATE rescue_resale_deliveries SET provider_sid=")) {
          const audit = audits.find(a => a.id === params[0]);
          assert.ok(audit);
          audit.sid = params[1];
          audit.status = params[2];
        } else throw Error(`Unexpected SQL: ${sql}`);
        return { rows: [] };
      },
    },
    createClient(account: string, token: string) {
      clients++;
      assert.equal(account, "fake-account");
      assert.equal(token, "fake-token");
      return { messages: { async create(input: any) {
        assert.equal(audits.length, 1, "recipient audit must exist before provider call");
        calls.push(input);
        if (options.providerError) throw options.providerError;
        return { sid: "SM-test", from: tenant.twilioPhoneNumber };
      } } };
    },
  };
  const instant = Date.parse(options.now ?? "2026-11-13T18:00:00Z");
  class Clock extends Date { constructor() { super(instant); } }
  const module = { exports: {} as any };
  runInNewContext(code, {
    module, exports: module.exports, fixture, URL, Date: Clock,
    console: { warn() {}, error() {}, log() {} },
    require(name: string) {
      if (name === "node:crypto") return { randomUUID };
      throw Error(`External dependency forbidden: ${name}`);
    },
  });
  return {
    calls, logs, audits, reads, clients: () => clients,
    async send(bypassQuietHours?: boolean) {
      const status = await module.exports.sendResaleSms({
        tenantId, messageId: "message-test", recipient: "buyer", number,
        body: "Resale R123456: Still available?", bypassQuietHours,
      });
      assert.equal(audits[0].status, status, "persist the returned outcome");
      assert.equal(audits[0].sid, status === "accepted" ? "SM-test" : null);
      return status;
    },
  };
}

for (const bypass of [undefined, false, true]) {
  test(`communication pause prevents provider calls (quiet-hour bypass=${bypass})`, async () => {
    const h = harness({ paused: true });
    assert.equal(await h.send(bypass), "not_sent");
    assert.equal(h.calls.length, 0);
    assert.equal(h.clients(), 0);
    assert.equal(h.logs.length, 0);
    assert.equal(h.reads.length, 1);
  });
}

for (const [time, expected] of [
  ["2026-11-13T01:59:00Z", "accepted"], // 19:59 CST
  ["2026-11-13T02:00:00Z", "not_sent"], // 20:00 CST
  ["2026-11-13T11:59:00Z", "not_sent"], // 05:59 CST
  ["2026-11-13T12:00:00Z", "accepted"], // 06:00 CST
  ["2026-07-13T01:00:00Z", "not_sent"], // 20:00 CDT, not fixed CST
] as const) {
  test(`system broadcast observes tenant quiet hours at ${time}`, async () => {
    const h = harness({ now: time });
    assert.equal(await h.send(false), expected);
    assert.equal(h.calls.length, expected === "accepted" ? 1 : 0);
  });
}

for (const timezone of [null, "Invalid/Timezone"]) {
  test(`unset or invalid timezone uses legacy CST quiet hours: ${timezone}`, async () => {
    const h = harness({ timezone, now: "2026-07-13T02:00:00Z" });
    assert.equal(await h.send(), "not_sent");
    assert.equal(h.calls.length, 0);
  });
}

test("direct response bypasses quiet hours but retains callback and SMS audit", async () => {
  const h = harness({ now: "2026-11-13T03:00:00Z" });
  assert.equal(await h.send(true), "accepted");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].to, number);
  assert.equal(h.calls[0].messagingServiceSid, "fake-service");
  assert.equal(h.calls[0].body, "Example: Resale R123456: Still available?");
  const callback = new URL(h.calls[0].statusCallback);
  assert.equal(callback.origin + callback.pathname, "https://resale.example.test/api/webhooks/twilio/status");
  assert.equal(callback.searchParams.get("resaleDelivery"), h.audits[0].id);
  assert.equal(h.logs[0].tenantId, tenantId);
  assert.equal(h.logs[0].messageType, "proxy_message");
  assert.equal(h.logs[0].twilioMessageSid, "SM-test");
});

test("disabled Twilio cannot send even a direct response", async () => {
  const h = harness({ enabled: false });
  assert.equal(await h.send(true), "not_sent");
  assert.equal(h.calls.length, 0);
});

for (const bypass of [false, true]) {
  test(`provider unsubscribe rejection is not_sent without fallback or retry (direct=${bypass})`, async () => {
    const h = harness({ providerError: { message: "Recipient unsubscribed", status: 400, code: 21610 } });
    assert.equal(await h.send(bypass), "not_sent");
    assert.equal(h.calls.length, 1, "Twilio rejection requires a provider call; it is not local suppression");
    assert.equal(h.logs[0].status, "failed");
  });

  test(`local unsubscribe prevents provider calls (direct=${bypass})`, async () => {
    const h = harness({ optedOut: true });
    assert.equal(await h.send(bypass), "not_sent");
    assert.equal(h.calls.length, 0);
    assert.equal(h.clients(), 0);
    assert.equal(h.logs.length, 0);
  });
}

for (const userPhone of ["(202) 555-0101", "1-202-555-0101", "+1 (202) 555-0101"]) {
  test(`formatted opted-out phone blocks a direct reply: ${userPhone}`, async () => {
    const h = harness({ optedOut: true, userPhone });
    assert.equal(await h.send(true), "not_sent");
    assert.equal(h.calls.length, 0);
  });
}

for (const options of [
  { optedOut: true, userTenant: "other-rescue" },
  { optedOut: true, userPhone: "+12025550999" },
  { optedOut: true, userPhone: "+442025550101" },
  { optedOut: true, userPhone: null },
  { optedOut: false },
]) {
  test(`unrelated or absent explicit opt-out does not block: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    assert.equal(await h.send(true), "accepted");
    assert.equal(h.calls.length, 1);
  });
}

test("opt-out lookup failure fails closed with an unknown outcome", async () => {
  const h = harness({ optOutReadFails: true });
  assert.equal(await h.send(true), "unknown");
  assert.equal(h.calls.length, 0);
});

for (const providerError of [
  { message: "Response lost" },
  { message: "Provider unavailable", status: 503 },
]) {
  test(`${providerError.message} stays unknown and is never retried`, async () => {
    const h = harness({ providerError });
    assert.equal(await h.send(true), "unknown");
    assert.equal(h.calls.length, 1);
  });
}

test("SMS log failure after acceptance preserves the provider SID", async () => {
  const h = harness({ logFails: true });
  assert.equal(await h.send(true), "accepted");
  assert.equal(h.calls.length, 1);
});

test("provider failure plus SMS log failure remains unknown", async () => {
  const h = harness({ logFails: true, providerError: { message: "Response lost" } });
  assert.equal(await h.send(true), "unknown");
  assert.equal(h.calls.length, 1);
});

test("settings read exception cannot send and is conservatively unknown", async () => {
  const h = harness({ readFails: true });
  assert.equal(await h.send(true), "unknown");
  assert.equal(h.calls.length, 0);
});
