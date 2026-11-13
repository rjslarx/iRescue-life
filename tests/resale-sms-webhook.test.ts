/**
 * Run: scripts/run-tests.sh tests/resale-sms-webhook.test.ts
 * All HTTP stays on loopback. Database, encryption and outbound SMS are mocked;
 * signatures, production webhook registrations and resale services are real.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { compileWebhook, withWebhook, tenants, tokens, buyer, donor } from "./helpers/resale-webhook-harness";

let code: string;
before(async () => { code = await compileWebhook(); });
function emptyTwiml(response: any) {
  assert.equal(response.status, 200);
  assert.match(response.type, /text\/xml/);
  assert.match(response.text, /<Response\s*\/>|<Response><\/Response>/);
}

test("missing, forged, wrong-tenant and wrong-URL signatures cannot reach either router", async () => {
  await withWebhook(code, async (h, post) => {
    for (const options of [
      { noSignature: true }, { signature: "forged" },
      { token: tokens["encrypted-b"] }, { signPath: "/wrong-path" },
    ]) assert.equal((await post("R123456 ACCEPT", options)).status, 403);
    h.state.decryptFails = true;
    assert.equal((await post("R123456 ACCEPT")).status, 403);
    assert.equal(h.sent.length, 0);
    assert.equal(h.fallback.length, 0);
    assert.equal(h.queries.length, 0);
  });
});

test("required fields are checked and unknown To numbers never enter resale", async () => {
  await withWebhook(code, async (h, post) => {
    assert.equal((await post("R123456 ACCEPT", { params: { From: "" } })).status, 400);
    assert.equal((await post("R123456 ACCEPT", { params: { To: "" } })).status, 400);
    await post("R123456 ACCEPT", { params: { To: "+12025550999" } });
    assert.equal(h.sent.length, 0);
    assert.equal(h.queries.length, 0);
    assert.equal(h.fallback.length, 1);
    assert.equal(h.fallback[0][4].signatureValidated, false);
  });
});

test("shared R-codes route by signed To tenant, never by code or sender alone", async () => {
  await withWebhook(code, async (h, post) => {
    emptyTwiml(await post("R123456 ACCEPT", {
      token: tokens["encrypted-b"], params: { To: tenants[1].twilioPhoneNumber },
    }));
    assert.equal(h.conversations[0].offer_status, "pending");
    assert.equal(h.conversations[1].offer_status, "accepted");
    assert.equal(h.sent.length, 2);
    for (const [tenant, , body] of h.sent) {
      assert.equal(tenant, "rescue-b");
      assert.match(body, /https:\/\/rescue.example\/beta\/rescue-resale/);
      assert.match(body, /Acceptance is not payment or a reservation/);
    }
    assert.deepEqual(h.sent.map(s => s[1]), [buyer, donor]);
    assert.equal(h.fallback.length, 0);
  });
});

test("unknown sender, unknown code and another tenant's participant cannot relay or change offers", async () => {
  await withWebhook(code, async (h, post) => {
    h.conversations[1].buyer_phone = "+12025550201";
    h.conversations[1].donor_phone = "+12025550202";
    emptyTwiml(await post("R123456 ACCEPT", { params: { From: "+12025550999" } }));
    emptyTwiml(await post("R654321 hello"));
    emptyTwiml(await post("R123456 hello", {
      token: tokens["encrypted-b"], params: { To: tenants[1].twilioPhoneNumber },
    }));
    assert.equal(h.sent.length, 0);
    assert.equal(h.messages.length, 0);
    assert.equal(h.fallback.length, 0);
    assert.ok(h.conversations.every(c => c.offer_status === "pending"));
  });
});

for (const [command, status] of [["YES", "accepted"], ["accept", "accepted"], ["NO", "declined"], ["DECLINE", "declined"], ["COUNTER $20.50", "countered"]]) {
  test(`exact R-code ${command} changes the offer and notifies both participants`, async () => {
    await withWebhook(code, async (h, post) => {
      emptyTwiml(await post(`  r123456 ${command}  `));
      assert.equal(h.conversations[0].offer_status, status);
      assert.equal(h.conversations[0].offer_cents, status === "countered" ? 2050 : 1500);
      assert.equal(h.sent.length, 2);
      for (const [tenant, , body, type, options] of h.sent) {
        assert.equal(tenant, "rescue-a");
        assert.match(body, new RegExp(`Offer ${status} at \\$${status === "countered" ? "20.50" : "15.00"}`));
        assert.match(body, /Resale R123456:/);
        assert.equal(type, "proxy_message");
        assert.equal(options.bypassQuietHours, false);
      }
      assert.equal(h.messages.filter(m => m.status === "command").length, 1);
      assert.equal(h.fallback.length, 0);
    });
  });
}

test("counter then buyer acceptance uses current amount; buyer cannot accept a pending offer", async () => {
  await withWebhook(code, async (h, post) => {
    emptyTwiml(await post("R123456 ACCEPT", { params: { From: buyer } }));
    assert.equal(h.conversations[0].offer_status, "pending");
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0][1], buyer);
    assert.match(h.sent[0][2], /expired, changed/);
    await post("R123456 COUNTER $25");
    await post("R123456 ACCEPT", { params: { From: buyer } });
    assert.equal(h.conversations[0].offer_status, "accepted");
    assert.equal(h.conversations[0].offer_cents, 2500);
    assert.equal(h.sent.length, 5);
    assert.match(h.sent[4][2], /Offer accepted at \$25.00/);
    assert.equal(h.fallback.length, 0);
  });
});

test("ordinary messages relay only to the other participant with masked contact information", async () => {
  await withWebhook(code, async (h, post) => {
    for (const [from, to, body, role] of [
      [buyer, donor, "Is this still available?", "buyer"],
      [donor, buyer, "It is in good condition.", "donor"],
    ]) {
      emptyTwiml(await post(`R123456 ${body}`, { params: { From: from } }));
      const sent = h.sent.at(-1)!;
      assert.equal(sent[0], "rescue-a");
      assert.equal(sent[1], to);
      assert.ok(sent[2].includes(body));
      assert.ok(!sent[2].includes(from));
      assert.match(sent[2], /Reply R123456 followed by your message/);
      assert.equal(sent[4].bypassQuietHours, true);
      assert.equal(h.messages.at(-1).sender, role);
      assert.equal(h.messages.at(-1).status, "sent");
    }
    assert.equal(h.sent.length, 2);
    assert.equal(h.conversations[0].offer_status, "pending");
    assert.equal(h.fallback.length, 0);
  });
});

test("malformed offer commands are rejected privately, not relayed or applied", async () => {
  await withWebhook(code, async (h, post) => {
    const commands = ["YES please", "ACCEPT tomorrow", "NO thanks", "COUNTER", "COUNTER $0", "COUNTER -20", "COUNTER $5001", "COUNTER $20.001"];
    for (const command of commands) emptyTwiml(await post(`R123456 ${command}`));
    assert.equal(h.sent.length, commands.length);
    assert.ok(h.sent.every(s => s[1] === donor && /Use YES, NO, ACCEPT, or COUNTER/.test(s[2])));
    assert.ok(h.messages.every(m => m.status === "rejected"));
    assert.equal(h.conversations[0].offer_status, "pending");
    assert.equal(h.fallback.length, 0);
  });
});

for (const body of ["ACCEPT", "COUNTER $20", "YES please", "Is it available?"]) {
  test(`duplicate MessageSid suppresses repeated ${body} notifications and mutations`, async () => {
    await withWebhook(code, async (h, post) => {
      const options = { params: { MessageSid: "SM-repeat" } };
      emptyTwiml(await post(`R123456 ${body}`, options));
      const sends = h.sent.length, messages = h.messages.length;
      assert.ok(sends > 0);
      // A redelivery must not mutate a later offer either.
      h.conversations[0].offer_status = "pending";
      h.conversations[0].offer_cents = 9900;
      emptyTwiml(await post(`R123456 ${body}`, options));
      assert.equal(h.sent.length, sends);
      assert.equal(h.messages.length, messages);
      assert.equal(h.conversations[0].offer_status, "pending");
      assert.equal(h.conversations[0].offer_cents, 9900);
      assert.equal(h.fallback.length, 0);
    });
  });
}

test("rejected role command is replay-safe even after offer eligibility changes", async () => {
  await withWebhook(code, async (h, post) => {
    const options = { params: { From: buyer, MessageSid: "SM-rejected" } };
    await post("R123456 ACCEPT", options);
    h.conversations[0].offer_status = "countered";
    await post("R123456 ACCEPT", options);
    assert.equal(h.conversations[0].offer_status, "countered");
    assert.equal(h.sent.length, 1);
    assert.equal(h.messages.length, 1);
  });
});

test("contact-detail messages are blocked without sending or falling through", async () => {
  await withWebhook(code, async (h, post) => {
    emptyTwiml(await post("R123456 Call me at +12025550199"));
    assert.equal(h.sent.length, 0);
    assert.equal(h.messages[0].status, "blocked");
    assert.equal(h.fallback.length, 0);
  });
});

test("unprefixed and malformed R-code messages preserve the existing SMS router", async () => {
  await withWebhook(code, async (h, post) => {
    for (const body of ["DONE", "YES", "STOP", "SUPPLIES food", "R12345 ACCEPT", "R1234567 ACCEPT", "R123456", "R123456ACCEPT"]) {
      h.state.routedAs = body === "DONE" ? "medication_confirmed" : "foster_update";
      const response = await post(body);
      assert.equal(response.status, 200);
      assert.match(response.text, body === "DONE" ? /Meds confirmed/ : /Thanks for the update/);
      assert.equal(h.fallback.at(-1)![2], body);
      assert.equal(h.fallback.at(-1)![4].signatureValidated, true);
    }
    assert.equal(h.fallback.length, 8);
    assert.equal(h.sent.length, 0);
    assert.equal(h.queries.length, 0);
  });
});

test("adopter MMS, media and MessageSid survive the resale interception unchanged", async () => {
  await withWebhook(code, async (h, post) => {
    h.state.routedAs = "alumni_update";
    emptyTwiml(await post("Our adopted dog is happy!", { params: {
      From: buyer, MessageSid: "SM-alumni", NumMedia: "1", MediaUrl0: "https://api.twilio.com/test-image",
    } }));
    assert.deepEqual(h.fallback[0].slice(0, 3), [buyer, tenants[0].twilioPhoneNumber, "Our adopted dog is happy!"]);
    assert.equal(JSON.stringify(h.fallback[0][3]), JSON.stringify(["https://api.twilio.com/test-image"]));
    assert.equal(h.fallback[0][4].messageSid, "SM-alumni");
    assert.equal(h.fallback[0][4].signatureValidated, true);
    assert.equal(h.sent.length, 0);
  });
});

test("disabled resale SMS or missing MessageSid leaves existing routing intact", async () => {
  await withWebhook(code, async (h, post) => {
    h.state.enabled = false;
    await post("R123456 ACCEPT");
    h.state.enabled = true;
    await post("R123456 ACCEPT", { omitSid: true });
    assert.equal(h.fallback.length, 2);
    assert.equal(h.fallback[1][4].messageSid, undefined);
    assert.equal(h.sent.length, 0);
    assert.equal(h.queries.length, 0);
  });
});

test("inbound alias validates its original URL and reaches the real resale handler", async () => {
  await withWebhook(code, async (h, post) => {
    const path = "/api/webhooks/twilio/inbound";
    assert.equal((await post("R123456 hello", { path, signPath: "/api/webhooks/twilio/incoming" })).status, 403);
    emptyTwiml(await post("R123456 hello", { path }));
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0][1], buyer);
    assert.equal(h.fallback.length, 0);
  });
});
