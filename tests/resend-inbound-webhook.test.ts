import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Webhook } from "svix";
import { verifyInboundWebhook, inboundRecipients } from "../server/lib/resend-inbound-webhook";

// Test-only signing key; never reads deployment credentials.
const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const event = {
  type: "email.received",
  created_at: "2026-10-08T10:00:00.000Z",
  data: { email_id: "f64296e2-a5d7-43c6-a4e2-9b4afb740244", from: "sender@example.com", to: ["admin@irescue.life"], subject: "test" },
};
function signed(value: unknown = event, time = new Date()) {
  const body = Buffer.from(JSON.stringify(value));
  const id = "msg_test";
  const headers = {
    "svix-id": id,
    "svix-timestamp": String(Math.floor(time.getTime() / 1000)),
    "svix-signature": new Webhook(secret).sign(id, time, body.toString()),
  };
  return { body, headers };
}
test("accepts signed receiving events using exact raw body", () => {
  const { body, headers } = signed();
  const result = verifyInboundWebhook(body, headers, secret);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.event?.data.email_id, event.data.email_id);
});
test("fails closed for absent configuration, missing headers, tampered bytes and expired signatures", () => {
  const { body, headers } = signed();
  assert.equal(verifyInboundWebhook(body, headers, undefined).ok, false);
  assert.equal(verifyInboundWebhook(body, {}, secret).ok, false);
  assert.equal(verifyInboundWebhook(Buffer.from(`${body} `), headers, secret).ok, false);
  assert.equal(verifyInboundWebhook(event, headers, secret).ok, false);
  const stale = signed(event, new Date(Date.now() - 3600_000));
  assert.equal(verifyInboundWebhook(stale.body, stale.headers, secret).ok, false);
});
test("ignores unrelated events only after verifying signature", () => {
  const { body, headers } = signed({ type: "email.delivered", data: {} });
  assert.deepEqual(verifyInboundWebhook(body, headers, secret), { ok: true, event: null });
  assert.equal(verifyInboundWebhook(body, {}, secret).ok, false);
});
test("rejects malformed received-email payloads", () => {
  for (const data of [{}, { ...event.data, to: [] }, { ...event.data, email_id: "not-an-id" }]) {
    const { body, headers } = signed({ ...event, data });
    assert.equal(verifyInboundWebhook(body, headers, secret).ok, false);
  }
});
test("normalizes recipient addresses", () => {
  assert.deepEqual(inboundRecipients([" Admin <ADMIN@irescue.life> ", "admin@irescue.life"]), ["admin@irescue.life"]);
  assert.deepEqual(inboundRecipients("  "), []);
});
test("route acknowledges unmatched recipients and checks duplicates before remote fetch", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  const route = routes.slice(routes.indexOf("app.post('/api/resend/inbound'"), routes.indexOf("// Save to inbound_emails table", routes.indexOf("app.post('/api/resend/inbound'")));
  assert.match(route, /verifyInboundWebhook\(req.rawBody, req.headers, process.env.RESEND_WEBHOOK_SIGNING_SECRET\)/);
  assert.match(route, /res.json\(\{ received: true, ignored: true, reason: 'unmatched_recipient' \}\)/);
  assert.doesNotMatch(route, /status\(404\)|resendApiKeyEncrypted|decrypt\(/);
  assert.ok(route.indexOf("if (existingEmail)") < route.indexOf("receiving.get("));
});
test("platform addresses bypass tenant routing and forwarding has durable/provider deduplication", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  const route = routes.slice(routes.indexOf("app.post('/api/resend/inbound'"));
  assert.ok(route.indexOf("isPlatformInboundMail(recipients)") < route.indexOf(".where(eq(tenants.systemInboundEmail"));
  const forwarding = readFileSync("server/lib/platform-inbound-mail.ts", "utf8");
  assert.match(forwarding, /"admin@irescue.life", "notifications@irescue.life"/);
  assert.match(forwarding, /recipients.some/);
  assert.match(forwarding, /platformMailDestination\(process.env.PLATFORM_ADMIN_EMAIL\)/);
  assert.match(forwarding, /forwarding loop/);
  assert.match(forwarding, /pg_advisory_xact_lock/);
  assert.match(forwarding, /headers.set\("Idempotency-Key", key\)/);
  assert.match(forwarding, /reply_to: email.reply_to/);
  assert.match(forwarding, /receiving.forward/);
  assert.match(forwarding, /false,'Platform inbound forwarding delivery record'/);
});
