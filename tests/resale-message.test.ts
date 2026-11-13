/**
 * scripts/run-tests.sh tests/rescue-resale.test.ts tests/resale-message.test.ts
 * Runs the real service with fake persistence/SMS. No app bootstrap or network.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { randomUUID, createHash } from "node:crypto";
import { build } from "esbuild";
import { z } from "zod";
import { resaleMessageAllowed } from "../shared/rescue-resale";
import { allowedResaleMessages, blockedResaleMessages } from "./helpers/resale-message-cases";

let code: string;
before(async () => {
  const mocks: Record<string, string> = {
    "../db": "export const pool=globalThis.fixture.pool; export const db={};",
    "@shared/schema": "export const tenants={};",
    "drizzle-orm": "export const eq=()=>{throw Error('Unexpected ORM use')};",
    "../lib/twilio-service": "export const isTwilioEnabled=()=>false; export const sendSms=(...args)=>globalThis.fixture.transport(...args);",
    "./resale-delivery": `import { sendResaleSms as send } from ${JSON.stringify(`${process.cwd()}/server/services/resale-delivery.ts`)};
      export const sendResaleSms=(input)=>{globalThis.fixture.captureSend(input); return send(input);};`,
    "../lib/stripe-service": "export const stripeService={};",
    "../lib/app-base-url": "export const getAppBaseUrl=()=> 'https://resale.example.test';",
    "./resale-offers": "export const applyResaleOffer=()=>{throw Error('Unexpected offer')}; export const parseResaleCommand=()=>null;",
  };
  const result = await build({
    entryPoints: ["server/services/rescue-resale.ts"],
    bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{
      name: "mock-resale-message-boundaries",
      setup(b) {
        b.onResolve({ filter: /.*/ }, args => {
          if (args.path in mocks) return { path: args.path, namespace: "mock" };
        });
        b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({
          contents: mocks[args.path], loader: "js", resolveDir: process.cwd(),
        }));
      },
    }],
  });
  code = result.outputFiles[0].text;
});

const tenantId = "rescue-test";
const conversationId = "conversation-test";
const buyer = "+12025550101", donor = "+12025550102";
const redacted = "[Blocked: contact details, external payment request, or message length]";
const hour = 60 * 60 * 1000;
type Message = { id: string; conversation: string; sender: string; body: string; status: string; sid: string | null; createdAt: number };
type Delivery = { id: string; tenantId: string; messageId: string; recipient: string; status: string; sid: string | null };
type Outcome = "accepted" | "failed" | "unknown" | "throw";

function harness(deliveryStatus: Outcome | Partial<Record<"buyer" | "donor", Outcome>> = "accepted") {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const messages: Message[] = [], sent: any[] = [];
  const deliveries: Delivery[] = [];
  const writes: any[][] = [], queries: { sql: string; params: any[] }[] = [];
  const fixture = {
    pool: {
      async query(raw: string, params: any[]) {
        const sql = raw.replace(/\s+/g, " ").trim();
        queries.push({ sql, params });
        if (sql.startsWith("INSERT INTO rescue_resale_deliveries")) {
          const [id, tenantId, messageId, orderId, recipient] = params;
          assert.equal(orderId, null);
          deliveries.push({ id, tenantId, messageId, recipient, status: "unknown", sid: null });
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE rescue_resale_deliveries SET provider_sid=")) {
          const delivery = deliveries.find(d => d.id === params[0]);
          assert.ok(delivery);
          delivery.sid = params[1];
          delivery.status = params[2];
          return { rows: [] };
        }
        if (sql.startsWith("SELECT c.")) {
          assert.match(sql, /WHERE c.id=\$1 AND c.tenant_id=\$2/);
          assert.deepEqual(Array.from(params), [conversationId, tenantId]);
          return { rows: [{ id: conversationId, code: "123456", buyer_phone: buyer, donor_phone: donor }] };
        }
        if (sql.startsWith("SELECT count(*)")) {
          // Check the real SQL's scope/window as well as emulating its result.
          assert.match(sql, /WHERE conversation_id=\$1 AND sender=\$2 AND created_at>now\(\)-interval '1 hour'/);
          return { rows: [{ n: messages.filter(m => m.conversation === params[0] &&
            m.sender === params[1] && m.createdAt > now - hour).length }] };
        }
        if (sql.startsWith("INSERT INTO rescue_resale_messages")) {
          assert.match(sql, /VALUES\(\$1,\$2,\$3,\$4,\$5,\$6\)/);
          writes.push(Array.from(params));
          const [id, conversation, sender, body, status, sid] = params;
          messages.push({ id, conversation, sender, body, status, sid, createdAt: now });
          return { rows: [{ id }] };
        }
        if (sql === "UPDATE rescue_resale_messages SET status=$2 WHERE id=$1") {
          writes.push(Array.from(params));
          const message = messages.find(m => m.id === params[0]);
          assert.ok(message);
          message.status = params[1];
          return { rows: [] };
        }
        throw new Error(`Unexpected persistence operation: ${sql}`);
      },
    },
    captureSend(input: any) {
      assert.equal(messages.at(-1)?.status, "sending", "persist before delivery");
      sent.push(input);
    },
    async transport(tid: string, number: string, body: string, type: string, context: any) {
      const input = sent.at(-1);
      const delivery = deliveries.at(-1)!;
      assert.ok(delivery, "persist recipient audit before transport");
      assert.equal(delivery.messageId, input.messageId);
      assert.equal(delivery.tenantId, tid);
      assert.equal(delivery.recipient, input.recipient);
      assert.equal(number, input.number);
      assert.equal(body, input.body);
      assert.equal(type, "proxy_message");
      assert.equal(context.bypassQuietHours, input.bypassQuietHours);
      assert.equal(new URL(context.statusCallbackUrl).searchParams.get("resaleDelivery"), delivery.id);
      const status = typeof deliveryStatus === "string" ? deliveryStatus :
        deliveryStatus[input.recipient as "buyer" | "donor"] ?? "accepted";
      if (status === "throw") throw new Error("Simulated lost transport response");
      return status === "accepted" ? { number, status: "sent", sid: `SM-${delivery.id}` } :
        { number, status: "failed", uncertain: status === "unknown" };
    },
  };
  const module = { exports: {} as any };
  runInNewContext(code, {
    module, exports: module.exports, fixture, URL,
    require(name: string) {
      if (name === "node:crypto") return { randomUUID, createHash };
      if (name === "zod") return { z };
      throw new Error(`External dependency forbidden: ${name}`);
    },
  });
  function seed(count: number, sender: string, age = 0, conversation = conversationId) {
    for (let i = 0; i < count; i++) messages.push({
      id: randomUUID(), conversation, sender, body: "Earlier message", status: "sent",
      sid: null, createdAt: now - age,
    });
  }
  return {
    messages, sent, writes, queries, seed, deliveries,
    send: (sender: string, body: string, replyTo?: string) =>
      module.exports.sendResaleMessage(tenantId, conversationId, sender, body, sender === "system" ? undefined : "SM-test", replyTo),
  };
}

