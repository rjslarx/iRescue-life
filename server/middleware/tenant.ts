import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { tenants } from '@shared/schema';
import { eq, or, and } from 'drizzle-orm';

export interface TenantContext {
  id: string;
  subdomain: string;
  name: string;
  tagline?: string | null;
  missionStatement?: string | null;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  heroMobileImageUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  customDomain?: string | null;
  customDomainVerified?: boolean;
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    successColor?: string;
    warningColor?: string;
    destructiveColor?: string;
  };
  stripeLink?: string | null;
  stripeEnabled?: boolean;
  stripePublishableKey?: string | null;
  resendEnabled?: boolean;
  resendFromEmail?: string | null;
  resendFromName?: string | null;
  constantContactEnabled?: boolean;
  actionCircle?: {
    enabled?: boolean;
    rotationSpeed?: number;
    actions?: {
      adopt?: { imageUrl?: string; title?: string; description?: string; };
      foster?: { imageUrl?: string; title?: string; description?: string; };
      volunteer?: { imageUrl?: string; title?: string; description?: string; };
      donate?: { imageUrl?: string; title?: string; description?: string; };
    };
  };
  mascot?: {
    enabled?: boolean;
    speechText?: string;
  };
  announcementBar?: {
    enabled?: boolean;
    text?: string;
    linkText?: string;
    linkUrl?: string;
    style?: 'info' | 'warning' | 'urgent';
  };
  heroHeadline?: string | null;
  heroButtonText?: string | null;
  heroButton2Text?: string | null;
  footerText?: string | null;
  footerHours?: string | null;
  footerAddress?: string | null;
  privacyPolicyUrl?: string | null;
  termsOfServiceUrl?: string | null;
  sponsorLogos?: Array<{
    id?: string;
    name: string;
    logoUrl: string;
    websiteUrl?: string;
  }>;
  donationSection?: {
    sectionHeading?: string;
    sectionDescription?: string;
    monthlyGivingTitle?: string;
    monthlyGivingDescription?: string;
    monthlyGivingIcon?: string;
    oneTimeButtonText?: string;
    monthlyButtonText?: string;
  };
  heroLayoutType?: 'none' | 'action_circle' | 'three_doors';
  threeDoorsConfig?: {
    door1?: {
      title?: string;
      description?: string;
      linkText?: string;
      linkUrl?: string;
      icon?: 'paw' | 'home' | 'heart' | 'dollar';
    };
    door2?: {
      title?: string;
      description?: string;
      linkText?: string;
      linkUrl?: string;
      icon?: 'paw' | 'home' | 'heart' | 'dollar';
    };
    door3?: {
      title?: string;
      description?: string;
      linkText?: string;
      linkUrl?: string;
      icon?: 'paw' | 'home' | 'heart' | 'dollar';
    };
  };
  quickActions?: string[] | null;
  subscriptionTier?: string | null;
  jotformAdoptionUrl?: string | null;
  jotformFosterUrl?: string | null;
  jotformVolunteerUrl?: string | null;
  jotformSurrenderUrl?: string | null;
  // Organization Legal Settings
  orgLegalName?: string | null;
  orgAddressStreet?: string | null;
  orgAddressCity?: string | null;
  orgAddressState?: string | null;
  orgAddressZip?: string | null;
  orgPhonePublic?: string | null;
  orgEmailRecords?: string | null;
  orgWebsiteUrl?: string | null;
  orgStateLicenseNumber?: string | null;
  orgUsdaLicenseNumber?: string | null;
  supervisingVetName?: string | null;
  supervisingVetLicense?: string | null;
  orgTaxEin?: string | null;
}

// Extend Express Request type to include tenant and platform admin flag
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      isPlatformAdmin?: boolean;
      basePath?: string; // Base path for tenant (e.g., "/" or "/munchkin3")
    }
  }
}

/**
 * Middleware to resolve tenant from subdomain, custom domain, path, or tenant ID
 * Supports three routing modes:
 * 1. Path-based: irescue.life/turbeau (for trials/demos)
 * 2. Custom domain: turbeau.org (for paid customers)
 * 3. Subdomain: turbeau.irescue.life (legacy, may not work with SSL)
 */
