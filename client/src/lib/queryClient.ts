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
    
    // Join all elements of the query key to form the URL path
    // This supports hierarchical paths like ['/api/animals', animalId, 'files']
    const url = queryKey.join("/");
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
