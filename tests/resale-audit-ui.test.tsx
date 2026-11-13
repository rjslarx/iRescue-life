/**
 * Run: scripts/run-tests.sh tests/resale-audit-ui.test.tsx
 * Real admin page + hook + QueryClient; only shell, tenant context and HTTP
 * boundaries are replaced. No database, SMS provider, or browser install needed.
 */
import { afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as reactQuery from "@tanstack/react-query";
import { JSDOM } from "jsdom";
import type { ResaleAdmin, ResaleClient, ResaleConversation } from "../client/src/hooks/use-rescue-resale";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://resale.test/alpha" });
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true, window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event, sessionStorage: dom.window.sessionStorage,
});
let tenant = { tenantId: "alpha", basePath: "/alpha" };
let calls: { method: string; path: string; scope: string }[] = [];
let respond: (filter: string, scope: string) => ResaleAdmin | Promise<ResaleAdmin>;
let Page: React.ComponentType;
let useRescueResale: typeof import("../client/src/hooks/use-rescue-resale").useRescueResale;
let root: Root;
let cache: QueryClient;
let api: ResaleClient;

before(async () => {
  const bundle = await build({
    stdin: {
      contents: `export { default as Page } from "./client/src/pages/RescueResaleAdminPage";
        export { useRescueResale } from "./client/src/hooks/use-rescue-resale";`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, platform: "node", format: "cjs", packages: "external",
    write: false, jsx: "automatic", loader: { ".css": "empty" },
    plugins: [{
      name: "audit-ui-boundaries",
      setup(b) {
        b.onResolve({ filter: /^@\/(contexts\/TenantContext|lib\/tenantApi|components\/DashboardLayout)$/ },
          args => ({ path: args.path, external: true }));
      },
    }],
  });
  const nativeRequire = createRequire(import.meta.url);
  const request = async (method: string, path: string) => {
    const scope = `${tenant.tenantId}:${tenant.basePath}`;
    calls.push({ method, path, scope });
    const url = new URL(path, "https://resale.test");
    const body = url.pathname.endsWith("/config")
      ? { enabled: true, checkoutEnabled: true, pickupOptions: [], rescueName: scope }
      : url.pathname.endsWith("/admin")
        ? await respond(url.searchParams.get("deliveryStatus")!, scope) : { ok: true };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const injectedRequire = (name: string) => {
    // Share the ESM context with the provider; require() otherwise loads a
    // separate CJS React Query context even though both are the real library.
    if (name === "@tanstack/react-query") return reactQuery;
    if (name === "@/contexts/TenantContext") return { useTenant: () => tenant };
    if (name === "@/lib/tenantApi") return {
      tenantApiRequest: request,
      tenantFetch: () => { throw new Error("Audit view must not make verified participant requests"); },
    };
    if (name === "@/components/DashboardLayout") return ({ children }: React.PropsWithChildren) => children;
    return nativeRequire(name);
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(injectedRequire, module, module.exports);
  ({ Page, useRescueResale } = module.exports);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  cache?.clear();
  document.body.replaceChildren();
  sessionStorage.clear();
});

const date = "2026-11-13T12:00:00Z";
function conversation(title: string, summary: ResaleConversation["deliverySummary"] = []): ResaleConversation {
  return {
    id: title, itemId: title, itemTitle: title, code: "RS-TEST", role: "buyer",
    offerCents: null, offerStatus: "none", expiresAt: null, updatedAt: date,
    deliverySummary: summary, messages: [],
  };
}
function data(...conversations: ResaleConversation[]): ResaleAdmin {
  return { conversations, items: [], orders: [], settings: { pickupOptions: [] } };
}
function key(filter: string, id = tenant.tenantId, path = tenant.basePath) {
  return ["rescue-resale", id, path, "admin", filter];
}
function text() { return document.body.textContent || ""; }
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  assert.ok(check(), `UI did not settle. Rendered: ${text()}`);
}
async function render(probe = false, filter = "all") {
  function Probe() { api = useRescueResale({ admin: true, deliveryStatus: filter }); return null; }
  await act(async () => {
    root.render(<QueryClientProvider client={cache}>{probe ? <Probe /> : <Page />}</QueryClientProvider>);
  });
}
async function setup(probe = false) {
  tenant = { tenantId: "alpha", basePath: "/alpha" };
  calls = [];
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render(probe);
  await until(() => cache.getQueryState(key("all"))?.status === "success");
  if (!probe) {
    await click("Conversation logs");
    await until(() => !!document.querySelector("select"));
  }
}
async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find(b => b.textContent === label);
  assert.ok(button, `Missing button: ${label}`);
  await act(async () => button.click());
}
async function select(value: string) {
  const input = document.querySelector("select")!;
  assert.ok(input);
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await until(() => cache.getQueryState(key(value))?.status === "success" && !!document.querySelector("select"));
  assert.equal(document.querySelector("select")!.value, value);
}

test("selector changes request parameters and separates every filter cache", async () => {
  respond = filter => data(conversation(`Result for ${filter}`));
  await setup();
  const options = [...document.querySelectorAll("select option")].map(o => [o.getAttribute("value"), o.textContent]);
  assert.deepEqual(options, [
    ["all", "All conversations"], ["attention", "Needs attention"], ["undelivered", "Undelivered"],
    ["failed", "Failed"], ["not_sent", "Not sent"], ["unknown", "Unknown outcome"],
  ]);
  assert.equal(document.querySelector("label")?.htmlFor, document.querySelector("select")?.id);
  for (const [value] of options) {
    await select(value!);
    assert.match(text(), new RegExp(`Result for ${value}`));
    assert.equal(cache.getQueryData<ResaleAdmin>(key(value!))?.conversations[0].itemTitle, `Result for ${value}`);
  }
  await select("all");
  assert.match(text(), /Result for all/);
  assert.doesNotMatch(text(), /Result for unknown/);
  assert.deepEqual(calls.filter(c => c.path.includes("/admin?")).map(c => c.path),
    options.map(([value]) => `/api/rescue-resale/admin?deliveryStatus=${value}`));
  assert.ok(calls.every(c => c.method === "GET"), "Changing filters must not send or retry texts");
});

test("empty filtered results do not claim there have never been conversations", async () => {
  respond = filter => filter === "all" ? data(conversation("Existing conversation")) : data();
  await setup();
  await select("failed");
  assert.match(text(), /No conversations match this delivery status\./);
  assert.doesNotMatch(text(), /No conversations yet\./);
  await select("all");
  assert.match(text(), /Existing conversation/);
  assert.doesNotMatch(text(), /No conversations match/);
  respond = () => data();
  await click("Refresh");
  await until(() => text().includes("No conversations yet."));
  assert.doesNotMatch(text(), /No conversations match/);
});

test("refresh replaces changed outcomes within the selected filter without sending texts", async () => {
  respond = () => data(conversation("Needs review", [{ recipient: "Buyer", status: "failed", count: 1 }]));
  await setup();
  await select("attention");
  let release!: (value: ResaleAdmin) => void;
  respond = () => new Promise(resolve => { release = resolve; });
  await click("Refresh");
  await until(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Refresh" && b.disabled));
  await act(async () => release(data()));
  await until(() => text().includes("No conversations match this delivery status."));
  assert.equal(document.querySelector("select")!.value, "attention");
  assert.doesNotMatch(text(), /Needs review/);
  assert.equal(calls.at(-1)?.path, "/api/rescue-resale/admin?deliveryStatus=attention");
  assert.ok(calls.every(c => c.method === "GET"));
});

test("masked recipient summaries preserve counts, warnings and legacy outcomes", async () => {
  const record = conversation("Masked audit", [
    { recipient: "Buyer", status: "failed", count: 1 },
    { recipient: "Donor", status: "undelivered", count: 2 },
    { recipient: "Unknown recipient", status: "unknown", count: 3 },
  ]);
  record.messages = [{ sender: "Buyer", body: "[Contact details removed]", createdAt: date, status: "accepted",
    deliveries: [{ recipient: "Donor", status: "not_sent", errorCode: "21610", updatedAt: date }] },
  { sender: "System", body: "Legacy entry", createdAt: date, status: "accepted" }];
  // Extra response metadata must never be dumped into the masked audit UI.
  Object.assign(record, { buyerPhone: "+15555550123", donorEmail: "private@example.test" });
  respond = () => data(record, conversation("No tracking"));
  await setup();
  const summaries = [...document.querySelectorAll('ul[aria-label="Delivery outcomes needing attention"]')];
  assert.match(summaries[0].textContent!, /To Buyer: Failed · 1 recipient outcome(?!s)/);
  assert.match(summaries[0].textContent!, /To Donor: Undelivered · 2 recipient outcomes/);
  assert.match(summaries[0].textContent!, /To Unknown recipient: Unknown outcome — do not resend · 3 recipient outcomes/);
  assert.equal(summaries[1].textContent, "No attention outcomes recorded.");
  assert.match(text(), /To Donor: Not sent — blocked or rejected before acceptance · Twilio error 21610/);
  assert.match(text(), /Accepted by Twilio — delivery not confirmed/);
  assert.match(text(), /entire message history/);
  assert.match(text(), /outside the first 300 audit entries/);
  assert.doesNotMatch(text(), /\+1\d{10}|@example\.test/);
});

test("tenant and path navigation never displays another scope's cached conversations", async () => {
  respond = (filter, scope) => data(conversation(`${scope} ${filter}`));
  await setup();
  await select("failed");
  for (const next of [
    { tenantId: "beta", basePath: "/alpha" }, // Isolate tenant ID as a key dimension.
    { tenantId: "beta", basePath: "/beta" }, // Isolate basePath as a key dimension.
  ]) {
    tenant = next;
    let release!: (value: ResaleAdmin) => void;
    respond = () => new Promise(resolve => { release = resolve; });
    await render();
    assert.doesNotMatch(text(), /alpha:\/alpha failed|beta:\/alpha failed/);
    assert.ok(document.querySelector('[aria-label="Loading resale workspace"]'));
    await act(async () => release(data(conversation(`${next.tenantId}:${next.basePath} failed`))));
    await until(() => text().includes(`${next.tenantId}:${next.basePath} failed`));
    assert.equal(document.querySelector("select")!.value, "failed");
    assert.equal(document.querySelector("a")?.getAttribute("href"), `${next.basePath}/rescue-resale`);
  }
  assert.equal(cache.getQueryData<ResaleAdmin>(key("failed", "alpha", "/alpha"))?.conversations[0].itemTitle, "alpha:/alpha failed");
  tenant = { tenantId: "alpha", basePath: "/alpha" };
  await render();
  await until(() => text().includes("alpha:/alpha failed"));
  assert.doesNotMatch(text(), /beta:\/beta failed/);
});

test("mutation refresh invalidates every filter in its scope but not other tenants or paths", async () => {
  respond = () => data();
  await setup(true);
  const sibling = key("failed");
  const otherTenant = key("failed", "beta", "/alpha");
  const otherPath = key("failed", "alpha", "/other");
  for (const k of [sibling, otherTenant, otherPath]) cache.setQueryData(k, data(conversation("Cached")));
  const before = calls.filter(c => c.path.endsWith("deliveryStatus=all")).length;
  await act(async () => { await api.settings.mutateAsync({ pickupOptions: [] }); });
  assert.equal(cache.getQueryState(sibling)?.isInvalidated, true);
  assert.equal(cache.getQueryState(otherTenant)?.isInvalidated, false);
  assert.equal(cache.getQueryState(otherPath)?.isInvalidated, false);
  assert.equal(calls.filter(c => c.path.endsWith("deliveryStatus=all")).length, before + 1);
  respond = () => data(conversation("Updated after refresh"));
  await render(true, "failed");
  await until(() => api.adminData.data?.conversations[0]?.itemTitle === "Updated after refresh");
  assert.equal(cache.getQueryState(sibling)?.isInvalidated, false);
  assert.equal(calls.at(-1)?.path, "/api/rescue-resale/admin?deliveryStatus=failed");
});