export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  try {
    let subdomain: string | null = null;
    let tenantId: string | null = null;
    let customDomain: string | null = null;

    // Extract hostname
    const hostname = req.hostname;
    
    // Skip tenant resolution for static assets - let static file middleware handle these
    // This is critical for production custom domains where assets must be served before tenant resolution
    if (req.path.startsWith('/assets/') || 
        req.path.endsWith('.js') || 
        req.path.endsWith('.css') || 
        req.path.endsWith('.ico') || 
        req.path.endsWith('.png') || 
        req.path.endsWith('.jpg') || 
        req.path.endsWith('.jpeg') || 
        req.path.endsWith('.svg') ||
        req.path.endsWith('.woff') ||
        req.path.endsWith('.woff2') ||
        req.path.endsWith('.ttf') ||
        req.path.endsWith('.map')) {
      return next();
    }
    
    // Debug logging
    console.log(`[TENANT DEBUG] ${req.method} ${req.path} - hostname: ${hostname}, x-tenant-id: ${req.headers['x-tenant-id']}, session.tenantId: ${req.session.tenantId}`);
    
    // Platform domain for iRescue.life
    const PLATFORM_DOMAIN = 'irescue.life';
    const PLATFORM_SUBDOMAIN = 'platform';
    
    // Check for impersonation first
    if (req.session.impersonating && req.session.impersonatedTenantId) {
      tenantId = req.session.impersonatedTenantId;
      console.log(`[TENANT DEBUG] Impersonation active - using tenant ${tenantId}`);
    } 
    // For localhost development or Replit domains, use path-based routing (same as production) OR fallback to x-tenant-id header
    else if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('replit.dev') || hostname.endsWith('.replit.app')) {
      // First try path-based routing (same as production platform domain)
      const pathMatch = req.path.match(/^\/([^\/]+)/);
      const firstPathSegment = pathMatch ? pathMatch[1] : null;
      const reservedPaths = ['platform', 'api'];  // 'demo' is a real tenant, not reserved!
      
      // Try path-based tenant first (for testing path-based routing in dev)
      if (firstPathSegment && !reservedPaths.includes(firstPathSegment)) {
        const [potentialTenant] = await db
          .select({ subdomain: tenants.subdomain })
          .from(tenants)
          .where(eq(tenants.subdomain, firstPathSegment))
          .limit(1);
        
        if (potentialTenant) {
          subdomain = firstPathSegment;
          console.log(`[TENANT DEBUG] Path-based tenant detected (dev): ${subdomain}`);
          console.log(`[TENANT DEBUG] BEFORE stripping - req.url: ${req.url}, req.originalUrl: ${req.originalUrl}, req.path: ${req.path}`);
          
          // Store base path for PWA manifest and other URL generation
          req.basePath = `/${firstPathSegment}`;
          
          const strippedPath = req.url.replace(`/${firstPathSegment}`, '') || '/';
          req.url = strippedPath;
          req.originalUrl = req.originalUrl.replace(`/${firstPathSegment}`, '') || '/';
          
          // CRITICAL: Invalidate Express's cached parsed URL to force re-parsing with new path
          // Without this, Express router still sees /demo/api/... even though we modified req.url
          delete (req as any)._parsedUrl;
          
          console.log(`[TENANT DEBUG] AFTER stripping - req.url: ${req.url}, req.originalUrl: ${req.originalUrl}, req.path: ${req.path}`);
        }
      }
      
      // If no path-based tenant, fall back to x-tenant-id header or session
      if (!subdomain) {
        // Validate session tenantId is a proper UUID before using it
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const sessionTenantId = req.session.tenantId && uuidPattern.test(req.session.tenantId) 
          ? req.session.tenantId 
          : null;
        const tenantIdentifier = (req.headers['x-tenant-id'] as string) || sessionTenantId || null;
        
        // Check if this is a platform admin request (x-tenant-id = "platform")
        if (tenantIdentifier === PLATFORM_SUBDOMAIN) {
          req.isPlatformAdmin = true;
          console.log(`[TENANT DEBUG] Platform admin context detected (localhost)`);
          return next();
        }
        
        // If no identifier, allow request to proceed without tenant (for root signup page)
        if (!tenantIdentifier) {
          return next();
        }
        
        // Check if it's a UUID (tenant ID from session) or a subdomain (from header)
        // Note: uuidPattern already declared above
        if (uuidPattern.test(tenantIdentifier)) {
          tenantId = tenantIdentifier;
        } else {
          subdomain = tenantIdentifier;
        }
      }
    } else if (hostname.endsWith(PLATFORM_DOMAIN)) {
      // On the platform domain - check for path-based tenant routing FIRST
      // Extract first path segment (e.g., /demo/dashboard -> demo)
      const pathMatch = req.path.match(/^\/([^\/]+)/);
      const firstPathSegment = pathMatch ? pathMatch[1] : null;
      
      // Reserved paths that are NOT tenants (platform routes)
      const reservedPaths = ['platform', 'api'];  // 'demo' is a real tenant, not reserved!
      
      // If we have a first path segment that's not reserved, treat it as a potential tenant subdomain
      if (firstPathSegment && !reservedPaths.includes(firstPathSegment)) {
        // Try to look up tenant by this subdomain
        const [potentialTenant] = await db
          .select({ subdomain: tenants.subdomain })
          .from(tenants)
          .where(eq(tenants.subdomain, firstPathSegment))
          .limit(1);
        
        if (potentialTenant) {
          // Found a tenant! Use path-based routing
          subdomain = firstPathSegment;
          console.log(`[TENANT DEBUG] Path-based tenant detected: ${subdomain}`);
          console.log(`[TENANT DEBUG] BEFORE stripping - req.url: ${req.url}, req.originalUrl: ${req.originalUrl}, req.path: ${req.path}`);
          
          // Store base path for PWA manifest and other URL generation
          req.basePath = `/${firstPathSegment}`;
          
          // Strip the tenant prefix from both req.url AND req.originalUrl
          // This is critical because Express uses originalUrl when delegating to mounted routers
          // e.g., /demo/dashboard -> /dashboard
          // Without updating originalUrl, app.use('/api', ...) would see /demo/api/... and 404
          const strippedPath = req.url.replace(`/${firstPathSegment}`, '') || '/';
          req.url = strippedPath;
          req.originalUrl = req.originalUrl.replace(`/${firstPathSegment}`, '') || '/';
          
          // CRITICAL: Invalidate Express's cached parsed URL to force re-parsing with new path
          // Without this, Express router still sees /demo/api/... even though we modified req.url
          delete (req as any)._parsedUrl;
          
          console.log(`[TENANT DEBUG] AFTER stripping - req.url: ${req.url}, req.originalUrl: ${req.originalUrl}, req.path: ${req.path}`);
        }
      }
      
      // If no path-based tenant found, check for subdomain-based routing (legacy)
      if (!subdomain) {
        const parts = hostname.split('.');
        if (parts.length >= 3 && parts[parts.length - 2] + '.' + parts[parts.length - 1] === PLATFORM_DOMAIN) {
          // Remove platform domain parts and join remaining as subdomain
          subdomain = parts.slice(0, -2).join('.');
          
          // Check if this is the platform admin subdomain
          if (subdomain === PLATFORM_SUBDOMAIN) {
            req.isPlatformAdmin = true;
            console.log(`[TENANT DEBUG] Platform admin context detected (platform.irescue.life)`);
            return next();
          }
        } else if (hostname === PLATFORM_DOMAIN || hostname === 'www.' + PLATFORM_DOMAIN) {
          // If it's just "irescue.life" or "www.irescue.life", check for x-tenant-id header as fallback
          // Validate session tenantId is a proper UUID before using it
          const uuidPatternCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const sessionTenantIdProd = req.session.tenantId && uuidPatternCheck.test(req.session.tenantId) 
            ? req.session.tenantId 
            : null;
          const tenantIdentifier = (req.headers['x-tenant-id'] as string) || sessionTenantIdProd || null;
          
          // Check if this is a platform admin request
          if (tenantIdentifier === PLATFORM_SUBDOMAIN) {
            req.isPlatformAdmin = true;
            console.log(`[TENANT DEBUG] Platform admin context detected (header)`);
            return next();
          }
          
          // If tenant identifier provided via header, use it
          if (tenantIdentifier) {
            // Check if it's a UUID (tenant ID from session) or a subdomain (from header)
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidPattern.test(tenantIdentifier)) {
              tenantId = tenantIdentifier;
            } else {
              subdomain = tenantIdentifier;
            }
            console.log(`[TENANT DEBUG] Production domain using header tenant: ${subdomain || tenantId}`);
          } else {
            // No tenant context - allow request to proceed (for root platform pages)
            return next();
          }
        }
      }
    } else {
      // Not a platform domain - treat as custom domain
      // Normalize by stripping www. prefix and converting to lowercase
      customDomain = hostname.replace(/^www\./i, '').toLowerCase();
      console.log(`[TENANT DEBUG] Custom domain detected: ${customDomain} (original: ${hostname})`);
    }

    // If we have a tenant identifier, look up the tenant
    if (subdomain || tenantId || customDomain) {
      // Build the WHERE clause based on what we have
      let whereClause;
      if (tenantId) {
        whereClause = eq(tenants.id, tenantId);
      } else if (customDomain) {
        // For custom domains, MUST check both the domain AND that it's verified
        whereClause = and(
          eq(tenants.customDomain, customDomain),
          eq(tenants.customDomainVerified, true)
        );
      } else if (subdomain) {
        whereClause = eq(tenants.subdomain, subdomain);
      }

      const [tenant] = await db
        .select({
          id: tenants.id,
          subdomain: tenants.subdomain,
          name: tenants.name,
          tagline: tenants.tagline,
          missionStatement: tenants.missionStatement,
          logoUrl: tenants.logoUrl,
          heroImageUrl: tenants.heroImageUrl,
          heroMobileImageUrl: tenants.heroMobileImageUrl,
          heroHeadline: tenants.heroHeadline,
          heroButtonText: tenants.heroButtonText,
          heroButton2Text: tenants.heroButton2Text,
          contactEmail: tenants.contactEmail,
          contactPhone: tenants.contactPhone,
          customDomain: tenants.customDomain,
          customDomainVerified: tenants.customDomainVerified,
          branding: tenants.branding,
          isActive: tenants.isActive,
          stripeLink: tenants.stripeLink,
          stripeEnabled: tenants.stripeEnabled,
          stripePublishableKey: tenants.stripePublishableKey,
          resendEnabled: tenants.resendEnabled,
          resendFromEmail: tenants.resendFromEmail,
          resendFromName: tenants.resendFromName,
          constantContactEnabled: tenants.constantContactEnabled,
          actionCircle: tenants.actionCircle,
          mascot: tenants.mascot,
          announcementBar: tenants.announcementBar,
          footerText: tenants.footerText,
          footerHours: tenants.footerHours,
          footerAddress: tenants.footerAddress,
          privacyPolicyUrl: tenants.privacyPolicyUrl,
          termsOfServiceUrl: tenants.termsOfServiceUrl,
          sponsorLogos: tenants.sponsorLogos,
          donationSection: tenants.donationSection,
          heroLayoutType: tenants.heroLayoutType,
          threeDoorsConfig: tenants.threeDoorsConfig,
          quickActions: tenants.quickActions,
          // Organization Legal Settings
          orgLegalName: tenants.orgLegalName,
          orgAddressStreet: tenants.orgAddressStreet,
          orgAddressCity: tenants.orgAddressCity,
          orgAddressState: tenants.orgAddressState,
          orgAddressZip: tenants.orgAddressZip,
          orgPhonePublic: tenants.orgPhonePublic,
          orgEmailRecords: tenants.orgEmailRecords,
          orgWebsiteUrl: tenants.orgWebsiteUrl,
          orgStateLicenseNumber: tenants.orgStateLicenseNumber,
          orgUsdaLicenseNumber: tenants.orgUsdaLicenseNumber,
          supervisingVetName: tenants.supervisingVetName,
          supervisingVetLicense: tenants.supervisingVetLicense,
          orgTaxEin: tenants.orgTaxEin,
          subscriptionTier: tenants.subscriptionTier,
          jotformAdoptionUrl: tenants.jotformAdoptionUrl,
          jotformFosterUrl: tenants.jotformFosterUrl,
          jotformVolunteerUrl: tenants.jotformVolunteerUrl,
          jotformSurrenderUrl: tenants.jotformSurrenderUrl,
        })
        .from(tenants)
        .where(whereClause!)
        .limit(1);

      if (!tenant) {
        // Provide helpful error message based on lookup type
        let message: string;
        if (customDomain) {
          message = `No rescue organization found for custom domain "${customDomain}". The domain may not be configured or verified.`;
        } else if (subdomain) {
          message = `No rescue organization found with subdomain "${subdomain}"`;
        } else if (tenantId) {
          message = `No rescue organization found with ID "${tenantId}"`;
        } else {
          message = 'No rescue organization found';
        }
        
        return res.status(404).json({ 
          error: 'Tenant not found',
          message
        });
      }

      if (!tenant.isActive) {
        return res.status(403).json({ 
          error: 'Tenant inactive',
          message: 'This rescue organization is currently inactive'
        });
      }

      // Attach tenant to request
      req.tenant = {
        id: tenant.id,
        subdomain: tenant.subdomain,
        name: tenant.name,
        tagline: tenant.tagline,
        missionStatement: tenant.missionStatement,
        logoUrl: tenant.logoUrl,
        heroImageUrl: tenant.heroImageUrl,
        heroMobileImageUrl: tenant.heroMobileImageUrl,
        heroHeadline: tenant.heroHeadline,
        heroButtonText: tenant.heroButtonText,
        heroButton2Text: tenant.heroButton2Text,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
        customDomain: tenant.customDomain,
        customDomainVerified: tenant.customDomainVerified,
        branding: tenant.branding as TenantContext['branding'],
        stripeLink: tenant.stripeLink,
        stripeEnabled: tenant.stripeEnabled,
        stripePublishableKey: tenant.stripePublishableKey,
        resendEnabled: tenant.resendEnabled,
        resendFromEmail: tenant.resendFromEmail,
        resendFromName: tenant.resendFromName,
        constantContactEnabled: tenant.constantContactEnabled,
        actionCircle: tenant.actionCircle as TenantContext['actionCircle'],
        mascot: tenant.mascot as TenantContext['mascot'],
        announcementBar: tenant.announcementBar as TenantContext['announcementBar'],
        footerText: tenant.footerText,
        footerHours: tenant.footerHours,
        footerAddress: tenant.footerAddress,
        privacyPolicyUrl: tenant.privacyPolicyUrl,
        termsOfServiceUrl: tenant.termsOfServiceUrl,
        sponsorLogos: tenant.sponsorLogos as TenantContext['sponsorLogos'],
        donationSection: tenant.donationSection as TenantContext['donationSection'],
        heroLayoutType: tenant.heroLayoutType as TenantContext['heroLayoutType'],
        threeDoorsConfig: tenant.threeDoorsConfig as TenantContext['threeDoorsConfig'],
        quickActions: tenant.quickActions,
        // Organization Legal Settings
        orgLegalName: tenant.orgLegalName,
        orgAddressStreet: tenant.orgAddressStreet,
        orgAddressCity: tenant.orgAddressCity,
        orgAddressState: tenant.orgAddressState,
        orgAddressZip: tenant.orgAddressZip,
        orgPhonePublic: tenant.orgPhonePublic,
        orgEmailRecords: tenant.orgEmailRecords,
        orgWebsiteUrl: tenant.orgWebsiteUrl,
        orgStateLicenseNumber: tenant.orgStateLicenseNumber,
        orgUsdaLicenseNumber: tenant.orgUsdaLicenseNumber,
        supervisingVetName: tenant.supervisingVetName,
        supervisingVetLicense: tenant.supervisingVetLicense,
        orgTaxEin: tenant.orgTaxEin,
        subscriptionTier: tenant.subscriptionTier,
        jotformAdoptionUrl: tenant.jotformAdoptionUrl,
        jotformFosterUrl: tenant.jotformFosterUrl,
        jotformVolunteerUrl: tenant.jotformVolunteerUrl,
        jotformSurrenderUrl: tenant.jotformSurrenderUrl,
      };
      
      // Set cookie for PWA manifest resolution on path-based tenants
      // This allows /manifest.json requests (which don't include path prefix) to resolve tenant
      if (req.basePath) {
        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie('_tenant_hint', tenant.subdomain, {
          httpOnly: false, // Needs to be readable for manifest route
          secure: isProduction,
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: '/',
        });
      }
    }
    // Note: We intentionally do NOT clear the _tenant_hint cookie when no tenant is found.
    // This allows /manifest.json requests (which don't include path prefix) to still resolve
    // tenant context via the cookie that was set during the initial path-based navigation.
    // The 24-hour expiry handles cleanup automatically.

    next();
  } catch (error) {
    console.error('Error resolving tenant:', error);
    res.status(500).json({ error: 'Failed to resolve tenant' });
  }
}

/**
 * Middleware to require tenant context
 * Use this on routes that must have a tenant
 */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.tenant) {
    return res.status(400).json({ 
      error: 'Tenant required',
      message: 'This endpoint requires a valid tenant subdomain'
    });
  }
  next();
}

/**
 * Middleware to require platform admin context AND role verification
 * Use this on platform admin routes
 * SECURITY: Must verify both isPlatformAdmin flag AND user has platform_admin role
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  // Check if request context is platform admin
  if (!req.isPlatformAdmin) {
    return res.status(403).json({ 
      error: 'Platform admin required',
      message: 'This endpoint requires platform admin access'
    });
  }

  // SECURITY: Verify the authenticated user actually has platform_admin role
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access this resource'
    });
  }

  if (!req.user.roles || !req.user.roles.includes('platform_admin')) {
    // Clear the platform admin flag since user doesn't have the role
    req.isPlatformAdmin = false;
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'You must have platform_admin role to access this resource'
    });
  }

  next();
}
