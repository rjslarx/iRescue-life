import * as React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { TransportBroadcastSummary } from "../client/src/components/TransportBroadcastSummary";
import { summarizeTransportBroadcast, type TransportBroadcastResult } from "../client/src/lib/transport-broadcast-results";

const mixed: TransportBroadcastResult[] = [
  { number: "+12025550101", status: "sent" },
  { number: "(202) 555-0101", status: "sent" },
  { number: "+12025550102", status: "failed", error: "Outbound communications are paused for this organization" },
  { number: "+12025550103", status: "failed", error: "Recipient has opted out of SMS for this organization" },
  { number: "+12025550104", status: "failed", error: "Invalid destination", uncertain: false },
  { number: "+12025550105", status: "failed", error: "Response lost", uncertain: true },
];

test("mixed results render distinct counts and actionable guidance", () => {
  const html = renderToStaticMarkup(<TransportBroadcastSummary results={mixed} />);
  for (const label of ["Accepted for sending", "Communications paused", "Recorded unsubscribes", "Provider or configuration failures", "Outcome uncertain"]) {
    assert.ok(html.includes(`${label}: 1`), label);
  }
  assert.match(html, /5 unique phone numbers/);
  assert.match(html, /1 duplicate subscriber entry counted only once/);
  assert.match(html, /Ask an administrator/);
  assert.match(html, /Do not resend or re-add/);
  assert.match(html, /Do not resend these messages/);
  assert.match(html, /delivery is not yet confirmed/);
  assert.doesNotMatch(html, /try again|retry/i);
  assert.match(html, /Invalid destination/);
});

test("duplicate spellings count once for every outcome without conflating international numbers", () => {
  for (const result of mixed.filter((_, i) => i !== 1)) {
    const rows = [result, { ...result, number: result.number.slice(2) }, { ...result, number: result.number.slice(1) }];
    const summary = summarizeTransportBroadcast(rows);
    assert.equal(summary.total, 1);
    assert.equal(summary.duplicates, 2);
    assert.equal(Object.values(summary.groups).flat().length, 1);
  }
  assert.equal(summarizeTransportBroadcast([
    { number: "+442025550101", status: "sent" },
    mixed[0],
  ]).total, 2);
});

test("uncertainty takes precedence over status and error text", () => {
  const summary = summarizeTransportBroadcast([{ ...mixed[2], uncertain: true }]);
  assert.equal(summary.groups.uncertain.length, 1);
  assert.equal(summary.groups.paused.length, 0);
});

test("missing and empty results fail safely, and text is escaped", () => {
  for (const results of [undefined, []]) {
    const html = renderToStaticMarkup(<TransportBroadcastSummary results={results} />);
    assert.match(html, /outcome uncertain/);
    assert.match(html, /Do not resend/);
    assert.doesNotMatch(html, /SMS sent|try again/i);
  }
  const html = renderToStaticMarkup(<TransportBroadcastSummary results={[{ ...mixed[4], error: "<script>alert(1)</script>" }]} />);
  assert.doesNotMatch(html, /<script>/);
});

test("all-success and all-blocked summaries omit unrelated outcomes", () => {
  const success = renderToStaticMarkup(<TransportBroadcastSummary results={[mixed[0]]} />);
  assert.match(success, /Accepted for sending: 1/);
  assert.doesNotMatch(success, /Outcome uncertain|Communications paused/);
  const blocked = renderToStaticMarkup(<TransportBroadcastSummary results={[mixed[2]]} />);
  assert.match(blocked, /Communications paused: 1/);
  assert.doesNotMatch(blocked, /Accepted for sending|Outcome uncertain/);
});

test("client keeps tenant-aware requests and isolates dialog results; endpoint retains access guards", () => {
  const client = readFileSync("client/src/pages/CollaborationHubPage.tsx", "utf8");
  assert.ok(client.includes("apiRequest('POST', `/api/transports/${transport?.id}/sms-broadcast`"));
  assert.ok(client.includes('key={`${tenantId}:${transport?.id}:${open}`}'));
  assert.ok(client.includes("broadcastMutation.isSuccess || broadcastMutation.isError"));
  const routes = readFileSync("server/routes.ts", "utf8");
  const broadcast = routes.slice(routes.indexOf("app.post('/api/transports/:id/sms-broadcast'"));
  const route = broadcast.slice(0, broadcast.indexOf("app.post('/api/transports/:id/sms-subscribe'"));
  assert.match(route, /requireTenant, requireAuth/);
  assert.match(route, /eq\(transportEvents.tenantId, req.tenant!.id\)/);
  assert.match(route, /return res.status\(404\)/);
});
