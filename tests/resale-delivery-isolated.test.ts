/**
 * Run: scripts/run-tests.sh tests/resale-delivery-isolated.test.ts
 * No RUN_RESALE_DB_TEST flag, database, credentials, or live SMS required.
 * Production delivery services and Twilio signature verification are real.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { compileDeliveryServices, deliveryFixture, deliveryId, tenantId, sid } from "./helpers/resale-delivery-harness";

let code: string;
before(async () => { code = await compileDeliveryServices(); });

test("out-of-order callbacks never regress delivery or buyer notice", async () => {
  const h = deliveryFixture(code);
  for (const [incoming, expected] of [
    ["queued", "queued"], ["accepted", "queued"], ["sent", "sent"],
    ["sending", "sent"], ["undelivered", "undelivered"], ["sent", "undelivered"],
    ["failed", "undelivered"], ["queued", "undelivered"],
  ]) {
    const response = await h.callback(incoming, { body: { ErrorCode: "30003" } });
    assert.equal(response.status, 200);
    assert.equal(response.type, "text/xml");
    assert.match(response.body, /<Response\/>/);
    assert.equal(h.delivery.status, expected);
    assert.equal(h.order.data.buyerNotice, expected);
    assert.equal(h.order.data.donorNotice, "sent");
  }
  assert.equal(h.delivery.error_code, "30003");
  assert.equal(h.releases, 8);
  assert.equal(h.queries.filter(q => q === "COMMIT").length, 8);
});

for (const terminal of ["delivered", "read"]) {
  test(`${terminal} wins over failures and lower or duplicate callbacks`, async () => {
    const h = deliveryFixture(code);
    await h.callback("undelivered", { body: { ErrorCode: "30003" } });
    await h.callback(terminal);
    assert.equal(h.delivery.error_code, null);
    for (const stale of ["unknown", "accepted", "scheduled", "queued", "sending", "sent", "not_sent", "failed", "undelivered", "canceled", "delivered", terminal]) {
      assert.equal((await h.callback(stale, { body: { ErrorCode: "30005" } })).status, 200);
      assert.equal(h.delivery.status, terminal);
      assert.equal(h.delivery.error_code, null);
      assert.equal(h.order.data.buyerNotice, terminal);
      assert.deepEqual(h.logs.map(l => l.status), ["delivered", "sent", "sent"]);
    }
    assert.equal(h.queries.filter(q => q.startsWith("UPDATE rescue_resale_deliveries")).length, 2);
    assert.equal(h.queries.filter(q => q.startsWith("UPDATE rescue_resale_orders")).length, 2);
  });
}

test("read advances delivered once, and the first callback binds an unassigned SID", async () => {
  const h = deliveryFixture(code);
  h.delivery.provider_sid = null;
  await h.callback("delivered");
  assert.equal(h.delivery.provider_sid, sid);
  await h.callback("read");
  await h.callback("delivered");
  assert.equal(h.delivery.status, "read");
  assert.equal(h.order.data.buyerNotice, "read");
  assert.equal(h.queries.filter(q => q.startsWith("UPDATE rescue_resale_deliveries")).length, 2);
});

test("wrong tenant, delivery ID or provider SID cannot change a delivery or order", async () => {
  const h = deliveryFixture(code);
  const before = structuredClone({ delivery: h.delivery, order: h.order });
  await h.record("rescue-b", deliveryId, sid, "read", "30003");
  await h.record(tenantId, "22222222-2222-4222-8222-222222222222", sid, "read");
  await h.record(tenantId, deliveryId, "SM-other", "read");
  assert.equal((await h.callback("read", { body: { MessageSid: "SM-other" } })).status, 200);
  assert.deepEqual({ delivery: h.delivery, order: h.order }, before);
  assert.equal(h.queries.filter(q => q.startsWith("UPDATE")).length, 0);
  assert.equal(h.releases, 4);
});

for (const [name, options] of Object.entries({
  missing: { noSignature: true },
  forged: { signature: "forged" },
  "another tenant's token": { signingToken: "fake-other-tenant-token" },
  "wrong callback URL": { signPath: "/api/webhooks/twilio/status" },
  "wrong account": { body: { AccountSid: "AC-other" } },
  "unknown delivery": { id: "22222222-2222-4222-8222-222222222222" },
})) {
  test(`${name} is rejected without delivery, order or SMS-log writes`, async () => {
    const h = deliveryFixture(code);
    const before = structuredClone({ delivery: h.delivery, order: h.order, logs: h.logs });
    assert.equal((await h.callback("delivered", options)).status, 403);
    assert.deepEqual({ delivery: h.delivery, order: h.order, logs: h.logs }, before);
    assert.equal(h.logWrites, 0);
    assert.equal(h.queries.some(q => q === "BEGIN" || q.startsWith("UPDATE")), false);
    assert.ok(h.configLookups.every(id => id === tenantId));
  });
}

test("unknown statuses are ignored and invalid error codes are not persisted", async () => {
  const h = deliveryFixture(code);
  await h.callback("invented-status");
  assert.equal(h.delivery.status, "unknown");
  assert.equal(h.releases, 0);
  await h.callback("failed", { body: { ErrorCode: "not-a-code" } });
  assert.equal(h.delivery.status, "failed");
  assert.equal(h.delivery.error_code, null);
});
