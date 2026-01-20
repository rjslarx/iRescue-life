import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';

interface TenantContextType {
  tenantId: string | null;
  setTenantId: (id: string) => void;
  clearTenantId: () => void;
  basePath: string; // Base path for routing (e.g., "/turbeau" for path-based tenants)
  isPathBasedTenant: boolean; // True if using path-based routing
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const STORAGE_KEY = 'rescue_portal_tenant';

const DEV_DEFAULT_TENANT = 'demo'; // Default tenant for development

// SINGLE SOURCE OF TRUTH: Reserved paths that are NOT tenant slugs
// These are application routes that should never be interpreted as tenant identifiers
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

// Clean up any stale reserved path stored as tenant
// Exception: 'platform' is always valid - it's explicitly handled by the platform admin flow
function cleanupStaleStorage(): void {
  if (typeof window === 'undefined') return;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && RESERVED_PATHS.includes(stored.toLowerCase())) {
    // Never remove 'platform' - it's a valid special tenant for platform admin
    // The platform admin flow explicitly manages this value
    if (stored.toLowerCase() === 'platform') {
      return;
    }
    console.log('[TENANT CLEANUP] Removing stale reserved path from storage:', stored);
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  
  // Clean up any stale reserved paths stored as tenant on mount
  cleanupStaleStorage();
  
  // Detect tenant from URL SYNCHRONOUSLY before any API calls
  const [tenantId, setTenantIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const pathMatch = pathname.match(/^\/([^\/]+)/);
    const firstPathSegment = pathMatch ? pathMatch[1] : null;
    const PLATFORM_DOMAIN = 'irescue.life';
    
    // Platform admin route
    if (pathname.startsWith('/platform')) {
      localStorage.setItem(STORAGE_KEY, 'platform');
      return 'platform';
    }
    
    // Check if this is irescue.life (platform domain)
    if (hostname === PLATFORM_DOMAIN || hostname === 'www.' + PLATFORM_DOMAIN) {
      if (!isReservedPath(firstPathSegment)) {
        console.log('[TENANT INIT] Path-based tenant:', firstPathSegment);
        localStorage.setItem(STORAGE_KEY, firstPathSegment!);
        return firstPathSegment;
      }
      // No tenant on platform root or reserved path
      return null;
    }
    
    // Development domains (localhost, replit.dev, or replit.app)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('replit.dev') || hostname.endsWith('.replit.app')) {
      if (!isReservedPath(firstPathSegment)) {
        console.log('[TENANT INIT] Path-based tenant (dev):', firstPathSegment);
        localStorage.setItem(STORAGE_KEY, firstPathSegment!);
        return firstPathSegment;
      }
      // Default to demo tenant in development (not a path-based tenant)
      localStorage.setItem(STORAGE_KEY, DEV_DEFAULT_TENANT);
      return DEV_DEFAULT_TENANT;
    }
    
    // Custom domain (not irescue.life, not localhost, not replit.dev)
    // Backend will resolve the actual tenant from the domain
    console.log('[TENANT INIT] Custom domain detected:', hostname);
    localStorage.setItem(STORAGE_KEY, 'custom-domain');
    return 'custom-domain';
  });
  
  const [basePath, setBasePath] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const pathMatch = pathname.match(/^\/([^\/]+)/);
    const firstPathSegment = pathMatch ? pathMatch[1] : null;
    
    // If we have a path-based tenant (not a reserved path), use it
    if (!isReservedPath(firstPathSegment)) {
      return `/${firstPathSegment}`;
    }
    
    // On dev domains at root /, use empty basePath so routes work
    // The tenant is still demo, but routing works from root
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('replit.dev') || hostname.endsWith('.replit.app')) {
      return '';
    }
    
    return '';
  });
  
  const [isPathBasedTenant, setIsPathBasedTenant] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const pathname = window.location.pathname;
    const pathMatch = pathname.match(/^\/([^\/]+)/);
    const firstPathSegment = pathMatch ? pathMatch[1] : null;
    
    // If we have a path-based tenant in URL (not a reserved path), return true
    if (!isReservedPath(firstPathSegment)) {
      return true;
    }
    
    // On dev domains at root, we use demo tenant but without path-based routing
    return false;
  });

  const setTenantId = (id: string) => {
    setTenantIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const clearTenantId = () => {
    setTenantIdState(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Automatically detect tenant from subdomain, path, or custom domain
  useEffect(() => {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const PLATFORM_DOMAIN = 'irescue.life';
    
    // Check if this is a platform admin route
    if (location.startsWith('/platform')) {
      setTenantId('platform');
      setBasePath('');
      setIsPathBasedTenant(false);
      return;
    }
    
    // On localhost/dev/replit.app, check for path-based routing FIRST (same as production)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('replit.dev') || hostname.endsWith('.replit.app')) {
      // Try path-based routing first (e.g., /munchkin3/dashboard)
      const pathMatch = pathname.match(/^\/([^\/]+)/);
      const firstPathSegment = pathMatch ? pathMatch[1] : null;
      
      if (!isReservedPath(firstPathSegment)) {
        // This looks like a path-based tenant
        console.log('[TENANT CONTEXT] Path-based tenant detected (dev):', firstPathSegment);
        console.log('[TENANT CONTEXT] Setting localStorage to:', firstPathSegment);
        setTenantId(firstPathSegment);
        setBasePath(`/${firstPathSegment}`);
        setIsPathBasedTenant(true);
        console.log('[TENANT CONTEXT] localStorage now contains:', localStorage.getItem(STORAGE_KEY));
        return;
      }
      
      // No path-based tenant in URL, use default demo tenant but with empty basePath
      // so routes work from root /
      const current = localStorage.getItem(STORAGE_KEY);
      if (current !== 'platform' && current !== DEV_DEFAULT_TENANT) {
        setTenantId(DEV_DEFAULT_TENANT);
      }
      // Keep basePath empty so routes match from root
      setBasePath('');
      setIsPathBasedTenant(false);
      return;
    }

    // Check if on platform domain (irescue.life or www.irescue.life)
    if (hostname === PLATFORM_DOMAIN || hostname === 'www.' + PLATFORM_DOMAIN) {
      // Path-based routing: extract tenant from first path segment
      // e.g., /turbeau/dashboard -> tenant: turbeau, basePath: /turbeau
      const pathMatch = pathname.match(/^\/([^\/]+)/);
      const firstPathSegment = pathMatch ? pathMatch[1] : null;
      
      if (!isReservedPath(firstPathSegment)) {
        // This looks like a path-based tenant
        console.log('[TENANT CONTEXT] Path-based tenant detected (prod):', firstPathSegment);
        console.log('[TENANT CONTEXT] Hostname:', hostname, 'Pathname:', pathname);
        console.log('[TENANT CONTEXT] Setting localStorage to:', firstPathSegment);
        setTenantId(firstPathSegment);
        setBasePath(`/${firstPathSegment}`);
        setIsPathBasedTenant(true);
        console.log('[TENANT CONTEXT] localStorage now contains:', localStorage.getItem(STORAGE_KEY));
        return;
      }
      
      // Not a path-based tenant, clear tenant context
      clearTenantId();
      setBasePath('');
      setIsPathBasedTenant(false);
      return;
    }
    
    // Check if subdomain-based (e.g., turbeau.irescue.life)
    if (hostname.endsWith(PLATFORM_DOMAIN)) {
      const parts = hostname.split('.');
      if (parts.length >= 3) {
        const subdomain = parts.slice(0, -2).join('.');
        setTenantId(subdomain);
        setBasePath('');
        setIsPathBasedTenant(false);
        return;
      }
    }
    
    // Otherwise, assume custom domain
    // The backend will resolve the tenant from the custom domain
    setTenantId('custom-domain'); // Placeholder - backend will resolve actual tenant
    setBasePath('');
    setIsPathBasedTenant(false);
  }, [location]);

  return (
    <TenantContext.Provider value={{ tenantId, setTenantId, clearTenantId, basePath, isPathBasedTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

/**
 * Hook to get headers with tenant ID for API requests
 * For custom domains, don't send x-tenant-id header - backend resolves from hostname
 */
export function useTenantHeaders() {
  const { tenantId } = useTenant();
  
  // For custom domains, don't send the header - backend resolves from hostname
  if (tenantId === 'custom-domain') {
    return {};
  }
  
  return tenantId ? { 'x-tenant-id': tenantId } : {};
}
