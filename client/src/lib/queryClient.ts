import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { buildTenantUrl, getTenantHeaders } from "./tenantApi";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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
    // - First element is always the base URL path
    // - String elements (except tenant IDs) are path segments
    // - Object elements are converted to query parameters
    const firstKey = String(queryKey[0]);
    let url: string;
    let queryParams: URLSearchParams = new URLSearchParams();
    
    if (queryKey.length === 1) {
      // Simple case: single URL string
      url = firstKey;
    } else {
      // Multiple elements: handle path segments and query params separately
      const tenantId = typeof window !== 'undefined' ? localStorage.getItem('rescue_portal_tenant') : null;
      const pathSegments: string[] = [firstKey];
      
      for (let i = 1; i < queryKey.length; i++) {
        const key = queryKey[i];
        
        // Handle objects as query parameters
        if (key && typeof key === 'object' && !Array.isArray(key)) {
          const obj = key as Record<string, unknown>;
          for (const [paramKey, paramValue] of Object.entries(obj)) {
            if (paramValue !== undefined && paramValue !== null && paramValue !== '') {
              queryParams.append(paramKey, String(paramValue));
            }
          }
          continue;
        }
        
        const keyStr = String(key);
        // Exclude keys that match tenantId (these are cache-busting only)
        if (keyStr === tenantId) continue;
        // Exclude undefined/null strings
        if (keyStr === 'undefined' || keyStr === 'null') continue;
        
        pathSegments.push(keyStr);
      }
      
      url = pathSegments.join("/");
    }
    
    // Append query parameters if any
    const queryString = queryParams.toString();
    if (queryString) {
      url = url + (url.includes('?') ? '&' : '?') + queryString;
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
