import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';

interface TenantInfo {
  id: string;
  subdomain?: string;
  name: string;
  tagline?: string | null;
  logoUrl?: string | null;
  branding?: {
    primaryColor?: string;
  } | null;
  customDomain?: string | null;
  customDomainVerified?: boolean;
}

/**
 * Hook to dynamically update PWA manifest and meta tags for tenant-specific branding.
 * 
 * iOS Safari caches the manifest URL from the HTML <link rel="manifest"> tag.
 * To ensure the correct tenant's manifest is used when "Add to Home Screen" is invoked,
 * we update the link tag to include the tenant as a query parameter.
 * 
 * For custom domains (e.g., magapie.com), the backend resolves the tenant from the hostname,
 * so no query parameter is needed - just use /manifest.json directly.
 * 
 * This approach is recommended for multi-tenant PWAs because:
 * 1. iOS Safari requests /manifest.json separately from the page
 * 2. Path-based routing doesn't apply to the manifest request
 * 3. Query parameters force iOS to fetch the correct tenant-specific manifest
 * 4. Custom domains work automatically via hostname-based tenant resolution
 */
export function usePWAManifest() {
  const { tenantId, basePath, isPathBasedTenant } = useTenant();
  
  // Determine if we're on a custom domain
  const isCustomDomain = tenantId === 'custom-domain';

  const { data: tenantData } = useQuery<{ tenant: TenantInfo }>({
    queryKey: ['/api/tenant', tenantId],
    // Enable for all tenants including custom-domain (backend will resolve from hostname)
    enabled: !!tenantId && tenantId !== 'platform',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    
    // Find or create apple-touch-icon link
    let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]:not([sizes])') as HTMLLinkElement;
    if (!appleTouchIcon) {
      appleTouchIcon = document.createElement('link');
      appleTouchIcon.rel = 'apple-touch-icon';
      document.head.appendChild(appleTouchIcon);
    }

    // First, determine the subdomain for path-based tenants (before waiting for tenantData)
    // This ensures the manifest link is set correctly even while tenantData is loading
    const subdomainFromBasePath = isPathBasedTenant && basePath ? basePath.replace(/^\//, '') : null;
    const subdomain = tenantData?.tenant?.subdomain || subdomainFromBasePath;
    
    // Update manifest link based on tenant type
    if (manifestLink) {
      if (isCustomDomain) {
        // For custom domains, just use /manifest.json - backend resolves tenant from hostname
        // No query parameter needed since the domain itself identifies the tenant
        manifestLink.href = '/manifest.json';
        console.log('[PWA] Custom domain detected - using /manifest.json (hostname-based resolution)');
      } else if (subdomain) {
        // Use query parameter approach for explicit tenant identification
        // This works reliably with iOS Safari's aggressive manifest caching
        manifestLink.href = `/manifest.json?tenant=${subdomain}`;
        console.log(`[PWA] Path-based tenant - using /manifest.json?tenant=${subdomain}`);
      } else {
        // Default platform manifest
        manifestLink.href = '/manifest.json';
      }
    }

    // Update Apple-specific meta tags for proper home screen branding
    if (tenantData?.tenant) {
      const tenant = tenantData.tenant;
      
      console.log(`[PWA] Updating meta tags for tenant: ${tenant.name}, logo: ${tenant.logoUrl ? 'yes' : 'no'}`);
      
      if (appleTitleMeta) {
        // Apple recommends keeping this under 12 characters
        appleTitleMeta.content = tenant.name.substring(0, 12);
      }

      if (themeColorMeta && tenant.branding?.primaryColor) {
        themeColorMeta.content = tenant.branding.primaryColor;
      }
      
      // Update apple-touch-icon with tenant's logo for home screen icon
      // Use default iRescue icon if tenant has no custom logo
      const iconUrl = tenant.logoUrl || '/apple-touch-icon.png';
      if (appleTouchIcon) {
        appleTouchIcon.href = iconUrl;
        // Also update sized variants if they exist
        const sizedIcons = document.querySelectorAll('link[rel="apple-touch-icon"][sizes]') as NodeListOf<HTMLLinkElement>;
        sizedIcons.forEach(icon => {
          icon.href = iconUrl;
        });
        console.log(`[PWA] Updated apple-touch-icon to: ${iconUrl}`);
      }

      // Update Open Graph image if tenant has logo
      if (tenant.logoUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
        if (ogImage) {
          ogImage.content = tenant.logoUrl;
        }
      }

      // Only update document title on tenant pages
      if (tenantId && tenantId !== 'platform') {
        document.title = `${tenant.name} - Animal Rescue Portal`;
      }
    }
  }, [isPathBasedTenant, basePath, tenantData, tenantId, isCustomDomain]);

  return null;
}