const checkoutNotice = "Offer accepted at $17.00. Review My activity: https://resale.example.test/rescue-resale . Acceptance is not payment or a reservation. Choose pickup and pay through checkout within two hours, subject to availability.";

function assertSystemNotice(h: ReturnType<typeof harness>, recipients = [buyer, donor], bypassQuietHours = false) {
  assert.deepEqual(h.sent.map(s => s.number), recipients);
  for (const delivery of h.sent) {
    assert.equal(delivery.tenantId, tenantId);
    assert.equal(delivery.messageId, h.messages.at(-1)!.id);
    assert.equal(delivery.recipient, delivery.number === buyer ? "buyer" : "donor");
    assert.equal(delivery.body, `Resale R123456: ${checkoutNotice}\nReply R123456 followed by your message. Do not share contact details. Reply STOP to unsubscribe.`);
    assert.equal(delivery.bypassQuietHours, bypassQuietHours);
  }
  const message = h.messages.at(-1)!;
  assert.equal(message.sender, "system");
  assert.equal(message.body, checkoutNotice);
  assert.equal(message.sid, null);
  // Delivery outcomes now live on each recipient audit; tracked is not success.
  assert.equal(message.status, "tracked");
  assert.deepEqual(h.writes.map(w => w.length === 6 ? w[4] : w[1]), ["sending", "tracked"]);
}

test("system checkout notice bypasses participant link filtering and notifies both participants within quiet-hour policy", async () => {
  assert.equal(resaleMessageAllowed(checkoutNotice), false, "same link must remain forbidden to participants");
  const h = harness();
  await h.send("system", checkoutNotice);
  assertSystemNotice(h);
  assert.deepEqual(h.deliveries.map(d => d.status), ["accepted", "accepted"]);
  assert.ok(h.deliveries.every(d => d.sid));
});

test("system notifications are not suppressed by the participant hourly cap", async () => {
  const h = harness();
  h.seed(31, "system");
  await h.send("system", checkoutNotice);
  assertSystemNotice(h);
});

