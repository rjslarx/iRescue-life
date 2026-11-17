import { before, test } from "node:test";
import React from "react";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { build } from "esbuild";
import type { StaffDecisionAudit as AuditComponent } from "../client/src/components/community-resale/StaffDecisionAudit";

let StaffDecisionAudit: typeof AuditComponent;
before(async () => {
  const bundle = await build({
    entryPoints: ["client/src/components/community-resale/StaffDecisionAudit.tsx"],
    bundle: true, platform: "node", format: "cjs", packages: "external",
    write: false, jsx: "automatic", loader: { ".css": "empty" },
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports);
  StaffDecisionAudit = module.exports.StaffDecisionAudit;
});

test("staff audit renders exact receipt references with actor and time without duplicating evidence", () => {
  const createdAt = "2026-11-17T12:00:00Z";
  const html = renderToStaticMarkup(<StaffDecisionAudit entries={[{
    auditId: "11111111-1111-4111-8111-111111111111",
    actor: "support-actor", action: "refund_intent_recovery", createdAt,
    data: { savedIntent: "sensitive-evidence-once" },
  }]} />);
  assert.ok(html.includes("Receipt reference: <code>11111111-1111-4111-8111-111111111111</code>"));
  assert.match(html, /Support-actor/i);
  assert.ok(html.includes(new Date(createdAt).toLocaleString()));
  assert.equal(html.split("sensitive-evidence-once").length - 1, 1);
});

test("empty and older audit responses do not invent receipt references", () => {
  assert.match(renderToStaticMarkup(<StaffDecisionAudit />), /No staff decision audit entries/);
  const html = renderToStaticMarkup(<StaffDecisionAudit entries={[{
    actor: null, action: "legacy", createdAt: "2026-11-17T12:00:00Z", data: {},
  }]} />);
  assert.doesNotMatch(html, /Receipt reference/);
  assert.match(html, /<strong>legacy<\/strong>/);
});

test("staff ledger projects the audit row ID within the existing tenant and order scope", () => {
  const source = readFileSync("server/routes/communityResaleAdmin.ts", "utf8");
  assert.match(source, /SELECT id AS "auditId",actor_id AS actor,action,created_at AS "createdAt",data FROM community_resale_audit\s+WHERE tenant_id=o\.tenant_id AND data->>'orderId'=o\.id::text/);
});
