import { isSensitiveVolunteerTrainingUrl } from "./sensitive-routes";

const hosts = new Set(["irescue.life", "www.irescue.life", "platform.irescue.life"]);
const routes = new Set([
  "/platform", "/platform/pricing", "/platform/integrations",
  "/platform/security", "/platform/privacy", "/platform/terms", "/platform/blog",
]);

/** Exact public allowlist, not a prefix match. Never return arbitrary URL text. */
export function marketingPerformanceRoute(hostname: string, pathname: string): string | null {
  if (!hosts.has(hostname.toLowerCase()) || isSensitiveVolunteerTrainingUrl(pathname)) return null;
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/" || path === "/platform") return "/platform";
  return routes.has(path) ? path : null;
}

export function performanceDevice(width: number): "mobile" | "tablet" | "desktop" {
  return width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop";
}
