import type { Metric } from "web-vitals";
import { marketingPerformanceRoute, performanceDevice } from "../../../shared/marketing-performance";
import type {} from "./platformAnalytics";

type Vital = Pick<Metric, "name" | "value" | "navigationType">;

/** One observation per metric per initial document, not per person or SPA route. */
export function createPerformanceReporter(browser: Window) {
  const initialPath = browser.location.pathname;
  const route = marketingPerformanceRoute(browser.location.hostname, initialPath);
  const device = performanceDevice(browser.innerWidth);
  const sent = new Set<string>();
  let active = !!route;
  return {
    invalidate() { active = false; },
    report(metric: Vital) {
      if (!active || browser.location.pathname !== initialPath || !route ||
          !["LCP", "CLS", "INP"].includes(metric.name) ||
          !Number.isFinite(metric.value) || metric.value < 0 ||
          metric.navigationType === "back-forward-cache" || sent.has(metric.name)) return;
      // A missing/blocked tracker is a lost sample, never a replay or synthetic zero.
      sent.add(metric.name);
      try {
        const result = browser.umami?.track(defaults => ({
          // Do not spread tracker defaults (identity, raw URL, title or referrer).
          website: defaults.website,
          url: route, referrer: "", title: "Marketing performance",
          name: "marketing_web_vital",
          data: {
            schema: "v1", route, device, metric: metric.name,
            value: metric.name === "CLS" ? Math.round(metric.value * 10000) / 10000 : Math.round(metric.value),
          },
        }));
        if (result && typeof result.catch === "function") void result.catch(() => {});
      } catch {
        // Measurement must never interrupt navigation.
      }
    },
  };
}

let started = false;
export async function startMarketingPerformance() {
  if (started || !import.meta.env.PROD ||
      !marketingPerformanceRoute(window.location.hostname, window.location.pathname) ||
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  started = true;
  const reporter = createPerformanceReporter(window);
  // Invalidate synchronously, including leave-and-return navigation. Document
  // Web Vitals cannot be attributed reliably to individual SPA screens.
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args);
      reporter.invalidate();
      return result;
    };
  }
  window.addEventListener("popstate", () => reporter.invalidate(), { capture: true });
  window.addEventListener("hashchange", () => reporter.invalidate(), { capture: true });
  try {
    const { onLCP, onCLS, onINP } = await import("web-vitals");
    // Defaults report on finalization/first backgrounding, not every update.
    onLCP(reporter.report);
    onCLS(reporter.report);
    onINP(reporter.report);
  } catch {
    // Unsupported/blocked collection must not affect the page.
  }
}
