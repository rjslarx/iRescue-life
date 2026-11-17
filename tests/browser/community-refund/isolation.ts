import assert from "node:assert/strict";
import type { Browser, Page } from "puppeteer";

type Scope = "tenant" | "platform";
type Intent = { requestId: string; amountCents: number; expectedRefundedCents: number; reason: string };
const ids = ["isolation-chair", "isolation-table"];
const scopes: Scope[] = ["tenant", "platform"];
const key = (scope: Scope, id: string) => `community-refund-request:${scope}:${id}`;
const root = (scope: Scope) => scope === "tenant" ? "/api/community-resale-admin" : "/api/platform/community-resale";
const route = (scope: Scope) => scope === "tenant" ? "/demo/dashboard/community-resale" : "/platform/community-resale";

async function row(page: Page, id: string) {
  await page.waitForFunction(id => Array.from(document.querySelectorAll("tbody tr"))
    .some(row => Array.from(row.querySelectorAll("p")).some(p => p.textContent === id)), {}, id);
  const handle = await page.evaluateHandle(id => Array.from(document.querySelectorAll("tbody tr"))
    .find(row => Array.from(row.querySelectorAll("p")).some(p => p.textContent === id))!, id);
  return handle.asElement()!;
}

// Both workspaces share the SAME order IDs, page, browser context and storage.
// All expectations are row-scoped so a notice in another order cannot satisfy them.
export async function runIsolationScenarios(browser: Browser, origin: string) {
  let passed = 0;
  for (const width of [1280, 390]) for (const first of scopes) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    await page.setViewport({ width, height: 844 });
    const errors: string[] = [], unexpected: string[] = [];
    const posts: { scope: Scope; id: string; action: string; body: unknown }[] = [];
    const expected: Record<string, string> = {};
    const intents = new Map<string, Intent>();
    const terminal = new Set<string>();
    const orders = (scope: Scope) => ids.map((id, index) => ({
      id, itemTitle: index ? "Isolation table" : "Isolation chair",
      amountCents: 10000, refundedCents: 0, status: "paid", disputed: false,
      finance: { pendingRefundCents: 0 }, canManageFinancialActions: true,
      refunds: terminal.has(key(scope, id))
        ? [{ id: intents.get(key(scope, id))!.requestId, status: "failed" }] : [],
    }));
    page.on("pageerror", error => errors.push(String(error)));
    page.on("dialog", dialog => void dialog.accept());
    await page.setRequestInterception(true);
    page.on("request", async req => {
      const url = new URL(req.url());
      if (url.protocol === "data:") { await req.continue(); return; }
      if (url.origin !== origin) { unexpected.push(req.url()); await req.abort(); return; }
      if (!url.pathname.includes("/api/")) { await req.continue(); return; }
      const path = url.pathname.replace(/^\/demo/, "");
      const scope = scopes.find(scope => path.startsWith(`${root(scope)}/`));
      const active = page.url().includes("/platform/") ? "platform" : "tenant";
      if (!scope || scope !== active || req.headers()["x-tenant-id"] !== (scope === "tenant" ? "demo" : "platform")) {
        unexpected.push(`${req.method()} ${url.pathname} active=${active} header=${req.headers()["x-tenant-id"]}`); await req.abort(); return;
      }
      const json = (body: unknown) => req.respond({ contentType: "application/json", body: JSON.stringify(body) });
      if (req.method() === "GET" && path === `${root(scope)}/ledger`) {
        await json({ orders: orders(scope) }); return;
      }
      const match = /^\/orders\/([^/]+)\/(sync|refund)$/.exec(path.slice(root(scope).length));
      if (req.method() !== "POST" || !match || !ids.includes(match[1])) {
        unexpected.push(`${req.method()} ${path}`); await req.abort(); return;
      }
      const [, id, action] = match;
      posts.push({ scope, id, action, body: JSON.parse(req.postData() || "{}") });
      if (action === "refund") await req.abort("failed");
      else await json({ order: orders(scope).find(order => order.id === id) });
    });
    const storage = () => page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
    async function inspect(scope: Scope) {
      await page.waitForSelector(`[data-fixture-scope="${scope}"] tbody tr`);
      assert.equal(await page.$$eval("tbody tr", rows => rows.length), 2);
      for (const id of ids) {
        const element = await row(page, id);
        const summary = await element.$("summary::-p-text(Full or partial buyer refund)");
        if (!await summary!.evaluate(e => (e.parentElement as HTMLDetailsElement).open)) await summary!.click();
        const actual = await element.evaluate(e => ({
          amount: e.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value,
          reason: e.querySelector<HTMLTextAreaElement>("textarea")!.value,
          locked: e.querySelector<HTMLFieldSetElement>("form fieldset")!.disabled,
          references: Array.from(e.querySelectorAll("p")).map(p => p.textContent || "")
            .filter(t => t.startsWith("Request reference: ")),
        }));
        const intent = expected[key(scope, id)] ? intents.get(key(scope, id)) : undefined;
        assert.deepEqual(actual, {
          amount: intent ? (intent.amountCents / 100).toFixed(2) : "",
          reason: intent?.reason || "", locked: !!intent,
          references: intent ? [`Request reference: ${intent.requestId}`] : [],
        }, `${scope}/${id} must restore only its own intent`);
        await element.dispose();
      }
      assert.deepEqual(await storage(), expected, "Navigation must not modify any stored entry");
    }
    async function switchTo(scope: Scope) {
      await page.click(`nav a[href="${route(scope)}"]`);
      await inspect(scope);
    }
    try {
      await page.goto(origin + route(first));
      await inspect(first);
      // Populate each key through the production form, not just seeded JSON.
      for (const scope of [first, first === "tenant" ? "platform" : "tenant"] as Scope[]) {
        if (scope !== first) await switchTo(scope);
        for (const [index, id] of ids.entries()) {
          const element = await row(page, id);
          const amountCents = (scope === "tenant" ? 1100 : 3300) + index * 500;
          const reason = `${scope} refund for ${id}`;
          await (await element.$('input[inputmode="decimal"]'))!.type((amountCents / 100).toFixed(2));
          await (await element.$("textarea"))!.type(reason);
          await (await element.$('form input[type="checkbox"]'))!.click();
          await (await element.$("form button.danger"))!.click();
          await page.waitForFunction(id => Array.from(document.querySelectorAll("tbody tr"))
            .some(e => e.textContent?.includes(id) && e.textContent.includes("Failed to fetch")), {}, id);
          await page.waitForFunction(() => !Array.from(document.querySelectorAll("button"))
            .some(b => /Working…|Submitting…/.test(b.textContent || "")));
          const saved = (await storage())[key(scope, id)];
          const intent = JSON.parse(saved) as Intent;
          assert.deepEqual(intent, { requestId: intent.requestId, amountCents, expectedRefundedCents: 0, reason });
          assert.match(intent.requestId, /^[0-9a-f-]{36}$/);
          assert.equal([...intents.values()].some(i => i.requestId === intent.requestId), false);
          intents.set(key(scope, id), intent); expected[key(scope, id)] = saved;
          assert.deepEqual(posts.at(-1), { scope, id, action: "refund", body: intent });
          await element.dispose();
          await inspect(scope);
        }
      }
      // Preserve unrelated session data as well as the other three refund keys.
      expected["unrelated-session-entry"] = "preserve me";
      await page.evaluate(() => sessionStorage.setItem("unrelated-session-entry", "preserve me"));
      for (const scope of scopes) {
        await switchTo(scope); // Warm-cache SPA transitions exercise component reuse.
        await page.reload();
        await inspect(scope);
      }
      assert.equal(posts.length, 4, "Switching/reloading must never auto-submit or sync");
      // Reconcile all four independently, checking exact storage after each removal.
      for (const scope of [first, first === "tenant" ? "platform" : "tenant"] as Scope[]) {
        await switchTo(scope);
        for (const id of ids) {
          terminal.add(key(scope, id));
          const element = await row(page, id);
          const sync = await element.$("button::-p-text(Sync with Stripe)");
          await sync!.click();
          await page.waitForFunction(key => sessionStorage.getItem(key) === null, {}, key(scope, id));
          delete expected[key(scope, id)];
          assert.deepEqual(posts.at(-1), { scope, id, action: "sync", body: {} });
          assert.deepEqual(await storage(), expected, "Reconciliation may remove only its exact scope/order key");
          await element.dispose();
          // Remount verifies the cleared request cannot return; other requests survive.
          await switchTo(scope === "tenant" ? "platform" : "tenant");
          await switchTo(scope);
        }
      }
      assert.equal(posts.filter(p => p.action === "refund").length, 4);
      assert.equal(posts.filter(p => p.action === "sync").length, 4);
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      console.log(`PASS ${first}-first ${width}px: multi-order same-tab scope isolation and targeted cleanup`);
      passed++;
    } finally { await context.close(); }
  }
  return passed;
}
