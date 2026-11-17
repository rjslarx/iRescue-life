import assert from "node:assert/strict";
import type { Browser } from "puppeteer";

// Use the real ledger, form state, native dialogs and scoped request hooks.
// No backend or provider is reachable from these isolated browser contexts.
export async function runHandoffScenarios(browser: Browser, origin: string) {
  let passed = 0;
  for (const scope of ["tenant", "platform"] as const) {
    for (const width of [1280, 390]) {
      for (const mode of ["resolve", "handoff"] as const) {
        const context = await browser.createBrowserContext();
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(7000);
          await page.setViewport({ width, height: 844 });
          const root = scope === "tenant" ? "/api/community-resale-admin" : "/api/platform/community-resale";
          const route = scope === "tenant" ? "/demo/dashboard/community-resale" : "/platform/community-resale";
          const order = {
            id: "handoff-review-order", itemTitle: "Fixture handoff chair",
            amountCents: 10000, refundedCents: 0, status: "paid",
            disputed: false, refunds: [], finance: { pendingRefundCents: 0 },
            canManageFinancialActions: true,
            issue: mode === "resolve" ? { id: "buyer-issue-reference", status: "open" } : null,
            pickupHelp: { id: "pickup-help-reference", status: "open" },
          };
          const endpoint = `${root}/orders/${order.id}/${mode === "resolve" ? "resolve-issue" : "confirm-handoff"}`;
          const reason = `  ${scope} staff verified the ${mode} decision  `;
          const evidence = `  ${scope} reviewed the signed collection record and buyer statement  `;
          const confirmation = mode === "resolve"
            ? "Resolve this buyer issue with the recorded reason and evidence? This does not issue a refund."
            : "Confirm the actual handover based on this evidence? Settlement may follow when funds are available; this is not an immediate bank payout.";
          const success = mode === "resolve"
            ? "Issue resolution recorded. No refund was initiated by this action."
            : "Handoff review recorded. Check settlement and available-funds status.";
          const errors: string[] = [], unexpected: string[] = [];
          const posts: { path: string; method: string; body: unknown }[] = [];
          const dialogs: { type: string; message: string; dismissed: boolean }[] = [];
          let dismiss = true;
          let ledgerReads = 0;
          page.on("pageerror", error => errors.push(String(error)));
          page.on("dialog", async dialog => {
            dialogs.push({ type: dialog.type(), message: dialog.message(), dismissed: dismiss });
            if (dismiss) await dialog.dismiss();
            else await dialog.accept();
          });
          await page.setRequestInterception(true);
          page.on("request", async req => {
            const url = new URL(req.url());
            if (url.protocol === "data:") { await req.continue(); return; }
            if (url.origin !== origin) { unexpected.push(req.url()); await req.abort(); return; }
            if (!url.pathname.includes("/api/")) { await req.continue(); return; }
            const path = url.pathname.replace(/^\/demo/, "");
            if (req.method() !== "GET") {
              posts.push({ path, method: req.method(), body: JSON.parse(req.postData() || "{}") });
            }
            if (req.headers()["x-tenant-id"] !== (scope === "tenant" ? "demo" : "platform")) {
              unexpected.push(`Wrong tenant header: ${path}`); await req.abort(); return;
            }
            const json = (body: unknown) => req.respond({ contentType: "application/json", body: JSON.stringify(body) });
            if (req.method() === "GET" && path === `${root}/ledger`) {
              ledgerReads++;
              await json({ orders: [order] });
            } else if (req.method() === "POST" && path === endpoint) {
              await json({ order });
            } else {
              unexpected.push(`${req.method()} ${path}`); await req.abort();
            }
          });
          await page.goto(origin + route);
          const summary = await page.waitForSelector("summary::-p-text(Staff issue & handoff review)");
          await summary!.click();
          const review = (await summary!.evaluateHandle(e => e.parentElement!)).asElement()!;
          const fields = await review.$$("textarea");
          assert.equal(fields.length, 2);
          await fields[0].type(reason);
          await fields[1].type(evidence);
          const submit = (await review.$("form button"))!;
          assert.equal(await submit.evaluate(e => e.textContent),
            mode === "resolve" ? "Resolve issue" : "Confirm actual handoff");
          const snapshot = () => review.evaluate(e => ({
            open: (e as HTMLDetailsElement).open,
            mode: e.querySelector<HTMLSelectElement>("select")!.value,
            values: Array.from(e.querySelectorAll("textarea")).map(field => field.value),
            disabled: e.querySelector<HTMLButtonElement>("form button")!.disabled,
          }));
          const before = await snapshot();
          assert.deepEqual(before, { open: true, mode, values: [reason, evidence], disabled: false });
          const readsBefore = ledgerReads;
          await submit.scrollIntoView();
          await submit.click();
          // Give accidental fetches and state changes time to surface.
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
          assert.deepEqual(dialogs, [{ type: "confirm", message: confirmation, dismissed: true }]);
          assert.deepEqual(posts, [], "Cancel must send no mutation, including either review endpoint");
          assert.equal(ledgerReads, readsBefore, "Cancel must not trigger a refresh");
          assert.deepEqual(await snapshot(), before, "Cancel must preserve exact reason, evidence and selection");
          assert.equal(await review.evaluate((e, success) => e.textContent!.includes(success), success), false);

          // Consent must be explicit on a later click, using the unchanged form.
          dismiss = false;
          await submit.click();
          await page.waitForFunction(success => document.body.textContent!.includes(success), {}, success);
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
          assert.deepEqual(dialogs, [
            { type: "confirm", message: confirmation, dismissed: true },
            { type: "confirm", message: confirmation, dismissed: false },
          ]);
          assert.deepEqual(posts, [{
            path: endpoint, method: "POST",
            body: {
              ...(mode === "resolve" ? { issueId: order.issue!.id } : { requestId: order.pickupHelp.id }),
              reason: reason.trim(), evidence: evidence.trim(),
            },
          }], "Explicit acceptance must send exactly one correctly scoped request and no other mutation");
          assert.ok(ledgerReads > readsBefore, "Successful review must refresh the ledger");
          assert.deepEqual((await snapshot()).values, ["", ""], "Only success clears the review inputs");
          assert.deepEqual(unexpected, [], "Every API and external request must be mocked");
          assert.deepEqual(errors, [], "No browser runtime errors");
          console.log(`PASS ${scope} ${width}px: cancel ${mode} review then explicitly accept`);
          passed++;
        } catch (error) {
          throw new Error(`${scope} ${width}px: cancel ${mode} review`, { cause: error });
        } finally {
          await context.close();
        }
      }
    }
  }
  return passed;
}
