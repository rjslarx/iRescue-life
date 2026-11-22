import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trackPlatformEvent, trackPlatformCtaClick, platformErrorCategory } from "../client/src/lib/platformAnalytics";
import { JSDOM } from "jsdom";

test("only acquisition routes emit; payloads remove sensitive URL context and unknown dimensions", () => {
  const events: any[] = [];
  const browser = {
    location: { pathname: "/platform/signup" },
    umami: { track: (build: any) => events.push(build({
      website: "site", url: "/platform/signup?token=secret", referrer: "https://example.test/?email=private",
      title: "Sensitive title",
    })) },
  };
  Object.assign(globalThis, { window: browser });
  trackPlatformEvent("platform_signup_success", { plan: "lite", email: "private", category: "raw error" } as any);
  assert.deepEqual(events[0], {
    website: "site", url: "/platform/signup", referrer: "", title: "Platform acquisition",
    name: "platform_signup_success", data: { funnel: "platform_acquisition", plan: "lite" },
  });
  for (const path of ["/animals/123", "/demo", "/rescue/donate", "/platform/login", "/platform/signup/success", "/rescue/platform/signup"]) {
    browser.location.pathname = path;
    trackPlatformEvent("platform_signup_success");
  }
  assert.equal(events.length, 1);
  for (const path of ["/platform", "/platform/pricing", "/platform/signup/"]) {
    browser.location.pathname = path;
    trackPlatformEvent("platform_pricing_view");
  }
  assert.equal(events.length, 4);
  Reflect.deleteProperty(globalThis, "window");
});

test("missing, throwing, or rejecting trackers cannot break user actions", async () => {
  assert.doesNotThrow(() => trackPlatformEvent("platform_signup_start"));
  Object.assign(globalThis, { window: { location: { pathname: "/platform" } } });
  assert.doesNotThrow(() => trackPlatformEvent("platform_signup_start"));
  (globalThis as any).window.umami = { track: () => { throw new Error("unavailable"); } };
  assert.doesNotThrow(() => trackPlatformEvent("platform_signup_start"));
  (globalThis as any).window.umami = { track: () => Promise.reject(new Error("offline")) };
  trackPlatformEvent("platform_signup_start");
  await new Promise(resolve => setImmediate(resolve));
  Reflect.deleteProperty(globalThis, "window");
});

test("error categories never include raw provider responses", () => {
  for (const [error, category] of [
    [{ status: 409, message: "private" }, "conflict"], [{ status: 429 }, "rate_limited"],
    [{ status: 503 }, "server"], [{ status: 400 }, "request"],
    [new TypeError("private"), "network"], [new Error("private"), "unexpected"],
  ] as const) assert.equal(platformErrorCategory(error), category);
});

test("signup completion stays in the confirmed success branch, not submission or success-page load", () => {
  const source = readFileSync("client/src/pages/TenantSignupPage.tsx", "utf8");
  assert.match(source, /if \(data.success && data.tenantId\) \{\s*trackPlatformEvent\("platform_signup_success"/);
  assert.equal(source.match(/"platform_signup_success"/g)?.length, 1);
  assert.match(source, /onChange=\{trackSignupStart\}/);
  assert.match(source, /if \(signupStarted.current\) return/);
  assert.match(source, /"platform_signup_attempt"/);
  const hook = readFileSync("client/src/hooks/usePlatformAcquisition.ts", "utf8");
  assert.match(hook, /IntersectionObserver/);
  assert.match(hook, /!viewed.current/);
  assert.doesNotMatch(hook, /action: "login"/);
});

test("nested Link/Button CTA clicks emit exactly once for both plans and every placement", () => {
  const dom = new JSDOM("<main></main>", { url: "https://example.test/platform" });
  const events: any[] = [];
  Object.assign(globalThis, { window: dom.window });
  (dom.window as any).umami = { track: (build: any) => events.push(build({})) };
  const main = dom.window.document.querySelector("main")!;
  // Capture phase matches the page-root React onClickCapture handler.
  main.addEventListener("click", event => trackPlatformCtaClick(event.target as Element, "landing"), true);
  main.addEventListener("click", event => event.preventDefault());
  for (const [container, placement] of [["header", "header"], ["section", "body"], ["footer", "footer"]]) {
    for (const tier of ["lite", "pro"]) {
      for (const responsiveClass of ["hidden md:flex", "flex md:hidden"]) {
        main.innerHTML = `<${container}><a href="/platform/signup?tier=${tier}" class="${responsiveClass}"><button><span>Start</span><svg><path d="M0 0"/></svg></button></a></${container}>`;
        for (const selector of ["a", "button", "span", "svg", "path"]) {
          const before = events.length;
          main.querySelector(selector)!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
          assert.equal(events.length, before + 1, `${placement}/${tier}/${selector}`);
          assert.deepEqual(events.at(-1).data, {
            funnel: "platform_acquisition", location: "landing", placement,
            action: "signup", plan: tier === "lite" ? "lite" : "professional",
          });
        }
      }
    }
  }
  for (const [html, action] of [
    ['<a href="/platform/pricing"><button><span>Compare Plans</span></button></a>', "pricing"],
    ['<a href="/platform/pricing"><span>Pricing</span></a>', "pricing"],
    ['<button data-acquisition-action="demo"><span>Demo</span></button>', "demo"],
  ]) {
    main.innerHTML = html;
    const before = events.length;
    main.querySelector("span")!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    assert.equal(events.length, before + 1);
    assert.equal(events.at(-1).data.action, action);
  }
  for (const href of ["/platform/login", "/demo", "/rescue/donate"]) {
    main.innerHTML = `<a href="${href}"><button><span>Other action</span></button></a>`;
    const before = events.length;
    main.querySelector("span")!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    assert.equal(events.length, before);
  }
  dom.window.close();
  Reflect.deleteProperty(globalThis, "window");
});
