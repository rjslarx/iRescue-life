import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";

export interface PublicPuzzleConfig {
  enabled: boolean;
  facebookPostUrl: string;
  rescueName: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone: string;
  available: boolean;
  availability: "open" | "paused" | "upcoming" | "closed";
  availabilityMessage: string;
  nextChangeAt: string | null;
  serverNow: number;
}
export interface PublicPuzzleLaunch extends PublicPuzzleConfig {
  photoVersion: string | null;
  html: string;
  pet: { id: string; name: string; breed: string; imageUrl: string } | null;
}
export async function publicPuzzleRequest<T>(action: "access" | "launch" | "settings", method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(buildTenantUrl(`/api/public-puzzle/${action}`), {
    method, credentials: "same-origin", signal,
    headers: { ...getTenantHeaders(), ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Could not load the puzzle. Please try again."), { status: response.status });
  return data as T;
}
