/**
 * Run: scripts/run-tests.sh tests/public-puzzle-page.test.tsx
 * Render the real page and request helper; replace only tenant/SEO boundaries
 * and HTTP. JSDOM does not execute srcDoc: game messages use the real iframe
 * window as their source, exercising the page's message and persistence logic.
 */
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { PUZZLE_SAVE_KEY, parsePuzzleSave } from "../client/src/lib/puzzle-progress";

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "https://puzzle.test/haseyas/puzzle",
});
const originalDescriptors = new Map(
  ["IS_REACT_ACT_ENVIRONMENT", "window", "document", "navigator", "HTMLElement", "Event", "localStorage", "fetch"]
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);
const storage = dom.window.localStorage;
const storageDescriptor = Object.getOwnPropertyDescriptor(dom.window, "localStorage")!;
const round = { board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15], moves: 12, seconds: 31 };
const config = { enabled: true, rescueName: "Haseyas", facebookPostUrl: "" };
const launch = {
  ...config, html: "<!doctype html><html><body>Puzzle fixture</body></html>",
  pet: { id: "pet", name: "Friend", breed: "Mix", imageUrl: "/photo.jpg" },
  photoVersion: "a".repeat(64),
};
let Page: React.ComponentType;
let root: Root | undefined;
let requests: { url: string; method: string; body: unknown }[];
let launchResponse: () => Response | Promise<Response>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

before(async () => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true, window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  });
  const bundle = await build({
    entryPoints: ["client/src/pages/PublicPuzzlePage.tsx"],
    bundle: true, platform: "node", format: "cjs", packages: "external",
    write: false, jsx: "automatic", loader: { ".css": "empty" },
    plugins: [{
      name: "puzzle-page-boundaries",
      setup(b) {
        b.onResolve({ filter: /^@\/(contexts\/TenantContext|hooks\/useSEO|lib\/tenantApi)$/ },
          args => ({ path: args.path, external: true }));
      },
    }],
  });
  const nativeRequire = createRequire(import.meta.url);
  const injectedRequire = (name: string) => {
    if (name === "@/contexts/TenantContext") return { useTenant: () => ({ tenantId: "haseyas", basePath: "/haseyas" }) };
    if (name === "@/hooks/useSEO") return { useSEO() {} };
    if (name === "@/lib/tenantApi") return {
      buildTenantUrl: (path: string) => `/haseyas${path}`, getTenantHeaders: () => ({}),
    };
    return nativeRequire(name);
  };
  const module = { exports: {} as { default: React.ComponentType } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(injectedRequire, module, module.exports);
  Page = module.exports.default;
});

beforeEach(() => {
  requests = [];
  launchResponse = () => response(launch);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true, get: () => dom.window.localStorage,
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === "/haseyas/api/public-puzzle/access") return response(config);
    assert.equal(url, "/haseyas/api/public-puzzle/launch", "unexpected HTTP request");
    return launchResponse();
  };
});

async function unmount() {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
}

afterEach(async () => {
  await unmount();
  Object.defineProperty(dom.window, "localStorage", storageDescriptor);
  for (const method of ["getItem", "setItem", "removeItem"]) {
    // Fault injection is per-test and never modifies Storage.prototype.
    delete (storage as any)[method];
  }
  storage.clear();
  assert.equal(document.head.querySelector('meta[name="robots"]'), null);
});

after(() => {
  dom.window.close();
  for (const [key, descriptor] of originalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as any)[key];
  }
});

async function renderPage() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Page />));
}

function button(text: string) {
  const result = [...document.querySelectorAll("button")].find(node => node.textContent?.includes(text));
  assert.ok(result, `missing button: ${text}`);
  assert.equal(result.disabled, false);
  return result;
}

async function click(text: string) {
  await act(async () => button(text).click());
}

async function message(data: unknown) {
  const frame = document.querySelector("iframe");
  assert.ok(frame?.contentWindow, "game iframe is mounted");
  await act(async () => {
    window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, data }));
  });
}

async function readyGame() {
  await message({ type: "rescue-shuffle-ready" });
  const frame = document.querySelector("iframe")!;
  assert.equal(frame.style.visibility, "visible");
  assert.equal(frame.tabIndex, 0);
  assert.doesNotMatch(document.body.textContent!, /Getting your puzzle ready/);
  return frame;
}

function status(text: string) {
  assert.ok([...document.querySelectorAll('[role="status"]')].some(node => node.textContent === text),
    `missing visible saving warning: ${text}`);
}

