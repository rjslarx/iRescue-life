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
    stdin: { contents: `export * from "./server/services/resale-delivery";
      export { handleIncomingSms } from "./server/lib/twilio-service";
      export * from "./server/lib/sms-suppression";`, resolveDir: process.cwd() },
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
  proxyDirection?: "A" | "B";
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
  const events = new Set<string>(), suppressions = new Map<string, boolean>();
  let clients = 0;
  const tenant = {
    id: tenantId,
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
          return { where(condition: any) {
            const result = (async () => {
            reads.push({ projection, condition });
            if (options.readFails) throw Error("Simulated settings read failure");
            if (table.id === "smsProxySessions.id") {
              assert.deepEqual(Array.from(condition[0]), ["smsProxySessions.tenantId", tenantId]);
              const isA = condition.some((c: any) => c[0] === "smsProxySessions.partyAPhone");
              if ((isA ? "A" : "B") !== options.proxyDirection) return [];
              return [{ id: "proxy-session", tenantId, partyAPhone: number, partyBPhone: number,
                partyAAlias: "Party A", partyBAlias: "Party B" }];
            }
            if (table.id === "users.id") {
              if (projection.id) return []; // accountless proxy participants
              if (options.optOutReadFails) throw Error("Simulated opt-out read failure");
              assert.deepEqual(Array.from(condition[0]), ["users.tenantId", tenantId]);
              assert.equal(condition[1].notNull, "users.smsOptOutAt");
              assert.equal(projection.phone, "users.phone");
              return user.tenantId === condition[0][1] && user.smsOptOutAt ? [user] : [];
            }
            assert.equal(table.id, "tenants.id");
            if (condition[0] === "tenants.twilioPhoneNumber") return [tenant];
            assert.deepEqual(Array.from(condition), ["tenants.id", tenantId]);
            return [tenant];
            })();
            return Object.assign(result, { limit: () => result });
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
        if (sql.startsWith("WITH event AS")) {
          const [tenant, sid, phone, command] = params;
          if (!events.has(`${tenant}:${sid}`)) {
            events.add(`${tenant}:${sid}`);
            suppressions.set(`${tenant}:${phone}`, command === "STOP");
          }
        } else if (sql.startsWith("SELECT suppressed FROM sms_phone_suppressions")) {
          return { rows: [{ suppressed: suppressions.get(`${params[0]}:${params[1]}`) ?? false }] };
        } else if (sql.startsWith("INSERT INTO rescue_resale_deliveries")) {
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
        if (!options.proxyDirection) assert.ok(audits.length >= 1, "recipient audit must exist before provider call");
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
    relay: () => module.exports.handleIncomingSms("+12025550199", tenant.twilioPhoneNumber, "ordinary relay"),
    event: module.exports.recordVerifiedSmsOptOut,
    command: module.exports.smsOptOutCommand,
    user,
    calls, logs, audits, reads, clients: () => clients,
    async send(bypassQuietHours?: boolean) {
      const status = await module.exports.sendResaleSms({
        tenantId, messageId: "message-test", recipient: "buyer", number,
        body: "Resale R123456: Still available?", bypassQuietHours,
      });
      assert.equal(audits.at(-1).status, status, "persist the returned outcome");
      assert.equal(audits.at(-1).sid, status === "accepted" ? "SM-test" : null);
      return status;
    },
  };
}

test("accountless STOP blocks provider; START restores transactional eligibility without consent", async () => {
  const h = harness({ userPhone: null });
  const stop = `SM${"1".repeat(32)}`, start = `SM${"2".repeat(32)}`;
  await h.event(tenantId, "(202) 555-0101", stop, "STOP");
  assert.equal(await h.send(true), "not_sent");
  assert.equal(h.calls.length, 0);
  await h.event(tenantId, number, start, "START");
  await h.event(tenantId, number, stop, "STOP"); // replay cannot undo START
  assert.equal(await h.send(true), "accepted");
  assert.equal(h.user.smsOptIn, false);
  await h.event(tenantId, number, `SM${"3".repeat(32)}`, "STOP");
  await h.event(tenantId, number, start, "START"); // replay cannot undo new STOP
  assert.equal(await h.send(true), "not_sent");
  assert.equal(h.calls.length, 1);
});

test("phone suppressions cannot cross tenants or clear independent account opt-outs", async () => {
  const h = harness();
  await h.event("other-rescue", number, `SM${"4".repeat(32)}`, "STOP");
  assert.equal(await h.send(true), "accepted");
  const optedOut = harness({ optedOut: true });
  await optedOut.event(tenantId, number, `SM${"5".repeat(32)}`, "START");
  assert.equal(await optedOut.send(true), "not_sent");
  assert.equal(optedOut.user.smsOptIn, false);
});

test("only exact commands or provider opt-out metadata are consumed", () => {
  const h = harness();
  for (const word of [" stop ", "STOPALL", "unsubscribe", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]) {
    assert.equal(h.command(word, undefined), "STOP");
  }
  for (const word of ["START", "UNSTOP"]) assert.equal(h.command(word, undefined), "START");
  assert.equal(h.command("YES", undefined), null);
  assert.equal(h.command("YES", "START"), "START");
  for (const word of ["R123456 STOP", "stop by tomorrow", "please start", ""]) assert.equal(h.command(word, undefined), null);
  assert.equal(h.command("custom keyword", "STOP"), "STOP");
  assert.equal(h.command("STOP", "HELP"), "HELP");
});

for (const proxyDirection of ["A", "B"] as const) {
  test(`proxy ${proxyDirection} forwarding honors accountless STOP and START`, async () => {
    const h = harness({ proxyDirection, userPhone: null });
    await h.event(tenantId, number, `SM${"6".repeat(32)}`, "STOP");
    assert.equal((await h.relay()).success, false);
    assert.equal(h.calls.length, 0);
    await h.event(tenantId, number, `SM${"7".repeat(32)}`, "START");
    assert.equal((await h.relay()).success, true);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].to, number);
    assert.equal(h.calls[0].body, `(From Party ${proxyDirection}): ordinary relay`);
  });
  test(`proxy ${proxyDirection} forwarding respects pauses and never retries uncertain outcomes`, async () => {
    const paused = harness({ proxyDirection, paused: true });
    assert.equal((await paused.relay()).success, false);
    assert.equal(paused.calls.length, 0);
    const failed = harness({ proxyDirection, providerError: { message: "Response lost" } });
    assert.equal((await failed.relay()).success, false);
    assert.equal(failed.calls.length, 1);
  });
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
