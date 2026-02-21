import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { buildTenantUrl, getTenantHeaders } from "./tenantApi";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = `${res.status}: ${text}`;
    try {
      const json = JSON.parse(text);
      if (json.error) {
        message = json.error;
      } else if (json.message) {
        message = json.message;
      }
    } catch {}
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const tenantUrl = buildTenantUrl(url);
  const tenantHeaders = getTenantHeaders();
  const headers: Record<string, string> = {
    ...tenantHeaders,
  };
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  const res = await fetch(tenantUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const tenantHeaders = getTenantHeaders();
    
    // Build URL from query key elements
    // - If first element is a complete URL (starts with /api), use only that as the URL
    //   Additional elements like tenantId are for cache separation, not URL building
    // - For hierarchical paths like ['/api/animals', animalId, 'files'], join them
    // - Detect cache-only elements: if an element looks like a tenant ID (stored in headers),
    //   don't include it in the URL path
    const firstKey = String(queryKey[0]);
    let url: string;
    
    if (queryKey.length === 1) {
      // Simple case: single URL string
      url = firstKey;
    } else {
      // Multiple elements: determine if second element is a URL path segment or cache key
      // If the first element is a complete API path like '/api/animals' and the second
      // element is used in x-tenant-id header, it's for caching only
      const tenantId = typeof window !== 'undefined' ? localStorage.getItem('rescue_portal_tenant') : null;
      const filteredKeys = queryKey.filter((key, index) => {
        if (index === 0) return true; // Always include first element
        const keyStr = String(key);
        // Exclude keys that match tenantId (these are cache-busting only)
        if (keyStr === tenantId) return false;
        // Exclude undefined/null strings
        if (keyStr === 'undefined' || keyStr === 'null') return false;
        return true;
      });
      url = filteredKeys.join("/");
    }
    
    const tenantUrl = buildTenantUrl(url);
    
    const res = await fetch(tenantUrl, {
      credentials: "include",
      headers: tenantHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
