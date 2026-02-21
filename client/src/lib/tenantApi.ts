/**
 * Tenant-aware API request utilities
 * Handles both path-based tenants (/munchkin3/api/...) and header-based tenants (custom domains/subdomains)
 */

interface TenantApiConfig {
  basePath: string;
  isPathBasedTenant: boolean;
  tenantId: string | null;
}

const TENANT_STORAGE_KEY = 'rescue_portal_tenant';

// SINGLE SOURCE OF TRUTH: Reserved paths that are NOT tenant slugs
// These are application routes that should never be interpreted as tenant identifiers
// This MUST match the list in TenantContext.tsx
const RESERVED_PATHS = [
  'platform', 'api', 'login', 'signup', 'register', 'logout',
  'donate', 'volunteer', 'foster', 'become-a-foster', 'surrender',
  'animals', 'animal', 'events', 'happy-tails', 'shop', 'cart',
  'checkout', 'order', 'dashboard', 'settings', 'profile',
  'applications', 'contacts', 'finances', 'kennels', 'calendar',
  'reports', 'help', 'docs', 'assets', 'static', 'public',
  'manifest.json', 'sw.js', 'favicon.ico', 'give', 'page',
  'medical-fund', 'contract', 'collaboration', 'reset-password',
  'forgot-password', 'verify-email', 'unsubscribe'
];

// Helper to check if a path segment is reserved
function isReservedPath(segment: string | null): boolean {
  if (!segment) return true; // null/empty is effectively reserved
  return RESERVED_PATHS.includes(segment.toLowerCase());
}

/**
 * Get tenant configuration from localStorage and current URL
 * This is used for non-React contexts where hooks can't be used
 */
function getTenantConfig(): TenantApiConfig {
  if (typeof window === 'undefined') {
    return { basePath: '', isPathBasedTenant: false, tenantId: null };
  }

  const tenantId = localStorage.getItem(TENANT_STORAGE_KEY);
  const hostname = window.location.hostname;
  
  // CRITICAL: For custom domains (not irescue.life, not localhost, not replit.dev),
  // we should NEVER use path-based routing. The backend resolves tenant from hostname.
  const PLATFORM_DOMAIN = 'irescue.life';
  const isCustomDomain = hostname !== 'localhost' && 
                         hostname !== '127.0.0.1' && 
                         !hostname.includes('replit.dev') && 
                         !hostname.endsWith(PLATFORM_DOMAIN);
  
  // Custom domains don't use path-based routing
  if (isCustomDomain) {
    return { basePath: '', isPathBasedTenant: false, tenantId };
  }
  
  // For platform domain or localhost, check for path-based tenant
  const pathname = window.location.pathname;
  const pathMatch = pathname.match(/^\/([^\/]+)/);
  const firstPathSegment = pathMatch ? pathMatch[1] : null;

  // Use the shared isReservedPath helper to check if this is a tenant slug
  const isPathBasedTenant = !isReservedPath(firstPathSegment);
  const basePath = isPathBasedTenant ? `/${firstPathSegment}` : '';

  return { basePath, isPathBasedTenant, tenantId };
}

/**
 * Build a tenant-aware URL
 * - For path-based tenants: prepends basePath (e.g., /api/foo -> /munchkin3/api/foo)
 * - For other tenants: returns URL as-is (tenant resolved via headers or subdomain)
 */
export function buildTenantUrl(url: string): string {
  const { basePath, isPathBasedTenant } = getTenantConfig();

  // If not path-based tenant, return URL as-is
  if (!isPathBasedTenant) {
    return url;
  }

  // For path-based tenants, prepend basePath to all API URLs
  if (url.startsWith('/api/')) {
    return `${basePath}${url}`;
  }

  // If URL already includes the basePath, don't double-prepend
  if (url.startsWith(basePath)) {
    return url;
  }

  // For any other absolute paths, prepend basePath
  if (url.startsWith('/')) {
    return `${basePath}${url}`;
  }

  // Relative URLs (no leading slash) are returned as-is
  return url;
}

/**
 * Get tenant headers for API requests
 * For custom domains, don't send x-tenant-id header - let the backend resolve from hostname
 * For platform admin pages, send x-tenant-id: platform to identify platform admin context
 */
export function getTenantHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  // On platform admin pages, send platform header to identify platform admin context
  // This tells the backend to set req.isPlatformAdmin = true
  const pathname = window.location.pathname;
  if (pathname.startsWith('/platform')) {
    return { 'x-tenant-id': 'platform' };
  }

  const tenantId = localStorage.getItem(TENANT_STORAGE_KEY);
  
  // For custom domains, don't send the header - backend resolves from hostname
  if (tenantId === 'custom-domain') {
    return {};
  }
  
  return tenantId ? { 'x-tenant-id': tenantId } : {};
}

/**
 * Make a tenant-aware fetch request
 * Automatically prepends basePath for path-based tenants and includes tenant headers
 */
export async function tenantFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const tenantUrl = buildTenantUrl(url);
  const tenantHeaders = getTenantHeaders();

  const headers = new Headers(options?.headers || {});
  Object.entries(tenantHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return fetch(tenantUrl, {
    ...options,
    headers,
    credentials: options?.credentials || 'include',
  });
}

/**
 * React hook for tenant-aware API calls
 * Returns a fetch function that automatically handles tenant context
 */
export function useTenantFetch() {
  return tenantFetch;
}

/**
 * Helper for making tenant-aware API requests with JSON
 */
export async function tenantApiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getTenantHeaders(),
  };

  if (data) {
    headers['Content-Type'] = 'application/json';
  }

  const tenantUrl = buildTenantUrl(url);

  const res = await fetch(tenantUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  return res;
}
