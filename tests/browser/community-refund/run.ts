import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import puppeteer, { type Page } from "puppeteer";
import { runIsolationScenarios } from "./isolation";

const bundle = await build({
  entryPoints: ["tests/browser/community-refund/fixture.tsx"],
  bundle: true, write: false, outdir: "/tmp/refund-browser",
  platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"', "import.meta.env.DEV": "false" },
});
const assets = new Map(bundle.outputFiles!.map(f => [
  f.path.endsWith(".css") ? "/fixture.css" : "/fixture.js",
  f.path.endsWith(".css") ? f.text.replace(/@import[^\n]+\n/g, "") : f.text,
]));
const server = createServer((req, res) => {
  const path = new URL(req.url!, "http://fixture").pathname;
  if (assets.has(path)) {
    res.setHeader("Content-Type", path.endsWith(".css") ? "text/css" : "text/javascript");
    res.end(assets.get(path));
  } else if (["/demo/dashboard/community-resale", "/platform/community-resale"].includes(path)) {
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
  } else { res.statusCode = 404; res.end("Unexpected fixture route"); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
  headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const originalReason = "Buyer requested a partial refund";
const retryText = "Recheck & retry unchanged request";
type Intent = { requestId: string; amountCents: number; expectedRefundedCents: number; reason: string; rejectionStatus?: number };
const baseOrder = () => ({
  id: "refund-browser-order", itemTitle: "Fixture chair", amountCents: 10000,
  refundedCents: 0, status: "paid", disputed: false, refunds: [] as any[],
  finance: { pendingRefundCents: 0 }, canManageFinancialActions: true,
});
const malformedIntents: Record<string, string> = {
  "invalid JSON": '{"requestId":',
  "empty saved value": "",
  "null intent": "null",
  "array intent": "[]",
  "missing fields": JSON.stringify({ requestId: "saved-request-reference" }),
  "non-string reason": JSON.stringify({ requestId: "saved-request-reference", amountCents: 2500, expectedRefundedCents: 0, reason: 123 }),
  "invalid amount": JSON.stringify({ requestId: "saved-request-reference", amountCents: -1, expectedRefundedCents: 0, reason: "Buyer requested refund" }),
  "invalid balance": JSON.stringify({ requestId: "saved-request-reference", amountCents: 2500, expectedRefundedCents: "0", reason: "Buyer requested refund" }),
  "invalid request ID": JSON.stringify({ requestId: 123, amountCents: 2500, expectedRefundedCents: 0, reason: "Buyer requested refund" }),
  "invalid rejection status": JSON.stringify({ requestId: "saved-request-reference", amountCents: 2500, expectedRefundedCents: 0, reason: "Buyer requested refund", rejectionStatus: 200 }),
};
// Patch only the actual intent key. UUID instrumentation and fixture setup must
// remain usable, and the native method must throw before mutating storage.
async function failStorage(page: Page, key: string, method: "setItem" | "removeItem") {
  await page.evaluate(({ key, method }) => {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (itemKey: string, value?: string) {
      if (this === sessionStorage && itemKey === key) {
        throw new DOMException("Mock browser storage denied", method === "setItem" ? "QuotaExceededError" : "SecurityError");
      }
      return original.call(this, itemKey, value!);
    };
  }, { key, method });
}
async function button(page: Page, text: string) {
  await page.waitForFunction(text => Array.from(document.querySelectorAll("button"))
    .some(b => b.textContent === text && !b.disabled), {}, text);
  const handle = await page.evaluateHandle(text => Array.from(document.querySelectorAll("button"))
    .find(b => b.textContent === text)!, text);
  const element = handle.asElement()!;
  await element.scrollIntoView();
  await element.click();
  await handle.dispose();
}
async function text(page: Page, value: string) {
  await page.waitForFunction(value => document.body.textContent?.includes(value), {}, value);
}
async function openForm(page: Page) {
  const summary = await page.waitForSelector("summary::-p-text(Full or partial buyer refund)");
  await summary!.click();
}
async function fill(page: Page, amount = "25.00", reason = originalReason) {
  for (const [selector, value] of [['input[inputmode="decimal"]', amount], ["textarea", reason]]) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(selector, value);
  }
  await page.click('form input[type="checkbox"]');
}

function deferredResponse() {
  let release!: () => void;
  let arrived!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { arrived = resolve; });
  return { pending, started, release, arrived };
}

// Dispatch in one browser turn, before React can render disabled controls.
// Native confirm is replaced only for this burst so dialogs cannot serialize it.
async function rapidAction(page: Page, retry = false) {
  await page.evaluate(retry => {
    const original = window.confirm;
    window.confirm = () => true;
    try {
      const form = document.querySelector("form")!;
      const button = Array.from(document.querySelectorAll("button"))
        .find(b => b.textContent === "Recheck & retry unchanged request");
      if (retry && !button) throw new Error("Retry control missing before burst");
      for (let i = 0; i < 8; i++) {
        if (retry) button!.click();
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    } finally { window.confirm = original; }
  }, retry);
}

let passed = 0;
try {
  // Every scenario runs in a fresh browser context; reload alone preserves storage.
  for (const scope of ["tenant", "platform"] as const) {
    for (const width of [1280, 390]) {
      const scenarios = [
        "lost response and unchanged retry", "exact terminal matching",
        "correct rejected request", "failed terminal", "canceled terminal",
        "read-only staff", "retry rechecks balance", "retry rechecks record",
        "sync failure", "initial persistence failure", "retry persistence failure",
        "correction persistence failure", "succeeded clearing failure",
        "failed clearing failure", "canceled clearing failure",
        "rapid initial submit", "rapid unchanged retry", "rapid corrected retry",
        ...Object.keys(malformedIntents).map(name => `malformed: ${name}`),
      ];
      for (const scenario of scenarios) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        await page.setViewport({ width, height: 844 });
        const errors: string[] = [], unexpected: string[] = [];
        page.on("pageerror", error => errors.push(String(error)));
        page.on("dialog", dialog => void dialog.accept());
        const root = scope === "tenant" ? "/api/community-resale-admin" : "/api/platform/community-resale";
        const route = scope === "tenant" ? "/demo/dashboard/community-resale" : "/platform/community-resale";
        const key = `community-refund-request:${scope}:refund-browser-order`;
        let order = baseOrder(), syncOrder = order, syncFailure = false;
        let refundReply: "lost" | "rejected" | "pending" = ["correct rejected request", "correction persistence failure", "rapid corrected retry"].includes(scenario) ? "rejected" : "lost";
        let syncGate: ReturnType<typeof deferredResponse> | undefined;
        let refundGate: ReturnType<typeof deferredResponse> | undefined;
        let inFlightRefunds = 0, maxInFlightRefunds = 0;
        const posts: { path: string; body: any }[] = [];
        const seeded: Intent = { requestId: "11111111-1111-4111-8111-111111111111", amountCents: 2500, expectedRefundedCents: 0, reason: originalReason };
        if (scenario === "read-only staff") order.canManageFinancialActions = false;
        // Record UUID allocation across reloads, not just the last outbound body.
        await page.evaluateOnNewDocument(() => {
          const randomUUID = crypto.randomUUID.bind(crypto);
          crypto.randomUUID = () => {
            sessionStorage.setItem("uuid-count", String(Number(sessionStorage.getItem("uuid-count") || 0) + 1));
            return randomUUID();
          };
        });
        await page.setRequestInterception(true);
        page.on("request", async req => {
          const url = new URL(req.url());
          if (url.protocol === "data:") { await req.continue(); return; }
          if (url.origin !== origin) { unexpected.push(req.url()); await req.abort(); return; }
          if (!url.pathname.includes("/api/")) { await req.continue(); return; }
          const path = url.pathname.replace(/^\/demo/, "");
          const expectedTenant = scope === "tenant" ? "demo" : "platform";
          if (!path.startsWith(root) || req.headers()["x-tenant-id"] !== expectedTenant) {
            unexpected.push(`${req.method()} ${url.pathname} tenant=${req.headers()["x-tenant-id"]}`);
            await req.abort(); return;
          }
          const json = (body: any, status = 200) => req.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
          if (req.method() === "GET" && path === `${root}/ledger`) { await json({ orders: [order] }); return; }
          posts.push({ path, body: JSON.parse(req.postData() || "{}") });
          if (path.endsWith("/sync")) {
            if (syncGate) { syncGate.arrived(); await syncGate.pending; }
            if (syncFailure) await json({ error: "Mock sync unavailable" }, 500);
            else { order = syncOrder; await json({ order }); }
          } else if (path.endsWith("/refund")) {
            const body = JSON.parse(req.postData() || "{}");
            inFlightRefunds++;
            maxInFlightRefunds = Math.max(maxInFlightRefunds, inFlightRefunds);
            try {
            if (refundGate) { refundGate.arrived(); await refundGate.pending; }
            if (refundReply === "lost") await req.abort("failed");
            else if (refundReply === "rejected") await json({ error: "Mock request rejected" }, 409);
            else {
              order = { ...order, refunds: [{ id: body.requestId, status: "pending" }] };
              await json({ order });
            }
            } finally { inFlightRefunds--; }
          } else { unexpected.push(path); await req.abort(); }
        });
        const stored = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null"), key) as Promise<Intent | null>;
        const count = () => page.evaluate(() => Number(sessionStorage.getItem("uuid-count") || 0));
        const refunds = () => posts.filter(p => p.path.endsWith("/refund"));
        const locked = async () => assert.equal(await page.$eval("form fieldset", e => (e as HTMLFieldSetElement).disabled), true);
        const waitIdle = () => page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).some(b => /Working…|Submitting…/.test(b.textContent || "")));
        const sync = async () => { await button(page, "Sync with Stripe"); await waitIdle(); };
        const assertBusy = async () => {
          await text(page, "Submitting…");
          await locked();
          const controls = await page.$eval("form", form => {
            const container = form.closest(".cr-safeguards")!;
            return Array.from(container.querySelectorAll("button, input, textarea"))
              .every(control => control.matches(":disabled"));
          });
          assert.equal(controls, true, "Sync, refund, retry and editable fields must be disabled while pending");
        };
        try {
          await page.goto(origin + route);
          await text(page, "Fixture chair");
          if (scenario.startsWith("rapid ")) {
            await openForm(page);
            await fill(page);
            const retry = scenario !== "rapid initial submit";
            if (retry) {
              await button(page, "Request $25.00 refund");
              await text(page, refundReply === "rejected" ? "Mock request rejected" : "Failed to fetch");
              await waitIdle();
              await sync();
              await text(page, retryText);
              if (scenario === "rapid corrected retry") {
                await fill(page, "20.00", "Corrected buyer refund reason");
              }
              syncGate = deferredResponse();
            }
            refundReply = "pending";
            refundGate = deferredResponse();
            const baseline = refunds().length;
            const syncBaseline = posts.filter(p => p.path.endsWith("/sync")).length;
            const unchanged = scenario === "rapid unchanged retry";
            await rapidAction(page, unchanged);
            if (syncGate) {
              await syncGate.started;
              await assertBusy();
              await rapidAction(page); // Scripted submit cannot bypass the pending retry.
              assert.equal(refunds().length, baseline, "No refund before the deferred preflight sync completes");
              assert.equal(posts.filter(p => p.path.endsWith("/sync")).length, syncBaseline + 1, "Only one retry preflight");
              assert.equal(await count(), 1);
              syncGate.release();
            }
            await refundGate.started;
            await assertBusy();
            await rapidAction(page);
            const intent = (await stored())!;
            assert.equal(refunds().length, baseline + 1, "Burst must send exactly one refund POST");
            assert.equal(inFlightRefunds, 1);
            assert.equal(maxInFlightRefunds, 1, "Refund requests must never overlap");
            assert.equal(await count(), 1, "Burst must allocate only one UUID");
            assert.equal(new Set(refunds().map(p => p.body.requestId)).size, 1);
            assert.deepEqual(refunds().at(-1)!.body, {
              requestId: intent.requestId,
              amountCents: scenario === "rapid corrected retry" ? 2000 : 2500,
              expectedRefundedCents: 0,
              reason: scenario === "rapid corrected retry" ? "Corrected buyer refund reason" : originalReason,
            });
            refundGate.release();
            await text(page, "Refund request recorded.");
            await waitIdle();
            // Let invalidation and subsequent renders settle; no queued click or
            // effect may turn the late response into another financial request.
            await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
            await locked();
            assert.equal(refunds().length, baseline + 1, "Response arrival must not resubmit");
            assert.equal(posts.filter(p => p.path.endsWith("/sync")).length, syncBaseline + (retry ? 1 : 0));
            assert.equal(inFlightRefunds, 0);
            assert.equal(await count(), 1);
            assert.deepEqual(await stored(), intent);
          } else if (scenario.startsWith("malformed: ")) {
            const raw = malformedIntents[scenario.slice("malformed: ".length)];
            await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key, raw });
            await page.reload();
            await text(page, "The saved refund request cannot be read safely.");
            await text(page, "Sync with Stripe and contact support to reconcile the saved request before trying again.");
            await openForm(page);
            await locked();
            await sync();
            await locked();
            // Even a scripted submit cannot bypass the fail-closed guard.
            await page.$eval("form", form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
            await waitIdle();
            assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), raw, "Preserve corrupted evidence for reconciliation");
            assert.equal(await page.evaluate(t => document.body.textContent!.includes(t), retryText), false);
            assert.equal(refunds().length, 0);
            assert.equal(await count(), 0, "Corrupted saved intent must not allocate a replacement request ID");
          } else if (scenario === "initial persistence failure") {
            await openForm(page);
            await fill(page);
            await failStorage(page, key, "setItem");
            await button(page, "Request $25.00 refund");
            await text(page, "The refund request could not be saved safely in browser storage.");
            await text(page, "Restore browser storage access before trying again.");
            await waitIdle();
            assert.equal(refunds().length, 0, "No refund POST before durable intent persistence");
            assert.equal(await stored(), null);
            assert.equal(await count(), 1);
            await page.reload();
            await text(page, "Fixture chair");
            assert.equal(refunds().length, 0, "Reload must not send the unsaved request");
          } else if (scenario === "read-only staff") {
            await page.evaluate(({ key, seeded }) => sessionStorage.setItem(key, JSON.stringify(seeded)), { key, seeded });
            await page.reload();
            await text(page, "Financial actions require an authorized owner or administrator.");
            await sync();
            assert.equal(await page.$("form"), null);
            assert.equal(await page.evaluate(t => document.body.textContent!.includes(t), retryText), false);
            assert.equal(refunds().length, 0);
            assert.deepEqual(await stored(), seeded);
            assert.equal(await count(), 0);
          } else {
            await openForm(page);
            await fill(page);
            await button(page, "Request $25.00 refund");
            await text(page, refundReply === "rejected" ? "Mock request rejected" : "Failed to fetch");
            await waitIdle();
            const intent = (await stored())!;
            assert.equal(refunds().length, 1);
            assert.deepEqual(refunds()[0].body, { ...seeded, requestId: intent.requestId });
            assert.equal(await count(), 1);
            await locked();
            await page.reload();
            await text(page, "Refund request awaiting reconciliation");
            await openForm(page);
            assert.equal(await page.$eval('input[inputmode="decimal"]', e => (e as HTMLInputElement).value), "25.00");
            assert.equal(await page.$eval("textarea", e => (e as HTMLTextAreaElement).value), originalReason);
            await locked();
            assert.deepEqual(await stored(), intent);
            assert.equal(refunds().length, 1, "Reload must never submit a refund");

            if (scenario.endsWith("clearing failure")) {
              const status = scenario.split(" ")[0];
              syncOrder = { ...baseOrder(), refunds: [{ id: intent.requestId, status, recoveryStatus: "recovered" }] };
              await failStorage(page, key, "removeItem");
              await sync();
              await text(page, "The reconciled refund request could not be cleared from browser storage.");
              await text(page, "Restore browser storage access, then Sync with Stripe again.");
              await locked();
              assert.deepEqual(await stored(), intent);
              await text(page, `Request reference: ${intent.requestId}`);
              assert.equal(await page.evaluate(t => document.body.textContent!.includes(t), retryText), false);
              await page.$eval("form", form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
              await waitIdle();
              assert.equal(refunds().length, 1, "Failed clear must not allow a replacement POST");
              await page.reload();
              await text(page, `Request reference: ${intent.requestId}`);
              await openForm(page);
              await locked();
              assert.deepEqual(await stored(), intent);
              // Restoring storage alone does not unlock; an explicit sync must
              // still reconcile the exact original ID before clearing it.
              await sync();
              await page.waitForFunction(key => sessionStorage.getItem(key) === null, {}, key);
              assert.equal(await page.$eval("form fieldset", e => (e as HTMLFieldSetElement).disabled), false);
              assert.equal(refunds()[0].body.requestId, intent.requestId);
            } else if (scenario === "exact terminal matching") {
              for (const candidate of [
                { id: "another-request", status: "succeeded", recoveryStatus: "recovered" },
                { id: intent.requestId, status: "pending" },
                { id: intent.requestId, status: "succeeded", recoveryStatus: "failed" },
              ]) {
                syncOrder = { ...baseOrder(), refundedCents: 2500, status: "partially_refunded", refunds: [candidate] };
                await sync(); await locked();
                assert.equal((await stored())!.requestId, intent.requestId);
              }
              // Exercise the alternate explicit requestId field, not just record id.
              syncOrder = { ...baseOrder(), refundedCents: 2500, status: "partially_refunded",
                refunds: [{ id: "provider-record", requestId: intent.requestId, status: "succeeded", recoveryStatus: "split_reconciliation" }] };
              await sync();
              await page.waitForFunction(key => sessionStorage.getItem(key) === null, {}, key);
              assert.equal(await page.$eval("form fieldset", e => (e as HTMLFieldSetElement).disabled), false);
            } else if (scenario === "failed terminal" || scenario === "canceled terminal") {
              syncOrder = { ...baseOrder(), refunds: [{ id: intent.requestId, status: scenario.split(" ")[0] }] };
              await sync();
              await page.waitForFunction(key => sessionStorage.getItem(key) === null, {}, key);
              assert.equal(await page.$eval("form fieldset", e => (e as HTMLFieldSetElement).disabled), false);
              await text(page, "Actually refunded: $0.00");
            } else if (scenario === "sync failure") {
              syncFailure = true;
              await sync(); await text(page, "Mock sync unavailable"); await locked();
              assert.deepEqual(await stored(), intent);
              assert.equal(await page.evaluate(t => document.body.textContent!.includes(t), retryText), false);
            } else {
              syncOrder = baseOrder();
              await sync();
              await text(page, retryText);
              if (scenario === "retry persistence failure" || scenario === "correction persistence failure") {
                await failStorage(page, key, "setItem");
                if (scenario === "correction persistence failure") {
                  assert.equal(intent.rejectionStatus, 409);
                  await fill(page, "20.00", "Corrected buyer refund reason");
                  await button(page, "Request $20.00 refund with same ID");
                } else {
                  await locked();
                  await button(page, retryText);
                }
                await text(page, "The refund request could not be saved safely in browser storage.");
                await text(page, "If a request was already sent, Sync with Stripe and keep its original request reference; do not start a replacement refund.");
                await waitIdle();
                assert.equal(refunds().length, 1, "Failed retry persistence must not send a second POST");
                assert.deepEqual(await stored(), intent, "Original saved ID and payload must survive failed overwrite");
                await page.reload();
                await text(page, `Request reference: ${intent.requestId}`);
                assert.deepEqual(await stored(), intent);
                assert.equal(refunds()[0].body.requestId, intent.requestId);
              } else if (scenario === "correct rejected request") {
                assert.equal((await stored())!.rejectionStatus, 409, "Tenant HTTP status must survive request wrapper");
                await fill(page, "20.00", "Corrected buyer refund reason");
                refundReply = "pending";
                await button(page, "Request $20.00 refund with same ID");
                await text(page, "Refund request recorded.");
                assert.deepEqual(refunds()[1].body, { requestId: intent.requestId, amountCents: 2000, expectedRefundedCents: 0, reason: "Corrected buyer refund reason" });
                assert.equal((await stored())!.rejectionStatus, undefined);
              } else {
                await locked();
                if (scenario === "retry rechecks balance") syncOrder = { ...baseOrder(), refundedCents: 1000 };
                if (scenario === "retry rechecks record") syncOrder = { ...baseOrder(), refunds: [{ id: intent.requestId, status: "pending" }] };
                refundReply = "pending";
                await button(page, retryText);
                await waitIdle();
                if (scenario.startsWith("retry rechecks")) {
                  await text(page, scenario.endsWith("balance") ? "balance changed" : "already has a server record");
                  assert.equal(refunds().length, 1);
                  assert.deepEqual(await stored(), intent);
                } else {
                  await text(page, "Refund request recorded.");
                  assert.deepEqual(refunds()[1].body, refunds()[0].body);
                  assert.deepEqual(await stored(), intent);
                }
              }
              assert.deepEqual(posts.slice(-2).map(p => p.path.split("/").at(-1)),
                scenario.startsWith("retry rechecks") || scenario.endsWith("persistence failure") ? ["sync", "sync"] : ["sync", "refund"],
                "Retry must recheck server state immediately before sending");
            }
            assert.equal(await count(), 1, "Uncertain/rejected outcomes must not allocate a replacement UUID");
            if (!["lost response and unchanged retry", "correct rejected request"].includes(scenario)) assert.equal(refunds().length, 1);
          }
          assert.deepEqual(unexpected, [], "No unexpected API or external requests allowed");
          assert.deepEqual(errors, [], "No browser runtime errors");
          console.log(`PASS ${scope} ${width}px: ${scenario}`);
          passed++;
        } catch (error) {
          throw new Error(`${scope} ${width}px: ${scenario}`, { cause: error });
        } finally {
          syncGate?.release();
          refundGate?.release();
          await context.close();
        }
      }
    }
  }
  passed += await runIsolationScenarios(browser, origin);
  console.log(`Passed ${passed} mocked refund browser scenarios; no database or Stripe access.`);
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