for (const recipient of ["buyer", "donor"] as const) {
  test(`direct system response targets only ${recipient} and bypasses quiet hours`, async () => {
    const h = harness();
    const number = recipient === "buyer" ? buyer : donor;
    await h.send("system", checkoutNotice, number);
    assertSystemNotice(h, [number], true);
    assert.deepEqual(h.deliveries.map(d => [d.recipient, d.status]), [[recipient, "accepted"]]);
  });
  for (const outcome of ["failed", "unknown", "throw"] as const) {
    test(`system notice reports ${recipient} ${outcome} without hiding partial failure or skipping the other participant`, async () => {
      const h = harness({ [recipient]: outcome });
      await assert.rejects(h.send("system", checkoutNotice),
        /one or more texts failed or have an unknown outcome\. Do not resend/);
      assertSystemNotice(h);
      assert.equal(h.deliveries.length, 2);
      for (const delivery of h.deliveries) {
        const failed = delivery.recipient === recipient;
        assert.equal(delivery.status, failed ? outcome === "failed" ? "not_sent" : "unknown" : "accepted");
        assert.equal(delivery.sid === null, failed);
      }
      assert.equal(new Set(h.deliveries.map(d => d.id)).size, 2, "independent recipient audits");
    });
  }
}

for (const sender of ["buyer", "donor"]) {
  for (const [label, body] of blockedResaleMessages) {
    test(`${sender}: ${label} is redacted in persistence and never relayed`, async () => {
      const h = harness();
      await assert.rejects(h.send(sender, body), /Please remove contact details/);
      assert.equal(h.sent.length, 0);
      assert.equal(h.messages.length, 1);
      assert.equal(h.messages[0].body, redacted);
      assert.equal(h.messages[0].status, "blocked");
      assert.equal(h.messages[0].sender, sender);
      assert.equal(h.messages[0].sid, "SM-test");
      assert.equal(h.writes.length, 1, "blocked status must not be overwritten");
      assert.deepEqual(h.writes[0].slice(1), [conversationId, sender, redacted, "blocked", "SM-test"]);
    });
  }
  for (const [label, body] of allowedResaleMessages) {
    test(`${sender}: ${label} reaches only the other participant and logs tracked`, async () => {
      const h = harness();
      await h.send(sender, body);
      assert.equal(h.sent.length, 1);
      const delivery = h.sent[0];
      assert.equal(delivery.tenantId, tenantId);
      assert.equal(delivery.messageId, h.messages[0].id);
      assert.equal(delivery.number, sender === "buyer" ? donor : buyer);
      assert.equal(delivery.recipient, sender === "buyer" ? "donor" : "buyer");
      assert.equal(delivery.body, `Resale R123456: ${body}\nReply R123456 followed by your message. Do not share contact details. Reply STOP to unsubscribe.`);
      assert.equal(delivery.bypassQuietHours, true);
      assert.equal(h.messages[0].body, body);
      assert.equal(h.messages[0].status, "tracked");
      assert.equal(h.writes[0][4], "sending");
      assert.equal(h.writes[1][1], "tracked");
    });
  }
  test(`${sender}: 30th message succeeds, 31st is neither persisted nor sent`, async () => {
    const h = harness();
    h.seed(29, sender);
    await h.send(sender, "Still available?");
    const snapshot = JSON.stringify(h.messages);
    await assert.rejects(h.send(sender, "One more question"), /Too many messages/);
    assert.equal(h.sent.length, 1);
    assert.equal(h.messages.length, 30);
    assert.equal(JSON.stringify(h.messages), snapshot);
    assert.equal(h.writes.length, 2);
  });
  for (const count of [30, 31]) {
    test(`${sender}: ${count} recent messages rejects even private content before logging`, async () => {
      const h = harness();
      h.seed(count, sender);
      const snapshot = JSON.stringify(h.messages);
      await assert.rejects(h.send(sender, "Email private@example.com"), /Too many messages/);
      assert.equal(h.sent.length, 0);
      assert.equal(h.writes.length, 0);
      assert.equal(JSON.stringify(h.messages), snapshot);
      assert.ok(!JSON.stringify(h.queries).includes("private@example.com"));
    });
  }
  test(`${sender}: hourly count excludes the boundary, older messages, other sender and conversation`, async () => {
    const h = harness();
    h.seed(29, sender);
    h.seed(30, sender, hour);
    h.seed(30, sender, hour + 1);
    h.seed(30, sender === "buyer" ? "donor" : "buyer");
    h.seed(30, sender, 0, "other-conversation");
    await h.send(sender, "Still available?");
    assert.equal(h.sent.length, 1);
    assert.equal(h.messages.at(-1)?.status, "tracked");
  });
  test(`${sender}: messages just inside the hour still count`, async () => {
    const h = harness();
    h.seed(30, sender, hour - 1);
    await assert.rejects(h.send(sender, "Still available?"), /Too many messages/);
    assert.equal(h.sent.length, 0);
    assert.equal(h.writes.length, 0);
  });
  test(`${sender}: delivery failure keeps allowed text tracked and reports failure`, async () => {
    const h = harness("failed");
    await assert.rejects(h.send(sender, "Still available?"), /one or more texts failed or have an unknown outcome\. Do not resend/);
    assert.equal(h.sent.length, 1);
    assert.equal(h.messages[0].body, "Still available?");
    assert.equal(h.messages[0].status, "tracked");
  });
}
