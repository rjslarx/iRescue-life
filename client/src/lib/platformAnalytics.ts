type EventName = "platform_pricing_view" | "platform_cta_click" |
  "platform_demo_request" | "platform_demo_success" | "platform_demo_error" |
  "platform_signup_start" | "platform_signup_attempt" | "platform_signup_success" | "platform_signup_error";
type Dimensions = {
  location?: "landing" | "pricing" | "signup";
  placement?: "header" | "footer" | "body";
  action?: "signup" | "pricing" | "demo";
  plan?: "lite" | "professional";
  demo_type?: "live" | "requested";
  category?: "validation" | "conflict" | "rate_limited" | "server" | "network" | "request" | "unexpected";
};

declare global {
  interface Window {
    umami?: {
      track(payload: (defaults: Record<string, unknown>) => Record<string, unknown>): void | Promise<unknown>;
    };
  }
}

// Closed dimensions only: never forward form values, errors, URLs or identifiers.
export function trackPlatformEvent(name: EventName, dimensions: Dimensions = {}): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname.replace(/\/$/, "");
  if (!["/platform", "/platform/pricing", "/platform/signup"].includes(path)) return;
  try {
    const data: Record<string, string> = { funnel: "platform_acquisition" };
    const allowed: Record<keyof Dimensions, readonly string[]> = {
      location: ["landing", "pricing", "signup"],
      placement: ["header", "footer", "body"],
      action: ["signup", "pricing", "demo"],
      plan: ["lite", "professional"],
      demo_type: ["live", "requested"],
      category: ["validation", "conflict", "rate_limited", "server", "network", "request", "unexpected"],
    };
    for (const key of Object.keys(allowed) as (keyof Dimensions)[]) {
      const value = dimensions[key];
      if (value && allowed[key].includes(value)) data[key] = value;
    }
    // Override automatic URL/referrer/title fields too: query strings may contain
    // sensitive values. Automatic pageviews remain managed by the hosting proxy.
    const result = window.umami?.track(defaults => ({
      ...defaults, url: path, referrer: "", title: "Platform acquisition",
      name, data,
    }));
    if (result && typeof result.catch === "function") void result.catch(() => {});
  } catch {
    // Tracking must not interrupt signup or demo access.
  }
}

export function platformErrorCategory(error: unknown): NonNullable<Dimensions["category"]> {
  const status = (error as { status?: number } | null)?.status;
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status && status >= 500) return "server";
  if (status && status >= 400) return "request";
  if (error instanceof TypeError) return "network";
  return "unexpected";
}

export function trackPlatformCtaClick(target: Element, location: "landing" | "pricing"): void {
  const control = target.closest("a,button");
  if (!control) return;
  // Link renders an anchor around Button. Resolve the enclosing anchor even
  // when the click lands on the inner button, text span, SVG or SVG path.
  const href = control.closest("a")?.getAttribute("href");
  const placement = control.closest("header") ? "header" : control.closest("footer") ? "footer" : "body";
  if (href === "/platform/signup?tier=lite" || href === "/platform/signup?tier=pro") {
    trackPlatformEvent("platform_cta_click", { location, placement, action: "signup", plan: href.endsWith("lite") ? "lite" : "professional" });
  } else if (href === "/platform/pricing") {
    trackPlatformEvent("platform_cta_click", { location, placement, action: "pricing" });
  } else if (control.getAttribute("data-acquisition-action") === "demo") {
    trackPlatformEvent("platform_cta_click", { location, placement, action: "demo" });
  }
}
