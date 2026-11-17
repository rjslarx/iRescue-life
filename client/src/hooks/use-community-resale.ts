import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tenantApiRequest } from "@/lib/tenantApi";
import { useTenant } from "@/contexts/TenantContext";
export function communityToken() { return sessionStorage.getItem("community-resale-token") || ""; }
export function saveCommunityToken(token: string) { sessionStorage.setItem("community-resale-token", token); }
export async function communityRequest<T = any>(path: string, method = "GET", body?: any, scope: "public" | "tenant" | "platform" = "public"): Promise<T> {
  const root = scope === "tenant" ? "/api/community-resale-admin" : scope === "platform" ? "/api/platform/community-resale" : "/api/community-resale";
  let response: Response;
  if (scope === "tenant") {
    try { response = await tenantApiRequest(method, `${root}${path}`, body); }
    catch (error) {
      // tenantApiRequest already throws on HTTP errors. Preserve its message and
      // Error compatibility while retaining a machine-readable response status.
      if (error instanceof Error) {
        const status = /^(\d{3}):/.exec(error.message);
        if (status) Object.assign(error, { status: Number(status[1]) });
      }
      throw error;
    }
  }
  else response = await fetch(`${root}${path}`, {
    method, credentials: "same-origin",
    headers: { ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), "X-Community-Token": communityToken(),
      ...(scope === "platform" ? { "x-tenant-id": "platform" } : {}) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "Unable to finish. Please try again."), { status: response.status });
  return data;
}
export function useCommunityQuery<T = any>(path: string, scope: "public" | "tenant" | "platform" = "public", enabled = true) {
  const { tenantId, basePath } = useTenant();
  return useQuery<T>({ queryKey: ["community-resale", scope, scope === "tenant" ? [tenantId, basePath] : null, path, communityToken()], queryFn: () => communityRequest<T>(path, "GET", undefined, scope), enabled, retry: false });
}
export function useRefreshCommunity() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["community-resale"] });
}
