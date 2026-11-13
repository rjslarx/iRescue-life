import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transform, build } from "esbuild";
import twilio from "twilio";

// Exercise the actual registered route without booting unrelated app services.
const routes = readFileSync("server/routes.ts", "utf8");
const route = routes.slice(routes.indexOf("  app.post('/api/webhooks/twilio/incoming'"),
  routes.indexOf("  app.post('/api/webhooks/twilio/inbound'"));
const compiled = (await transform(route.replace(/import\((['"])(.*?)\1\)/g,
  (_, _quote, path) => `Promise.resolve(imports[${JSON.stringify(path)}])`), { loader: "ts" })).code;
const commandBundle = await build({
  entryPoints: ["server/lib/sms-suppression.ts"], bundle: true, platform: "node", format: "cjs", write: false,
  plugins: [{ name: "no-database", setup(b) {
    b.onResolve({ filter: /^\.\.\/db$/ }, () => ({ path: "db", namespace: "fake" }));
    b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ contents: "export const pool = {};" }));
  } }],
});
const commandModule = { exports: {} as any };
runInNewContext(commandBundle.outputFiles[0].text, { module: commandModule, exports: commandModule.exports });
const { smsOptOutCommand } = commandModule.exports;

async function request({ signature = true, knownTenant = true, fail = false, body = "STOP", metadata }: {
  signature?: boolean; knownTenant?: boolean; fail?: boolean; body?: string; metadata?: string;
} = {}) {
  const events: any[] = [], relays: string[] = [];
  const payload = { From: "+12025550101", To: "+12025550102", Body: body,
    MessageSid: `SM${"a".repeat(32)}`, ...(metadata ? { OptOutType: metadata } : {}) };
  const token = "test-only-token", url = "https://example.test/api/webhooks/twilio/incoming";
  let handler: any;
  const response = { statusCode: 200, body: "", status(code: number) { this.statusCode = code; return this; },
    type() { return this; }, set() { return this; }, send(body: string) { this.body = body; return this; } };
  runInNewContext(compiled, {
    app: { post(_path: string, fn: any) { handler = fn; } },
    db: { select: () => ({ from: () => ({ where: () => ({ limit: async () =>
      knownTenant ? [{ id: "verified-tenant", twilioAuthTokenEncrypted: token }] : [] }) }) }) },
    tenants: {}, eq: () => {}, process: { env: {} }, console: { warn() {}, error() {} },
    imports: {
      "twilio": { default: twilio },
      "./lib/encryption": { decrypt: (s: string) => s },
      "./lib/sms-suppression": {
        smsOptOutCommand,
        recordVerifiedSmsOptOut: async (...args: any[]) => { if (fail) throw Error("DB unavailable"); events.push(args); },
      },
      "./lib/twilio-service": { handleIncomingSms: async () => { relays.push("general"); return { routedAs: body === "YES" ? "medication_confirmed" : null }; } },
      "./services/rescue-resale": { handleResaleSms: async () => { relays.push("resale"); return false; } },
    },
  });
  await handler({ body: payload, headers: signature ? { "x-twilio-signature": twilio.getExpectedTwilioSignature(token, url, payload) } : {},
    protocol: "https", get: () => "example.test", originalUrl: "/api/webhooks/twilio/incoming" }, response);
  return { events, relays, response };
}

test("verified STOP and START persist before routing, without an application reply", async () => {
  for (const body of ["STOP", "START"]) {
    const r = await request({ body });
    assert.equal(r.events[0][0], "verified-tenant");
    assert.equal(r.events[0][3], body);
    assert.equal(r.relays.length, 0);
    assert.equal(r.response.statusCode, 200);
    assert.ok(!r.response.body.includes("<Message>"));
  }
});
test("unsigned or unresolved requests never change suppression", async () => {
  for (const options of [{ signature: false }, { knownTenant: false }]) {
    const r = await request(options);
    assert.equal(r.response.statusCode, 403);
    assert.equal(r.events.length, 0);
    assert.equal(r.relays.length, 0);
  }
});
test("persistence failure remains retryable and HELP stays provider-managed", async () => {
  assert.equal((await request({ fail: true })).response.statusCode, 503);
  const help = await request({ metadata: "HELP" });
  assert.equal(help.events.length, 0);
  assert.equal(help.relays.length, 0);
});

test("ordinary YES reaches medication routing; only provider START metadata changes suppression", async () => {
  const ordinary = await request({ body: "YES" });
  assert.equal(ordinary.events.length, 0);
  assert.deepEqual(ordinary.relays, ["resale", "general"]);
  assert.match(ordinary.response.body, /Meds confirmed/);
  const providerStart = await request({ body: "YES", metadata: "START" });
  assert.equal(providerStart.events.length, 1);
  assert.equal(providerStart.events[0][3], "START");
  assert.equal(providerStart.relays.length, 0);
  assert.ok(!providerStart.response.body.includes("<Message>"));
});
