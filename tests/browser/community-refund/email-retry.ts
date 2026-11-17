import assert from "node:assert/strict";
import type { Browser } from "puppeteer";

// Use the real ledger, safeguards, and request hooks, but never the backend or
// an email provider. Each recipient/permission case gets fresh query state.
export async function runEmailRetryScenarios(browser: Browser, origin: string) {
  let passed = 0;
  for (const scope of ["tenant", "platform"] as const) {
    for (const width of [1280, 390]) {
      for (const mode of ["native", "rapid", "read-only", "refresh-failure", "http-failure", "network-failure", "refresh-pending", "concurrent", "malformed-json", "html-response"] as const) {
        const canManage = mode !== "read-only";
        const parsingFailure = mode === "malformed-json" || mode === "html-response";
        const failureMode = mode === "http-failure" || mode === "network-failure" || parsingFailure;
        for (const recipient of ["buyer", "donor"] as const) {
          const label = recipient === "donor" ? "seller" : "buyer";
          const scenario = `${scope} ${width}px: ${mode} ${label} cross-order email retry`;
          const context = await browser.createBrowserContext();
          let releaseRetry!: () => void;
          const retryPending = new Promise<void>(resolve => { releaseRetry = resolve; });
          let releaseOtherRetry!: () => void;
          const otherRetryPending = new Promise<void>(resolve => { releaseOtherRetry = resolve; });
          let releaseLedger!: () => void;
          let ledgerArrived!: () => void;
          const ledgerPending = new Promise<void>(resolve => { releaseLedger = resolve; });
          const ledgerStarted = new Promise<void>(resolve => { ledgerArrived = resolve; });
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
            const otherOrder = {
              ...order, id: "email-retry-other-order", itemTitle: "Other email fixture table",
              notificationStatus: { buyer: "delivered", donor: "bounced" },
            };
            const otherInitialStatuses = { ...otherOrder.notificationStatus };
            let ledgerReads = 0;
            let failLedgerRefresh = false;
            let failedLedgerReads = 0;
            const refreshError = "Fixture ledger refresh unavailable after accepted email retry";
            const errors: string[] = [], unexpected: string[] = [];
            const apiRequests: { method: string; path: string }[] = [];
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
              apiRequests.push({ method: req.method(), path });
              if (req.method() === "POST") posts.push({ path, body: JSON.parse(req.postData() || "{}") });
              if (req.headers()["x-tenant-id"] !== (scope === "tenant" ? "demo" : "platform")) {
                unexpected.push(`${req.method()} ${path}: wrong tenant header`); await req.abort(); return;
              }
              if (req.method() === "GET" && path === `${root}/ledger`) {
                ledgerReads++;
                if (mode === "refresh-pending" && ledgerReads > 1) {
                  ledgerArrived();
                  await ledgerPending;
                }
                if (failLedgerRefresh) {
                  failedLedgerReads++;
                  await req.respond({ status: 503, contentType: "application/json",
                    body: JSON.stringify({ error: refreshError }) }); return;
                }
                // Put the target second so an accidental first-row lookup fails.
                await req.respond({ contentType: "application/json", body: JSON.stringify({ orders: [otherOrder, order] }) }); return;
              }
              const retryOrder = [order, ...(mode === "concurrent" ? [otherOrder] : [])]
                .find(candidate => path === `${root}/orders/${candidate.id}/retry-email`);
              if (req.method() === "POST" && retryOrder) {
                const attempt = posts.length;
                // Keep every retry in flight until the pending-state assertions
                // finish. Extra requests must be counted, not silently discarded.
                await (retryOrder === order ? retryPending : otherRetryPending);
                if (failureMode && attempt === 1) {
                  if (mode === "network-failure") await req.abort("failed");
                  // HTTP success with an unreadable body must fail during JSON
                  // parsing in both request paths, not their HTTP error checks.
                  else if (parsingFailure) await req.respond({
                    status: 200,
                    contentType: mode === "malformed-json" ? "application/json" : "text/html",
                    body: mode === "malformed-json" ? '{"success":' : "<!doctype html><html><body>Fixture proxy response</body></html>",
                  });
                  else await req.respond({
                    status: 503, contentType: "application/json",
                    body: JSON.stringify({ error: "Email retry temporarily unavailable." }),
                  });
                  return;
                }
                // Change only the requested recipient. The POST deliberately
                // returns no statuses: the UI must refresh them from the ledger.
                const requested = JSON.parse(req.postData() || "{}").recipient;
                if (requested === "buyer" || requested === "donor") {
                  retryOrder.notificationStatus[requested as "buyer" | "donor"] =
                    retryOrder === otherOrder ? "failed" : "accepted";
                }
                // This is a successful POST, not failed-POST recovery. Keep
                // subsequent reads failing until an explicit ledger-only retry.
                failLedgerRefresh = mode === "refresh-failure";
                await req.respond({ contentType: "application/json", body: JSON.stringify({ success: true }) }); return;
              }
              unexpected.push(`${req.method()} ${path}`); await req.abort();
            });
            const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
            await page.goto(origin + route);
            await page.waitForSelector("tbody tr");
            assert.equal(await page.$$eval("tbody tr", rows => rows.length), 2);
            const row = async (id: string) => {
              const handle = await page.evaluateHandle(id => Array.from(document.querySelectorAll("tbody tr"))
                .find(row => Array.from(row.querySelectorAll("td:first-child p")).some(p => p.textContent === id))!, id);
              const element = handle.asElement();
              assert.ok(element, `Missing ledger row for ${id}`);
              return element;
            };
            for (const id of [otherOrder.id, order.id]) {
              const element = await row(id);
              const summary = await element.$("summary::-p-text(Notification audit & manual retry)");
              assert.ok(summary);
              await summary.scrollIntoView();
              await summary.click();
              await element.dispose();
            }
            const assertStatuses = async (id: string, expected: typeof initialStatuses) => {
              const paragraphs = [
                `Buyer: ${expected.buyer}`, `Seller: ${expected.donor}`,
                "Provider acceptance is not proof of delivery. Manual retry may duplicate email.",
              ];
              await page.waitForFunction((id, expected) => {
                const row = Array.from(document.querySelectorAll("tbody tr"))
                  .find(row => Array.from(row.querySelectorAll("td:first-child p")).some(p => p.textContent === id));
                const audit = Array.from(row?.querySelectorAll("details") || [])
                  .find(e => e.querySelector("summary")?.textContent === "Notification audit & manual retry");
                return !!audit?.open && expected.every((text, i) => audit.querySelectorAll("p")[i]?.textContent === text);
              }, {}, id, paragraphs);
              const element = await row(id);
              const summary = await element.$("summary::-p-text(Notification audit & manual retry)");
              assert.deepEqual(await summary!.evaluate(e => Array.from(
                e.parentElement!.querySelectorAll("p"), p => p.textContent).slice(0, 3)),
              paragraphs, `${id}: recipient statuses and the delivery caveat must remain accurate`);
              await element.dispose();
            };
            await assertStatuses(order.id, initialStatuses);
            await assertStatuses(otherOrder.id, otherInitialStatuses);
            const targetRow = await row(order.id);
            const control = await targetRow.$(`button::-p-text(Retry ${label} email)`);
            assert.ok(control);
            const otherControl = await targetRow.$(`button::-p-text(Retry ${recipient === "buyer" ? "seller" : "buyer"} email)`);
            assert.ok(otherControl);
            const assertRetryControls = async (disabled: boolean, element = targetRow) => {
              await page.waitForFunction((row, expected) => {
                const buttons = Array.from(row.querySelectorAll("button"))
                  .filter(b => /^Retry (buyer|seller) email$/.test(b.textContent || ""));
                return buttons.length === 2 && buttons.every(b => b.disabled === expected);
              }, {}, element, disabled);
            };
            await control.scrollIntoView();
            assert.equal(await control.evaluate(e => (e as HTMLButtonElement).disabled), !canManage);
            await control.click();
            await settle();
            assert.deepEqual(posts, [], "Canceled or disabled retry must not send any mutation");
            await assertStatuses(order.id, initialStatuses);
            await assertStatuses(otherOrder.id, otherInitialStatuses);
            const confirmation = {
              type: "confirm",
              message: `Retry ${label} email? Check recorded status first to avoid duplicates.`,
              accepted: false,
            };
            if (mode === "concurrent") {
              const secondRecipient = recipient === "buyer" ? "donor" : "buyer";
              const secondLabel = secondRecipient === "donor" ? "seller" : "buyer";
              const secondRow = await row(otherOrder.id);
              const secondControl = await secondRow.$(`button::-p-text(Retry ${secondLabel} email)`);
              assert.ok(secondControl);
              const readsBeforeRetry = ledgerReads;
              const expectedPosts = [
                { path: `${root}/orders/${order.id}/retry-email`, body: { recipient } },
                { path: `${root}/orders/${otherOrder.id}/retry-email`, body: { recipient: secondRecipient } },
              ];
              const successText = "Email retry requested. Review the returned notification status.";
              const assertFeedback = async (element: typeof targetRow, expected: boolean) => {
                assert.equal(await element.evaluate((row, text) => row.textContent?.includes(text), successText), expected);
              };
              const clickPendingControls = async (element: typeof targetRow) => {
                // Same-turn attempts catch queued mutations as well as disabled
                // pointer clicks. Neither recipient may ask for fresh consent.
                await element.evaluate(row => {
                  const buttons = Array.from(row.querySelectorAll("button"))
                    .filter(b => /^Retry (buyer|seller) email$/.test(b.textContent || ""));
                  for (let i = 0; i < 5; i++) buttons.forEach(button => button.click());
                });
                for (const button of await element.$$("button")) {
                  if (await button.evaluate(b => /^Retry (buyer|seller) email$/.test(b.textContent || ""))) {
                    await button.scrollIntoView();
                    await button.click();
                  }
                  await button.dispose();
                }
              };
              acceptNext = true;
              await control.click();
              await assertRetryControls(true);
              await assertRetryControls(false, secondRow);
              await settle();
              assert.deepEqual(posts, expectedPosts.slice(0, 1));
              acceptNext = true;
              await secondControl.scrollIntoView();
              await secondControl.click();
              await assertRetryControls(true, secondRow);
              await assertRetryControls(true);
              await settle();
              assert.deepEqual(posts, expectedPosts, "Both orders send their own exact recipient while concurrently pending");
              await clickPendingControls(targetRow);
              await clickPendingControls(secondRow);
              await settle();
              assert.deepEqual(posts, expectedPosts);
              assert.equal(ledgerReads, readsBeforeRetry);
              await assertStatuses(order.id, initialStatuses);
              await assertStatuses(otherOrder.id, otherInitialStatuses);
              await assertFeedback(targetRow, false);
              await assertFeedback(secondRow, false);

              // Release the second request first. Its ledger refresh must update
              // only its selected recipient and must not unlock the first order.
              const secondResponse = page.waitForResponse(response =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname.endsWith(`/orders/${otherOrder.id}/retry-email`));
              releaseOtherRetry();
              assert.equal((await secondResponse).status(), 200);
              await assertRetryControls(false, secondRow);
              await assertRetryControls(true);
              await assertStatuses(otherOrder.id, { ...otherInitialStatuses, [secondRecipient]: "failed" });
              await assertStatuses(order.id, initialStatuses);
              await assertFeedback(secondRow, true);
              await assertFeedback(targetRow, false);
              assert.equal(ledgerReads, readsBeforeRetry + 1);
              await clickPendingControls(targetRow);
              await settle();
              assert.deepEqual(posts, expectedPosts, "Completing the second order cannot enqueue retries for the first");
              await assertRetryControls(true);

              const firstResponse = page.waitForResponse(response =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname.endsWith(`/orders/${order.id}/retry-email`));
              releaseRetry();
              assert.equal((await firstResponse).status(), 200);
              await assertRetryControls(false);
              await assertRetryControls(false, secondRow);
              await assertStatuses(order.id, { ...initialStatuses, [recipient]: "accepted" });
              await assertStatuses(otherOrder.id, { ...otherInitialStatuses, [secondRecipient]: "failed" });
              await assertFeedback(targetRow, true);
              await assertFeedback(secondRow, true);
              // Observe beyond the usual first retry delay after both settle.
              await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));
              assert.equal(ledgerReads, readsBeforeRetry + 2);
              assert.deepEqual(posts, expectedPosts, "Reverse completion must not send queued or automatic duplicates");
              assert.deepEqual(dialogs, [
                confirmation, { ...confirmation, accepted: true },
                { type: "confirm", message: `Retry ${secondLabel} email? Check recorded status first to avoid duplicates.`, accepted: true },
              ], "Only the two explicitly authorized retries may open confirmations");
              await secondControl.dispose();
              await secondRow.dispose();
            } else if (failureMode) {
              assert.deepEqual(dialogs, [confirmation]);
              const readsBeforeRetry = ledgerReads;
              const expectedPost = {
                path: `${root}/orders/${order.id}/retry-email`, body: { recipient },
              };
              const successText = "Email retry requested. Review the returned notification status.";
              const failureText = parsingFailure
                ? "The marketplace service is not responding with usable data. Please try again shortly."
                : mode === "http-failure"
                ? "Email retry temporarily unavailable." : "Failed to fetch";
              acceptNext = true;
              await control.click();
              await assertRetryControls(true);
              await settle();
              assert.deepEqual(posts, [expectedPost]);
              await assertStatuses(order.id, initialStatuses);
              await assertStatuses(otherOrder.id, otherInitialStatuses);
              assert.equal(ledgerReads, readsBeforeRetry);
              assert.equal(await targetRow.evaluate((row, text) => row.textContent?.includes(text), failureText), false,
                "Failure feedback must wait for the deferred response");
              const unreadableResponse = parsingFailure ? page.waitForResponse(response =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname.endsWith(`/orders/${order.id}/retry-email`)) : null;
              releaseRetry();
              if (unreadableResponse) {
                const response = await unreadableResponse;
                assert.equal(response.status(), 200, "Unreadable response must not be an HTTP rejection");
                assert.equal(response.headers()["content-type"], mode === "malformed-json" ? "application/json" : "text/html");
              }
              await page.waitForFunction((row, text) => row.textContent?.includes(text), {}, targetRow, failureText);
              if (parsingFailure) {
                assert.deepEqual(await targetRow.$$eval('[role="alert"]', alerts => alerts.map(e => e.textContent)),
                  [failureText], "Parsing failure must show usable feedback, not raw JSON errors or proxy HTML");
                assert.equal(failedLedgerReads, 0, "Parsing failure must not be confused with a failed ledger refresh");
              }
              await assertRetryControls(false);
              // Observe beyond the usual first retry delay, without any click.
              await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));
              assert.deepEqual(posts, [expectedPost], "Failure must not automatically retry either recipient");
              assert.equal(ledgerReads, readsBeforeRetry, "Failed POST must not refresh recipient statuses");
              await assertStatuses(order.id, initialStatuses);
              await assertStatuses(otherOrder.id, otherInitialStatuses);
              assert.equal(await targetRow.evaluate((row, text) => row.textContent?.includes(text), successText), false,
                "Failed requests must not show success feedback");
              assert.deepEqual(dialogs, [confirmation, { ...confirmation, accepted: true }]);

              // Recovery still requires fresh consent; dismissing it does nothing.
              await control.click();
              await settle();
              assert.deepEqual(posts, [expectedPost]);
              await assertRetryControls(false);
              await assertStatuses(order.id, initialStatuses);
              await assertStatuses(otherOrder.id, otherInitialStatuses);
              acceptNext = true;
              await control.click();
              await page.waitForFunction((row, text) => row.textContent?.includes(text), {}, targetRow, successText);
              await assertRetryControls(false);
              await settle();
              assert.deepEqual(posts, [expectedPost, expectedPost],
                "Only the later explicitly confirmed retry may send a second POST");
              assert.deepEqual(dialogs, [
                confirmation, { ...confirmation, accepted: true },
                confirmation, { ...confirmation, accepted: true },
              ]);
              await assertStatuses(order.id, { ...initialStatuses, [recipient]: "accepted" });
              await assertStatuses(otherOrder.id, otherInitialStatuses);
              assert.ok(ledgerReads > readsBeforeRetry, "Recovery must fetch the updated ledger");
              assert.equal(await targetRow.evaluate((row, text) => row.textContent?.includes(text), failureText), false,
                "Successful recovery must clear the prior failure feedback");
            } else if (canManage) {
              assert.deepEqual(dialogs, [confirmation], "First attempt must dismiss the native confirmation");
              assert.equal(await control.evaluate(e => (e as HTMLButtonElement).disabled), false);
              const readsBeforeRetry = ledgerReads;
              // Replace confirm only for a same-turn burst: native dialogs can
              // serialize clicks and conceal the pre-render race.
              const rapidClicks = () => targetRow.evaluate((row, label) => {
                const buttons = Array.from(row.querySelectorAll("button"))
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
              if (mode !== "rapid") {
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
              assert.deepEqual(await targetRow.$$eval("button", buttons => buttons
                .filter(b => /^Retry (buyer|seller) email$/.test(b.textContent || ""))
                .map(b => b.disabled)), [true, true], "Both retry controls stay disabled throughout the deferred response");
              assert.deepEqual(posts, expectedPosts, "Pending clicks must not send additional requests");
              await assertStatuses(order.id, initialStatuses);
              await assertStatuses(otherOrder.id, otherInitialStatuses);
              // Real pointer clicks on both disabled controls must neither open
              // another confirmation nor enqueue another recipient's request.
              for (let attempt = 0; attempt < 3; attempt++) {
                await control.click();
                await otherControl.click();
              }
              await settle();
              await assertRetryControls(true);
              await assertStatuses(order.id, initialStatuses);
              await assertStatuses(otherOrder.id, otherInitialStatuses);
              assert.equal(ledgerReads, readsBeforeRetry, "Pending retry must not refresh statuses before success");
              assert.deepEqual(posts, expectedPosts, "Repeated pending clicks send only the selected-recipient POST");
              assert.deepEqual(dialogs, mode !== "rapid"
                ? [confirmation, { ...confirmation, accepted: true }] : [confirmation],
                "Both recipient controls must suppress confirmation while pending");
              assert.equal(await page.evaluate(() => document.body.textContent?.includes(
                "Email retry requested. Review the returned notification status.")), false,
              "Success feedback must wait for the response");
              const retryResponse = page.waitForResponse(response =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname.endsWith(`/orders/${order.id}/retry-email`));
              releaseRetry();
              assert.equal((await retryResponse).status(), 200, "The email retry POST was accepted");
              if (mode === "refresh-pending") {
                // Signal from inside interception: waiting for Puppeteer's
                // request event can deadlock on the held interception handler.
                let timeout!: ReturnType<typeof setTimeout>;
                try {
                  await Promise.race([ledgerStarted, new Promise<never>((_, reject) => {
                    timeout = setTimeout(() => reject(new Error("Ledger refresh did not start")), 7000);
                  })]);
                } finally { clearTimeout(timeout); }
                await assertRetryControls(true);
                await settle();
                assert.equal(ledgerReads, readsBeforeRetry + 1, "Accepted POST starts exactly one held ledger GET");
                assert.equal(order.notificationStatus[recipient], "accepted", "POST completed before refresh assertions");
                await assertStatuses(order.id, initialStatuses);
                await assertStatuses(otherOrder.id, otherInitialStatuses);
                await rapidClicks();
                await settle();
                await assertRetryControls(true);
                assert.deepEqual(posts, expectedPosts, "Same-turn clicks during ledger refresh cannot resend either recipient");
                for (let attempt = 0; attempt < 3; attempt++) {
                  await control.click();
                  await otherControl.click();
                  await assertRetryControls(true);
                }
                await settle();
                await assertRetryControls(true);
                await assertStatuses(order.id, initialStatuses);
                await assertStatuses(otherOrder.id, otherInitialStatuses);
                assert.deepEqual(posts, expectedPosts, "Pointer clicks during ledger refresh cannot resend either recipient");
                assert.deepEqual(dialogs, [confirmation, { ...confirmation, accepted: true }],
                  "Neither recipient opens a confirmation while the ledger GET is pending");
                assert.equal(ledgerReads, readsBeforeRetry + 1, "Pending clicks cannot start additional refreshes");
                const ledgerResponse = page.waitForResponse(response =>
                  response.request().method() === "GET" &&
                  new URL(response.url()).pathname.endsWith(`${root}/ledger`));
                releaseLedger();
                assert.equal((await ledgerResponse).status(), 200, "Deferred ledger refresh succeeds");
              }
              if (mode === "refresh-failure") {
                const assertRefreshError = async () => {
                  await page.waitForFunction(message => Array.from(document.querySelectorAll('[role="alert"]'))
                    .some(e => e.textContent?.includes(message)), {}, refreshError);
                  await settle();
                  assert.equal(await page.$$eval("tbody tr", rows => rows.length), 0,
                    "Every failed refresh must hide stale ledger rows");
                  assert.equal(await page.evaluate(() => /(?:Buyer|Seller):/.test(
                    document.body.textContent || "")), false,
                  "No recipient status may be claimed while the ledger is unavailable");
                  assert.deepEqual(posts, expectedPosts, "Refresh failure must not resend email");
                  assert.deepEqual(dialogs, [confirmation, { ...confirmation, accepted: true }],
                    "Ledger-only recovery must not ask to resend email");
                };
                const refreshLedger = async (action: "Refresh ledger" | "Try again", status: number) => {
                  const before = apiRequests.length;
                  const readsBefore = ledgerReads;
                  const button = await page.waitForSelector(`button::-p-text(${action})`);
                  assert.ok(button);
                  await page.waitForFunction(button => !(button as HTMLButtonElement).disabled, {}, button);
                  const response = page.waitForResponse(response =>
                    response.request().method() === "GET" &&
                    new URL(response.url()).pathname.replace(/^\/demo/, "") === `${root}/ledger`);
                  await button.scrollIntoView();
                  await button.click();
                  assert.equal((await response).status(), status, `${action}: expected ledger response`);
                  await settle();
                  assert.equal(ledgerReads, readsBefore + 1, `${action}: exactly one explicit GET`);
                  assert.deepEqual(apiRequests.slice(before), [{ method: "GET", path: `${root}/ledger` }],
                    `${action}: recovery must be GET-only, with no other requests`);
                  await button.dispose();
                };
                await assertRefreshError();
                assert.equal(ledgerReads, readsBeforeRetry + 1, "Accepted POST must attempt a ledger refresh");
                assert.equal(failedLedgerReads, 1, "The following GET, not the POST, must fail");
                assert.equal(order.notificationStatus[recipient], "accepted", "Server fixture accepted the selected retry");
                assert.equal(await page.$$eval("tbody tr", rows => rows.length), 0,
                  "Failed refresh must hide stale ledger rows, not present them as current");
                assert.equal(await page.evaluate(() => /(?:Buyer|Seller): (?:accepted|delivered)/.test(
                  document.body.textContent || "")), false, "A successful POST alone cannot invent recipient status");
                assert.deepEqual(posts, expectedPosts, "Refresh failure must not automatically resend email");
                assert.deepEqual(dialogs, [confirmation, { ...confirmation, accepted: true }],
                  "Refresh failure must not ask to resend email");

                // Both recovery controls must tolerate repeated failures, not
                // just the automatic invalidation after the accepted POST.
                const failedActions = ["Refresh ledger", "Try again", "Refresh ledger", "Try again"] as const;
                for (const [index, action] of failedActions.entries()) {
                  await refreshLedger(action, 503);
                  await assertRefreshError();
                  assert.equal(failedLedgerReads, index + 2, `${action}: failure must remain recorded`);
                  assert.equal(ledgerReads, readsBeforeRetry + index + 2,
                    "Failures must not schedule extra automatic refreshes");
                }

                // The provider's recorded outcome may differ from acceptance.
                // Return a non-success status to catch optimistic accepted/delivered
                // fallbacks, while preserving the other recipient and other order.
                order.notificationStatus[recipient] = recipient === "buyer" ? "bounced" : "failed";
                failLedgerRefresh = false;
                await refreshLedger(recipient === "buyer" ? "Refresh ledger" : "Try again", 200);
                await page.waitForSelector("tbody tr");
                for (const id of [otherOrder.id, order.id]) {
                  const element = await row(id);
                  const summary = await element.$("summary::-p-text(Notification audit & manual retry)");
                  assert.ok(summary);
                  await summary.scrollIntoView();
                  await summary.click();
                  await element.dispose();
                }
                await assertStatuses(order.id, { ...initialStatuses, [recipient]: order.notificationStatus[recipient] });
                await assertStatuses(otherOrder.id, otherInitialStatuses);
                await settle();
                assert.equal(ledgerReads, readsBeforeRetry + failedActions.length + 2,
                  "Recovery requires one final explicit ledger GET");
                assert.equal(failedLedgerReads, failedActions.length + 1);
                assert.equal(await page.evaluate(message => document.body.textContent?.includes(message), refreshError), false,
                  "Successful refresh must clear the ledger error");
                const recoveredRow = await row(order.id);
                assert.deepEqual(await recoveredRow.$$eval("button", buttons => buttons
                  .filter(b => /^Retry (buyer|seller) email$/.test(b.textContent || ""))
                  .map(b => b.disabled)), [false, false], "Recovered ledger restores both manual controls");
                await recoveredRow.dispose();
                assert.deepEqual(posts, expectedPosts, "Ledger recovery must never resend the accepted email retry");
                assert.deepEqual(dialogs, [confirmation, { ...confirmation, accepted: true }]);
              } else {
                await page.waitForFunction(() => document.body.textContent?.includes(
                  "Email retry requested. Review the returned notification status."));
                await assertRetryControls(false);
                await settle();
                await assertStatuses(order.id, { ...initialStatuses, [recipient]: "accepted" });
                await assertStatuses(otherOrder.id, otherInitialStatuses);
                assert.ok(ledgerReads > readsBeforeRetry, "Retry must refetch the ledger, not just show success feedback");
                assert.deepEqual(dialogs, mode !== "rapid"
                  ? [confirmation, { ...confirmation, accepted: true }] : [confirmation]);
                assert.deepEqual(posts, expectedPosts, "Response arrival must leave exactly one request to the selected order and recipient");
              }
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
            releaseOtherRetry();
            releaseLedger();
            await context.close();
          }
        }
      }
    }
  }
  return passed;
}
