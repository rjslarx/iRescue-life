import assert from "node:assert/strict";
import type { Browser } from "puppeteer";

// Use the real ledger, safeguards, and request hooks, but never the backend or
// an email provider. Each recipient/permission case gets fresh query state.
export async function runEmailRetryScenarios(browser: Browser, origin: string) {
  let passed = 0;
  for (const scope of ["tenant", "platform"] as const) {
    for (const width of [1280, 390]) {
      for (const mode of ["native", "rapid", "read-only"] as const) {
        const canManage = mode !== "read-only";
        for (const recipient of ["buyer", "donor"] as const) {
          const label = recipient === "donor" ? "seller" : "buyer";
          const scenario = `${scope} ${width}px: ${mode} ${label} email retry`;
          const context = await browser.createBrowserContext();
          let releaseRetry!: () => void;
          const retryPending = new Promise<void>(resolve => { releaseRetry = resolve; });
          try {
            const page = await context.newPage();
            page.setDefaultTimeout(7000);
            await page.setViewport({ width, height: 844 });
            const root = scope === "tenant" ? "/api/community-resale-admin" : "/api/platform/community-resale";
            const route = scope === "tenant" ? "/demo/dashboard/community-resale" : "/platform/community-resale";
            const order = {
              id: "email-retry-order", itemTitle: "Email retry fixture chair",
              amountCents: 10000, refundedCents: 0, status: "paid",
              disputed: false, refunds: [], finance: { pendingRefundCents: 0 },
              canManageFinancialActions: canManage,
              notificationStatus: { buyer: "failed", donor: "unknown" },
            };
            const initialStatuses = { ...order.notificationStatus };
            let ledgerReads = 0;
            const errors: string[] = [], unexpected: string[] = [];
            const posts: { path: string; body: unknown }[] = [];
            const dialogs: { type: string; message: string; accepted: boolean }[] = [];
            let acceptNext = false;
            page.on("pageerror", error => errors.push(String(error)));
            page.on("dialog", async dialog => {
              // No blanket auto-accept: a single later click gets explicit consent.
              const accepted = acceptNext;
              acceptNext = false;
              dialogs.push({ type: dialog.type(), message: dialog.message(), accepted });
              if (accepted) await dialog.accept();
              else await dialog.dismiss();
            });
            await page.setRequestInterception(true);
            page.on("request", async req => {
              const url = new URL(req.url());
              // Chromium's built-in date-input icon is inline data, not a
              // network request. Match the existing fixture's allowance.
              if (url.protocol === "data:") { await req.continue(); return; }
              if (url.origin !== origin) { unexpected.push(req.url()); await req.abort(); return; }
              if (req.method() === "GET" && [route, "/fixture.js", "/fixture.css", "/favicon.ico"].includes(url.pathname)) {
                await req.continue(); return;
              }
              const path = url.pathname.replace(/^\/demo/, "");
              if (req.method() === "POST") posts.push({ path, body: JSON.parse(req.postData() || "{}") });
              if (req.headers()["x-tenant-id"] !== (scope === "tenant" ? "demo" : "platform")) {
                unexpected.push(`${req.method()} ${path}: wrong tenant header`); await req.abort(); return;
              }
              if (req.method() === "GET" && path === `${root}/ledger`) {
                ledgerReads++;
                await req.respond({ contentType: "application/json", body: JSON.stringify({ orders: [order] }) }); return;
              }
              if (req.method() === "POST" && path === `${root}/orders/${order.id}/retry-email`) {
                // Keep every retry in flight until the pending-state assertions
                // finish. Extra requests must be counted, not silently discarded.
                await retryPending;
                // Change only the requested recipient. The POST deliberately
                // returns no statuses: the UI must refresh them from the ledger.
                const requested = JSON.parse(req.postData() || "{}").recipient;
                if (requested === "buyer" || requested === "donor") {
                  order.notificationStatus[requested as "buyer" | "donor"] = "accepted";
                }
                await req.respond({ contentType: "application/json", body: JSON.stringify({ success: true }) }); return;
              }
              unexpected.push(`${req.method()} ${path}`); await req.abort();
            });
            const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
            await page.goto(origin + route);
            const summary = await page.waitForSelector("summary::-p-text(Notification audit & manual retry)");
            await summary!.click();
            const assertStatuses = async (expected: typeof initialStatuses) => {
              const paragraphs = [
                `Buyer: ${expected.buyer}`, `Seller: ${expected.donor}`,
                "Provider acceptance is not proof of delivery. Manual retry may duplicate email.",
              ];
              await page.waitForFunction(expected => {
                const audit = Array.from(document.querySelectorAll("details"))
                  .find(e => e.querySelector("summary")?.textContent === "Notification audit & manual retry");
                return !!audit?.open && expected.every((text, i) => audit.querySelectorAll("p")[i]?.textContent === text);
              }, {}, paragraphs);
              assert.deepEqual(await summary!.evaluate(e => Array.from(
                e.parentElement!.querySelectorAll("p"), p => p.textContent).slice(0, 3)),
              paragraphs, "Recipient statuses and the delivery caveat must remain accurate");
            };
            await assertStatuses(initialStatuses);
            const control = await page.waitForSelector(`button::-p-text(Retry ${label} email)`);
            assert.ok(control);
            const otherControl = await page.waitForSelector(`button::-p-text(Retry ${recipient === "buyer" ? "seller" : "buyer"} email)`);
            assert.ok(otherControl);
            const assertRetryControls = async (disabled: boolean) => {
              await page.waitForFunction(expected => {
                const buttons = Array.from(document.querySelectorAll("button"))
                  .filter(b => /^Retry (buyer|seller) email$/.test(b.textContent || ""));
                return buttons.length === 2 && buttons.every(b => b.disabled === expected);
              }, {}, disabled);
            };
            await control.scrollIntoView();
            assert.equal(await control.evaluate(e => (e as HTMLButtonElement).disabled), !canManage);
            await control.click();
            await settle();
            assert.deepEqual(posts, [], "Canceled or disabled retry must not send any mutation");
            await assertStatuses(initialStatuses);
            const confirmation = {
              type: "confirm",
              message: `Retry ${label} email? Check recorded status first to avoid duplicates.`,
              accepted: false,
            };
            if (canManage) {
              assert.deepEqual(dialogs, [confirmation], "First attempt must dismiss the native confirmation");
              assert.equal(await control.evaluate(e => (e as HTMLButtonElement).disabled), false);
              const readsBeforeRetry = ledgerReads;
              // Replace confirm only for a same-turn burst: native dialogs can
              // serialize clicks and conceal the pre-render race.
              const rapidClicks = () => page.evaluate(label => {
                const buttons = Array.from(document.querySelectorAll("button"))
                  .filter(b => /^Retry (buyer|seller) email$/.test(b.textContent || ""));
                const selected = buttons.find(b => b.textContent === `Retry ${label} email`)!;
                const other = buttons.find(b => b !== selected)!;
                const original = window.confirm;
                window.confirm = () => true;
                try {
                  for (let i = 0; i < 5; i++) {
                    selected.click();
                    other.click();
                  }
                } finally { window.confirm = original; }
              }, label);
              if (mode === "native") {
                acceptNext = true;
                await control.click();
              } else await rapidClicks();
              await assertRetryControls(true);
              await settle();
              const expectedPosts = [{
                path: `${root}/orders/${order.id}/retry-email`, body: { recipient },
              }];
              assert.deepEqual(posts, expectedPosts, "Rapid same-turn clicks must send only the selected recipient once");
              await rapidClicks();
              await settle();
              assert.deepEqual(await page.$$eval("button", buttons => buttons
                .filter(b => /^Retry (buyer|seller) email$/.test(b.textContent || ""))
                .map(b => b.disabled)), [true, true], "Both retry controls stay disabled throughout the deferred response");
              assert.deepEqual(posts, expectedPosts, "Pending clicks must not send additional requests");
              await assertStatuses(initialStatuses);
              // Real pointer clicks on both disabled controls must neither open
              // another confirmation nor enqueue another recipient's request.
              for (let attempt = 0; attempt < 3; attempt++) {
                await control.click();
                await otherControl.click();
              }
              await settle();
              await assertRetryControls(true);
              await assertStatuses(initialStatuses);
              assert.equal(ledgerReads, readsBeforeRetry, "Pending retry must not refresh statuses before success");
              assert.deepEqual(posts, expectedPosts, "Repeated pending clicks send only the selected-recipient POST");
              assert.deepEqual(dialogs, mode === "native"
                ? [confirmation, { ...confirmation, accepted: true }] : [confirmation],
                "Both recipient controls must suppress confirmation while pending");
              assert.equal(await page.evaluate(() => document.body.textContent?.includes(
                "Email retry requested. Review the returned notification status.")), false,
              "Success feedback must wait for the response");
              releaseRetry();
              await page.waitForFunction(() => document.body.textContent?.includes(
                "Email retry requested. Review the returned notification status."));
              await assertRetryControls(false);
              await settle();
              await assertStatuses({ ...initialStatuses, [recipient]: "accepted" });
              assert.ok(ledgerReads > readsBeforeRetry, "Retry must refetch the ledger, not just show success feedback");
              assert.deepEqual(dialogs, mode === "native"
                ? [confirmation, { ...confirmation, accepted: true }] : [confirmation]);
              assert.deepEqual(posts, expectedPosts, "Response arrival must not send queued duplicate retries");
            } else {
              assert.deepEqual(dialogs, [], "Read-only staff cannot open retry confirmation");
              assert.deepEqual(posts, []);
            }
            assert.deepEqual(unexpected, [], "No unexpected API or external requests");
            assert.deepEqual(errors, [], "No browser runtime errors");
            console.log(`PASS ${scenario}`);
            passed++;
          } catch (error) {
            throw new Error(scenario, { cause: error });
          } finally {
            releaseRetry();
            await context.close();
          }
        }
      }
    }
  }
  return passed;
}
