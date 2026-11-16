import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { configureReceiptShare, shareReceipt } from "../client/public/rescue-vend/share";

function setup(nav: object) {
  const dom = new JSDOM('<div><button>Share</button></div>', { url: "https://rescue.test/rescue-vend/index.html" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
  configureReceiptShare("https://rescue.test/haseyas/rescue-vend?session_id=private#receipt");
  return document.querySelector("button")!;
}
test("native share runs directly and never includes checkout identifiers", async () => {
  let payload: any;
  const button = setup({ share: (data: unknown) => { payload = data; return Promise.resolve(); } });
  const pending = shareReceipt(button);
  assert.equal(payload.url, "https://rescue.test/haseyas/rescue-vend");
  assert.doesNotMatch(JSON.stringify(payload), /private|session_id/);
  await pending;
});
test("unsupported sharing copies link with feedback beside receipt button", async () => {
  let copied = "";
  const button = setup({ clipboard: { writeText: async (text: string) => { copied = text; } } });
  await shareReceipt(button);
  assert.equal(copied, "https://rescue.test/haseyas/rescue-vend");
  assert.match(button.nextElementSibling!.textContent!, /Link copied/);
});
test("blocked native share and clipboard expose a selectable link", async () => {
  const button = setup({ share: async () => { throw new Error("denied"); } });
  await shareReceipt(button);
  assert.equal(document.querySelector("input")!.value, "https://rescue.test/haseyas/rescue-vend");
  assert.ok(document.querySelector("input")!.readOnly);
});
test("cancel is not treated as an error or automatic copy", async () => {
  let copied = false;
  const button = setup({
    share: async () => { throw Object.assign(new Error("cancel"), { name: "AbortError" }); },
    clipboard: { writeText: async () => { copied = true; } },
  });
  await shareReceipt(button);
  assert.equal(copied, false);
  assert.equal(button.nextElementSibling!.textContent, "");
});
test("untrusted share URLs are rejected and status is not duplicated", async () => {
  const button = setup({});
  configureReceiptShare("https://evil.test/rescue-vend");
  await shareReceipt(button);
  await shareReceipt(button);
  assert.equal(document.querySelectorAll("[data-share-status]").length, 1);
  assert.match(button.nextElementSibling!.textContent!, /not ready/);
  assert.equal(document.querySelector("input"), null);
});
