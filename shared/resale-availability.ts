// Deliberate platform-wide pause. Keep all records and recovery workflows.
export const RESALE_PUBLIC_ENABLED = false;
export const RESALE_PAUSED_MESSAGE = "Rescue Resale is currently unavailable. Please contact the rescue about an existing order.";

export function isPausedResalePage(path: string, search = "") {
  if (RESALE_PUBLIC_ENABLED) return false;
  const normalized = path.replace(/\/+$/, "");
  if (/^(?:\/[^/]+)?\/rescue-resale$/.test(normalized)) {
    const params = new URLSearchParams(search);
    return !["order", "payoutSetup", "activity"].some(key => params.has(key));
  }
  return /^(?:\/[^/]+)?\/resale(?:\/create|\/item\/[^/]+)?$/.test(normalized);
}

export function isPausedResaleApi(method: string, path: string) {
  if (RESALE_PUBLIC_ENABLED) return false;
  const normalized = path.replace(/\/+$/, "").toLowerCase() || "/";
  if (method === "GET" || method === "HEAD") {
    return normalized === "/partners" || /^\/items(?:\/[^/]+)?$/.test(normalized);
  }
  return normalized === "/checkout" || normalized === "/images" ||
    normalized === "/items" ||
    /^\/items\/[^/]+(?:\/price|\/messages)?$/.test(normalized) ||
    /^\/conversations\/[^/]+\/offer$/.test(normalized);
}
