import test from "node:test";
import assert from "node:assert/strict";
import { marketingPerformanceRoute, performanceDevice } from "../shared/marketing-performance";
import { createPerformanceReporter } from "../client/src/lib/marketingPerformance";

test("only exact marketing routes on public platform hosts qualify", () => {
  for (const host of ["irescue.life", "www.irescue.life", "platform.irescue.life"]) {
    assert.equal(marketingPerformanceRoute(host, "/"), "/platform");
    assert.equal(marketingPerformanceRoute(host, "/platform/pricing/"), "/platform/pricing");
    for (const path of ["/platform/signup", "/platform/signup/success", "/platform/login",
      "/platform/dashboard", "/volunteer-training/secret", "/rescue/platform",
      "/platform/reset-password", "/platform/blog/private-slug", "/animals/123"]) {
      assert.equal(marketingPerformanceRoute(host, path), null);
    }
  }
  for (const host of ["rescue.irescue.life", "custom.org", "localhost", "example.replit.dev"]) {
    assert.equal(marketingPerformanceRoute(host, "/platform"), null);
  }
  assert.deepEqual([390, 767, 768, 1023, 1024].map(performanceDevice),
    ["mobile", "mobile", "tablet", "tablet", "desktop"]);
});

function fixture() {
  const events: any[] = [];
  const browser: any = {
    location: { hostname: "irescue.life", pathname: "/platform", search: "?token=secret" },
    innerWidth: 390,
    umami: { track: (build: any) => events.push(build({
      website: "site", url: "/platform?token=secret", referrer: "secret",
      title: "private", distinctId: "private", data: { email: "private" },
    })) },
  };
  return { events, browser, reporter: createPerformanceReporter(browser) };
}
test("all three metrics have numeric samples and no incidental private context", () => {
  const { events, reporter } = fixture();
  for (const name of ["LCP", "CLS", "INP"] as const) {
    reporter.report({ name, value: name === "CLS" ? 0.12345 : 1234.56, navigationType: "navigate" });
    reporter.report({ name, value: 9999, navigationType: "navigate" });
  }
  assert.equal(events.length, 3);
  assert.deepEqual(events[1], {
    website: "site", url: "/platform", referrer: "", title: "Marketing performance",
    name: "marketing_web_vital",
    data: { schema: "v1", route: "/platform", device: "mobile", metric: "CLS", value: 0.1235 },
  });
  assert.equal(events[0].data.value, 1235);
  assert.doesNotMatch(JSON.stringify(events), /secret|private|distinctId|funnel|email/);
});
test("navigation, restored pages and malformed values never contaminate samples", () => {
  const { events, browser, reporter } = fixture();
  for (const value of [NaN, Infinity, -1]) reporter.report({ name: "LCP", value, navigationType: "navigate" });
  reporter.report({ name: "LCP", value: 1, navigationType: "back-forward-cache" });
  browser.location.pathname = "/dashboard";
  reporter.report({ name: "LCP", value: 1, navigationType: "navigate" });
  reporter.invalidate();
  browser.location.pathname = "/platform";
  reporter.report({ name: "LCP", value: 1, navigationType: "navigate" });
  assert.equal(events.length, 0);
});
test("missing and failing trackers do not affect visitors", async () => {
  for (const track of [undefined, () => { throw Error("offline"); }, () => Promise.reject(Error("offline"))]) {
    const { browser } = fixture();
    browser.umami = track ? { track } : undefined;
    const reporter = createPerformanceReporter(browser);
    assert.doesNotThrow(() => reporter.report({ name: "INP", value: 22, navigationType: "navigate" }));
  }
  await new Promise(resolve => setImmediate(resolve));
});