test("denied localStorage access warns but still allows starting and resetting a playable round", async () => {
  let denied = 0;
  Object.defineProperty(dom.window, "localStorage", {
    configurable: true, get() { denied++; throw new dom.window.DOMException("Access denied", "SecurityError"); },
  });
  await renderPage();
  const warning = "Saving is unavailable in this browser. You can still play.";
  status(warning);
  assert.equal(denied, 1, "availability check attempted to read storage");
  await click("Start your puzzle");
  const frame = await readyGame();
  assert.equal(denied, 2, "start tolerated a failed storage removal");
  await message({ type: "rescue-shuffle-reset" });
  assert.equal(denied, 3, "game reset tolerated a failed storage removal");
  assert.equal(document.querySelector("iframe"), frame);
  assert.equal(frame.style.visibility, "visible");
  status(warning);
  assert.equal(document.querySelector('[role="alert"]'), null);
});

test("quota exhaustion on opted-in progress warns without closing or disabling the game", async () => {
  const writes: string[] = [];
  // Storage is a named-property object: inject a wrapper rather than assigning
  // methods to it (which some DOM implementations treat as stored strings).
  Object.defineProperty(dom.window, "localStorage", { configurable: true, value: {
    getItem: storage.getItem.bind(storage), removeItem: storage.removeItem.bind(storage),
    setItem(key: string, value: string) {
      assert.equal(key, PUZZLE_SAVE_KEY);
      writes.push(value);
      throw new dom.window.DOMException("Storage full", "QuotaExceededError");
    },
  } });
  await renderPage();
  const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => checkbox.click());
  assert.equal(checkbox.checked, true);
  await click("Start your puzzle");
  const frame = await readyGame();
  await message({ type: "rescue-shuffle-progress", round });
  const warning = "Your browser could not save progress. Keep this page open to continue.";
  status(warning);
  assert.deepEqual(parsePuzzleSave(writes[0], "haseyas")?.round, round);
  await message({ type: "rescue-shuffle-progress", round: { ...round, moves: 14, seconds: 40 } });
  assert.equal(writes.length, 2, "further play still reaches the progress handler");
  assert.equal(parsePuzzleSave(writes[1], "haseyas")?.round.moves, 14);
  assert.equal(document.querySelector("iframe"), frame);
  assert.equal(frame.style.visibility, "visible");
  assert.equal(frame.tabIndex, 0);
  assert.equal(document.querySelector('[role="alert"]'), null);
  status(warning);
  assert.equal(storage.getItem(PUZZLE_SAVE_KEY), null);
});

for (const failure of ["network rejection", "HTTP 503"] as const) {
  test(`saved round survives a ${failure}, remount, and successful resume retry`, async () => {
    const saved = { version: 1, tenant: "haseyas", savedAt: Date.now(), petId: "pet", photoVersion: launch.photoVersion, round };
    const raw = JSON.stringify(saved);
    storage.setItem(PUZZLE_SAVE_KEY, raw);
    launchResponse = () => {
      if (failure === "network rejection") throw new TypeError("Network unavailable");
      return response({ error: "Temporarily unavailable" }, 503);
    };
    await renderPage();
    await click("Resume unfinished puzzle");
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? "",
      failure === "network rejection" ? /Network unavailable/ : /Temporarily unavailable/);
    button("Resume unfinished puzzle");
    button("Retry puzzle");
    assert.equal(document.querySelector("iframe"), null);
    assert.equal(storage.getItem(PUZZLE_SAVE_KEY), raw, "failed request must not alter the save");

    await unmount();
    launchResponse = () => response(launch);
    await renderPage();
    await click("Resume unfinished puzzle");
    const frame = document.querySelector("iframe")!;
    const restored: unknown[] = [];
    frame.contentWindow!.postMessage = (data: unknown) => { restored.push(data); };
    await readyGame();
    assert.deepEqual(restored, [{ type: "rescue-shuffle-restore", round }]);
    assert.equal(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked, true);
    assert.equal(storage.getItem(PUZZLE_SAVE_KEY), raw);
    assert.deepEqual(requests.filter(call => call.method === "POST").map(call => call.body), [
      { resume: { petId: "pet", photoVersion: launch.photoVersion } },
      { resume: { petId: "pet", photoVersion: launch.photoVersion } },
    ]);
    await message({ type: "rescue-shuffle-progress", round: { ...round, moves: 14, seconds: 40 } });
    assert.deepEqual(parsePuzzleSave(storage.getItem(PUZZLE_SAVE_KEY), "haseyas")?.round,
      { ...round, moves: 14, seconds: 40 });
  });
}
