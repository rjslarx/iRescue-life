import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { requireTenant } from "./middleware/tenant";
import { requireAuth, requireRole, requireOwner } from "./middleware/auth";
import { loginUser, createTenantWithAdmin, createUser } from "./services/auth";
import { PushNotificationService } from "./services/push-notifications";
import { db } from "./db";
import { tenants, users, demoRequests, insertDemoRequestSchema, smsMessageLogs, emailEvents, animals, platformIntegrations, newsletterCampaigns, newsletterSubscribers, happyTails, adoptionCheckoutSessions, pageVisits, customFormSubmissions, customForms, applications, fosterApplications, volunteerApplications, donations, calendarEvents, contacts, insertContactSchema } from "@shared/schema";
import { eq, and, desc, sql, inArray, lt, ilike, gte, count } from "drizzle-orm";
import { z } from "zod";
import { authLimiter, signupLimiter, passwordResetLimiter, emailLimiter } from "./config/security";
import QRCode from "qrcode";
import adopterPortalRouter from "./routes/adopter-portal";
import fosterPortalRouter from "./routes/foster-portal";

// Build version identifier for debugging production deployments
const BUILD_VERSION = "2025-01-16-v1-uuid-validation";
console.log(`[SERVER] Starting with build version: ${BUILD_VERSION}`);

/**
 * UUID validation regex - prevents database errors from invalid UUID parameters
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate if a string is a valid UUID
 */
function isValidUUID(value: string | undefined): boolean {
  if (!value) return false;
  return UUID_REGEX.test(value);
}

/**
 * Helper function to get email quota limit based on subscription tier
 */
function getEmailQuotaForTier(tier: "free" | "professional"): number {
  const quotas = {
    free: 500,           // Free tier - 500 emails/month
    professional: 10000, // Professional tier - 10,000 emails/month
  };
  return quotas[tier] || 500; // Default to free quota
}

/**
 * Helper function to escape HTML to prevent XSS in emails
 */
function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize CSS color values using strict allowlist
 * Server-side mirror of client-side sanitization
 */
function sanitizeColorValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow hex colors (#RGB, #RRGGBB, #RRGGBBAA) - with end anchor
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return trimmed;
  }
  
  // Allow rgb/rgba colors with strict numeric range validation
  // RGB values: 0-255, Alpha: 0.0-1.0 (no scientific notation)
  // Returns CANONICAL format to prevent injection
  const rgbaMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const rNum = parseInt(r);
    const gNum = parseInt(g);
    const bNum = parseInt(b);
    
    if (rNum <= 255 && gNum <= 255 && bNum <= 255) {
      if (a) {
        const aNum = parseFloat(a);
        if (aNum >= 0 && aNum <= 1) {
          // Return canonical rgba format, NOT user input
          return `rgba(${rNum}, ${gNum}, ${bNum}, ${aNum})`;
        }
      } else {
        // Return canonical rgb format, NOT user input
        return `rgb(${rNum}, ${gNum}, ${bNum})`;
      }
    }
  }
  
  // Allow HSL colors with strict numeric range validation
  // Hue: 0-360, Saturation/Lightness: 0-100%, Alpha: 0.0-1.0
  // Returns CANONICAL format to prevent injection
  const hslaMatch = trimmed.match(/^hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i);
  if (hslaMatch) {
    const [, h, s, l, a] = hslaMatch;
    const hNum = parseInt(h);
    const sNum = parseInt(s);
    const lNum = parseInt(l);
    
    if (hNum <= 360 && sNum <= 100 && lNum <= 100) {
      if (a) {
        const aNum = parseFloat(a);
        if (aNum >= 0 && aNum <= 1) {
          // Return canonical hsla format, NOT user input
          return `hsla(${hNum}, ${sNum}%, ${lNum}%, ${aNum})`;
        }
      } else {
        // Return canonical hsl format, NOT user input
        return `hsl(${hNum}, ${sNum}%, ${lNum}%)`;
      }
    }
  }
  
  // Allow named colors (common safe ones) - return canonical lowercase value
  const namedColors: { [key: string]: string } = {
    'transparent': 'transparent',
    'black': 'black',
    'white': 'white',
    'red': 'red',
    'blue': 'blue',
    'green': 'green',
    'yellow': 'yellow',
    'orange': 'orange',
    'purple': 'purple',
    'pink': 'pink',
    'gray': 'gray',
    'grey': 'grey',
    'brown': 'brown',
    'cyan': 'cyan',
    'magenta': 'magenta',
    'navy': 'navy',
    'teal': 'teal',
    'lime': 'lime',
    'aqua': 'aqua',
    'maroon': 'maroon',
    'olive': 'olive',
    'silver': 'silver',
    'fuchsia': 'fuchsia'
  };
  
  return namedColors[trimmed] || undefined;
}

/**
 * Sanitize font family values using strict allowlist
 * Server-side mirror of client-side sanitization
 */
function sanitizeFontFamilyValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow common safe font families - return ONLY the canonical safe value
  const safeFonts: { [key: string]: string } = {
    'inherit': 'inherit',
    'arial': 'Arial',
    'helvetica': 'Helvetica',
    'sans-serif': 'sans-serif',
    'serif': 'serif',
    'monospace': 'monospace',
    'times new roman': 'Times New Roman',
    'georgia': 'Georgia',
    'courier new': 'Courier New',
    'verdana': 'Verdana',
    'tahoma': 'Tahoma',
    'trebuchet ms': 'Trebuchet MS',
    'comic sans ms': 'Comic Sans MS',
    'impact': 'Impact',
    'palatino': 'Palatino',
    'garamond': 'Garamond',
    'bookman': 'Bookman',
    'courier': 'Courier',
    'monaco': 'Monaco',
    'lucida console': 'Lucida Console'
  };
  
  // Return the canonical safe value, NOT the user's input
  // This prevents attackers from appending extra CSS directives
  return safeFonts[trimmed] || undefined;
}

/**
 * Sanitize font size values using strict pattern
 * Server-side mirror of client-side sanitization
 * Returns CANONICAL format to prevent injection
 */
function sanitizeFontSizeValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow rem, em, px with numbers - validate single decimal point
  const unitMatch = trimmed.match(/^(\d+(?:\.\d+)?)(rem|em|px)$/i);
  if (unitMatch) {
    const [, num, unit] = unitMatch;
    // Ensure single decimal point (no 1.2.3)
    if ((num.match(/\./g) || []).length <= 1) {
      // Return canonical format
      return `${parseFloat(num)}${unit.toLowerCase()}`;
    }
  }
  
  // Allow percentage - validate single decimal point
  const pctMatch = trimmed.match(/^(\d+(?:\.\d+)?)%$/);
  if (pctMatch) {
    const [, num] = pctMatch;
    // Ensure single decimal point
    if ((num.match(/\./g) || []).length <= 1) {
      // Return canonical format
      return `${parseFloat(num)}%`;
    }
  }
  
  return undefined;
}

/**
 * Sanitize background image URL
 * Server-side mirror of client-side sanitization
 * Returns CANONICAL URL (for storage) - caller wraps in url() for rendering
 */
function sanitizeBgImageValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  // Handle already-wrapped url() format from stored data
  const urlMatch = value.match(/^url\(['"]?([^'"()]+)['"]?\)$/i);
  const trimmed = urlMatch ? urlMatch[1].trim() : value.trim();
  
  // Allow relative paths from object storage (e.g., /objects/animals/uuid)
  if (trimmed.startsWith('/objects/')) {
    return trimmed;
  }
  
  try {
    const parsed = new URL(trimmed);
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return undefined;
    }
    // Return canonical URL (fully resolved, no trailing junk)
    // Caller will wrap in url() with proper escaping
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * Sanitize content module styling object
 * Applies strict allowlists to all CSS values
 */
function sanitizeContentModuleStyling(styling: any): any {
  if (!styling || typeof styling !== 'object') return {};
  
  return {
    backgroundColor: sanitizeColorValue(styling.backgroundColor),
    textColor: sanitizeColorValue(styling.textColor),
    fontFamily: sanitizeFontFamilyValue(styling.fontFamily),
    fontSize: sanitizeFontSizeValue(styling.fontSize),
    backgroundImage: sanitizeBgImageValue(styling.backgroundImage),
    textAlign: ['left', 'center', 'right'].includes(styling.textAlign) 
      ? styling.textAlign 
      : undefined,
    imagePosition: ['background', 'above', 'below'].includes(styling.imagePosition)
      ? styling.imagePosition
      : 'background',
    showBorder: styling.showBorder === true,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // Public Routes (no authentication required)
  // ============================================================================

  /**
   * GET /api/qr-code
   * Generate a QR code for any URL
   * Returns a base64-encoded PNG image
   */
  app.get('/api/qr-code', async (req, res, next) => {
    try {
      const url = req.query.url as string;
      
      if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
      }

      // Validate the URL
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      // Generate QR code as base64 data URL
      const qrCode = await QRCode.toDataURL(url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      res.json({ qrCode, url });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /manifest.json
   * Serve tenant-specific PWA manifest dynamically
   * Supports four tenant resolution methods (in order of priority):
   * 1. ?tenant= query parameter - explicit tenant from HTML link tag (most reliable for iOS)
   * 2. req.tenant - set by tenant middleware for path-based/subdomain requests
   * 3. _tenant_hint cookie - set by tenant middleware for PWA manifest fallback
   * 4. Default platform manifest - when no tenant context
   * 
   * iOS Safari caches manifest aggressively, so the query parameter approach
   * ensures the correct tenant manifest is fetched when user adds to home screen.
   */
  app.get('/manifest.json', async (req, res, next) => {
    try {
      // Default platform manifest
      let manifest = {
        name: "iRescue.life - Animal Rescue Management",
        short_name: "iRescue",
        description: "Comprehensive animal rescue management platform for rescue organizations, foster families, and volunteers",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#2563eb",
        orientation: "portrait-primary" as const,
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ],
        categories: ["productivity", "utilities", "lifestyle"],
        shortcuts: [
          {
            name: "My Fosters",
            short_name: "Fosters",
            description: "View your foster animals",
            url: "/dashboard/my-fosters",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }]
          },
          {
            name: "Log Update",
            short_name: "Log Update",
            description: "Log a foster update",
            url: "/dashboard/my-fosters",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }]
          }
        ],
        prefer_related_applications: false
      };

      // Try to get tenant from multiple sources (priority order)
      let tenant = req.tenant;
      let tenantSubdomain: string | null = null;
      
      // Determine if this is a custom domain request
      // Custom domains should use "/" as base path, path-based tenants use their subdomain path
      const isCustomDomain = tenant?.customDomain && tenant?.customDomainVerified;
      let basePath = isCustomDomain ? "/" : (req.basePath || "/");
      
      console.log(`[MANIFEST] Request - tenant: ${tenant?.name || 'none'}, isCustomDomain: ${isCustomDomain}, basePath: ${basePath}, hostname: ${req.hostname}`);
      
      // Priority 1: Already have tenant from middleware (custom domain or path-based)
      if (tenant) {
        console.log(`[MANIFEST] Using tenant from middleware: ${tenant.name}`);
      }
      // Priority 2: Query parameter (most reliable for iOS Add to Home Screen on path-based tenants)
      else if (req.query.tenant && typeof req.query.tenant === 'string') {
        tenantSubdomain = req.query.tenant;
        basePath = `/${tenantSubdomain}`;
        console.log(`[MANIFEST] Using query param for tenant: ${tenantSubdomain}`);
      }
      // Priority 3: Cookie hint fallback (for path-based tenants)
      else if (req.cookies?._tenant_hint) {
        tenantSubdomain = req.cookies._tenant_hint;
        basePath = `/${tenantSubdomain}`;
        console.log(`[MANIFEST] Using cookie hint for tenant: ${tenantSubdomain}`);
      }
      
      // Look up tenant from database if we have a subdomain but no tenant context
      if (!tenant && tenantSubdomain) {
        const [tenantFromLookup] = await db
          .select({
            id: tenants.id,
            subdomain: tenants.subdomain,
            name: tenants.name,
            tagline: tenants.tagline,
            logoUrl: tenants.logoUrl,
            branding: tenants.branding,
            isActive: tenants.isActive,
            customDomain: tenants.customDomain,
            customDomainVerified: tenants.customDomainVerified,
          })
          .from(tenants)
          .where(eq(tenants.subdomain, tenantSubdomain))
          .limit(1);
        
        if (tenantFromLookup && tenantFromLookup.isActive) {
          tenant = tenantFromLookup as any;
          // For query param lookups (path-based tenants), basePath should be /{subdomain}
          // Don't override if already set from query param
          console.log(`[MANIFEST] Found tenant from DB: ${tenant.name}, basePath: ${basePath}`);
        }
      }

      // If this is a tenant request, customize the manifest
      if (tenant) {
        console.log(`[MANIFEST] Customizing manifest for tenant: ${tenant.name}, logo: ${tenant.logoUrl ? 'yes' : 'no'}`);
        
        manifest.name = `${tenant.name} - Animal Rescue Portal`;
        manifest.short_name = tenant.name.substring(0, 12); // PWA short names should be ≤12 chars
        manifest.description = tenant.tagline || `${tenant.name} - Animal rescue management and adoption portal`;
        manifest.start_url = basePath;
        manifest.scope = basePath;
        
        // Use tenant's primary color if available
        if (tenant.branding?.primaryColor) {
          manifest.theme_color = tenant.branding.primaryColor;
        }
        
        // Use tenant's logo as app icon if available
        if (tenant.logoUrl) {
          manifest.icons = [
            {
              src: tenant.logoUrl,
              sizes: "192x192",
              type: "image/png",
              purpose: "any maskable"
            },
            {
              src: tenant.logoUrl,
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable"
            }
          ];
        }
        
        // Update shortcuts to include base path
        manifest.shortcuts = manifest.shortcuts.map(shortcut => ({
          ...shortcut,
          url: `${basePath}${shortcut.url}`
        }));
      } else {
        console.log(`[MANIFEST] No tenant context - using platform defaults`);
      }

      res.setHeader('Content-Type', 'application/manifest+json');
      res.json(manifest);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /robots.txt
   * Serve robots.txt for SEO - tells search engines what to crawl
   */
  app.get('/robots.txt', (req, res) => {
    const robotsTxt = `# robots.txt for iRescue.life
# https://irescue.life

User-agent: *

# Allow public pages
Allow: /
Allow: /platform
Allow: /platform/privacy
Allow: /platform/terms
Allow: /platform/security
Allow: /platform/blog
Allow: /platform/integrations

# Allow tenant public pages (path-based routing)
Allow: /*/animals
Allow: /*/events
Allow: /*/happy-tails
Allow: /*/donate
Allow: /*/foster
Allow: /*/volunteer
Allow: /*/surrender
Allow: /*/wishlist
Allow: /*/contact
Allow: /*/shop

# Block internal/admin routes
Disallow: /*/dashboard
Disallow: /*/admin
Disallow: /*/settings
Disallow: /*/team
Disallow: /*/communications
Disallow: /*/documents
Disallow: /*/analytics
Disallow: /*/finance
Disallow: /*/grants
Disallow: /*/applications
Disallow: /*/medical
Disallow: /*/kennels

# Block API endpoints
Disallow: /api/

# Block authentication pages
Disallow: /*/login
Disallow: /*/forgot-password
Disallow: /*/reset-password
Disallow: /*/accept-invitation
Disallow: /platform/signup
Disallow: /platform/login
Disallow: /platform/admin

# Block utility routes (but allow /objects/ for social media image sharing)
Disallow: /manifest.json

# Sitemap location
Sitemap: https://irescue.life/sitemap.xml

# Crawl-delay for politeness
Crawl-delay: 1
`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(robotsTxt);
  });

  /**
   * GET /sitemap.xml
   * Dynamic sitemap generation for SEO
   * Includes platform pages and all active tenant public pages
   */
  app.get('/sitemap.xml', async (req, res, next) => {
    try {
      const baseUrl = 'https://irescue.life';
      const today = new Date().toISOString().split('T')[0];

      // Platform static pages
      const platformPages = [
        { loc: '/', priority: '1.0', changefreq: 'weekly' },
        { loc: '/platform', priority: '1.0', changefreq: 'weekly' },
        { loc: '/platform/privacy', priority: '0.3', changefreq: 'monthly' },
        { loc: '/platform/terms', priority: '0.3', changefreq: 'monthly' },
        { loc: '/platform/security', priority: '0.4', changefreq: 'monthly' },
        { loc: '/platform/blog', priority: '0.7', changefreq: 'weekly' },
        { loc: '/platform/integrations', priority: '0.6', changefreq: 'monthly' },
      ];

      // Get all active tenants for tenant-specific pages
      const activeTenants = await db
        .select({
          subdomain: tenants.subdomain,
          isActive: tenants.isActive,
        })
        .from(tenants)
        .where(eq(tenants.isActive, true));

      // Tenant public pages (for each active tenant)
      const tenantPublicPaths = [
        { path: '', priority: '0.8', changefreq: 'daily' }, // Home
        { path: '/animals', priority: '0.9', changefreq: 'daily' },
        { path: '/events', priority: '0.6', changefreq: 'weekly' },
        { path: '/happy-tails', priority: '0.5', changefreq: 'weekly' },
        { path: '/donate', priority: '0.7', changefreq: 'monthly' },
        { path: '/foster', priority: '0.6', changefreq: 'monthly' },
        { path: '/volunteer', priority: '0.6', changefreq: 'monthly' },
        { path: '/wishlist', priority: '0.5', changefreq: 'weekly' },
        { path: '/contact', priority: '0.4', changefreq: 'monthly' },
      ];

      // Build sitemap XML
      let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

      // Add platform pages
      for (const page of platformPages) {
        sitemap += `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
      }

      // Add tenant pages (path-based routing: /subdomain/page)
      for (const tenant of activeTenants) {
        for (const pagePath of tenantPublicPaths) {
          sitemap += `  <url>
    <loc>${baseUrl}/${tenant.subdomain}${pagePath.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${pagePath.changefreq}</changefreq>
    <priority>${pagePath.priority}</priority>
  </url>
`;
        }
      }

      sitemap += `</urlset>`;

      res.setHeader('Content-Type', 'application/xml');
      res.send(sitemap);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/webhooks/resend
   * Resend webhook endpoint for email events (bounces, complaints, deliveries)
   * This helps maintain email deliverability by tracking problematic email addresses
   * 
   * Resend webhook documentation: https://resend.com/docs/dashboard/webhooks/introduction
   * 
   * Security: Uses Svix signature verification to ensure webhooks are authentic
   * Set RESEND_WEBHOOK_SECRET in environment variables (get from Resend dashboard)
   */
  app.post('/api/webhooks/resend', async (req, res, next) => {
    try {
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      
      // Verify webhook signature if secret is configured
      if (webhookSecret) {
        const { Webhook } = await import('svix');
        
        const svixId = req.headers['svix-id'] as string;
        const svixTimestamp = req.headers['svix-timestamp'] as string;
        const svixSignature = req.headers['svix-signature'] as string;
        
        if (!svixId || !svixTimestamp || !svixSignature) {
          console.warn('[RESEND WEBHOOK] Missing Svix headers');
          return res.status(401).json({ error: 'Missing webhook signature headers' });
        }
        
        try {
          const wh = new Webhook(webhookSecret);
          const rawBody = (req as any).rawBody;
          
          if (!rawBody) {
            console.error('[RESEND WEBHOOK] Raw body not available for verification');
            return res.status(400).json({ error: 'Raw body required for verification' });
          }
          
          // Verify the webhook signature
          wh.verify(rawBody.toString(), {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature,
          });
          
          console.log('[RESEND WEBHOOK] Signature verified successfully');
        } catch (verifyError) {
          console.error('[RESEND WEBHOOK] Signature verification failed:', verifyError);
          return res.status(401).json({ error: 'Invalid webhook signature' });
        }
      } else {
        console.warn('[RESEND WEBHOOK] No webhook secret configured - skipping signature verification');
      }
      
      const payload = req.body;
      
      // Log incoming webhook for debugging
      console.log('[RESEND WEBHOOK] Received event:', payload?.type);
      
      if (!payload || !payload.type) {
        console.warn('[RESEND WEBHOOK] Invalid payload received');
        return res.status(400).json({ error: 'Invalid payload' });
      }

      const eventType = payload.type;
      const data = payload.data;
      
      // Extract email from the payload
      const recipientEmail = data?.to?.[0] || data?.email || null;
      
      if (!recipientEmail) {
        console.warn('[RESEND WEBHOOK] No email found in payload');
        return res.status(200).json({ received: true }); // Still acknowledge
      }

      // Handle different event types
      switch (eventType) {
        case 'email.bounced': {
          console.log(`[RESEND WEBHOOK] Bounce detected for: ${recipientEmail}`);
          
          // Log the event
          await db.insert(emailEvents).values({
            email: recipientEmail,
            eventType: 'bounce',
            resendEmailId: data?.email_id || null,
            bounceType: data?.bounce?.type || 'unknown',
            reason: data?.bounce?.message || data?.error?.message || null,
            rawPayload: payload,
          });

          // Mark user's email as bounced (across all tenants)
          await db
            .update(users)
            .set({
              emailBounced: true,
              emailBouncedAt: new Date(),
            })
            .where(eq(users.email, recipientEmail));
          
          console.log(`[RESEND WEBHOOK] Marked ${recipientEmail} as bounced`);
          break;
        }

        case 'email.complained': {
          console.log(`[RESEND WEBHOOK] Complaint detected for: ${recipientEmail}`);
          
          // Log the event
          await db.insert(emailEvents).values({
            email: recipientEmail,
            eventType: 'complaint',
            resendEmailId: data?.email_id || null,
            reason: 'User marked email as spam',
            rawPayload: payload,
          });

          // Mark user's email as complained (across all tenants)
          await db
            .update(users)
            .set({
              emailComplaint: true,
              emailComplaintAt: new Date(),
            })
            .where(eq(users.email, recipientEmail));
          
          console.log(`[RESEND WEBHOOK] Marked ${recipientEmail} as complained`);
          break;
        }

        case 'email.delivered': {
          // Log successful deliveries (optional, for tracking)
          await db.insert(emailEvents).values({
            email: recipientEmail,
            eventType: 'delivered',
            resendEmailId: data?.email_id || null,
            rawPayload: payload,
          });
          console.log(`[RESEND WEBHOOK] Email delivered to: ${recipientEmail}`);
          break;
        }

        case 'email.opened': {
          // Log opens for engagement tracking
          await db.insert(emailEvents).values({
            email: recipientEmail,
            eventType: 'opened',
            resendEmailId: data?.email_id || null,
            rawPayload: payload,
          });
          console.log(`[RESEND WEBHOOK] Email opened by: ${recipientEmail}`);
          break;
        }

        case 'email.clicked': {
          // Log clicks for engagement tracking
          await db.insert(emailEvents).values({
            email: recipientEmail,
            eventType: 'clicked',
            resendEmailId: data?.email_id || null,
            rawPayload: payload,
          });
          console.log(`[RESEND WEBHOOK] Email link clicked by: ${recipientEmail}`);
          break;
        }

        default:
          console.log(`[RESEND WEBHOOK] Unhandled event type: ${eventType}`);
      }

      // Always respond with 200 to acknowledge receipt
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('[RESEND WEBHOOK] Error processing webhook:', error);
      // Still return 200 to prevent Resend from retrying
      res.status(200).json({ received: true, error: 'Processing error logged' });
    }
  });

  /**
   * POST /api/signup
   * Create new tenant with admin user
   */
  app.post('/api/signup', signupLimiter, async (req, res, next) => {
    try {
      const signupSchema = z.object({
        rescueName: z.string().min(1),
        subdomain: z.string().min(1).regex(/^[a-z0-9]+$/),
        adminName: z.string().min(1),
        adminEmail: z.string().email(),
        adminPassword: z.string().min(8),
      });

      const data = signupSchema.parse(req.body);
      const result = await createTenantWithAdmin(data);

      res.json({
        success: true,
        tenant: result.tenant,
        message: `Successfully created ${result.tenant.name}! You can now access your portal at ${result.tenant.subdomain}.rescueportal.com`,
      });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * POST /api/auth/platform/signup
   * Create new tenant for platform signup flow
   * New tenants start on Free tier with 'active' status immediately (no payment required)
   * They can optionally start a 14-day Pro trial later
   */
  app.post('/api/auth/platform/signup', signupLimiter, async (req, res, next) => {
    try {
      const signupSchema = z.object({
        rescueName: z.string().min(1, "Rescue name is required"),
        subdomain: z.string().min(1, "Identifier is required").regex(/^[a-z0-9]+$/, "Identifier must contain only lowercase letters and numbers"),
        adminEmail: z.string().email("Valid email is required"),
        adminPassword: z.string().min(8, "Password must be at least 8 characters"),
        startProTrial: z.boolean().optional().default(false), // Option to start Pro trial immediately
      });

      const data = signupSchema.parse(req.body);

      // Check if identifier already exists (excluding pending signups that were abandoned)
      const [existingTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.subdomain, data.subdomain))
        .limit(1);

      // Only block if there's an existing tenant with active/trial/cancelled/suspended status
      // Allow reusing identifier if previous signup was abandoned (pending status)
      if (existingTenant && existingTenant.subscriptionStatus !== 'pending') {
        return res.status(400).json({ 
          error: 'Identifier taken', 
          message: 'This identifier is already in use. Please choose another.' 
        });
      }

      // If there's a pending tenant with this identifier, delete it to allow fresh signup
      if (existingTenant && existingTenant.subscriptionStatus === 'pending') {
        await db.delete(tenants).where(eq(tenants.id, existingTenant.id));
      }

      // Create tenant (base creation uses schema defaults: Free tier, active status)
      console.log(`[PLATFORM SIGNUP] Creating tenant for ${data.subdomain}`);
      const result = await createTenantWithAdmin({
        rescueName: data.rescueName,
        subdomain: data.subdomain,
        adminName: data.adminEmail.split('@')[0], // Use email prefix as temp name
        adminEmail: data.adminEmail,
        adminPassword: data.adminPassword,
      });
      console.log(`[PLATFORM SIGNUP] Tenant created: ${result.tenant.id}, User: ${result.user.id}`);

      // Determine subscription status based on whether they want a Pro trial
      const subscriptionTier = data.startProTrial ? 'professional' : 'free';
      const subscriptionStatus = data.startProTrial ? 'trial' : 'active';
      const trialEndsAt = data.startProTrial ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null;
      const proTrialUsed = data.startProTrial;
      const emailQuotaLimit = data.startProTrial ? 10000 : 500;

      // Update tenant with subscription settings
      await db
        .update(tenants)
        .set({
          subscriptionTier: subscriptionTier as any,
          subscriptionStatus: subscriptionStatus as any,
          trialEndsAt,
          proTrialUsed,
          emailQuotaLimit,
        })
        .where(eq(tenants.id, result.tenant.id));
      console.log(`[PLATFORM SIGNUP] Tenant ${result.tenant.id} activated on ${subscriptionTier} tier${data.startProTrial ? ' with 14-day Pro trial' : ''}`);

      // VERIFICATION: Double-check that both tenant and user exist AND user has admin role
      const [finalTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, result.tenant.id))
        .limit(1);

      const [finalUser] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.id, result.user.id),
          eq(users.tenantId, result.tenant.id)
        ))
        .limit(1);

      if (!finalTenant || !finalUser) {
        console.error(`[PLATFORM SIGNUP] CRITICAL: Verification failed after signup - Tenant: ${!!finalTenant}, User: ${!!finalUser}`);
        throw new Error('Signup verification failed - please try again');
      }

      // CRITICAL: Verify user has admin role
      if (!finalUser.roles || !finalUser.roles.includes('admin')) {
        console.error(`[PLATFORM SIGNUP] CRITICAL: User ${finalUser.id} exists but lacks admin role. Roles: ${JSON.stringify(finalUser.roles)}`);
        throw new Error('Admin role verification failed - please try again');
      }

      console.log(`[PLATFORM SIGNUP] SUCCESS: Tenant ${data.subdomain} created with admin user ${data.adminEmail}`);

      // Send welcome emails now that account is immediately active
      try {
        const { EmailService } = await import('./lib/email-service');
        
        // Send notification to platform admin
        await EmailService.sendNewTenantNotification({
          rescueName: finalTenant.name,
          subdomain: finalTenant.subdomain,
          adminEmail: data.adminEmail,
          tier: subscriptionTier as any,
        });
        console.log('[PLATFORM SIGNUP] Admin notification sent successfully');

        // Send welcome email to tenant admin
        await EmailService.sendTenantWelcomeEmail({
          rescueName: finalTenant.name,
          adminEmail: data.adminEmail,
          subdomain: finalTenant.subdomain,
          tier: subscriptionTier as any,
        });
        console.log('[PLATFORM SIGNUP] Tenant welcome email sent successfully');
      } catch (emailError) {
        // Don't fail signup if email sending fails
        console.error('[PLATFORM SIGNUP] Failed to send welcome emails (non-blocking):', emailError);
      }

      const tierMessage = data.startProTrial 
        ? 'Your 14-day Pro trial has started! Enjoy all Pro features.'
        : 'Your Free account is now active! You can upgrade to Pro anytime.';

      res.json({
        success: true,
        tenantId: result.tenant.id,
        subdomain: result.tenant.subdomain,
        tier: subscriptionTier,
        trialEndsAt: trialEndsAt?.toISOString() || null,
        message: `Account created successfully. ${tierMessage}`,
      });
    } catch (error: any) {
      console.error('[PLATFORM SIGNUP] ERROR:', error);
      if (error.message?.includes('subdomain') || error.message?.includes('identifier')) {
        return res.status(400).json({ 
          error: 'Identifier error', 
          message: error.message 
        });
      }
      if (error.message?.includes('verification')) {
        return res.status(500).json({
          error: 'Signup failed',
          message: 'Account creation failed verification. Please try again.',
        });
      }
      next(error);
    }
  });

  /**
   * GET /api/auth/platform/check-subdomain/:subdomain
   * Check if a subdomain is available
   */
  app.get('/api/auth/platform/check-subdomain/:subdomain', async (req, res, next) => {
    try {
      const subdomain = req.params.subdomain.toLowerCase();
      
      // Validate identifier format
      if (!/^[a-z0-9]+$/.test(subdomain)) {
        return res.json({ 
          available: false, 
          message: 'Identifier must contain only lowercase letters and numbers' 
        });
      }

      const [existing] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.subdomain, subdomain))
        .limit(1);

      // Identifier is available if it doesn't exist OR if it's only in pending status (abandoned signup)
      const isAvailable = !existing || existing.subscriptionStatus === 'pending';

      res.json({ 
        available: isAvailable,
        message: isAvailable ? 'This identifier is available' : 'This identifier is already taken'
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/platform/start-pro-trial
   * Start a 14-day Pro trial for an existing Free tier tenant
   * Each tenant can only use the Pro trial once
   */
  app.post('/api/platform/start-pro-trial', requireAuth, async (req, res, next) => {
    try {
      if (!req.tenant) {
        return res.status(400).json({ 
          error: 'Tenant required', 
          message: 'No organization found for this request.' 
        });
      }

      // Check if already on Pro tier
      if (req.tenant.subscriptionTier === 'professional' && req.tenant.subscriptionStatus === 'active') {
        return res.status(400).json({
          error: 'Already Professional',
          message: 'Your organization is already on the Professional plan.'
        });
      }

      // Check if already on Pro trial
      if (req.tenant.subscriptionStatus === 'trial') {
        return res.status(400).json({
          error: 'Trial active',
          message: 'You already have an active Pro trial.',
          trialEndsAt: req.tenant.trialEndsAt?.toISOString()
        });
      }

      // Check if Pro trial was already used
      if (req.tenant.proTrialUsed) {
        return res.status(400).json({
          error: 'Trial already used',
          message: 'Your organization has already used the free 14-day Pro trial. Please upgrade to continue with Pro features.'
        });
      }

      // Start the 14-day Pro trial
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const [updatedTenant] = await db
        .update(tenants)
        .set({
          subscriptionTier: 'professional',
          subscriptionStatus: 'trial',
          trialEndsAt,
          proTrialUsed: true,
          emailQuotaLimit: 10000, // Pro tier email quota
        })
        .where(eq(tenants.id, req.tenant.id))
        .returning();

      if (!updatedTenant) {
        return res.status(500).json({
          error: 'Update failed',
          message: 'Failed to start Pro trial. Please try again.'
        });
      }

      console.log(`[PRO TRIAL] Started 14-day Pro trial for tenant ${req.tenant.subdomain}, ends at ${trialEndsAt.toISOString()}`);

      res.json({
        success: true,
        message: 'Your 14-day Pro trial has started! Enjoy 0% platform fees and 10,000 emails/month.',
        tier: 'professional',
        status: 'trial',
        trialEndsAt: trialEndsAt.toISOString(),
      });
    } catch (error) {
      console.error('[PRO TRIAL] Error starting trial:', error);
      next(error);
    }
  });

  /**
   * POST /api/platform/contact
   * Handle contact form submissions from the platform landing page
   * Sends email to platform owner
   */
  app.post('/api/platform/contact', async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        message: z.string().min(10).max(1000),
      });

      const { name, email, message } = schema.parse(req.body);

      const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;
      if (!platformApiKey) {
        console.error('PLATFORM_RESEND_API_KEY not configured');
        return res.status(500).json({
          error: 'Email service not configured',
          message: 'Unable to send message at this time. Please try again later.',
        });
      }

      // Send email to platform owner
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platformApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'iRescue.life <noreply@irescue.life>',
          to: 'rstelly3@gmail.com',
          reply_to: email,
          subject: `[iRescue.life Contact] Message from ${name}`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: #5B7B6B; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                  .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
                  .field { margin-bottom: 16px; }
                  .label { font-weight: bold; color: #5B7B6B; }
                  .message-box { background: white; padding: 16px; border-radius: 4px; border: 1px solid #e5e7eb; margin-top: 8px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h2 style="margin: 0;">New Contact Form Submission</h2>
                  </div>
                  <div class="content">
                    <div class="field">
                      <span class="label">Name:</span>
                      <p style="margin: 4px 0 0 0;">${name}</p>
                    </div>
                    <div class="field">
                      <span class="label">Email:</span>
                      <p style="margin: 4px 0 0 0;"><a href="mailto:${email}">${email}</a></p>
                    </div>
                    <div class="field">
                      <span class="label">Message:</span>
                      <div class="message-box">${message.replace(/\n/g, '<br>')}</div>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `,
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        console.error('Resend API error:', errorData);
        return res.status(500).json({
          error: 'Failed to send email',
          message: 'Unable to send your message. Please try again later.',
        });
      }

      res.json({
        success: true,
        message: 'Your message has been sent successfully.',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Please check your input and try again.',
        });
      }
      next(error);
    }
  });

  /**
   * POST /api/platform/finalize-subscription
   * Finalize tenant subscription after successful Stripe payment
   * Verifies payment with Stripe and activates tenant
   */
  app.post('/api/platform/finalize-subscription', async (req, res, next) => {
    try {
      const schema = z.object({
        tenantId: z.string().uuid(),
        subscriptionId: z.string(),
      });

      const { tenantId, subscriptionId } = schema.parse(req.body);

      // Fetch tenant
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ 
          error: 'Tenant not found',
          message: 'Could not find your account. Please contact support.'
        });
      }

      // If already finalized (not pending), return success idempotently
      if (tenant.subscriptionStatus !== 'pending') {
        return res.json({ 
          success: true,
          message: 'Subscription already activated',
          subdomain: tenant.subdomain
        });
      }

      // Verify subscription with Stripe using platform credentials
      const Stripe = (await import('stripe')).default;
      const platformStripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });

      let subscription: any;
      try {
        subscription = await platformStripe.subscriptions.retrieve(subscriptionId);
      } catch (error: any) {
        console.error('Stripe subscription retrieval error:', error);
        return res.status(400).json({
          error: 'Invalid subscription',
          message: 'Could not verify your subscription with Stripe. Please contact support.'
        });
      }

      // Verify subscription is active or trialing
      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        return res.status(400).json({
          error: 'Subscription not active',
          message: `Subscription status is ${subscription.status}. Please contact support.`
        });
      }

      // Calculate trial end date (30 days from now for trial, or subscription's trial end)
      const trialEndsAt = subscription.status === 'trialing' && subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      // Determine final status based on Stripe subscription
      const finalStatus = subscription.status === 'trialing' ? 'trial' : 'active';

      // Get tier from subscription metadata or default to free
      const tier = subscription.metadata?.tier || tenant.subscriptionTier || 'free';
      
      // Calculate email quota based on tier
      const getEmailQuotaForTierLocal = (tier: string) => {
        switch(tier) {
          case 'free': return 500;
          case 'professional': return 10000;
          default: return 500;
        }
      };

      // Update tenant status atomically
      const [updatedTenant] = await db
        .update(tenants)
        .set({
          subscriptionStatus: finalStatus,
          subscriptionTier: tier as any,
          trialEndsAt,
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: subscription.customer as string,
          stripePriceId: subscription.items.data[0]?.price.id || null,
          emailQuotaLimit: getEmailQuotaForTierLocal(tier),
        })
        .where(eq(tenants.id, tenantId))
        .returning();

      if (!updatedTenant) {
        return res.status(500).json({
          error: 'Update failed',
          message: 'Failed to activate subscription. Please contact support.'
        });
      }

      // Fetch admin user to get their email for welcome email
      const [adminUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(and(
          eq(users.tenantId, tenantId),
          sql`'admin' = ANY(${users.roles})`
        ))
        .limit(1);

      // Send welcome emails after successful subscription activation
      if (adminUser) {
        console.log(`[EMAIL DEBUG] Starting email send for tenant: ${updatedTenant.subdomain}, admin: ${adminUser.email}`);
        console.log(`[EMAIL DEBUG] PLATFORM_RESEND_API_KEY exists: ${!!process.env.PLATFORM_RESEND_API_KEY}`);
        console.log(`[EMAIL DEBUG] PLATFORM_ADMIN_EMAIL: ${process.env.PLATFORM_ADMIN_EMAIL}`);
        
        try {
          const { EmailService } = await import('./lib/email-service');
          
          // Send notification to platform admin
          console.log('[EMAIL DEBUG] Sending admin notification...');
          await EmailService.sendNewTenantNotification({
            rescueName: updatedTenant.name,
            subdomain: updatedTenant.subdomain,
            adminEmail: adminUser.email,
            tier: tier as any,
          });
          console.log('[EMAIL DEBUG] Admin notification sent successfully');

          // Send welcome email to tenant admin with setup instructions
          console.log('[EMAIL DEBUG] Sending tenant welcome email...');
          await EmailService.sendTenantWelcomeEmail({
            rescueName: updatedTenant.name,
            adminEmail: adminUser.email,
            subdomain: updatedTenant.subdomain,
            tier: tier as any,
          });
          console.log('[EMAIL DEBUG] Tenant welcome email sent successfully');
        } catch (emailError) {
          // Don't fail the finalization if email sending fails
          console.error('❌ [EMAIL ERROR] Failed to send welcome emails (non-blocking):', emailError);
          console.error('❌ [EMAIL ERROR] Error details:', JSON.stringify(emailError, null, 2));
        }
      } else {
        console.error('❌ [EMAIL ERROR] No admin user found for tenant:', tenantId);
      }

      res.json({
        success: true,
        message: 'Subscription activated successfully',
        subdomain: updatedTenant.subdomain,
        status: updatedTenant.subscriptionStatus,
        trialEndsAt: updatedTenant.trialEndsAt,
      });
    } catch (error: any) {
      console.error('Finalize subscription error:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Missing required fields'
        });
      }
      next(error);
    }
  });

  /**
   * POST /api/platform/forgot-password
   * Request password reset for platform admin users
   * Uses platform Resend API key instead of tenant-specific configuration
   */
  app.post('/api/platform/forgot-password', passwordResetLimiter, async (req, res, next) => {
    try {
      const { passwordResetTokens, users } = await import('@shared/schema');
      const crypto = await import('crypto');
      
      const requestSchema = z.object({
        email: z.string().email(),
      });

      const { email } = requestSchema.parse(req.body);
      console.log(`[PLATFORM RESET] Password reset requested for: ${email}`);
      
      // Find platform tenant
      const [platformTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.subdomain, 'platform'))
        .limit(1);

      if (!platformTenant) {
        console.error('[PLATFORM RESET] Platform tenant not found');
        return res.json({ success: true, message: 'If an account exists with that email, a password reset link has been sent.' });
      }

      // Find user by email in platform tenant
      const [user] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.email, email),
          eq(users.tenantId, platformTenant.id)
        ))
        .limit(1);

      // Always return success to prevent email enumeration
      if (!user) {
        console.log(`[PLATFORM RESET] No user found for email: ${email}`);
        return res.json({ success: true, message: 'If an account exists with that email, a password reset link has been sent.' });
      }

      console.log(`[PLATFORM RESET] Found platform admin user: ${user.email}`);

      // Generate secure random token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Delete any existing tokens for this user
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));

      // Create new reset token
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tenantId: platformTenant.id,
        token,
        expiresAt,
      });

      console.log(`[PLATFORM RESET] Created reset token for user: ${user.email}`);

      // Send reset email using platform Resend API key
      const platformApiKey = process.env.PLATFORM_RESEND_API_KEY;
      if (platformApiKey) {
        try {
          // Construct reset URL for platform admin - always use production domain
          // In production, use irescue.life. In development, use the dev domain.
          const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
          const baseUrl = isProduction 
            ? 'https://irescue.life'
            : process.env.REPLIT_DEV_DOMAIN 
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : 'http://localhost:5000';
          const resetUrl = `${baseUrl}/platform/reset-password?token=${token}`;
          
          console.log(`[PLATFORM RESET] Sending email to: ${user.email}, resetUrl: ${resetUrl}`);
          
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${platformApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'iRescue.life Platform <support@irescue.life>',
              to: user.email,
              subject: 'Platform Admin Password Reset',
              html: `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
                      .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                      .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; }
                      .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1 style="margin: 0;">Password Reset Request</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Platform Admin Account</p>
                      </div>
                      <div class="content">
                        <p>Hi ${user.fullName},</p>
                        <p>You requested to reset your password for your iRescue.life Platform Admin account.</p>
                        <p style="text-align: center; margin: 30px 0;">
                          <a href="${resetUrl}" class="button">Reset Password</a>
                        </p>
                        <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>
                        <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
                      </div>
                      <div class="footer">
                        <p>iRescue.life Platform</p>
                      </div>
                    </div>
                  </body>
                </html>
              `,
            }),
          });

          const result = await response.json();
          if (result.error) {
            console.error('[PLATFORM RESET] Failed to send email:', result.error);
          } else {
            console.log(`[PLATFORM RESET] Email sent successfully! ID: ${result.id}`);
          }
        } catch (emailError) {
          console.error('[PLATFORM RESET] Failed to send password reset email:', emailError);
        }
      } else {
        console.error('[PLATFORM RESET] No PLATFORM_RESEND_API_KEY configured');
      }

      res.json({ success: true, message: 'If an account exists with that email, a password reset link has been sent.' });
    } catch (error) {
      console.error('[PLATFORM RESET] Error:', error);
      next(error);
    }
  });

  /**
   * POST /api/platform/reset-password
   * Reset password for platform admin using token
   */
  app.post('/api/platform/reset-password', passwordResetLimiter, async (req, res, next) => {
    try {
      const { passwordResetTokens, users } = await import('@shared/schema');
      const bcrypt = await import('bcrypt');
      
      const resetSchema = z.object({
        token: z.string(),
        newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      });

      const { token, newPassword } = resetSchema.parse(req.body);
      console.log('[PLATFORM RESET] Processing password reset with token:', token.substring(0, 10) + '...');
      
      // Find platform tenant
      const [platformTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.subdomain, 'platform'))
        .limit(1);

      if (!platformTenant) {
        console.log('[PLATFORM RESET] Platform tenant not found!');
        return res.status(400).json({ error: 'Platform configuration error' });
      }
      
      console.log('[PLATFORM RESET] Platform tenant ID:', platformTenant.id);

      // Find and validate token
      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.token, token),
          eq(passwordResetTokens.tenantId, platformTenant.id)
        ))
        .limit(1);

      console.log('[PLATFORM RESET] Reset token lookup result:', resetToken ? 'FOUND' : 'NOT FOUND');
      
      if (!resetToken) {
        // Debug: check if token exists without tenant filter
        const [anyToken] = await db
          .select()
          .from(passwordResetTokens)
          .where(eq(passwordResetTokens.token, token))
          .limit(1);
        console.log('[PLATFORM RESET] Token exists (any tenant):', anyToken ? `YES - tenantId: ${anyToken.tenantId}` : 'NO');
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, resetToken.id));
        return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update user's password
      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, resetToken.userId));

      // Delete used token
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, resetToken.id));

      console.log('[PLATFORM RESET] Password reset successful');
      res.json({ success: true, message: 'Password has been reset successfully. You can now log in with your new password.' });
    } catch (error) {
      console.error('[PLATFORM RESET] Error:', error);
      next(error);
    }
  });

  /**
   * POST /api/demo-requests
   * Submit demo request (lead generation) - handles both contact_sales and demo_access types
   */
  app.post('/api/demo-requests', signupLimiter, async (req, res, next) => {
    try {
      // Base schema with conditional validation based on leadType
      const baseSchema = z.object({
        leadType: z.enum(['contact_sales', 'demo_access']).default('contact_sales'),
        email: z.string().email("Valid email is required"),
        fullName: z.string().optional(),
        organizationName: z.string().optional(),
        phone: z.string().optional(),
        message: z.string().optional(),
        landingPageUrl: z.string().optional(),
        referrer: z.string().optional(),
      });

      const parsed = baseSchema.parse(req.body);

      // Conditional validation based on leadType
      if (parsed.leadType === 'contact_sales') {
        if (!parsed.fullName || parsed.fullName.length === 0) {
          return res.status(400).json({ error: 'Name is required for contact requests' });
        }
        if (!parsed.organizationName || parsed.organizationName.length === 0) {
          return res.status(400).json({ error: 'Organization name is required for contact requests' });
        }
      }

      // Insert demo request into database
      const [demoRequest] = await db
        .insert(demoRequests)
        .values({
          leadType: parsed.leadType,
          fullName: parsed.fullName,
          email: parsed.email,
          organizationName: parsed.organizationName,
          phone: parsed.phone,
          message: parsed.message,
          landingPageUrl: parsed.landingPageUrl,
          referrer: parsed.referrer,
          status: 'pending',
        })
        .returning();

      // Send email notification to platform admin
      const platformEmail = process.env.PLATFORM_RESEND_API_KEY;
      const adminNotificationEmail = process.env.PLATFORM_ADMIN_EMAIL || 'admin@irescue.life';

      if (platformEmail) {
        try {
          const isDemoAccess = parsed.leadType === 'demo_access';
          const subject = isDemoAccess 
            ? `New Demo Access Request - ${parsed.email}` 
            : `New Demo Request from ${parsed.organizationName}`;

          const htmlContent = isDemoAccess ? `
            <h2>New Demo Access Request</h2>
            <p>Someone has requested access to the live demo:</p>
            <ul>
              <li><strong>Email:</strong> <a href="mailto:${escapeHtml(parsed.email)}">${escapeHtml(parsed.email)}</a></li>
              ${parsed.fullName ? `<li><strong>Name:</strong> ${escapeHtml(parsed.fullName)}</li>` : ''}
              ${parsed.landingPageUrl ? `<li><strong>Source Page:</strong> ${escapeHtml(parsed.landingPageUrl)}</li>` : ''}
              ${parsed.referrer ? `<li><strong>Referrer:</strong> ${escapeHtml(parsed.referrer)}</li>` : ''}
            </ul>
            <p><strong>Lead Type:</strong> Demo Access (Self-Service)</p>
            <p><strong>Request ID:</strong> ${demoRequest.id}</p>
            <p><em>Submitted: ${new Date().toLocaleString()}</em></p>
          ` : `
            <h2>New Demo Request Received</h2>
            <p>A new organization has requested a demo:</p>
            <ul>
              <li><strong>Organization:</strong> ${escapeHtml(parsed.organizationName)}</li>
              <li><strong>Contact Name:</strong> ${escapeHtml(parsed.fullName)}</li>
              <li><strong>Email:</strong> <a href="mailto:${escapeHtml(parsed.email)}">${escapeHtml(parsed.email)}</a></li>
              ${parsed.phone ? `<li><strong>Phone:</strong> ${escapeHtml(parsed.phone)}</li>` : ''}
              ${parsed.message ? `<li><strong>Message:</strong><br>${escapeHtml(parsed.message)}</li>` : ''}
            </ul>
            <p><strong>Lead Type:</strong> Contact Sales</p>
            <p><strong>Request ID:</strong> ${demoRequest.id}</p>
            <p><em>Submitted: ${new Date().toLocaleString()}</em></p>
          `;

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${platformEmail}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'iRescue Platform <noreply@irescue.life>',
              to: [adminNotificationEmail],
              subject,
              html: htmlContent,
            }),
          });
        } catch (emailError) {
          console.error('Failed to send demo request notification:', emailError);
          // Don't fail the request if email fails
        }
      }

      const responseMessage = parsed.leadType === 'demo_access'
        ? 'Thank you! Opening demo site...'
        : 'Thank you for your interest! We will contact you shortly with demo access.';

      res.json({
        success: true,
        message: responseMessage,
        leadType: parsed.leadType,
      });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * POST /api/login
   * Login user within tenant or platform admin
   */
  app.post('/api/login', authLimiter, async (req, res, next) => {
    try {
      const loginSchema = z.object({
        email: z.string().email(),
        password: z.string(),
        selectedRole: z.string().optional(), // Optional role selection
      });

      const credentials = loginSchema.parse(req.body);
      console.log(`[LOGIN] Attempt for email: ${credentials.email}`);
      
      // Determine tenant ID - either from platform admin context or tenant context
      let tenantId: string;
      if (req.isPlatformAdmin) {
        // Platform admin login - lookup platform tenant
        const [platformTenant] = await db
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.subdomain, 'platform'))
          .limit(1);
        
        if (!platformTenant) {
          return res.status(500).json({ error: 'Platform tenant not configured' });
        }
        tenantId = platformTenant.id;
        console.log(`[LOGIN] Platform admin login, tenant ID: ${tenantId}`);
      } else if (req.tenant) {
        // Regular tenant login
        tenantId = req.tenant.id;
        console.log(`[LOGIN] Tenant login: ${req.tenant.subdomain} (ID: ${tenantId})`);
      } else {
        // No tenant context
        console.log(`[LOGIN] ERROR: No tenant context`);
        return res.status(400).json({ error: 'No tenant context. Please access via subdomain.' });
      }

      console.log(`[LOGIN] Looking up user with email ${credentials.email} in tenant ${tenantId}`);
      const user = await loginUser(tenantId, credentials);
      console.log(`[LOGIN] SUCCESS: User ${user.email} logged in`);

      // Check if MFA is enabled
      if (user.mfaEnabled) {
        // Don't create session yet - require MFA verification first
        return res.json({
          success: true,
          requiresMfa: true,
          userId: user.id, // Needed for MFA verification
        });
      }

      // No MFA - proceed with normal login
      // Set session
      req.session.userId = user.id;
      req.session.tenantId = user.tenantId;
      
      // Set active role: use selected role if provided and valid, otherwise default to first role
      const activeRole = credentials.selectedRole && user.roles.includes(credentials.selectedRole)
        ? credentials.selectedRole
        : user.roles[0];
      req.session.activeRole = activeRole;

      // Save session before sending response to ensure cookie is set
      req.session.save(async (err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Failed to save session' });
        }

        // Log login activity
        try {
          const { logActivity } = await import('./lib/activity-logger');
          await logActivity({
            tenantId: user.tenantId,
            userId: user.id,
            entityType: 'User',
            entityId: user.id,
            action: 'login',
            description: `logged in as ${activeRole}`,
            category: 'user',
            metadata: { role: activeRole }
          });
        } catch (logError) {
          console.error('Failed to log login activity:', logError);
        }

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            roles: user.roles,
            activeRole: activeRole,
          },
        });
      });
    } catch (error: any) {
      res.status(401).json({ 
        error: error.message || 'Login failed' 
      });
    }
  });

  /**
   * POST /api/logout
   * Logout current user
   */
  app.post('/api/logout', requireAuth, (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });

  // ============================================================================
  // MFA/2FA Routes
  // ============================================================================

  /**
   * POST /api/auth/mfa/setup
   * Generate MFA secret and QR code for setup
   */
  app.post('/api/auth/mfa/setup', requireAuth, async (req, res, next) => {
    try {
      const { generateMfaSecret, generateQRCode, generateBackupCodes } = await import('./mfa');
      
      // Generate new secret
      const secret = generateMfaSecret();
      
      // Generate QR code
      const qrCodeDataUrl = await generateQRCode(req.user!.email, secret);
      
      // Generate backup codes
      const backupCodes = generateBackupCodes(10);
      
      // Store secret temporarily in session (not in DB until verified)
      req.session.mfaSetupSecret = secret;
      req.session.mfaSetupBackupCodes = backupCodes;
      
      res.json({
        success: true,
        qrCode: qrCodeDataUrl,
        secret: secret, // For manual entry
        backupCodes: backupCodes,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/auth/mfa/verify-setup
   * Verify MFA code and enable MFA for user
   */
  app.post('/api/auth/mfa/verify-setup', requireAuth, async (req, res, next) => {
    try {
      const { verifyTotpToken, encryptMfaSecret, hashBackupCodes } = await import('./mfa');
      
      const verifySchema = z.object({
        code: z.string().length(6),
      });
      
      const { code } = verifySchema.parse(req.body);
      
      // Get setup data from session
      const secret = req.session.mfaSetupSecret;
      const backupCodes = req.session.mfaSetupBackupCodes;
      
      if (!secret || !backupCodes) {
        return res.status(400).json({ error: 'No MFA setup in progress. Please start setup again.' });
      }
      
      // Verify the code
      const isValid = verifyTotpToken(code, secret);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid verification code. Please try again.' });
      }
      
      // Encrypt secret and hash backup codes
      const encryptedSecret = encryptMfaSecret(secret);
      const hashedBackupCodes = await hashBackupCodes(backupCodes);
      
      // Save to database
      await db
        .update(users)
        .set({
          mfaEnabled: true,
          mfaSecret: encryptedSecret,
          mfaBackupCodes: hashedBackupCodes,
        })
        .where(eq(users.id, req.user!.id));
      
      // Clear session data
      delete req.session.mfaSetupSecret;
      delete req.session.mfaSetupBackupCodes;
      
      res.json({
        success: true,
        message: 'MFA enabled successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/auth/mfa/verify
   * Verify MFA code during login
   */
  app.post('/api/auth/mfa/verify', async (req, res, next) => {
    try {
      const { verifyTotpToken, decryptMfaSecret, verifyBackupCode } = await import('./mfa');
      
      const verifySchema = z.object({
        code: z.string().min(6),
        userId: z.string().uuid(),
      });
      
      const { code, userId } = verifySchema.parse(req.body);
      
      // Get user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        return res.status(400).json({ error: 'MFA not enabled for this user' });
      }
      
      // Try TOTP first
      const secret = decryptMfaSecret(user.mfaSecret);
      const isTotpValid = verifyTotpToken(code, secret);
      
      if (isTotpValid) {
        // Valid TOTP code - create session
        req.session.userId = user.id;
        req.session.tenantId = user.tenantId;
        req.session.activeRole = user.roles[0];
        
        // Save session before sending response
        return req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            return res.status(500).json({ error: 'Failed to save session' });
          }

          return res.json({
            success: true,
            user: {
              id: user.id,
              email: user.email,
              fullName: user.fullName,
              roles: user.roles,
              activeRole: user.roles[0],
            },
          });
        });
      }
      
      // Try backup code
      if (user.mfaBackupCodes && user.mfaBackupCodes.length > 0) {
        const backupCodeIndex = await verifyBackupCode(code, user.mfaBackupCodes);
        
        if (backupCodeIndex !== null) {
          // Valid backup code - remove it from the list
          const updatedBackupCodes = [...user.mfaBackupCodes];
          updatedBackupCodes.splice(backupCodeIndex, 1);
          
          await db
            .update(users)
            .set({ mfaBackupCodes: updatedBackupCodes })
            .where(eq(users.id, user.id));
          
          // Create session
          req.session.userId = user.id;
          req.session.tenantId = user.tenantId;
          req.session.activeRole = user.roles[0];
          
          // Save session before sending response
          return req.session.save((err) => {
            if (err) {
              console.error('Session save error:', err);
              return res.status(500).json({ error: 'Failed to save session' });
            }

            return res.json({
              success: true,
              user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                roles: user.roles,
                activeRole: user.roles[0],
              },
              backupCodeUsed: true,
              remainingBackupCodes: updatedBackupCodes.length,
            });
          });
        }
      }
      
      // Invalid code
      res.status(401).json({ error: 'Invalid verification code' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/auth/mfa/disable
   * Disable MFA for user
   */
  app.post('/api/auth/mfa/disable', requireAuth, async (req, res, next) => {
    try {
      const bcrypt = await import('bcrypt');
      
      const disableSchema = z.object({
        password: z.string(),
      });
      
      const { password } = disableSchema.parse(req.body);
      
      // Verify password
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      
      // Disable MFA
      await db
        .update(users)
        .set({
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
        })
        .where(eq(users.id, req.user!.id));
      
      res.json({
        success: true,
        message: 'MFA disabled successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/auth/mfa/regenerate-backup-codes
   * Regenerate backup codes for user
   */
  app.post('/api/auth/mfa/regenerate-backup-codes', requireAuth, async (req, res, next) => {
    try {
      const { generateBackupCodes, hashBackupCodes } = await import('./mfa');
      const bcrypt = await import('bcrypt');
      
      const regenerateSchema = z.object({
        password: z.string(),
      });
      
      const { password } = regenerateSchema.parse(req.body);
      
      // Verify password
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (!user.mfaEnabled) {
        return res.status(400).json({ error: 'MFA not enabled' });
      }
      
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      
      // Generate new backup codes
      const backupCodes = generateBackupCodes(10);
      const hashedBackupCodes = await hashBackupCodes(backupCodes);
      
      // Update database
      await db
        .update(users)
        .set({ mfaBackupCodes: hashedBackupCodes })
        .where(eq(users.id, req.user!.id));
      
      res.json({
        success: true,
        backupCodes: backupCodes,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/auth/mfa/status
   * Get MFA status for current user
   */
  app.get('/api/auth/mfa/status', requireAuth, async (req, res, next) => {
    try {
      const [user] = await db
        .select({
          mfaEnabled: users.mfaEnabled,
          backupCodesCount: users.mfaBackupCodes,
        })
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        mfaEnabled: user.mfaEnabled,
        backupCodesRemaining: user.backupCodesCount?.length || 0,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/forgot-password
   * Request password reset token
   */
  app.post('/api/forgot-password', passwordResetLimiter, requireTenant, async (req, res, next) => {
    try {
      const { passwordResetTokens, users } = await import('@shared/schema');
      const crypto = await import('crypto');
      
      const requestSchema = z.object({
        email: z.string().email(),
      });

      const { email } = requestSchema.parse(req.body);
      
      // Find user by email and tenant
      const [user] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.email, email),
          eq(users.tenantId, req.tenant!.id)
        ))
        .limit(1);

      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ success: true, message: 'If an account exists with that email, a password reset link has been sent.' });
      }

      // Generate secure random token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Delete any existing tokens for this user
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));

      // Create new reset token
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tenantId: req.tenant!.id,
        token,
        expiresAt,
      });

      // Send reset email if Resend is configured
      if (req.tenant!.resendEnabled && req.tenant!.resendApiKeyEncrypted) {
        try {
          const { decryptApiKey } = await import('./lib/encryption');
          const { Resend } = await import('resend');
          
          const apiKey = decryptApiKey(req.tenant!.resendApiKeyEncrypted);
          const resend = new Resend(apiKey);
          
          // Construct reset URL with proper domain and path-based routing
          let resetUrl: string;
          if (req.tenant!.customDomain) {
            resetUrl = `https://${req.tenant!.customDomain}/reset-password?token=${token}`;
          } else {
            // Use path-based routing: {baseUrl}/{subdomain}/reset-password
            const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
            const baseUrl = isProduction 
              ? 'https://irescue.life'
              : process.env.REPLIT_DEV_DOMAIN 
                ? `https://${process.env.REPLIT_DEV_DOMAIN}`
                : 'http://localhost:5000';
            resetUrl = `${baseUrl}/${req.tenant!.subdomain}/reset-password?token=${token}`;
          }
          
          await resend.emails.send({
            from: `${req.tenant!.resendFromName || req.tenant!.name} <${req.tenant!.resendFromEmail}>`,
            to: user.email,
            subject: 'Password Reset Request',
            html: `
              <h2>Password Reset Request</h2>
              <p>Hi ${user.fullName},</p>
              <p>You requested to reset your password. Click the link below to create a new password:</p>
              <p><a href="${resetUrl}">Reset Password</a></p>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request this, you can safely ignore this email.</p>
              <p>Best regards,<br/>${req.tenant!.name}</p>
            `,
          });
        } catch (emailError) {
          console.error('Failed to send password reset email:', emailError);
          // Don't fail the request if email fails - user can still use the token
        }
      }

      res.json({ success: true, message: 'If an account exists with that email, a password reset link has been sent.' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/reset-password
   * Reset password using token
   */
  app.post('/api/reset-password', passwordResetLimiter, requireTenant, async (req, res, next) => {
    try {
      const { passwordResetTokens, users } = await import('@shared/schema');
      const bcrypt = await import('bcrypt');
      
      const resetSchema = z.object({
        token: z.string(),
        newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      });

      const { token, newPassword } = resetSchema.parse(req.body);
      
      // Find and validate token
      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.token, token),
          eq(passwordResetTokens.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!resetToken) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        // Delete expired token
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, resetToken.id));
        return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update user's password
      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, resetToken.userId));

      // Delete used token
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, resetToken.id));

      res.json({ success: true, message: 'Password has been reset successfully. You can now log in with your new password.' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/switch-role
   * Switch the user's active role
   */
  app.post('/api/switch-role', requireAuth, (req, res) => {
    const { role } = req.body;
    
    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }
    
    // Define all valid roles
    const allValidRoles = ['owner', 'admin', 'board_member', 'staff', 'foster', 'volunteer'];
    
    // Check if the requested role is valid
    if (!allValidRoles.includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role',
        message: `"${role}" is not a valid role. Valid roles are: ${allValidRoles.join(', ')}`
      });
    }
    
    // Admins and owners can preview any role
    const isAdminOrOwner = req.user!.roles.includes('admin') || req.user!.roles.includes('owner');
    
    if (!isAdminOrOwner && !req.user!.roles.includes(role)) {
      return res.status(403).json({ 
        error: 'Permission denied',
        message: `You don't have the ${role} role. Your available roles are: ${req.user!.roles.join(', ')}`
      });
    }
    
    // Update session with new active role
    req.session.activeRole = role;
    
    res.json({
      success: true,
      user: {
        id: req.user!.id,
        email: req.user!.email,
        fullName: req.user!.fullName,
        roles: req.user!.roles,
        activeRole: role,
      },
    });
  });

  /**
   * GET /api/me
   * Get current user info
   */
  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  /**
   * GET /api/me/is-owner
   * Check if the current user is the organization owner
   * Returns { isOwner: boolean } - true if user is owner or platform admin
   */
  app.get('/api/me/is-owner', requireTenant, requireAuth, async (req, res, next) => {
    try {
      // Platform admins always have owner access
      if (req.user!.roles.includes('platform_admin')) {
        return res.json({ isOwner: true });
      }
      
      // Check if user is the tenant owner
      const [tenant] = await db
        .select({ ownerId: tenants.ownerId })
        .from(tenants)
        .where(eq(tenants.id, req.user!.tenantId))
        .limit(1);
      
      const isOwner = tenant?.ownerId === req.user!.id;
      
      res.json({ isOwner });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/tenant
   * Get current tenant info
   */
  app.get('/api/tenant', requireTenant, (req, res) => {
    res.json({ tenant: req.tenant });
  });

  /**
   * GET /api/wizard/status
   * Get setup wizard status for current tenant (fresh from database)
   */
  app.get('/api/wizard/status', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      // Fetch fresh data from database to avoid caching issues
      const [tenant] = await db.select({
        wizardCompleted: tenants.wizardCompleted,
        wizardStep: tenants.wizardStep,
        wizardSkipped: tenants.wizardSkipped,
      })
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ message: 'Tenant not found' });
      }

      // Prevent caching to ensure fresh data on every request
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({ 
        wizardCompleted: tenant.wizardCompleted || false, 
        wizardStep: tenant.wizardStep || 0,
        wizardSkipped: tenant.wizardSkipped || false
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/wizard/step
   * Update current wizard step
   */
  app.patch('/api/wizard/step', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { step } = req.body;
      
      if (typeof step !== 'number' || step < 0 || step > 7) {
        return res.status(400).json({ message: 'Invalid step number. Must be 0-7' });
      }

      await db.update(tenants)
        .set({ wizardStep: step })
        .where(eq(tenants.id, req.tenant!.id));

      res.json({ message: 'Wizard step updated', step });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/wizard/complete
   * Mark wizard as completed
   */
  app.post('/api/wizard/complete', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      await db.update(tenants)
        .set({ 
          wizardCompleted: true,
          wizardStep: 7 // Set to final step
        })
        .where(eq(tenants.id, req.tenant!.id));

      res.json({ message: 'Setup wizard completed successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/wizard/skip
   * Skip the wizard (mark as skipped)
   */
  app.post('/api/wizard/skip', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      await db.update(tenants)
        .set({ 
          wizardSkipped: true,
          wizardCompleted: false
        })
        .where(eq(tenants.id, req.tenant!.id));

      res.json({ message: 'Setup wizard skipped' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/stats
   * Get dashboard statistics with trend indicators (authenticated users only)
   */
  app.get('/api/stats', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { getAnimalsByTenant } = await import('./services/animals');
      const { getApplicationsByTenant } = await import('./services/applications');
      const { db } = await import('./db');
      const { users, donations, animals: animalsTable, applications: applicationsTable, kennelRows, volunteerApplications, fosterApplications } = await import('@shared/schema');
      const { eq, and, or, sql, gte, lte } = await import('drizzle-orm');

      // Calculate date ranges for current and previous periods
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      // Fetch all data in parallel
      const [
        animals,
        applications,
        currentMonthCashDonations,
        currentMonthInKindDonations,
        previousMonthDonations,
        volunteers,
        previousMonthAnimals,
        previousMonthApplications,
        kennelCapacityResult,
        pendingVolunteerApps,
        pendingFosterApps,
      ] = await Promise.all([
        getAnimalsByTenant(req.tenant!.id),
        getApplicationsByTenant(req.tenant!.id),
        // Current month CASH donations (cash and check)
        db.select({ total: sql<number>`COALESCE(SUM(CAST(${donations.amount} AS NUMERIC)), 0)` })
          .from(donations)
          .where(
            and(
              eq(donations.tenantId, req.tenant!.id),
              gte(donations.date, currentMonthStart),
              sql`${donations.donationType} IN ('cash', 'check')`
            )
          ),
        // Current month IN-KIND donations (estimated value)
        db.select({ total: sql<number>`COALESCE(SUM(CAST(${donations.estimatedValue} AS NUMERIC)), 0)` })
          .from(donations)
          .where(
            and(
              eq(donations.tenantId, req.tenant!.id),
              gte(donations.date, currentMonthStart),
              sql`${donations.donationType} IN ('in_kind', 'in_kind_goods', 'in_kind_services')`
            )
          ),
        // Previous month donations (all types for trend comparison)
        db.select({ total: sql<number>`COALESCE(SUM(CAST(${donations.amount} AS NUMERIC)), 0)` })
          .from(donations)
          .where(
            and(
              eq(donations.tenantId, req.tenant!.id),
              gte(donations.date, previousMonthStart),
              lte(donations.date, previousMonthEnd),
              sql`${donations.donationType} IN ('cash', 'check')`
            )
          ),
        // Volunteers
        db.select().from(users).where(
          and(
            eq(users.tenantId, req.tenant!.id),
            sql`'volunteer' = ANY(${users.roles})`
          )
        ),
        // Previous month animals in care (those that existed and were in care)
        db.select({ count: sql<number>`count(*)::int` })
          .from(animalsTable)
          .where(
            and(
              eq(animalsTable.tenantId, req.tenant!.id),
              sql`${animalsTable.createdAt} <= ${previousMonthEnd}`,
              or(
                sql`${animalsTable.status} IN ('available', 'foster')`,
                and(
                  eq(animalsTable.status, 'adopted'),
                  sql`${animalsTable.adoptionDate} > ${previousMonthEnd}`
                )
              )
            )
          ),
        // Previous month pending applications
        db.select({ count: sql<number>`count(*)::int` })
          .from(applicationsTable)
          .where(
            and(
              eq(applicationsTable.tenantId, req.tenant!.id),
              sql`${applicationsTable.createdAt} <= ${previousMonthEnd}`,
              sql`${applicationsTable.stage} IN ('new', 'screening')`
            )
          ),
        // Kennel capacity (total units from all rows)
        db.select({ totalCapacity: sql<number>`COALESCE(SUM(${kennelRows.capacity}), 0)::int` })
          .from(kennelRows)
          .where(eq(kennelRows.tenantId, req.tenant!.id)),
        // Pending volunteer applications
        db.select({ count: sql<number>`count(*)::int` })
          .from(volunteerApplications)
          .where(
            and(
              eq(volunteerApplications.tenantId, req.tenant!.id),
              eq(volunteerApplications.status, 'pending')
            )
          ),
        // Pending foster applications
        db.select({ count: sql<number>`count(*)::int` })
          .from(fosterApplications)
          .where(
            and(
              eq(fosterApplications.tenantId, req.tenant!.id),
              eq(fosterApplications.status, 'pending')
            )
          ),
      ]);

      // Calculate current stats
      const currentAnimalsInCare = animals.filter(a => a.status === 'available' || a.status === 'foster').length;
      const currentPendingApplications = applications.filter(a => a.stage === 'new' || a.stage === 'screening').length;
      const currentActiveVolunteers = volunteers.length;
      const currentCashDonationsThisMonth = Number(currentMonthCashDonations[0]?.total || 0);
      const currentInKindDonationsThisMonth = Number(currentMonthInKindDonations[0]?.total || 0);
      const currentDonationsThisMonth = currentCashDonationsThisMonth; // For backwards compatibility

      // Calculate kennel occupancy (total units from kennel_rows capacity)
      const totalKennels = kennelCapacityResult[0]?.totalCapacity || 0;
      
      // Get active animals (not adopted or deceased, and not in foster)
      const activeAnimals = animals.filter(
        a => a.status === 'available' || a.status === 'pending' || a.status === 'medical_hold'
      );
      
      // Count animals with kennel assignments using structured fields
      const occupiedKennels = activeAnimals.filter(animal => 
        animal.kennelBuildingId && animal.kennelRowId && animal.kennelPosition !== null
      ).length;
      const vacantKennels = totalKennels - occupiedKennels;

      // Previous period stats
      const previousAnimalsInCare = previousMonthAnimals[0]?.count || 0;
      const previousPendingApplications = previousMonthApplications[0]?.count || 0;
      const previousDonationsLastMonth = Number(previousMonthDonations[0]?.total || 0);

      // Calculate percentage changes
      const calculateTrend = (current: number, previous: number) => {
        if (previous === 0) {
          return current > 0 ? { change: 100, isPositive: true } : { change: 0, isPositive: true };
        }
        const percentChange = ((current - previous) / previous) * 100;
        return {
          change: Math.round(Math.abs(percentChange)),
          isPositive: percentChange >= 0,
        };
      };

      const stats = {
        animalsInCare: currentAnimalsInCare,
        animalsInCareTrend: calculateTrend(currentAnimalsInCare, previousAnimalsInCare),
        pendingApplications: currentPendingApplications,
        pendingApplicationsTrend: calculateTrend(currentPendingApplications, previousPendingApplications),
        activeVolunteers: currentActiveVolunteers,
        donationsThisMonth: currentDonationsThisMonth, // For backwards compatibility (cash only)
        cashRevenueThisMonth: currentCashDonationsThisMonth, // Cash and check donations
        inKindRevenueThisMonth: currentInKindDonationsThisMonth, // In-kind donations (estimated value)
        donationsThisMonthTrend: calculateTrend(currentDonationsThisMonth, previousDonationsLastMonth),
        totalKennels,
        occupiedKennels,
        vacantKennels,
        pendingVolunteerApplications: pendingVolunteerApps[0]?.count || 0,
        pendingFosterApplications: pendingFosterApps[0]?.count || 0,
      };

      res.json({ stats });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/dashboard/activity
   * Get recent activity feed for dashboard (last 10 activities)
   * Tracks: application status changes, new applications, volunteer/foster apps, events, donations, animal updates, happy tails
   */
  app.get('/api/dashboard/activity', requireTenant, requireAuth, async (req, res, next) => {
    try {
      // Tables are imported statically at top of file: applications, donations, animals, volunteerApplications, fosterApplications, calendarEvents, happyTails

      // Fetch recent data from all sources
      const [
        recentApplications,
        recentDonations, 
        recentAnimalUpdates,
        recentVolunteerApps,
        recentFosterApps,
        recentEvents,
        recentHappyTails,
        recentNewAnimals
      ] = await Promise.all([
        // New adoption applications
        db.select({
          id: applications.id,
          createdAt: applications.createdAt,
          applicantName: applications.applicantName,
          animalId: applications.animalId,
        })
          .from(applications)
          .where(eq(applications.tenantId, req.tenant!.id))
          .orderBy(desc(applications.createdAt))
          .limit(10),
        
        // Donations
        db.select({
          id: donations.id,
          createdAt: donations.createdAt,
          donorName: donations.donorName,
          amount: donations.amount,
        })
          .from(donations)
          .where(eq(donations.tenantId, req.tenant!.id))
          .orderBy(desc(donations.createdAt))
          .limit(10),
        
        // Animal status updates
        db.select({
          id: animals.id,
          updatedAt: animals.updatedAt,
          name: animals.name,
          status: animals.status,
        })
          .from(animals)
          .where(
            and(
              eq(animals.tenantId, req.tenant!.id),
              sql`${animals.updatedAt} > ${animals.createdAt}`
            )
          )
          .orderBy(desc(animals.updatedAt))
          .limit(10),
        
        // Volunteer applications
        db.select({
          id: volunteerApplications.id,
          createdAt: volunteerApplications.createdAt,
          applicantName: volunteerApplications.applicantName,
        })
          .from(volunteerApplications)
          .where(eq(volunteerApplications.tenantId, req.tenant!.id))
          .orderBy(desc(volunteerApplications.createdAt))
          .limit(10),
        
        // Foster applications
        db.select({
          id: fosterApplications.id,
          createdAt: fosterApplications.createdAt,
          applicantName: fosterApplications.applicantName,
        })
          .from(fosterApplications)
          .where(eq(fosterApplications.tenantId, req.tenant!.id))
          .orderBy(desc(fosterApplications.createdAt))
          .limit(10),
        
        // New events
        db.select({
          id: calendarEvents.id,
          createdAt: calendarEvents.createdAt,
          title: calendarEvents.title,
          startTime: calendarEvents.startTime,
        })
          .from(calendarEvents)
          .where(eq(calendarEvents.tenantId, req.tenant!.id))
          .orderBy(desc(calendarEvents.createdAt))
          .limit(10),
        
        // New happy tails
        db.select({
          id: happyTails.id,
          createdAt: happyTails.createdAt,
          animalName: happyTails.animalName,
        })
          .from(happyTails)
          .where(eq(happyTails.tenantId, req.tenant!.id))
          .orderBy(desc(happyTails.createdAt))
          .limit(10),
        
        // New animals added
        db.select({
          id: animals.id,
          createdAt: animals.createdAt,
          name: animals.name,
          species: animals.species,
        })
          .from(animals)
          .where(eq(animals.tenantId, req.tenant!.id))
          .orderBy(desc(animals.createdAt))
          .limit(10),
      ]);

      // Get animal names for applications
      const allAnimalIds = recentApplications
        .map(a => a.animalId)
        .filter(Boolean) as string[];
      
      const animalsMap = new Map();
      if (allAnimalIds.length > 0) {
        const animalsForApps = await db.select({ id: animals.id, name: animals.name })
          .from(animals)
          .where(inArray(animals.id, allAnimalIds));
        animalsForApps.forEach(a => animalsMap.set(a.id, a.name));
      }

      // Transform into unified activity format
      const activities = [
        // New adoption applications
        ...recentApplications.map(app => ({
          type: 'application' as const,
          title: 'New adoption application',
          description: `${app.applicantName} applied to adopt ${animalsMap.get(app.animalId) || 'an animal'}`,
          timestamp: app.createdAt,
        })),
        
        // Donations
        ...recentDonations.map(don => ({
          type: 'donation' as const,
          title: 'Donation received',
          description: `$${Number(don.amount).toFixed(2)} from ${don.donorName}`,
          timestamp: don.createdAt,
        })),
        
        // Animal status updates
        ...recentAnimalUpdates.map(animal => ({
          type: 'status_change' as const,
          title: 'Animal status updated',
          description: `${animal.name} ${animal.status === 'adopted' ? 'was adopted' : `moved to ${animal.status}`}`,
          timestamp: animal.updatedAt,
        })),
        
        // Volunteer applications
        ...recentVolunteerApps.map(app => ({
          type: 'volunteer_app' as const,
          title: 'New volunteer application',
          description: `${app.applicantName} applied to volunteer`,
          timestamp: app.createdAt,
        })),
        
        // Foster applications
        ...recentFosterApps.map(app => ({
          type: 'foster_app' as const,
          title: 'New foster application',
          description: `${app.applicantName} applied to foster`,
          timestamp: app.createdAt,
        })),
        
        // New events
        ...recentEvents.map(event => ({
          type: 'event' as const,
          title: 'New event created',
          description: `${event.title}`,
          timestamp: event.createdAt,
        })),
        
        // New happy tails
        ...recentHappyTails.map(tale => ({
          type: 'happy_tail' as const,
          title: 'New success story',
          description: `Happy tail posted for ${tale.animalName}`,
          timestamp: tale.createdAt,
        })),
        
        // New animals
        ...recentNewAnimals.map(animal => ({
          type: 'animal_new' as const,
          title: 'New animal added',
          description: `${animal.name} (${animal.species}) joined our rescue`,
          timestamp: animal.createdAt,
        })),
      ];

      // Sort by timestamp and take the 10 most recent
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const recentActivities = activities.slice(0, 10);

      res.json({ activities: recentActivities });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/dashboard/form-submissions
   * Get recent form submissions for the dashboard widget
   * Includes: adoption applications, foster applications, volunteer applications, and custom form submissions
   */
  app.get('/api/dashboard/form-submissions', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      
      // Fetch all types of submissions in parallel - using simpler queries without complex joins
      const [customSubmissions, adoptionApps, fosterApps, volunteerApps, formsList, animalsList] = await Promise.all([
        // Custom form submissions
        db
          .select()
          .from(customFormSubmissions)
          .where(eq(customFormSubmissions.tenantId, tenantId))
          .orderBy(desc(customFormSubmissions.createdAt))
          .limit(10),
        
        // Adoption applications
        db
          .select()
          .from(applications)
          .where(eq(applications.tenantId, tenantId))
          .orderBy(desc(applications.createdAt))
          .limit(10),
        
        // Foster applications
        db
          .select()
          .from(fosterApplications)
          .where(eq(fosterApplications.tenantId, tenantId))
          .orderBy(desc(fosterApplications.createdAt))
          .limit(10),
        
        // Volunteer applications
        db
          .select()
          .from(volunteerApplications)
          .where(eq(volunteerApplications.tenantId, tenantId))
          .orderBy(desc(volunteerApplications.createdAt))
          .limit(10),
        
        // Custom forms for name lookup
        db
          .select({ id: customForms.id, name: customForms.name })
          .from(customForms)
          .where(eq(customForms.tenantId, tenantId)),
        
        // Animals for name lookup
        db
          .select({ id: animals.id, name: animals.name })
          .from(animals)
          .where(eq(animals.tenantId, tenantId)),
      ]);

      // Create lookup maps
      const formNames = new Map(formsList.map(f => [f.id, f.name]));
      const animalNames = new Map(animalsList.map(a => [a.id, a.name]));

      // Transform and combine all submissions into a unified format
      const allSubmissions: Array<{
        id: string;
        formName: string;
        signerName: string | null;
        signerEmail: string | null;
        status: string;
        createdAt: Date | null;
        signedAt: Date | null;
        feeAmount: number | null;
        paymentStatus: string | null;
        type: 'custom' | 'adoption' | 'foster' | 'volunteer';
      }> = [];

      // Add custom form submissions
      for (const sub of customSubmissions) {
        const formName = sub.formId ? formNames.get(sub.formId) : null;
        allSubmissions.push({
          id: sub.id,
          formName: formName || 'Custom Form',
          signerName: sub.signerName,
          signerEmail: sub.signerEmail,
          status: sub.status,
          createdAt: sub.createdAt,
          signedAt: sub.signedAt,
          feeAmount: sub.feeAmount,
          paymentStatus: sub.paymentStatus,
          type: 'custom',
        });
      }

      // Add adoption applications
      for (const app of adoptionApps) {
        const animalName = app.animalId ? animalNames.get(app.animalId) : null;
        allSubmissions.push({
          id: app.id,
          formName: animalName ? `Adoption Application - ${animalName}` : 'Adoption Application',
          signerName: app.applicantName,
          signerEmail: app.applicantEmail,
          status: app.stage || 'new',
          createdAt: app.createdAt,
          signedAt: null,
          feeAmount: null,
          paymentStatus: null,
          type: 'adoption',
        });
      }

      // Add foster applications
      for (const app of fosterApps) {
        allSubmissions.push({
          id: app.id,
          formName: 'Foster Application',
          signerName: app.applicantName,
          signerEmail: app.applicantEmail,
          status: app.stage || 'new',
          createdAt: app.createdAt,
          signedAt: null,
          feeAmount: null,
          paymentStatus: null,
          type: 'foster',
        });
      }

      // Add volunteer applications
      for (const app of volunteerApps) {
        allSubmissions.push({
          id: app.id,
          formName: 'Volunteer Application',
          signerName: app.applicantName,
          signerEmail: app.applicantEmail,
          status: app.stage || 'new',
          createdAt: app.createdAt,
          signedAt: null,
          feeAmount: null,
          paymentStatus: null,
          type: 'volunteer',
        });
      }

      // Sort by createdAt descending and take top 10
      allSubmissions.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      const submissions = allSubmissions.slice(0, 10);

      // Calculate counts across all submission types
      const counts = {
        pending: customSubmissions.filter(s => s.status === 'pending' && !s.signedAt).length,
        signed: customSubmissions.filter(s => s.signedAt && s.status !== 'completed').length,
        completed: customSubmissions.filter(s => s.status === 'completed').length,
        awaitingPayment: customSubmissions.filter(s => s.paymentStatus === 'pending' && s.signedAt).length,
        // Add application counts
        newAdoptions: adoptionApps.filter(a => a.stage === 'new').length,
        newFosters: fosterApps.filter(a => a.stage === 'new').length,
        newVolunteers: volunteerApps.filter(a => a.stage === 'new').length,
      };

      res.json({ submissions, counts });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/dashboard/urgent-items
   * Get urgent items requiring attention (overdue medical doses, old pending applications, animals needing adoption)
   */
  app.get('/api/dashboard/urgent-items', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalDoses, applications, animals, medicalPrescriptions } = await import('@shared/schema');
      const { lt, or } = await import('drizzle-orm');

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Fetch urgent items in parallel
      const [overdueDoses, oldApplications, longTermAnimals] = await Promise.all([
        // Overdue medical doses (due date in the past and status is 'due')
        db.select({
          id: medicalDoses.id,
          prescriptionId: medicalDoses.prescriptionId,
          dueDate: medicalDoses.dueDate,
        })
          .from(medicalDoses)
          .where(
            and(
              eq(medicalDoses.tenantId, req.tenant!.id),
              eq(medicalDoses.status, 'due'),
              lt(medicalDoses.dueDate, now)
            )
          ),
        
        // Applications pending for more than 7 days
        db.select({
          id: applications.id,
          applicantName: applications.applicantName,
          createdAt: applications.createdAt,
        })
          .from(applications)
          .where(
            and(
              eq(applications.tenantId, req.tenant!.id),
              or(
                eq(applications.stage, 'new'),
                eq(applications.stage, 'screening')
              ),
              lt(applications.createdAt, sevenDaysAgo)
            )
          )
          .limit(10),
        
        // Animals available for adoption for more than 90 days
        db.select({
          id: animals.id,
          name: animals.name,
          intakeDate: animals.intakeDate,
        })
          .from(animals)
          .where(
            and(
              eq(animals.tenantId, req.tenant!.id),
              eq(animals.status, 'available'),
              lt(animals.intakeDate, ninetyDaysAgo)
            )
          )
          .limit(10),
      ]);

      // Get prescription details for overdue doses
      const prescriptionIds = overdueDoses.map(d => d.prescriptionId);
      let dosesWithMedication = [];
      if (prescriptionIds.length > 0) {
        const prescriptions = await db.select({
          id: medicalPrescriptions.id,
          medicationName: medicalPrescriptions.medicationName,
          animalId: medicalPrescriptions.animalId,
        })
          .from(medicalPrescriptions)
          .where(inArray(medicalPrescriptions.id, prescriptionIds));
        
        const prescriptionsMap = new Map(prescriptions.map(p => [p.id, p]));
        const animalIdsForDoses = prescriptions.map(p => p.animalId).filter(Boolean);
        
        const animalsForDoses = await db.select({
          id: animals.id,
          name: animals.name,
        })
          .from(animals)
          .where(inArray(animals.id, animalIdsForDoses));
        
        const animalsMap = new Map(animalsForDoses.map(a => [a.id, a.name]));
        
        dosesWithMedication = overdueDoses.map(dose => {
          const prescription = prescriptionsMap.get(dose.prescriptionId);
          return {
            id: dose.id,
            medication: prescription?.medicationName || 'Unknown',
            animalName: prescription?.animalId ? animalsMap.get(prescription.animalId) || 'Unknown' : 'Unknown',
            dueDate: dose.dueDate,
          };
        });
      }

      const urgentItems = {
        overdueMedicalDoses: dosesWithMedication.length,
        overdueMedicalDosesDetails: dosesWithMedication,
        oldPendingApplications: oldApplications.length,
        oldPendingApplicationsDetails: oldApplications,
        longTermAvailableAnimals: longTermAnimals.length,
        longTermAvailableAnimalsDetails: longTermAnimals,
      };

      res.json({ urgentItems });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/dashboard/pending-applications
   * Get all pending applications across all types (adoption, foster, volunteer) for dashboard widget
   */
  app.get('/api/dashboard/pending-applications', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const pendingApps: Array<{
        id: string;
        type: 'adoption' | 'foster' | 'volunteer';
        applicantName: string;
        applicantEmail: string;
        applicantPhone: string;
        status: string;
        createdAt: Date;
        animalName?: string;
        animalId?: string;
        formData?: Record<string, any>;
      }> = [];

      // Fetch all pending adoption applications
      const adoptionApps = await db.select({
        id: applications.id,
        applicantName: applications.applicantName,
        applicantEmail: applications.applicantEmail,
        applicantPhone: applications.applicantPhone,
        stage: applications.stage,
        createdAt: applications.createdAt,
        animalId: applications.animalId,
        customResponses: applications.customResponses,
        notes: applications.notes,
      })
        .from(applications)
        .where(
          and(
            eq(applications.tenantId, req.tenant!.id),
            inArray(applications.stage, ['new', 'screening', 'vet_check', 'home_visit'])
          )
        )
        .orderBy(desc(applications.createdAt))
        .limit(20);

      // Get animal names for adoption applications
      const animalIds = adoptionApps.map(a => a.animalId).filter(Boolean);
      let animalNamesMap = new Map<string, string>();
      if (animalIds.length > 0) {
        const animalsData = await db.select({
          id: animals.id,
          name: animals.name,
        })
          .from(animals)
          .where(inArray(animals.id, animalIds as string[]));
        animalNamesMap = new Map(animalsData.map(a => [a.id, a.name]));
      }

      for (const app of adoptionApps) {
        pendingApps.push({
          id: app.id,
          type: 'adoption',
          applicantName: app.applicantName,
          applicantEmail: app.applicantEmail,
          applicantPhone: app.applicantPhone,
          status: app.stage,
          createdAt: app.createdAt,
          animalId: app.animalId,
          animalName: animalNamesMap.get(app.animalId) || undefined,
          formData: {
            ...app.customResponses,
            notes: app.notes,
          },
        });
      }

      // Fetch all pending foster applications
      const fosterApps = await db.select({
        id: fosterApplications.id,
        applicantName: fosterApplications.applicantName,
        applicantEmail: fosterApplications.applicantEmail,
        applicantPhone: fosterApplications.applicantPhone,
        status: fosterApplications.status,
        createdAt: fosterApplications.createdAt,
        customResponses: fosterApplications.customResponses,
        address: fosterApplications.address,
        housingType: fosterApplications.housingType,
        hasYard: fosterApplications.hasYard,
        hasOtherPets: fosterApplications.hasOtherPets,
        otherPetsDetails: fosterApplications.otherPetsDetails,
        experience: fosterApplications.experience,
        availability: fosterApplications.availability,
        preferences: fosterApplications.preferences,
        vetReference: fosterApplications.vetReference,
        personalReference: fosterApplications.personalReference,
        notes: fosterApplications.notes,
        hasFencedYard: fosterApplications.hasFencedYard,
        acceptsLargeDogs: fosterApplications.acceptsLargeDogs,
        acceptsCats: fosterApplications.acceptsCats,
        acceptsPuppies: fosterApplications.acceptsPuppies,
        acceptsSeniors: fosterApplications.acceptsSeniors,
        acceptsMedicalNeeds: fosterApplications.acceptsMedicalNeeds,
        maxAnimals: fosterApplications.maxAnimals,
      })
        .from(fosterApplications)
        .where(
          and(
            eq(fosterApplications.tenantId, req.tenant!.id),
            inArray(fosterApplications.status, ['pending', 'new_app', 'interview', 'home_check', 'orientation', 'agreement'])
          )
        )
        .orderBy(desc(fosterApplications.createdAt))
        .limit(20);

      for (const app of fosterApps) {
        pendingApps.push({
          id: app.id,
          type: 'foster',
          applicantName: app.applicantName,
          applicantEmail: app.applicantEmail,
          applicantPhone: app.applicantPhone,
          status: app.status,
          createdAt: app.createdAt,
          formData: {
            ...app.customResponses,
            address: app.address,
            housingType: app.housingType,
            hasYard: app.hasYard,
            hasOtherPets: app.hasOtherPets,
            otherPetsDetails: app.otherPetsDetails,
            experience: app.experience,
            availability: app.availability,
            preferences: app.preferences,
            vetReference: app.vetReference,
            personalReference: app.personalReference,
            notes: app.notes,
            hasFencedYard: app.hasFencedYard,
            acceptsLargeDogs: app.acceptsLargeDogs,
            acceptsCats: app.acceptsCats,
            acceptsPuppies: app.acceptsPuppies,
            acceptsSeniors: app.acceptsSeniors,
            acceptsMedicalNeeds: app.acceptsMedicalNeeds,
            maxAnimals: app.maxAnimals,
          },
        });
      }

      // Fetch all pending volunteer applications
      const volunteerApps = await db.select({
        id: volunteerApplications.id,
        applicantName: volunteerApplications.applicantName,
        applicantEmail: volunteerApplications.applicantEmail,
        applicantPhone: volunteerApplications.applicantPhone,
        status: volunteerApplications.status,
        pipelineStatus: volunteerApplications.pipelineStatus,
        createdAt: volunteerApplications.createdAt,
        customResponses: volunteerApplications.customResponses,
        address: volunteerApplications.address,
        experience: volunteerApplications.experience,
        availability: volunteerApplications.availability,
        interests: volunteerApplications.interests,
        skills: volunteerApplications.skills,
        emergencyContactName: volunteerApplications.emergencyContactName,
        emergencyContactPhone: volunteerApplications.emergencyContactPhone,
        notes: volunteerApplications.notes,
      })
        .from(volunteerApplications)
        .where(
          and(
            eq(volunteerApplications.tenantId, req.tenant!.id),
            inArray(volunteerApplications.pipelineStatus, ['new_applicant', 'orientation_scheduled', 'waiver_needed'])
          )
        )
        .orderBy(desc(volunteerApplications.createdAt))
        .limit(20);

      for (const app of volunteerApps) {
        pendingApps.push({
          id: app.id,
          type: 'volunteer',
          applicantName: app.applicantName,
          applicantEmail: app.applicantEmail,
          applicantPhone: app.applicantPhone,
          status: app.pipelineStatus,
          createdAt: app.createdAt,
          formData: {
            ...app.customResponses,
            address: app.address,
            experience: app.experience,
            availability: app.availability,
            interests: app.interests,
            skills: app.skills,
            emergencyContactName: app.emergencyContactName,
            emergencyContactPhone: app.emergencyContactPhone,
            notes: app.notes,
          },
        });
      }

      // Sort all by date, most recent first
      pendingApps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Calculate counts
      const counts = {
        adoption: pendingApps.filter(a => a.type === 'adoption').length,
        foster: pendingApps.filter(a => a.type === 'foster').length,
        volunteer: pendingApps.filter(a => a.type === 'volunteer').length,
        total: pendingApps.length,
      };

      res.json({ applications: pendingApps.slice(0, 30), counts });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/activity-logs
   * Get recent activity timeline for tenant admin dashboard
   * Returns logged activities with user info, color-coded by category
   */
  app.get('/api/activity-logs', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { getRecentActivity } = await import('./lib/activity-logger');
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      
      const activities = await getRecentActivity(req.tenant!.id, limit);
      res.json({ activities });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/notifications/counts
   * Get notification counts for sidebar badges (authenticated users only)
   */
  app.get('/api/notifications/counts', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { applications, supplyRequests, fosterUpdates, userInvitations, medicalDoses } = await import('@shared/schema');
      const { eq, and, or, lte, isNull } = await import('drizzle-orm');

      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const [
        pendingApplications,
        overdueDoses,
        pendingSupplyRequests,
        pendingFosterUpdates,
        pendingInvitations,
      ] = await Promise.all([
        // Count pending applications (new or screening stage)
        db.select({ count: sql<number>`count(*)::int` })
          .from(applications)
          .where(
            and(
              eq(applications.tenantId, req.tenant!.id),
              or(
                eq(applications.stage, 'new'),
                eq(applications.stage, 'screening')
              )
            )
          ),

        // Count pending/overdue medical doses (medication tasks)
        db.select({ count: sql<number>`count(*)::int` })
          .from(medicalDoses)
          .where(
            and(
              eq(medicalDoses.tenantId, req.tenant!.id),
              or(
                eq(medicalDoses.status, 'pending'),
                eq(medicalDoses.status, 'overdue')
              ),
              lte(medicalDoses.dueDate, today)
            )
          ),

        // Count pending supply requests
        db.select({ count: sql<number>`count(*)::int` })
          .from(supplyRequests)
          .where(
            and(
              eq(supplyRequests.tenantId, req.tenant!.id),
              eq(supplyRequests.status, 'pending')
            )
          ),

        // Count pending foster updates
        db.select({ count: sql<number>`count(*)::int` })
          .from(fosterUpdates)
          .where(
            and(
              eq(fosterUpdates.tenantId, req.tenant!.id),
              eq(fosterUpdates.status, 'pending')
            )
          ),

        // Count pending team invitations
        db.select({ count: sql<number>`count(*)::int` })
          .from(userInvitations)
          .where(
            and(
              eq(userInvitations.tenantId, req.tenant!.id),
              isNull(userInvitations.acceptedAt)
            )
          ),
      ]);

      const counts = {
        applications: pendingApplications[0]?.count || 0,
        medicalTasks: overdueDoses[0]?.count || 0,
        supplyRequests: pendingSupplyRequests[0]?.count || 0,
        fosterUpdates: pendingFosterUpdates[0]?.count || 0,
        teamInvitations: pendingInvitations[0]?.count || 0,
      };

      res.json({ counts });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/reports
   * Get comprehensive analytics and metrics for reports page
   */
  app.get('/api/reports', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { animals, adoptions, donations, expenditures, users } = await import('@shared/schema');
      const { eq, and, sql, gte, lte } = await import('drizzle-orm');
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      
      // Run all database queries in parallel for better performance
      const [
        allAnimals,
        allAdoptions,
        donationsThisMonth,
        donationsYTD,
        expendituresThisMonth,
        expendituresYTD,
        fosters
      ] = await Promise.all([
        // Get all animals for intake calculations
        db.select().from(animals).where(eq(animals.tenantId, req.tenant!.id)),
        
        // Get all adoptions for adoption calculations
        db.select().from(adoptions).where(eq(adoptions.tenantId, req.tenant!.id)),
        
        // Get donations this month (with upper bound to exclude future dates)
        db.select().from(donations).where(
          and(
            eq(donations.tenantId, req.tenant!.id),
            gte(donations.date, startOfMonth),
            lte(donations.date, endOfMonth)
          )
        ),
        
        // Get donations YTD (with upper bound to exclude future dates)
        db.select().from(donations).where(
          and(
            eq(donations.tenantId, req.tenant!.id),
            gte(donations.date, startOfYear),
            lte(donations.date, endOfYear)
          )
        ),
        
        // Get expenditures this month (with upper bound to exclude future dates)
        db.select().from(expenditures).where(
          and(
            eq(expenditures.tenantId, req.tenant!.id),
            gte(expenditures.date, startOfMonth),
            lte(expenditures.date, endOfMonth)
          )
        ),
        
        // Get expenditures YTD (with upper bound to exclude future dates)
        db.select().from(expenditures).where(
          and(
            eq(expenditures.tenantId, req.tenant!.id),
            gte(expenditures.date, startOfYear),
            lte(expenditures.date, endOfYear)
          )
        ),
        
        // Get active fosters (users with foster role)
        db.select().from(users).where(
          and(
            eq(users.tenantId, req.tenant!.id),
            sql`'foster' = ANY(${users.roles})`
          )
        )
      ]);
      
      // Calculate metrics
      const intakesThisMonth = allAnimals.filter(a => {
        if (!a.intakeDate) return false;
        const intakeDate = new Date(a.intakeDate);
        return intakeDate >= startOfMonth;
      }).length;
      
      const intakesYTD = allAnimals.filter(a => {
        if (!a.intakeDate) return false;
        const intakeDate = new Date(a.intakeDate);
        return intakeDate >= startOfYear;
      }).length;
      
      const adoptionsThisMonth = allAdoptions.filter(a => {
        const adoptionDate = new Date(a.adoptionDate);
        return adoptionDate >= startOfMonth;
      }).length;
      
      const adoptionsYTD = allAdoptions.filter(a => {
        const adoptionDate = new Date(a.adoptionDate);
        return adoptionDate >= startOfYear;
      }).length;
      
      // Calculate average length of stay for adopted animals
      const adoptedAnimals = allAdoptions
        .map(adoption => {
          const animal = allAnimals.find(a => a.id === adoption.animalId);
          if (!animal || !animal.intakeDate) return null;
          
          const intakeDate = new Date(animal.intakeDate);
          const adoptionDate = new Date(adoption.adoptionDate);
          const daysInCare = Math.floor((adoptionDate.getTime() - intakeDate.getTime()) / (1000 * 60 * 60 * 24));
          
          return daysInCare;
        })
        .filter((days): days is number => days !== null && days >= 0);
      
      const avgLengthOfStay = adoptedAnimals.length > 0
        ? Math.round(adoptedAnimals.reduce((sum, days) => sum + days, 0) / adoptedAnimals.length)
        : 0;
      
      const totalDonationsThisMonth = donationsThisMonth.reduce((sum, d) => sum + Number(d.amount), 0);
      const totalDonationsYTD = donationsYTD.reduce((sum, d) => sum + Number(d.amount), 0);
      const totalExpendituresThisMonth = expendituresThisMonth.reduce((sum, e) => sum + Number(e.amount), 0);
      const totalExpendituresYTD = expendituresYTD.reduce((sum, e) => sum + Number(e.amount), 0);
      
      const metrics = {
        intakesThisMonth,
        intakesYTD,
        adoptionsThisMonth,
        adoptionsYTD,
        avgLengthOfStay,
        totalDonationsThisMonth,
        totalDonationsYTD,
        totalExpendituresThisMonth,
        totalExpendituresYTD,
        activeFosters: fosters.length,
      };
      
      res.json({ metrics });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Protected Routes (require authentication and tenant)
  // ============================================================================

  /**
   * GET /api/users
   * List all users in tenant (admin/staff only)
   */
  app.get('/api/users', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { users } = await import('@shared/schema');
      
      const userList = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          roles: users.roles,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.tenantId, req.tenant!.id))
        .orderBy(desc(users.createdAt));
      
      res.json({ users: userList });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/users/volunteers
   * Get team members with 'volunteer' role for calendar scheduling
   * Accessible to any authenticated user (permission check happens at calendar level)
   */
  app.get('/api/users/volunteers', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { users } = await import('@shared/schema');
      const { arrayContains } = await import('drizzle-orm');
      
      const volunteerUsers = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
        })
        .from(users)
        .where(
          and(
            eq(users.tenantId, req.tenant!.id),
            arrayContains(users.roles, ['volunteer'])
          )
        )
        .orderBy(users.fullName);
      
      res.json({ volunteers: volunteerUsers });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/users
   * Create new user (admin only)
   */
  app.post('/api/users', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const userSchema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        fullName: z.string().min(1),
        roles: z.array(z.enum(['admin', 'board_member', 'staff', 'foster', 'volunteer'])).min(1),
      });

      const data = userSchema.parse(req.body);
      const user = await createUser(req.tenant!.id, data);

      res.json({
        success: true,
        user,
      });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * PATCH /api/users/:id
   * Update user role (admin/owner only)
   * Owner can modify any user including admins
   * Admin can only modify non-admin and non-owner users
   */
  app.patch('/api/users/:id', requireTenant, requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
    try {
      // Validate UUID to prevent database errors
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }
      
      const { users } = await import('@shared/schema');
      
      const updateSchema = z.object({
        roles: z.array(z.enum(['owner', 'admin', 'board_member', 'staff', 'foster', 'volunteer'])).min(1).optional(),
        fullName: z.string().min(1).optional(),
      });

      const data = updateSchema.parse(req.body);
      
      // Check if current user is an owner
      const isCurrentUserOwner = req.user!.roles.includes('owner');
      
      // Get the target user to check their current roles
      const [targetUser] = await db
        .select({ id: users.id, roles: users.roles })
        .from(users)
        .where(
          and(
            eq(users.id, req.params.id),
            eq(users.tenantId, req.tenant!.id)
          )
        )
        .limit(1);
      
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const targetHasOwnerRole = targetUser.roles.includes('owner');
      const targetHasAdminRole = targetUser.roles.includes('admin');
      
      // Prevent non-owners from modifying owners or admins
      if (!isCurrentUserOwner && (targetHasOwnerRole || targetHasAdminRole)) {
        return res.status(403).json({ 
          error: 'Only owners can modify admin or owner roles',
          message: 'You do not have permission to change the roles of this user. Only the organization owner can modify admin or owner roles.'
        });
      }
      
      // Prevent admins from assigning owner or admin roles
      if (!isCurrentUserOwner && data.roles) {
        if (data.roles.includes('owner') || data.roles.includes('admin')) {
          return res.status(403).json({ 
            error: 'Only owners can assign admin or owner roles',
            message: 'You do not have permission to assign admin or owner roles. Only the organization owner can grant these privileges.'
          });
        }
      }
      
      // Prevent removing owner role from yourself (owner must transfer ownership first)
      if (isCurrentUserOwner && req.params.id === req.user!.id && data.roles && !data.roles.includes('owner')) {
        return res.status(400).json({ 
          error: 'Cannot remove owner role from yourself',
          message: 'You cannot remove your own owner role. Transfer ownership to another user first.'
        });
      }

      const [updatedUser] = await db
        .update(users)
        .set(data)
        .where(
          and(
            eq(users.id, req.params.id),
            eq(users.tenantId, req.tenant!.id)
          )
        )
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          roles: users.roles,
          createdAt: users.createdAt,
        });

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Sync the updated user information to contacts
      try {
        const { syncContactFromUser } = await import('./services/contacts');
        await syncContactFromUser(
          updatedUser.id,
          req.tenant!.id,
          updatedUser.email,
          updatedUser.fullName,
          updatedUser.roles.filter(r => r !== 'platform_admin') as any[]
        );
      } catch (error) {
        console.error('Failed to sync updated user to contacts:', error);
        // Don't fail the user update if contact sync fails
      }

      res.json({ success: true, user: updatedUser });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/users/:id
   * Delete user (admin/owner only)
   * Owner can delete any user including admins
   * Admin can only delete non-admin and non-owner users
   */
  app.delete('/api/users/:id', requireTenant, requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
    try {
      // Validate UUID to prevent database errors
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }
      
      const { users } = await import('@shared/schema');
      
      // Prevent users from deleting themselves
      if (req.params.id === req.user!.id) {
        return res.status(400).json({ error: 'You cannot delete your own account' });
      }
      
      // Check if current user is an owner
      const isCurrentUserOwner = req.user!.roles.includes('owner');
      
      // Get the target user to check their current roles
      const [targetUser] = await db
        .select({ id: users.id, roles: users.roles })
        .from(users)
        .where(
          and(
            eq(users.id, req.params.id),
            eq(users.tenantId, req.tenant!.id)
          )
        )
        .limit(1);
      
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const targetHasOwnerRole = targetUser.roles.includes('owner');
      const targetHasAdminRole = targetUser.roles.includes('admin');
      
      // Prevent non-owners from deleting owners or admins
      if (!isCurrentUserOwner && (targetHasOwnerRole || targetHasAdminRole)) {
        return res.status(403).json({ 
          error: 'Only owners can delete admin or owner accounts',
          message: 'You do not have permission to delete this user. Only the organization owner can remove admin accounts.'
        });
      }
      
      // Prevent anyone from deleting the owner (owner role must be transferred first)
      if (targetHasOwnerRole) {
        return res.status(400).json({ 
          error: 'Cannot delete the organization owner',
          message: 'The owner account cannot be deleted. Transfer ownership to another user first.'
        });
      }

      const [deletedUser] = await db
        .delete(users)
        .where(
          and(
            eq(users.id, req.params.id),
            eq(users.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!deletedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // User Invitations Routes
  // ============================================================================

  /**
   * POST /api/invitations
   * Create and send an invitation (admin only)
   */
  app.post('/api/invitations', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { createInvitation, sendInvitationEmail } = await import('./services/invitations');
      const { users } = await import('@shared/schema');
      
      const invitationSchema = z.object({
        email: z.string().email(),
        fullName: z.string().optional(),
        roles: z.array(z.enum(['admin', 'board_member', 'staff', 'foster', 'volunteer'])).min(1),
      });

      const data = invitationSchema.parse(req.body);
      
      // Create the invitation
      const invitation = await createInvitation(req.tenant!.id, req.user!.id, data);

      // Get inviter name and tenant name for email
      const [inviter] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
      
      // Send invitation email
      await sendInvitationEmail(
        req.tenant!.id,
        invitation,
        inviter.fullName,
        req.tenant!.name
      );

      res.json({
        success: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          fullName: invitation.fullName,
          roles: invitation.roles,
          createdAt: invitation.createdAt,
          expiresAt: invitation.expiresAt,
        },
      });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * GET /api/invitations
   * Get all pending invitations (admin only)
   */
  app.get('/api/invitations', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { getPendingInvitations } = await import('./services/invitations');
      
      const invitations = await getPendingInvitations(req.tenant!.id);

      res.json({
        invitations: invitations.map(({ invitation, inviter }) => ({
          id: invitation.id,
          email: invitation.email,
          fullName: invitation.fullName,
          roles: invitation.roles,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          invitedBy: {
            id: inviter.id,
            fullName: inviter.fullName,
            email: inviter.email,
          },
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/invitations/:id
   * Cancel an invitation (admin only)
   */
  app.delete('/api/invitations/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid invitation ID format' });
      }
      
      const { cancelInvitation } = await import('./services/invitations');
      
      await cancelInvitation(req.params.id, req.tenant!.id);

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/invitations/:id/resend
   * Resend an invitation (admin only)
   */
  app.post('/api/invitations/:id/resend', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid invitation ID format' });
      }
      
      const { resendInvitation, sendInvitationEmail } = await import('./services/invitations');
      const { users } = await import('@shared/schema');
      
      const invitation = await resendInvitation(req.params.id, req.tenant!.id);
      
      // Get inviter name for email
      const [inviter] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
      
      // Send invitation email again
      await sendInvitationEmail(
        req.tenant!.id,
        invitation,
        inviter.fullName,
        req.tenant!.name
      );

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/invitations/verify/:token
   * Verify an invitation token (public route)
   */
  app.get('/api/invitations/verify/:token', async (req, res, next) => {
    try {
      const { getInvitationByToken } = await import('./services/invitations');
      const { tenants } = await import('@shared/schema');
      
      const invitation = await getInvitationByToken(req.params.token);
      
      // Get tenant info
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, invitation.tenantId)).limit(1);

      res.json({
        valid: true,
        invitation: {
          email: invitation.email,
          fullName: invitation.fullName,
          roles: invitation.roles,
          tenant: {
            name: tenant.name,
            subdomain: tenant.subdomain,
          },
        },
      });
    } catch (error: any) {
      res.status(400).json({
        valid: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/invitations/accept
   * Accept an invitation and create user account (public route)
   */
  app.post('/api/invitations/accept', async (req, res, next) => {
    try {
      const { acceptInvitation } = await import('./services/invitations');
      
      const acceptSchema = z.object({
        token: z.string(),
        password: z.string().min(8),
        fullName: z.string().min(1, "Full name is required"),
        phone: z.string().min(1, "Phone number is required"),
        address: z.string().min(1, "Mailing address is required"),
      });

      const data = acceptSchema.parse(req.body);
      
      const { user, invitation } = await acceptInvitation(
        data.token,
        data.password,
        data.fullName,
        data.phone,
        data.address
      );

      // Create session for the new user
      req.session.userId = user.id;
      req.session.tenantId = invitation.tenantId;
      await req.session.save();

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: user.roles,
        },
      });
    } catch (error: any) {
      next(error);
    }
  });

  // ============================================================================
  // Animals Routes
  // ============================================================================

  /**
   * GET /api/animals
   * Get all animals for tenant (public or authenticated)
   */
  app.get('/api/animals', requireTenant, async (req, res, next) => {
    try {
      const { getAnimalsByTenant, getAvailableAnimals } = await import('./services/animals');
      
      // If authenticated, show all animals; otherwise show only available
      const animals = req.user 
        ? await getAnimalsByTenant(req.tenant!.id)
        : await getAvailableAnimals(req.tenant!.id);
      
      res.json({ animals });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:id
   * Get specific animal
   */
  app.get('/api/animals/:id', requireTenant, async (req, res, next) => {
    try {
      // Validate UUID to prevent database errors from bots/crawlers
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { getAnimalById } = await import('./services/animals');
      const animal = await getAnimalById(req.tenant!.id, req.params.id);
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      res.json({ animal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:id/generate-ad-copy
   * Generate Google Ads Grant compliant ad copy for an animal using AI
   */
  app.post('/api/animals/:id/generate-ad-copy', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { getAnimalById } = await import('./services/animals');
      const { generateAdCopy } = await import('./geminiAdCopy');
      
      const animal = await getAnimalById(req.tenant!.id, req.params.id);
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      const adCopy = await generateAdCopy(
        animal.name,
        animal.bio || animal.description || `${animal.name} is a ${animal.species} looking for a forever home.`,
        animal.species
      );
      
      if (!adCopy) {
        return res.status(500).json({ error: 'Failed to generate ad copy' });
      }
      
      res.json({ 
        success: true, 
        adCopy,
        animal: {
          id: animal.id,
          name: animal.name,
          species: animal.species,
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/generate-bio
   * Generate a Petfinder-ready bio for an animal using AI based on personality tags
   * This endpoint works without requiring an existing animal ID (for new animal forms)
   */
  app.post('/api/generate-bio', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { generateAnimalBio } = await import('./services/aiAnimalBio');
      
      // Validate request body with zod
      const generateBioSchema = z.object({
        name: z.string().min(1, 'Animal name is required'),
        species: z.string().min(1, 'Species is required'),
        breed: z.string().optional(),
        age: z.string().optional(),
        sex: z.string().optional(),
        childFriendly: z.boolean().nullable().optional(),
        dogFriendly: z.boolean().nullable().optional(),
        catFriendly: z.boolean().nullable().optional(),
        specialNeeds: z.boolean().nullable().optional(),
        tags: z.array(z.string().min(1)).min(1, 'At least one personality tag is required'),
      });
      
      const parseResult = generateBioSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: parseResult.error.errors[0]?.message || 'Invalid request data'
        });
      }
      
      const { name, species, breed, age, sex, childFriendly, dogFriendly, catFriendly, specialNeeds, tags } = parseResult.data;
      
      const result = await generateAnimalBio(
        {
          name,
          species,
          breed: breed || undefined,
          age: age || undefined,
          sex: sex || undefined,
          childFriendly: childFriendly ?? null,
          dogFriendly: dogFriendly ?? null,
          catFriendly: catFriendly ?? null,
          specialNeeds: specialNeeds ?? null,
        },
        tags
      );
      
      if (!result) {
        return res.status(500).json({ error: 'Failed to generate bio' });
      }
      
      res.json({ 
        success: true, 
        bio: result.bio,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:id/generate-bio
   * Generate a Petfinder-ready bio for an animal using AI based on personality tags
   */
  app.post('/api/animals/:id/generate-bio', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { getAnimalById } = await import('./services/animals');
      const { generateAnimalBio } = await import('./services/aiAnimalBio');
      
      const animal = await getAnimalById(req.tenant!.id, req.params.id);
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      const { tags } = req.body;
      
      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        return res.status(400).json({ error: 'At least one personality tag is required' });
      }
      
      const result = await generateAnimalBio(
        {
          name: animal.name,
          species: animal.species,
          breed: animal.breed || undefined,
          age: animal.age || undefined,
          sex: animal.sex || undefined,
          childFriendly: animal.childFriendly,
          dogFriendly: animal.dogFriendly,
          catFriendly: animal.catFriendly,
          specialNeeds: animal.specialNeeds,
        },
        tags
      );
      
      if (!result) {
        return res.status(500).json({ error: 'Failed to generate bio' });
      }
      
      res.json({ 
        success: true, 
        bio: result.bio,
        animal: {
          id: animal.id,
          name: animal.name,
          species: animal.species,
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:id/foster-history
   * Get foster placement history for a specific animal with foster names and duration
   */
  app.get('/api/animals/:id/foster-history', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { fosterAnimals, users } = await import('@shared/schema');
      
      const fosterHistory = await db
        .select({
          id: fosterAnimals.id,
          animalId: fosterAnimals.animalId,
          fosterId: fosterAnimals.fosterId,
          fosterName: users.fullName,
          fosterEmail: users.email,
          startDate: fosterAnimals.startDate,
          expectedReturnDate: fosterAnimals.expectedReturnDate,
          actualReturnDate: fosterAnimals.actualReturnDate,
          status: fosterAnimals.status,
          notes: fosterAnimals.notes,
          createdAt: fosterAnimals.createdAt,
        })
        .from(fosterAnimals)
        .leftJoin(users, eq(fosterAnimals.fosterId, users.id))
        .where(
          and(
            eq(fosterAnimals.animalId, req.params.id),
            eq(fosterAnimals.tenantId, req.tenant!.id)
          )
        )
        .orderBy(desc(fosterAnimals.startDate));
      
      res.json({ fosterHistory });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:id/supply-requests
   * Get supply requests for a specific animal
   */
  app.get('/api/animals/:id/supply-requests', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { supplyRequests, users } = await import('@shared/schema');
      
      const requests = await db
        .select({
          id: supplyRequests.id,
          fosterId: supplyRequests.fosterId,
          fosterName: users.fullName,
          animalId: supplyRequests.animalId,
          category: supplyRequests.category,
          item: supplyRequests.item,
          quantity: supplyRequests.quantity,
          notes: supplyRequests.notes,
          status: supplyRequests.status,
          archivedAt: supplyRequests.archivedAt,
          createdAt: supplyRequests.createdAt,
          updatedAt: supplyRequests.updatedAt,
        })
        .from(supplyRequests)
        .leftJoin(users, eq(supplyRequests.fosterId, users.id))
        .where(
          and(
            eq(supplyRequests.animalId, req.params.id),
            eq(supplyRequests.tenantId, req.tenant!.id)
          )
        )
        .orderBy(desc(supplyRequests.createdAt));
      
      res.json({ supplyRequests: requests });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:id/foster-updates
   * Get foster updates for a specific animal
   */
  app.get('/api/animals/:id/foster-updates', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { fosterUpdates, users } = await import('@shared/schema');
      
      const updates = await db
        .select({
          id: fosterUpdates.id,
          fosterId: fosterUpdates.fosterId,
          fosterName: users.fullName,
          animalId: fosterUpdates.animalId,
          updateType: fosterUpdates.updateType,
          description: fosterUpdates.description,
          photoUrls: fosterUpdates.photoUrls,
          priority: fosterUpdates.priority,
          status: fosterUpdates.status,
          archivedAt: fosterUpdates.archivedAt,
          createdAt: fosterUpdates.createdAt,
          updatedAt: fosterUpdates.updatedAt,
        })
        .from(fosterUpdates)
        .leftJoin(users, eq(fosterUpdates.fosterId, users.id))
        .where(
          and(
            eq(fosterUpdates.animalId, req.params.id),
            eq(fosterUpdates.tenantId, req.tenant!.id)
          )
        )
        .orderBy(desc(fosterUpdates.createdAt));
      
      res.json({ fosterUpdates: updates });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:id/medical-fund
   * Get medical fund campaign status for an animal
   */
  app.get('/api/animals/:id/medical-fund', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { animals, donationLinks } = await import('@shared/schema');
      
      const animal = await db.query.animals.findFirst({
        where: and(
          eq(animals.id, req.params.id),
          eq(animals.tenantId, req.tenant!.id)
        ),
      });
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      // Check if there's an existing donation link for this animal's medical fund
      const existingLink = await db.query.donationLinks.findFirst({
        where: and(
          eq(donationLinks.tenantId, req.tenant!.id),
          eq(donationLinks.animalId, req.params.id),
          eq(donationLinks.campaignType, 'medical_fund'),
          eq(donationLinks.isActive, true)
        ),
      });
      
      const hasCampaign = !!existingLink;
      // medicalFundGoal/Raised are stored in dollars in the DB, convert to cents for frontend
      const goal = animal.medicalFundGoal ? Math.round(parseFloat(String(animal.medicalFundGoal)) * 100) : null;
      const raised = animal.medicalFundRaised ? Math.round(parseFloat(String(animal.medicalFundRaised)) * 100) : 0;
      
      // Generate QR code if campaign exists
      let qrCodeUrl: string | null = null;
      if (existingLink?.stripePaymentLinkUrl) {
        qrCodeUrl = await QRCode.toDataURL(existingLink.stripePaymentLinkUrl, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
      }
      
      res.json({
        hasCampaign,
        goal,
        raised,
        url: existingLink?.stripePaymentLinkUrl || null,
        qrCodeUrl,
        campaignId: existingLink?.id || null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:id/medical-fund
   * Create a medical fund campaign for an animal
   */
  app.post('/api/animals/:id/medical-fund', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { animals, donationLinks } = await import('@shared/schema');
      const { getPlatformStripeSecretKey, getPlatformFeePercent } = await import('./config/platform');
      const Stripe = (await import('stripe')).default;
      
      const medicalFundSchema = z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        goal: z.number().min(0).nullable().optional(), // Goal amount in dollars
      });
      
      const data = medicalFundSchema.parse(req.body);
      const tenant = req.tenant!;
      
      // Check if animal exists
      const animal = await db.query.animals.findFirst({
        where: and(
          eq(animals.id, req.params.id),
          eq(animals.tenantId, tenant.id)
        ),
      });
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      if (!tenant.stripeConnectedAccountId) {
        return res.status(400).json({ error: 'Stripe Connect is not configured. Please configure Stripe in your organization settings.' });
      }
      
      const platformStripeKey = getPlatformStripeSecretKey();
      if (!platformStripeKey) {
        return res.status(500).json({ error: 'Platform Stripe key not configured.' });
      }
      
      // Check for existing active campaign
      const existingLink = await db.query.donationLinks.findFirst({
        where: and(
          eq(donationLinks.tenantId, tenant.id),
          eq(donationLinks.animalId, req.params.id),
          eq(donationLinks.campaignType, 'medical_fund'),
          eq(donationLinks.isActive, true)
        ),
      });
      
      if (existingLink) {
        return res.status(400).json({ error: 'A medical fund campaign already exists for this animal.' });
      }
      
      const stripe = new Stripe(platformStripeKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      
      const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier as 'free' | 'professional', tenant.platformFeePercent);
      
      const goalInCents = data.goal ? Math.round(data.goal * 100) : null;
      const suggestedAmount = 2500; // $25 default suggestion
      
      const stripeMetadata: Record<string, string> = {
        campaign_type: 'medical_fund',
        pet_id: animal.id,
        pet_name: animal.name,
        tenant_id: tenant.id,
      };
      if (goalInCents) stripeMetadata.goal_amount = String(goalInCents);
      
      const productParams: Stripe.ProductCreateParams = {
        name: data.title,
        description: data.description || `Medical fund campaign for ${animal.name}`,
        metadata: stripeMetadata,
      };
      if (animal.photoUrls && animal.photoUrls.length > 0) {
        productParams.images = [animal.photoUrls[0]];
      }
      
      const product = await stripe.products.create(
        productParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      // Create a one-time price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: suggestedAmount,
        currency: 'usd',
      }, { stripeAccount: tenant.stripeConnectedAccountId });
      
      const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
        line_items: [{ 
          price: price.id, 
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 100 },
        }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
      };
      
      if (platformFeePercent > 0) {
        paymentLinkParams.application_fee_percent = Math.round(platformFeePercent * 100) / 100;
      }
      
      const paymentLink = await stripe.paymentLinks.create(
        paymentLinkParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      // Create donation link record
      const [newLink] = await db.insert(donationLinks).values({
        tenantId: tenant.id,
        title: data.title,
        description: data.description,
        amount: suggestedAmount,
        isRecurring: false,
        campaignType: 'medical_fund',
        animalId: animal.id,
        goalAmount: goalInCents,
        imageUrl: animal.photoUrls?.[0],
        stripeProductId: product.id,
        stripePriceId: price.id,
        stripePaymentLinkId: paymentLink.id,
        stripePaymentLinkUrl: paymentLink.url,
        createdById: req.user!.id,
      }).returning();
      
      // Update animal with medical fund goal (stored in dollars)
      if (data.goal) {
        await db.update(animals)
          .set({ 
            medicalFundGoal: String(data.goal),
            updatedAt: new Date(),
          })
          .where(eq(animals.id, animal.id));
      }
      
      // Generate QR code for the payment link
      const qrCodeUrl = await QRCode.toDataURL(paymentLink.url, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      
      res.json({
        success: true,
        hasCampaign: true,
        goal: goalInCents,
        raised: 0,
        url: paymentLink.url,
        qrCodeUrl,
        campaignId: newLink.id,
      });
    } catch (error: any) {
      console.error('[MEDICAL_FUND] Error creating campaign:', error);
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * POST /api/animals
   * Create new animal (staff only)
   */
  app.post('/api/animals', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { createAnimal } = await import('./services/animals');
      const { insertAnimalSchema } = await import('@shared/schema');
      const { ObjectStorageService } = await import('./objectStorage');
      
      // Convert ISO date strings to Date objects before validation
      const payload = { ...req.body };
      if (payload.dateOfBirth && typeof payload.dateOfBirth === 'string') {
        payload.dateOfBirth = new Date(payload.dateOfBirth);
      }
      if (payload.petfinderSyncedAt && typeof payload.petfinderSyncedAt === 'string') {
        payload.petfinderSyncedAt = new Date(payload.petfinderSyncedAt);
      }
      
      const data = insertAnimalSchema.omit({ tenantId: true }).parse(payload);
      
      if (data.photoUrls && data.photoUrls.length > 0) {
        const objectStorageService = new ObjectStorageService();
        const normalizedPhotoUrls = [];
        
        for (const photoUrl of data.photoUrls) {
          const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
            photoUrl,
            {
              owner: req.session.userId!,
              visibility: "public",
            }
          );
          normalizedPhotoUrls.push(normalizedPath);
        }
        
        data.photoUrls = normalizedPhotoUrls;
      }
      
      const animal = await createAnimal(req.tenant!.id, data);
      
      // Log activity (non-blocking - failures won't affect response)
      try {
        const { logActivity } = await import('./lib/activity-logger');
        await logActivity({
          tenantId: req.tenant!.id,
          userId: req.session.userId,
          entityType: 'Animal',
          entityId: animal.id,
          action: 'created',
          description: `added ${animal.species || 'animal'} "${animal.name}" to the shelter`,
          category: 'intake',
          metadata: { species: animal.species, breed: animal.breed, status: animal.status }
        });
      } catch (logError) {
        console.error('Failed to log animal creation activity:', logError);
      }
      
      res.json({ success: true, animal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/animals/:id
   * Update animal (staff only)
   */
  app.patch('/api/animals/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      // Validate UUID to prevent database errors
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { updateAnimal, getAnimalById } = await import('./services/animals');
      const { ObjectStorageService } = await import('./objectStorage');
      
      // Get the current animal state to detect status changes
      const previousAnimal = await getAnimalById(req.tenant!.id, req.params.id);
      const previousStatus = previousAnimal?.status;
      
      // Convert ISO date strings to Date objects
      const data = { ...req.body };
      if (data.dateOfBirth && typeof data.dateOfBirth === 'string') {
        data.dateOfBirth = new Date(data.dateOfBirth);
      }
      if (data.petfinderSyncedAt && typeof data.petfinderSyncedAt === 'string') {
        data.petfinderSyncedAt = new Date(data.petfinderSyncedAt);
      }
      if (data.nextVaccinationDue && typeof data.nextVaccinationDue === 'string') {
        data.nextVaccinationDue = new Date(data.nextVaccinationDue);
      }
      
      // Normalize photo URLs if provided
      if (data.photoUrls && data.photoUrls.length > 0) {
        const objectStorageService = new ObjectStorageService();
        const normalizedPhotoUrls = [];
        
        for (const photoUrl of data.photoUrls) {
          const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
            photoUrl,
            {
              owner: req.session.userId!,
              visibility: "public",
            }
          );
          normalizedPhotoUrls.push(normalizedPath);
        }
        
        data.photoUrls = normalizedPhotoUrls;
      }
      
      const animal = await updateAnimal(req.tenant!.id, req.params.id, data);
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      // Log activity for significant changes (non-blocking - failures won't affect response)
      try {
        const { logActivity } = await import('./lib/activity-logger');
        const changes: string[] = [];
        if (data.status) changes.push(`status to "${data.status}"`);
        if (data.weight) changes.push(`weight to ${data.weight}`);
        if (data.name) changes.push(`name to "${data.name}"`);
        
        await logActivity({
          tenantId: req.tenant!.id,
          userId: req.session.userId,
          entityType: 'Animal',
          entityId: animal.id,
          action: 'updated',
          description: changes.length > 0 
            ? `updated "${animal.name}": ${changes.join(', ')}`
            : `updated "${animal.name}"`,
          category: data.status === 'foster' || data.status === 'available' ? 'movement' : 'intake',
          metadata: { changes: Object.keys(data) }
        });
      } catch (logError) {
        console.error('Failed to log animal update activity:', logError);
      }
      
      // Send adoption success emails to sponsors when status changes to "adopted"
      if (data.status === 'adopted' && previousStatus !== 'adopted') {
        try {
          const { sendAdoptionSuccessEmails } = await import('./services/adoption-success-emails');
          const goingHomePhoto = data.photoUrls?.[0] || animal.photoUrls?.[0];
          const emailResults = await sendAdoptionSuccessEmails(
            req.tenant!.id,
            animal.id,
            goingHomePhoto
          );
          console.log(`[Adoption Success] Sent ${emailResults.sent} emails for ${animal.name}, failed: ${emailResults.failed}`);
        } catch (emailError) {
          console.error('[Adoption Success] Failed to send sponsor emails:', emailError);
        }
        
        // Create adopter portal account if adopter email is provided
        if (data.adopterEmail && data.adopterName) {
          try {
            const { onboardAdopter } = await import('./services/adopter-onboarding');
            const onboardResult = await onboardAdopter(
              req.tenant!.id,
              animal.id,
              data.adopterEmail,
              data.adopterName,
              data.adoptionDate ? new Date(data.adoptionDate) : new Date()
            );
            console.log(`[Adopter Portal] Onboarded ${data.adopterEmail} for ${animal.name}: ${onboardResult.success ? 'success' : 'failed'}`);
          } catch (onboardError) {
            console.error('[Adopter Portal] Failed to onboard adopter:', onboardError);
          }
        }
      }
      
      res.json({ success: true, animal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/animals/:id/deceased
   * Mark animal as deceased (admin/staff only)
   */
  app.patch('/api/animals/:id/deceased', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { animals } = await import('@shared/schema');
      const { z } = await import('zod');
      
      const markDeceasedSchema = z.object({
        deceasedDate: z.string().transform(str => new Date(str)),
        causeOfDeath: z.enum(['natural_death', 'euthanasia']),
        deceasedNotes: z.string().min(1),
      });

      const data = markDeceasedSchema.parse(req.body);

      const [animal] = await db
        .update(animals)
        .set({
          status: 'deceased',
          deceasedDate: data.deceasedDate,
          causeOfDeath: data.causeOfDeath,
          deceasedNotes: data.deceasedNotes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(animals.id, req.params.id),
            eq(animals.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }

      // If animal was in foster care, update foster status to completed
      const { fosterAnimals } = await import('@shared/schema');
      await db
        .update(fosterAnimals)
        .set({
          status: 'completed',
          actualReturnDate: data.deceasedDate,
          notes: `Animal deceased - ${data.causeOfDeath.replace('_', ' ')}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(fosterAnimals.animalId, req.params.id),
            eq(fosterAnimals.tenantId, req.tenant!.id),
            eq(fosterAnimals.status, 'active')
          )
        );

      res.json({ success: true, animal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/photos/upload
   * Upload animal photos directly (proxied through backend to avoid CORS)
   * Uses Google Drive if configured, otherwise falls back to Replit object storage
   */
  app.post('/api/animals/photos/upload', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const multer = (await import('multer')).default;
      const { TenantFileStorage } = await import('./lib/tenantFileStorage');
      
      // Allowed image extensions (for HEIC/HEIF files that may have incorrect MIME types)
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif', 'bmp', 'ico', 'avif'];
      
      // Configure multer for memory storage
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB
        },
        fileFilter: (_req, file, cb) => {
          // Check MIME type first
          if (file.mimetype.startsWith('image/')) {
            cb(null, true);
          } else {
            // Fallback to extension check for HEIC/HEIF files (often have incorrect MIME types)
            const ext = file.originalname.toLowerCase().split('.').pop();
            if (ext && imageExtensions.includes(ext)) {
              cb(null, true);
            } else {
              cb(new Error('Only image files are allowed'));
            }
          }
        },
      }).array('files', 10); // Accept up to 10 files

      // Process upload
      upload(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ error: 'No files uploaded' });
        }

        try {
          const tenantId = req.tenant!.id;
          const userId = req.session.userId!;
          const storage = await TenantFileStorage.forTenant(tenantId);
          const uploadedPaths: string[] = [];
          
          // Get optional animalId from query params for folder organization
          const animalId = req.query.animalId as string | undefined;
          let animalContext: { id: string; name: string; status: string } | undefined;
          
          if (animalId) {
            const animal = await db.query.animals.findFirst({
              where: and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)),
            });
            if (animal) {
              animalContext = {
                id: animal.id,
                name: animal.name,
                status: animal.status,
              };
            }
          }

          // Upload each file using TenantFileStorage (Google Drive or Replit)
          for (const file of files) {
            let fileBuffer = file.buffer;
            let contentType = file.mimetype;
            
            // Convert HEIC/HEIF to JPEG for browser compatibility
            const ext = file.originalname.toLowerCase().split('.').pop();
            if (ext === 'heic' || ext === 'heif' || file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
              try {
                const heicConvert = (await import('heic-convert')).default;
                const convertedBuffer = await heicConvert({
                  buffer: file.buffer,
                  format: 'JPEG',
                  quality: 0.9
                });
                fileBuffer = Buffer.from(convertedBuffer);
                contentType = 'image/jpeg';
                console.log(`Converted HEIC file to JPEG: ${file.originalname}`);
              } catch (conversionError) {
                console.error('HEIC conversion failed, uploading original:', conversionError);
              }
            }
            
            const result = await storage.uploadFile({
              tenantId,
              userId,
              category: 'animal-photos',
              visibility: 'public',
              fileName: file.originalname,
              mimeType: contentType,
              content: fileBuffer,
              animal: animalContext as any,
            });

            if (result.success) {
              uploadedPaths.push(result.fileUrl);
            } else {
              console.error('Failed to upload file:', result.error);
            }
          }

          res.json({ uploadedPaths });
        } catch (error: any) {
          console.error('Error uploading files:', error);
          return res.status(500).json({ error: 'Failed to upload files' });
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/custom-pages/images/upload
   * Upload custom page images (for use in website builder custom pages)
   * Uses Google Drive if configured, otherwise falls back to Replit object storage
   */
  app.post('/api/custom-pages/images/upload', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const multer = (await import('multer')).default;
      const { TenantFileStorage } = await import('./lib/tenantFileStorage');
      
      // Allowed image extensions (for HEIC/HEIF files that may have incorrect MIME types)
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif', 'bmp', 'ico', 'avif'];
      
      // Configure multer for memory storage
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB
        },
        fileFilter: (_req, file, cb) => {
          // Check MIME type first
          if (file.mimetype.startsWith('image/')) {
            cb(null, true);
          } else {
            // Fallback to extension check for HEIC/HEIF files (often have incorrect MIME types)
            const ext = file.originalname.toLowerCase().split('.').pop();
            if (ext && imageExtensions.includes(ext)) {
              cb(null, true);
            } else {
              cb(new Error('Only image files are allowed'));
            }
          }
        },
      }).array('files', 10); // Accept up to 10 files

      // Process upload
      upload(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ error: 'No files uploaded' });
        }

        try {
          const tenantId = req.tenant!.id;
          const userId = req.session.userId!;
          const storage = await TenantFileStorage.forTenant(tenantId);
          const uploadedPaths: string[] = [];

          // Upload each file using TenantFileStorage (Google Drive or Replit)
          for (const file of files) {
            let fileBuffer = file.buffer;
            let contentType = file.mimetype;
            
            // Convert HEIC/HEIF to JPEG for browser compatibility
            const ext = file.originalname.toLowerCase().split('.').pop();
            if (ext === 'heic' || ext === 'heif' || file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
              try {
                const heicConvert = (await import('heic-convert')).default;
                const convertedBuffer = await heicConvert({
                  buffer: file.buffer,
                  format: 'JPEG',
                  quality: 0.9
                });
                fileBuffer = Buffer.from(convertedBuffer);
                contentType = 'image/jpeg';
                console.log(`Converted HEIC file to JPEG: ${file.originalname}`);
              } catch (conversionError) {
                console.error('HEIC conversion failed, uploading original:', conversionError);
              }
            }
            
            const result = await storage.uploadFile({
              tenantId,
              userId,
              category: 'website-assets',
              visibility: 'public',
              fileName: file.originalname,
              mimeType: contentType,
              content: fileBuffer,
            });

            if (result.success) {
              uploadedPaths.push(result.fileUrl);
            } else {
              console.error('Failed to upload file:', result.error);
            }
          }

          res.json({ uploadedPaths });
        } catch (error: any) {
          console.error('Error uploading custom page images:', error);
          return res.status(500).json({ error: 'Failed to upload images' });
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/animals/:id/photos
   * Update animal photos after upload
   */
  app.put('/api/animals/:id/photos', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { ObjectStorageService } = await import('./objectStorage');
      const { getAnimalById, updateAnimal } = await import('./services/animals');
      
      if (!req.body.photoUrls || !Array.isArray(req.body.photoUrls)) {
        return res.status(400).json({ error: 'photoUrls array is required' });
      }

      const animal = await getAnimalById(req.tenant!.id, req.params.id);
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }

      const objectStorageService = new ObjectStorageService();
      const normalizedPhotoUrls = [];

      for (const photoUrl of req.body.photoUrls) {
        const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
          photoUrl,
          {
            owner: req.session.userId!,
            visibility: "public",
          }
        );
        normalizedPhotoUrls.push(normalizedPath);
      }

      const updatedAnimal = await updateAnimal(req.tenant!.id, req.params.id, {
        photoUrls: normalizedPhotoUrls,
      });

      res.json({ success: true, animal: updatedAnimal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /objects/:objectPath(*)
   * Serve uploaded objects with tenant-scoped access control
   * - Public files are accessible to everyone
   * - Private files require matching tenant ID from session
   */
  app.get('/objects/:objectPath(*)', async (req, res, next) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const { ObjectPermission, getObjectAclPolicy } = await import('./objectAcl');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      
      // Extract tenant ID from path if present (new tenant-scoped paths)
      const pathTenantId = objectStorageService.extractTenantIdFromPath(req.path);
      
      // Get session tenant ID if available
      const sessionTenantId = req.tenant?.id;
      const userId = req.session?.userId;
      
      // Debug: Log ACL info for troubleshooting social media crawler access
      const userAgent = req.get('User-Agent') || '';
      const isCrawler = ['facebookexternalhit', 'Facebot', 'Twitterbot', 'LinkedInBot'].some(
        c => userAgent.toLowerCase().includes(c.toLowerCase())
      );
      if (isCrawler) {
        const aclPolicy = await getObjectAclPolicy(objectFile);
        console.log(`[OBJECT-ACCESS] Crawler request for: ${req.path}`);
        console.log(`[OBJECT-ACCESS] User-Agent: ${userAgent.substring(0, 60)}`);
        console.log(`[OBJECT-ACCESS] ACL Policy: ${JSON.stringify(aclPolicy)}`);
        console.log(`[OBJECT-ACCESS] Session: userId=${userId}, tenantId=${sessionTenantId}`);
      }
      
      // Check if user can access this object
      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId,
        tenantId: sessionTenantId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      
      if (isCrawler) {
        console.log(`[OBJECT-ACCESS] canAccess result: ${canAccess}`);
      }
      
      if (!canAccess) {
        // For tenant-scoped paths, verify the path tenant matches session tenant
        if (pathTenantId && sessionTenantId && pathTenantId !== sessionTenantId) {
          console.log(`[OBJECT-ACCESS] Denied: tenant mismatch path=${pathTenantId} session=${sessionTenantId}`);
          return res.sendStatus(403);
        }
        // If no session and file is private, deny access
        console.log(`[OBJECT-ACCESS] Denied: no session and file is private`);
        return res.sendStatus(403);
      }
      
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error.name === 'ObjectNotFoundError') {
        console.log(`[OBJECT-ACCESS] 404: Object not found at ${req.path}`);
        return res.sendStatus(404);
      }
      next(error);
    }
  });

  // ============================================================================
  // Kennels Routes
  // ============================================================================

  /**
   * GET /api/kennels
   * Get all kennels for tenant (all authenticated users)
   */
  app.get('/api/kennels', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { kennels } = await import('@shared/schema');
      const { eq, asc } = await import('drizzle-orm');
      
      const kennelList = await db
        .select()
        .from(kennels)
        .where(eq(kennels.tenantId, req.tenant!.id))
        .orderBy(asc(kennels.displayOrder), asc(kennels.name));
      
      res.json({ kennels: kennelList });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/kennels
   * Create a new kennel (admin only)
   */
  app.post('/api/kennels', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { kennels, insertKennelSchema } = await import('@shared/schema');
      
      const data = insertKennelSchema.omit({ tenantId: true }).parse(req.body);
      
      const [kennel] = await db
        .insert(kennels)
        .values({
          ...data,
          tenantId: req.tenant!.id,
        })
        .returning();
      
      res.json({ success: true, kennel });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/kennels/bulk
   * Bulk create kennels (admin only)
   */
  app.post('/api/kennels/bulk', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { kennels } = await import('@shared/schema');
      
      const bulkSchema = z.object({
        pattern: z.string().min(1),
        startNumber: z.number().int().min(1),
        endNumber: z.number().int().min(1),
        startDisplayOrder: z.number().int().min(0),
      });

      const data = bulkSchema.parse(req.body);

      if (data.endNumber < data.startNumber) {
        return res.status(400).json({ 
          error: 'Invalid range', 
          message: 'End number must be greater than or equal to start number' 
        });
      }

      const totalCount = data.endNumber - data.startNumber + 1;

      if (totalCount > 500) {
        return res.status(400).json({ 
          error: 'Too many kennels', 
          message: 'Cannot create more than 500 kennels at once' 
        });
      }

      // Generate kennels to insert
      const kennelsToInsert = [];
      for (let i = data.startNumber; i <= data.endNumber; i++) {
        const name = data.pattern.replace('{number}', i.toString());
        const displayOrder = data.startDisplayOrder + (i - data.startNumber);
        
        kennelsToInsert.push({
          tenantId: req.tenant!.id,
          name,
          displayOrder,
          isActive: true,
        });
      }

      // Bulk insert
      const created = await db
        .insert(kennels)
        .values(kennelsToInsert)
        .returning();
      
      res.json({ 
        success: true, 
        created: created.length,
        kennels: created 
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/kennels/:id
   * Update a kennel (admin only)
   */
  app.patch('/api/kennels/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid kennel ID format' });
      }
      
      const { kennels } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      // Strict validation - only allow updating specific fields
      const updateSchema = z.object({
        name: z.string().min(1).max(200).optional(),
        rowLabel: z.string().max(50).optional().nullable(),
        kennelNumber: z.string().max(50).optional().nullable(),
        gridRow: z.coerce.number().int().min(0).optional().nullable(),
        gridColumn: z.coerce.number().int().min(0).optional().nullable(),
        displayOrder: z.coerce.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      });

      const data = updateSchema.parse(req.body);
      
      const [kennel] = await db
        .update(kennels)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(kennels.id, req.params.id),
            eq(kennels.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!kennel) {
        return res.status(404).json({ error: 'Kennel not found' });
      }
      
      res.json({ success: true, kennel });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/kennels/bulk-position
   * Bulk update kennel grid positions (admin only) - for drag-and-drop layout
   */
  app.post('/api/kennels/bulk-position', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { kennels } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const bulkPositionSchema = z.object({
        updates: z.array(z.object({
          id: z.string().uuid(),
          gridRow: z.number().int().min(0).nullable(),
          gridColumn: z.number().int().min(0).nullable(),
        })),
      });

      const { updates } = bulkPositionSchema.parse(req.body);

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      if (updates.length > 500) {
        return res.status(400).json({ 
          error: 'Too many updates', 
          message: 'Cannot update more than 500 kennels at once' 
        });
      }

      // Validate no duplicate grid positions (except for null positions)
      const positionMap = new Map<string, string>();
      for (const update of updates) {
        if (update.gridRow !== null && update.gridColumn !== null) {
          const posKey = `${update.gridRow},${update.gridColumn}`;
          if (positionMap.has(posKey)) {
            return res.status(400).json({
              error: 'Duplicate positions',
              message: `Multiple kennels cannot occupy the same grid position (${update.gridRow}, ${update.gridColumn})`
            });
          }
          positionMap.set(posKey, update.id);
        }
      }

      // Execute updates sequentially to avoid race conditions
      const updatedKennels = [];
      for (const { id, gridRow, gridColumn } of updates) {
        const [updated] = await db
          .update(kennels)
          .set({
            gridRow,
            gridColumn,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(kennels.id, id),
              eq(kennels.tenantId, req.tenant!.id)
            )
          )
          .returning();
        
        if (updated) {
          updatedKennels.push(updated);
        }
      }
      
      res.json({ 
        success: true, 
        updated: updatedKennels.length,
        kennels: updatedKennels
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/kennels/bulk-labels
   * Bulk update kennel row labels and numbers (admin only) - for auto-numbering
   */
  app.post('/api/kennels/bulk-labels', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { kennels } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const bulkLabelsSchema = z.object({
        updates: z.array(z.object({
          id: z.string().uuid(),
          rowLabel: z.string().max(50).nullable().optional(),
          kennelNumber: z.string().max(50).nullable().optional(),
        })),
      });

      const { updates } = bulkLabelsSchema.parse(req.body);

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      if (updates.length > 500) {
        return res.status(400).json({ 
          error: 'Too many updates', 
          message: 'Cannot update more than 500 kennels at once' 
        });
      }

      // Execute updates
      const updatedKennels = [];
      for (const { id, rowLabel, kennelNumber } of updates) {
        const updateData: any = { updatedAt: new Date() };
        
        if (rowLabel !== undefined) {
          updateData.rowLabel = rowLabel;
        }
        if (kennelNumber !== undefined) {
          updateData.kennelNumber = kennelNumber;
        }

        const [updated] = await db
          .update(kennels)
          .set(updateData)
          .where(
            and(
              eq(kennels.id, id),
              eq(kennels.tenantId, req.tenant!.id)
            )
          )
          .returning();
        
        if (updated) {
          updatedKennels.push(updated);
        }
      }
      
      res.json({ 
        success: true, 
        updated: updatedKennels.length,
        kennels: updatedKennels
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/kennels/:id
   * Delete a kennel (admin only)
   */
  app.delete('/api/kennels/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid kennel ID format' });
      }
      
      const { kennels } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const [kennel] = await db
        .delete(kennels)
        .where(
          and(
            eq(kennels.id, req.params.id),
            eq(kennels.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!kennel) {
        return res.status(404).json({ error: 'Kennel not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Kennel Buildings Routes (New Building/Row System)
  // ============================================================================

  /**
   * GET /api/kennel-buildings
   * Get all kennel buildings with their rows for current tenant
   */
  app.get('/api/kennel-buildings', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { kennelBuildings, kennelRows } = await import('@shared/schema');
      const { eq, asc } = await import('drizzle-orm');
      
      // Get all buildings for tenant
      const buildings = await db
        .select()
        .from(kennelBuildings)
        .where(eq(kennelBuildings.tenantId, req.tenant!.id))
        .orderBy(asc(kennelBuildings.displayOrder), asc(kennelBuildings.createdAt));
      
      // Get all rows for all buildings
      const rows = await db
        .select()
        .from(kennelRows)
        .where(eq(kennelRows.tenantId, req.tenant!.id))
        .orderBy(asc(kennelRows.displayOrder), asc(kennelRows.createdAt));
      
      // Group rows by buildingId
      const buildingsWithRows = buildings.map(building => ({
        ...building,
        rows: rows.filter(row => row.buildingId === building.id)
      }));
      
      res.json(buildingsWithRows);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/kennel-buildings
   * Create a new kennel building (admin only)
   */
  app.post('/api/kennel-buildings', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { kennelBuildings, insertKennelBuildingSchema } = await import('@shared/schema');
      
      const data = insertKennelBuildingSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id
      });
      
      const [building] = await db
        .insert(kennelBuildings)
        .values(data)
        .returning();
      
      res.json({ ...building, rows: [] }); // Return with empty rows array
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/kennel-buildings/:id
   * Update a kennel building (admin only)
   */
  app.patch('/api/kennel-buildings/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid building ID format' });
      }
      
      const { kennelBuildings } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { z } = await import('zod');
      
      // Validate input
      const updateSchema = z.object({
        name: z.string().optional(),
        displayOrder: z.number().optional(),
      });
      
      const { name, displayOrder } = updateSchema.parse(req.body);
      const updateData: any = {};
      
      if (name !== undefined) updateData.name = name;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      updateData.updatedAt = new Date();
      
      const [building] = await db
        .update(kennelBuildings)
        .set(updateData)
        .where(
          and(
            eq(kennelBuildings.id, req.params.id),
            eq(kennelBuildings.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!building) {
        return res.status(404).json({ error: 'Building not found' });
      }
      
      res.json(building);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/kennel-buildings/:id
   * Delete a kennel building (admin only)
   * Note: This will also delete all rows in the building via cascade
   */
  app.delete('/api/kennel-buildings/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid building ID format' });
      }
      
      const { kennelBuildings } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const [building] = await db
        .delete(kennelBuildings)
        .where(
          and(
            eq(kennelBuildings.id, req.params.id),
            eq(kennelBuildings.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!building) {
        return res.status(404).json({ error: 'Building not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Kennel Rows Routes
  // ============================================================================

  /**
   * POST /api/kennel-rows
   * Create a new kennel row within a building (admin only)
   */
  app.post('/api/kennel-rows', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { kennelRows, insertKennelRowSchema } = await import('@shared/schema');
      
      const data = insertKennelRowSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id
      });
      
      const [row] = await db
        .insert(kennelRows)
        .values(data)
        .returning();
      
      res.json(row);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/kennel-rows/:id
   * Update a kennel row (admin only)
   */
  app.patch('/api/kennel-rows/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid row ID format' });
      }
      
      const { kennelRows } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { z } = await import('zod');
      
      // Validate input
      const updateSchema = z.object({
        name: z.string().optional(),
        capacity: z.number().min(1).max(100).optional(),
        type: z.enum(['standard', 'isolation', 'puppy', 'cat']).optional(),
        displayOrder: z.number().optional(),
      });
      
      const { name, capacity, type, displayOrder } = updateSchema.parse(req.body);
      const updateData: any = {};
      
      if (name !== undefined) updateData.name = name;
      if (capacity !== undefined) updateData.capacity = capacity;
      if (type !== undefined) updateData.type = type;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      updateData.updatedAt = new Date();
      
      const [row] = await db
        .update(kennelRows)
        .set(updateData)
        .where(
          and(
            eq(kennelRows.id, req.params.id),
            eq(kennelRows.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!row) {
        return res.status(404).json({ error: 'Row not found' });
      }
      
      res.json(row);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/kennel-rows/:id
   * Delete a kennel row (admin only)
   */
  app.delete('/api/kennel-rows/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid row ID format' });
      }
      
      const { kennelRows, animals } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      // Clear any animals assigned to this row
      await db
        .update(animals)
        .set({
          kennelRowId: null,
          kennelBuildingId: null,
          kennelPosition: null,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(animals.kennelRowId, req.params.id),
            eq(animals.tenantId, req.tenant!.id)
          )
        );
      
      // Delete the row
      const [row] = await db
        .delete(kennelRows)
        .where(
          and(
            eq(kennelRows.id, req.params.id),
            eq(kennelRows.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!row) {
        return res.status(404).json({ error: 'Row not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/kennel-occupancy
   * Get current kennel occupancy (which animals are in which kennels)
   */
  app.get('/api/kennel-occupancy', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { animals } = await import('@shared/schema');
      const { eq, and, isNotNull } = await import('drizzle-orm');
      
      // Get all animals that are assigned to kennels (have buildingId, rowId, and position)
      const occupiedKennels = await db
        .select({
          id: animals.id,
          name: animals.name,
          animalId: animals.animalId,
          species: animals.species,
          buildingId: animals.kennelBuildingId,
          rowId: animals.kennelRowId,
          position: animals.kennelPosition,
          status: animals.status,
          medicalAlertMemo: animals.medicalAlertMemo
        })
        .from(animals)
        .where(
          and(
            eq(animals.tenantId, req.tenant!.id),
            isNotNull(animals.kennelBuildingId),
            isNotNull(animals.kennelRowId),
            isNotNull(animals.kennelPosition)
          )
        );
      
      res.json(occupiedKennels);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/animals/:id/kennel-assignment
   * Assign an animal to a specific kennel position
   */
  app.patch('/api/animals/:id/kennel-assignment', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid animal ID format' });
      }
      
      const { animals } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { z } = await import('zod');
      
      // Validate input - either all null or all provided
      const assignmentSchema = z.object({
        buildingId: z.string().uuid().nullable(),
        rowId: z.string().uuid().nullable(),
        position: z.number().min(0).nullable(),
      });
      
      const { buildingId, rowId, position } = assignmentSchema.parse(req.body);
      
      // Validate that all fields are provided or all are null (to clear assignment)
      const isClearing = buildingId === null && rowId === null && position === null;
      const isAssigning = buildingId && rowId && position !== undefined && position !== null;
      
      if (!isClearing && !isAssigning) {
        return res.status(400).json({ 
          error: 'Must provide buildingId, rowId, and position to assign, or all null to clear' 
        });
      }
      
      const [animal] = await db
        .update(animals)
        .set({
          kennelBuildingId: buildingId,
          kennelRowId: rowId,
          kennelPosition: position,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(animals.id, req.params.id),
            eq(animals.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      res.json(animal);
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Animal Notes Routes
  // ============================================================================

  /**
   * GET /api/animals/:animalId/notes
   * Get all notes for a specific animal
   */
  app.get('/api/animals/:animalId/notes', requireTenant, requireAuth, requireRole('admin', 'staff', 'volunteer'), async (req, res, next) => {
    try {
      const { animalNotes, users } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const notes = await db
        .select({
          id: animalNotes.id,
          animalId: animalNotes.animalId,
          noteText: animalNotes.noteText,
          createdAt: animalNotes.createdAt,
          updatedAt: animalNotes.updatedAt,
          userId: animalNotes.userId,
          user: {
            fullName: users.fullName,
            email: users.email,
          }
        })
        .from(animalNotes)
        .leftJoin(users, eq(animalNotes.userId, users.id))
        .where(
          and(
            eq(animalNotes.tenantId, req.tenant!.id),
            eq(animalNotes.animalId, req.params.animalId)
          )
        )
        .orderBy(animalNotes.createdAt);
      
      res.json({ notes });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:animalId/notes
   * Create a new note for an animal
   */
  app.post('/api/animals/:animalId/notes', requireTenant, requireAuth, requireRole('admin', 'staff', 'volunteer'), async (req, res, next) => {
    try {
      const { animalNotes, insertAnimalNoteSchema } = await import('@shared/schema');
      
      const data = insertAnimalNoteSchema.omit({ tenantId: true }).parse({
        ...req.body,
        animalId: req.params.animalId,
        userId: req.session.userId,
      });
      
      const [note] = await db
        .insert(animalNotes)
        .values({
          ...data,
          tenantId: req.tenant!.id,
        })
        .returning();
      
      res.json({ success: true, note });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/animal-notes/:id
   * Update an existing animal note
   */
  app.patch('/api/animal-notes/:id', requireTenant, requireAuth, requireRole('admin', 'staff', 'volunteer'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid note ID format' });
      }
      
      const { animalNotes } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const updateData = {
        noteText: req.body.noteText,
        updatedAt: new Date(),
      };
      
      const [note] = await db
        .update(animalNotes)
        .set(updateData)
        .where(
          and(
            eq(animalNotes.id, req.params.id),
            eq(animalNotes.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }
      
      res.json({ success: true, note });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/animal-notes/:id
   * Delete an animal note
   */
  app.delete('/api/animal-notes/:id', requireTenant, requireAuth, requireRole('admin', 'staff', 'volunteer'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid note ID format' });
      }
      
      const { animalNotes } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const [note] = await db
        .delete(animalNotes)
        .where(
          and(
            eq(animalNotes.id, req.params.id),
            eq(animalNotes.tenantId, req.tenant!.id)
          )
        )
        .returning();
      
      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Applications Routes
  // ============================================================================

  /**
   * GET /api/applications
   * Get all applications with optional filtering by animalId or stage (staff only)
   */
  app.get('/api/applications', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { animalId, stage } = req.query;
      
      // If filtering by animalId, use direct query with filter
      if (animalId && typeof animalId === 'string') {
        const { applications } = await import('@shared/schema');
        const conditions = [eq(applications.tenantId, req.tenant!.id), eq(applications.animalId, animalId)];
        
        if (stage && typeof stage === 'string') {
          conditions.push(eq(applications.stage, stage as any));
        }
        
        const applicationsList = await db
          .select()
          .from(applications)
          .where(and(...conditions));
        
        return res.json({ applications: applicationsList });
      }
      
      // Otherwise return all applications
      const { getApplicationsByTenant } = await import('./services/applications');
      const applicationsList = await getApplicationsByTenant(req.tenant!.id);
      
      res.json({ applications: applicationsList });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/applications/:id
   * Get a single application by ID with full details (staff only)
   */
  app.get('/api/applications/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid application ID format' });
      }
      
      const { getApplicationById } = await import('./services/applications');
      const application = await getApplicationById(req.tenant!.id, req.params.id);
      
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }
      
      res.json({ application });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/applications
   * Submit adoption application (public)
   * Supports Google Ads conversion tracking via gclid parameter
   */
  app.post('/api/applications', requireTenant, async (req, res, next) => {
    try {
      const { createApplication } = await import('./services/applications');
      const { insertApplicationSchema, animals, inboundEmails } = await import('@shared/schema');
      
      const { gclid, ...applicationData } = req.body;
      const data = insertApplicationSchema.omit({ tenantId: true }).parse({
        ...applicationData,
        gclid: gclid || null,
        gclidCapturedAt: gclid ? new Date() : null,
      });
      
      const application = await createApplication(req.tenant!.id, data);
      
      // Get animal name for notifications
      let animalName = 'Unknown Animal';
      try {
        const [animal] = await db
          .select({ name: animals.name })
          .from(animals)
          .where(eq(animals.id, data.animalId))
          .limit(1);
        if (animal) {
          animalName = animal.name;
        }
      } catch (err) {
        console.error('Failed to fetch animal name for notification:', err);
      }
      
      // Create inbox notification (like foster/volunteer/surrender)
      try {
        const emailSubject = `New Adoption Application from ${data.applicantName}`;
        const emailBody = `
Adoption Application Received

Animal: ${animalName}

Applicant Information:
Name: ${data.applicantName}
Email: ${data.applicantEmail}
Phone: ${data.applicantPhone || 'Not provided'}
Address: ${data.address || 'Not provided'}

Additional Information:
${data.notes || 'None provided'}

Application ID: ${application.id}
Submitted: ${new Date().toLocaleString()}
        `.trim();

        await db.insert(inboundEmails).values({
          tenantId: req.tenant!.id,
          messageId: `adoption-app-${application.id}`,
          from: data.applicantEmail,
          fromName: data.applicantName,
          to: `${req.tenant!.subdomain}@mail.irescue.life`,
          subject: emailSubject,
          textBody: emailBody,
          htmlBody: emailBody.replace(/\n/g, '<br>'),
          status: 'unprocessed',
        });
      } catch (error) {
        console.error('Failed to create inbound email record:', error);
      }
      
      // Send email notification to staff if enabled
      try {
        const { sendFormSubmissionNotification } = await import('./services/form-notifications');
        await sendFormSubmissionNotification({
          formType: 'adoption',
          tenantId: req.tenant!.id,
          applicantName: data.applicantName,
          applicantEmail: data.applicantEmail,
          applicantPhone: data.applicantPhone,
          applicationId: application.id,
          animalName,
        });
      } catch (error) {
        console.error('Failed to send form notification email:', error);
      }

      // Send confirmation email to applicant
      try {
        const { EmailService } = await import('./lib/email-service');
        const emailService = await EmailService.forTenant(req.tenant!.id);
        
        if (emailService && data.applicantEmail) {
          const safeApplicantName = escapeHtml(data.applicantName);
          const safeTenantName = escapeHtml(req.tenant!.name);
          const safeAnimalName = escapeHtml(animalName);
          const dateFormatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

          await emailService.send({
            to: data.applicantEmail,
            subject: `Thank you for your adoption application for ${safeAnimalName} - ${safeTenantName}`,
            html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Thank You, ${safeApplicantName}!</h2>
  
  <p>We've received your adoption application for <strong>${safeAnimalName}</strong>. Thank you for considering adoption!</p>
  
  <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Application Type:</strong> Adoption</p>
    <p style="margin: 5px 0;"><strong>Animal:</strong> ${safeAnimalName}</p>
    <p style="margin: 5px 0;"><strong>Date Submitted:</strong> ${dateFormatted}</p>
    <p style="margin: 5px 0;"><strong>Reference ID:</strong> ${application.id.slice(0, 8).toUpperCase()}</p>
  </div>
  
  <h3 style="color: #374151;">What Happens Next?</h3>
  <p>Our adoption team will review your application and reach out to you within 3-5 business days. This may include a phone interview, reference checks, or a meet-and-greet with ${safeAnimalName}.</p>
  
  <p>In the meantime, if you have any questions about ${safeAnimalName} or the adoption process, please don't hesitate to reach out to us.</p>
  
  <p>Thank you for choosing adoption!</p>
  
  <p>With gratitude,<br/>
  <strong>The ${safeTenantName} Team</strong></p>
</div>
            `.trim()
          });
          console.log(`[Application] Adoption confirmation email sent to ${data.applicantEmail} for ${animalName}`);
        }
      } catch (emailError) {
        console.error('Failed to send adoption application confirmation email:', emailError);
        // Don't fail the application submission if email fails
      }
      
      if (gclid && application) {
        try {
          const { uploadConversionToGoogleAds } = await import('./googleAds');
          const conversionResult = await uploadConversionToGoogleAds(
            req.tenant!.id,
            application.id,
            gclid
          );
          if (!conversionResult.success) {
            console.log('Google Ads conversion upload skipped or failed:', conversionResult.error);
          }
        } catch (conversionError) {
          console.error('Error uploading Google Ads conversion:', conversionError);
        }
      }
      
      res.json({ success: true, application });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/applications/:id/stage
   * Update application stage (staff only)
   */
  app.patch('/api/applications/:id/stage', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid application ID format' });
      }
      
      const { updateApplicationStage } = await import('./services/applications');
      const stageSchema = z.object({ stage: z.enum(['new', 'screening', 'vet_check', 'home_visit', 'approved', 'denied', 'adopted']) });
      
      const { stage } = stageSchema.parse(req.body);
      const application = await updateApplicationStage(req.tenant!.id, req.params.id, stage);
      
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }
      
      res.json({ success: true, application });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/applications/approve-and-send
   * Approve an application and optionally create checkout session + send contract for e-signature
   * This is the automated adoption workflow trigger
   */
  app.post('/api/applications/approve-and-send', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { updateApplicationStage, getApplicationById } = await import('./services/applications');
      const { createCheckoutSession, sendCheckoutLink } = await import('./services/adoption-checkout');
      const { adoptionCheckoutSessions } = await import('@shared/schema');
      
      const approveSchema = z.object({
        applicationId: z.string().uuid(),
        sendContract: z.boolean().default(false),
        baseFee: z.string().optional(),
        waiveFee: z.boolean().default(false),
        grantId: z.string().uuid().optional().nullable(),
        contractTemplateId: z.string().optional().nullable(),
        vetAppointmentDate: z.string().optional().nullable(),
        spayNeuterDate: z.string().optional().nullable(),
      });
      
      const { applicationId, sendContract, baseFee, waiveFee, grantId, contractTemplateId, vetAppointmentDate, spayNeuterDate } = approveSchema.parse(req.body);
      
      // Get the application details
      const application = await getApplicationById(req.tenant!.id, applicationId);
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }
      
      // Validate contract template if sending contract
      let parsedTemplateId: number | undefined;
      if (sendContract) {
        // Validate that contractTemplateId is provided and is a valid positive integer
        if (!contractTemplateId || contractTemplateId.trim() === '') {
          return res.status(400).json({ 
            error: 'Contract template required', 
            message: 'A contract template must be selected to send an agreement' 
          });
        }
        
        parsedTemplateId = parseInt(contractTemplateId, 10);
        if (isNaN(parsedTemplateId) || parsedTemplateId <= 0) {
          return res.status(400).json({ 
            error: 'Invalid contract template', 
            message: 'Please select a valid contract template' 
          });
        }
      }
      
      // Update application stage to approved
      const updatedApplication = await updateApplicationStage(req.tenant!.id, applicationId, 'approved');
      if (!updatedApplication) {
        return res.status(500).json({ error: 'Failed to update application status' });
      }
      
      let contractSent = false;
      let checkoutSession = null;
      
      // If sendContract is true, create checkout session and send contract email
      if (sendContract && parsedTemplateId) {
        // Create checkout session - this generates and stores the secure token
        const sessionResult = await createCheckoutSession(req.tenant!.id, {
          applicationId,
          animalId: application.animalId,
          staffInitiatedBy: req.user!.id,
          baseFee: waiveFee ? '0' : (baseFee || '200'),
          waiveFee,
          grantId: grantId || undefined,
          contractTemplateId: parsedTemplateId,
          vetAppointmentDate: vetAppointmentDate || undefined,
          spayNeuterDate: spayNeuterDate || undefined,
        });
        
        checkoutSession = sessionResult.session;
        // Use the token returned by createCheckoutSession - it matches the stored hash
        const token = sessionResult.token;
        
        // Update session status to awaiting_signature
        await db
          .update(adoptionCheckoutSessions)
          .set({
            status: 'awaiting_signature',
            updatedAt: new Date(),
          })
          .where(eq(adoptionCheckoutSessions.id, checkoutSession.id));
        
        // Send the checkout link email
        await sendCheckoutLink(checkoutSession.id, token, 'email');
        
        contractSent = true;
      }
      
      res.json({ 
        success: true, 
        application: updatedApplication,
        contractSent,
        checkoutSession: checkoutSession ? { id: checkoutSession.id } : null,
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Adoption Checkout Routes - Smart Adoption Workflow
  // ============================================================================

  /**
   * POST /api/adoptions/checkouts
   * Create a new adoption checkout session (staff only)
   */
  app.post('/api/adoptions/checkouts', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { createCheckoutSession } = await import('./services/adoption-checkout');
      
      const sessionSchema = z.object({
        applicationId: z.string().uuid(),
        animalId: z.string().uuid(),
        adopterContactId: z.string().uuid().optional(),
        grantId: z.string().uuid().optional(),
        contractTemplateId: z.string().optional(),
        baseFee: z.string(),
        donationBoost: z.string().optional(),
        coverFees: z.boolean().optional(),
        processor: z.enum(['stripe']).optional(),
        vetAppointmentDate: z.string().optional(),
        spayNeuterDate: z.string().optional(),
      });

      const data = sessionSchema.parse(req.body);
      
      // Security: Validate grantId belongs to this tenant if provided
      if (data.grantId) {
        const { grants } = await import('@shared/schema');
        const [grant] = await db
          .select()
          .from(grants)
          .where(and(
            eq(grants.id, data.grantId),
            eq(grants.tenantId, req.tenant!.id)
          ))
          .limit(1);
        
        if (!grant) {
          return res.status(400).json({ error: 'Grant not found or does not belong to this organization' });
        }
      }
      
      const result = await createCheckoutSession(req.tenant!.id, {
        ...data,
        contractTemplateId: data.contractTemplateId ? parseInt(data.contractTemplateId) : undefined,
        staffInitiatedBy: req.user!.id,
      });

      res.json({
        success: true,
        session: result.session,
        token: result.token,
      });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * GET /api/adoptions/checkouts
   * List all checkout sessions (staff only)
   */
  app.get('/api/adoptions/checkouts', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { listCheckoutSessions } = await import('./services/adoption-checkout');
      const sessions = await listCheckoutSessions(req.tenant!.id);
      res.json({ sessions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/adoptions/checkouts/:id
   * Get checkout session details (staff only)
   */
  app.get('/api/adoptions/checkouts/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid checkout ID format' });
      }
      
      const { getCheckoutSession } = await import('./services/adoption-checkout');
      const session = await getCheckoutSession(req.tenant!.id, req.params.id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ session });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/adoptions/checkouts/:id
   * Update checkout session (staff only)
   */
  app.patch('/api/adoptions/checkouts/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid checkout ID format' });
      }
      
      const { updateCheckoutSession } = await import('./services/adoption-checkout');
      
      const updateSchema = z.object({
        baseFee: z.string().optional(),
        donationBoost: z.string().optional(),
        coverFees: z.boolean().optional(),
        grantId: z.string().uuid().optional(),
        processor: z.enum(['stripe']).optional(),
      });

      const updates = updateSchema.parse(req.body);
      const session = await updateCheckoutSession(req.tenant!.id, req.params.id, updates);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ success: true, session });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * POST /api/adoptions/checkouts/:id/send-link
   * Send checkout link to adopter (staff only, rate limited)
   */
  app.post('/api/adoptions/checkouts/:id/send-link', requireTenant, requireAuth, requireRole('admin', 'staff'), emailLimiter, async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid checkout ID format' });
      }
      
      const { getCheckoutSession, sendCheckoutLink, generateSecureToken, hashToken } = await import('./services/adoption-checkout');
      const { adoptionCheckoutSessions } = await import('@shared/schema');
      
      const methodSchema = z.object({
        method: z.enum(['email', 'sms']).optional().default('email'),
      });

      const { method } = methodSchema.parse(req.body);
      const session = await getCheckoutSession(req.tenant!.id, req.params.id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Generate a new token for this send (more secure than reusing)
      const token = generateSecureToken();
      const tokenHash = await hashToken(token);

      // Update session with new token hash
      await db
        .update(adoptionCheckoutSessions)
        .set({
          secureTokenHash: tokenHash,
          updatedAt: new Date(),
        })
        .where(eq(adoptionCheckoutSessions.id, req.params.id));

      await sendCheckoutLink(req.params.id, token, method);

      res.json({ success: true, message: 'Checkout link sent successfully' });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * POST /api/adoptions/checkouts/:id/cancel
   * Cancel a checkout session (staff only)
   */
  app.post('/api/adoptions/checkouts/:id/cancel', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid checkout ID format' });
      }
      
      const { cancelCheckoutSession } = await import('./services/adoption-checkout');
      const session = await cancelCheckoutSession(req.tenant!.id, req.params.id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ success: true, session });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/adoptions/checkouts/:id/offline-payment
   * Record an offline payment (cash, check, etc.) to bypass Stripe (staff only)
   * Used when adopter pays with non-digital methods
   */
  app.post('/api/adoptions/checkouts/:id/offline-payment', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid checkout ID format' });
      }
      
      const { recordOfflinePayment, finalizeAdoption, getCheckoutSession } = await import('./services/adoption-checkout');
      
      const offlinePaymentSchema = z.object({
        paymentMethod: z.enum(['cash', 'check', 'money_order', 'other']),
        amount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, 'Amount must be positive'),
        referenceNumber: z.string().optional(),
        notes: z.string().optional(),
      });

      const paymentData = offlinePaymentSchema.parse(req.body);

      const payment = await recordOfflinePayment(req.tenant!.id, req.params.id, {
        ...paymentData,
        recordedBy: req.user!.id,
      });

      await finalizeAdoption(req.params.id);

      const updatedSession = await getCheckoutSession(req.tenant!.id, req.params.id);

      res.json({ 
        success: true, 
        message: 'Offline payment recorded and adoption finalized',
        payment,
        session: updatedSession,
      });
    } catch (error: any) {
      next(error);
    }
  });

  // ============================================================================
  // Public Adoption Checkout Routes (Token-Protected)
  // ============================================================================

  /**
   * GET /api/public/adoption-checkouts/:token
   * Get session info for adopter (public, token-protected)
   */
  app.get('/api/public/adoption-checkouts/:token', async (req, res, next) => {
    try {
      const { getCheckoutSessionByToken } = await import('./services/adoption-checkout');
      const { animals, applications, tenants } = await import('@shared/schema');
      const { getPlatformFeePercent, STRIPE_PROCESSING_FEE_PERCENT, STRIPE_PROCESSING_FEE_FIXED_CENTS } = await import('./config/platform');
      
      const session = await getCheckoutSessionByToken(req.params.token);

      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
      }

      // Fetch related data for display
      const [animal] = await db
        .select()
        .from(animals)
        .where(eq(animals.id, session.animalId))
        .limit(1);

      const [application] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, session.applicationId))
        .limit(1);

      // Fetch tenant settings for fee display
      const [tenant] = await db
        .select({
          subscriptionTier: tenants.subscriptionTier,
          passFeesToAdopter: tenants.passFeesToAdopter,
          requireSpayNeuterContract: tenants.requireSpayNeuterContract,
          name: tenants.name,
          platformFeePercent: tenants.platformFeePercent,
        })
        .from(tenants)
        .where(eq(tenants.id, session.tenantId))
        .limit(1);

      // Fetch contract template if selected
      let contractData: { html: string; name: string } | null = null;
      if (session.contractTemplateId) {
        const { adoptionContractTemplates } = await import('@shared/schema');
        const DOMPurify = (await import('isomorphic-dompurify')).default;
        const [template] = await db
          .select()
          .from(adoptionContractTemplates)
          .where(eq(adoptionContractTemplates.id, session.contractTemplateId))
          .limit(1);
        
        if (template) {
          // Calculate totals for display in contract
          // Note: Contract shows baseFee + donation (what the adopter pays to the rescue)
          // NOT the payment total with processing fees (which goes to Stripe)
          const donationAmount = parseFloat(session.donationBoost?.toString() || '0');
          const baseFee = parseFloat(session.baseFee?.toString() || '0');
          const totalAmount = baseFee + donationAmount;
          
          // Parse adopter name into first/last components
          const fullName = application?.applicantName || '';
          const nameParts = fullName.trim().split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
          
          // Format commitment dates for display
          const formatDate = (dateStr: string | null | undefined): string => {
            if (!dateStr) return '';
            try {
              return new Date(dateStr).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });
            } catch {
              return dateStr;
            }
          };
          
          // Check if animal is already spayed/neutered
          const isAlreadyAltered = animal?.neuterStatus === 'spayed' || animal?.neuterStatus === 'neutered';
          const spayNeuterDisplay = isAlreadyAltered 
            ? 'N/A (Already spayed/neutered)' 
            : formatDate(session.spayNeuterDate);
          
          // Helper to create highlighted editable field span
          const editableField = (fieldName: string, placeholder: string) => 
            `<span class="merge-field-editable" data-field="${fieldName}" style="background-color: #fff3cd; padding: 1px 4px; border-radius: 2px;">${placeholder}</span>`;
          
          // Replace merge fields with actual data
          const mergeFieldValues: Record<string, string> = {
            // Adopter info - legacy fields
            '{{adopter_name}}': fullName,
            '{{adopter_email}}': application?.applicantEmail || '',
            '{{adopter_phone}}': application?.applicantPhone || '',
            '{{adopter_address}}': application?.applicantAddress || '',
            // Adopter info - component fields
            '{{adopter_first_name}}': firstName,
            '{{adopter_last_name}}': lastName,
            // Address components - editable fields with yellow highlight
            '{{adopter_street_address}}': editableField('street_address', 'Street Address'),
            '{{adopter_street_address_2}}': `<span class="merge-field-editable" data-field="street_address_2"></span>`,
            '{{adopter_city}}': editableField('city', 'City'),
            '{{adopter_state}}': editableField('state', 'State'),
            '{{adopter_zip}}': editableField('zip', 'Zip Code'),
            // Animal info
            '{{animal_name}}': animal?.name || '',
            '{{animal_species}}': animal?.species || '',
            '{{animal_breed}}': animal?.breed || '',
            '{{animal_age}}': animal?.age?.toString() || '',
            '{{animal_sex}}': animal?.sex || '',
            // Organization info
            '{{organization_name}}': tenant?.name || '',
            // Financial info
            '{{contract_date}}': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            '{{adoption_fee}}': `$${baseFee.toFixed(2)}`,
            '{{donation_amount}}': donationAmount > 0 ? `$${donationAmount.toFixed(2)}` : '$0.00',
            '{{total_amount}}': `$${totalAmount.toFixed(2)}`,
            // Commitment dates (staff-confirmed)
            '{{vet_appointment_date}}': formatDate(session.vetAppointmentDate),
            '{{spay_neuter_date}}': spayNeuterDisplay,
            // Pre-signing placeholders - editable fields
            '{{signed_timestamp}}': '(Will be recorded upon signing)',
            '{{signed_ip}}': '(Will be recorded upon signing)',
            '{{signature_image_url}}': '',
            '{{adopter_drivers_license}}': editableField('drivers_license', "Driver's License #"),
          };
          
          let processedHtml = template.htmlTemplate;
          for (const [placeholder, value] of Object.entries(mergeFieldValues)) {
            processedHtml = processedHtml.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
          }
          
          // Sanitize HTML server-side to prevent XSS
          // Allow data-field attribute for merge field live updates
          const sanitizedHtml = DOMPurify.sanitize(processedHtml, {
            ALLOWED_TAGS: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
            ALLOWED_ATTR: ['class', 'style', 'data-field'],
            ALLOW_DATA_ATTR: false, // Only allow specific data attrs via ALLOWED_ATTR
          });
          
          contractData = {
            html: sanitizedHtml,
            name: template.name,
          };
        }
      }

      // Determine if spay/neuter contract is needed
      // Required when: animal is NOT already spayed/neutered AND tenant has enabled the setting AND spay/neuter date is set
      const isAnimalAltered = animal?.neuterStatus === 'spayed' || animal?.neuterStatus === 'neutered';
      const requiresSpayNeuterContract = !isAnimalAltered && tenant?.requireSpayNeuterContract === true && !!session.spayNeuterDate;
      
      // Generate spay/neuter contract HTML if needed
      let spayNeuterContractData: { html: string; name: string } | null = null;
      if (requiresSpayNeuterContract) {
        const DOMPurify = (await import('isomorphic-dompurify')).default;
        const { SPAY_NEUTER_CONTRACT_HTML } = await import('./services/contract-template');
        
        // Helper to create highlighted editable field span
        const editableField = (fieldName: string, placeholder: string) => 
          `<span class="merge-field-editable" data-field="${fieldName}" style="background-color: #fff3cd; padding: 1px 4px; border-radius: 2px;">${placeholder}</span>`;
        
        // Format commitment date for display
        const formatDate = (dateStr: string | null | undefined): string => {
          if (!dateStr) return '';
          try {
            return new Date(dateStr).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
          } catch {
            return dateStr;
          }
        };
        
        // Replace merge fields with actual data
        const spayNeuterMergeFields: Record<string, string> = {
          '{{adopter_name}}': application?.applicantName || '',
          '{{adopter_email}}': application?.applicantEmail || '',
          '{{adopter_phone}}': application?.applicantPhone || '',
          // Address components - editable fields with yellow highlight
          '{{adopter_street_address}}': editableField('street_address', 'Street Address'),
          '{{adopter_street_address_2}}': `<span class="merge-field-editable" data-field="street_address_2"></span>`,
          '{{adopter_city}}': editableField('city', 'City'),
          '{{adopter_state}}': editableField('state', 'State'),
          '{{adopter_zip}}': editableField('zip', 'Zip Code'),
          '{{adopter_drivers_license}}': editableField('drivers_license', "Driver's License #"),
          '{{animal_name}}': animal?.name || '',
          '{{organization_name}}': tenant?.name || '',
          '{{contract_date}}': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{spay_neuter_date}}': formatDate(session.spayNeuterDate),
          '{{signed_timestamp}}': '(Will be recorded upon signing)',
          '{{signed_ip}}': '(Will be recorded upon signing)',
          '{{signature_image_url}}': '',
        };
        
        let processedSpayNeuterHtml = SPAY_NEUTER_CONTRACT_HTML;
        for (const [placeholder, value] of Object.entries(spayNeuterMergeFields)) {
          processedSpayNeuterHtml = processedSpayNeuterHtml.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }
        
        // Sanitize HTML
        const sanitizedSpayNeuterHtml = DOMPurify.sanitize(processedSpayNeuterHtml, {
          ALLOWED_TAGS: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
          ALLOWED_ATTR: ['class', 'style', 'data-field', 'src', 'alt'],
          ALLOW_DATA_ATTR: false,
        });
        
        spayNeuterContractData = {
          html: sanitizedSpayNeuterHtml,
          name: 'Spay/Neuter Agreement',
        };
      }

      // Calculate fee info for display (pass tenant override if set)
      const platformFeePercent = getPlatformFeePercent(tenant?.subscriptionTier || 'free', tenant?.platformFeePercent);
      
      res.json({
        session: {
          id: session.id,
          status: session.status,
          baseFee: session.baseFee,
          donationBoost: session.donationBoost,
          totals: session.totals,
          expiresAt: session.expiresAt,
          signedAt: session.signedAt,
          paidAt: session.paidAt,
          contractTemplateId: session.contractTemplateId,
          // Staff-set commitment dates (read-only for adopter)
          vetAppointmentDate: session.vetAppointmentDate,
          spayNeuterDate: session.spayNeuterDate,
        },
        animal: animal ? {
          id: animal.id,
          name: animal.name,
          species: animal.species,
          breed: animal.breed,
          photoUrls: animal.photoUrls,
        } : null,
        applicant: application ? {
          name: application.applicantName,
          email: application.applicantEmail,
          phone: application.applicantPhone,
          address: application.applicantAddress,
        } : null,
        contract: contractData,
        spayNeuterContract: spayNeuterContractData,
        requiresSpayNeuterContract: requiresSpayNeuterContract,
        organization: tenant ? { name: tenant.name } : null,
        // Fee configuration for adopter display
        feeConfig: {
          passFeesToAdopter: tenant?.passFeesToAdopter || false,
          platformFeePercent,
          processingFeePercent: STRIPE_PROCESSING_FEE_PERCENT,
          processingFeeFixed: STRIPE_PROCESSING_FEE_FIXED_CENTS / 100, // Convert to dollars
          rescueName: tenant?.name || 'the rescue',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/public/adoption-checkouts/:token/sign
   * Submit signature for contract (public, token-protected)
   * After signing, automatically sends payment link email to adopter
   */
  app.post('/api/public/adoption-checkouts/:token/sign', async (req, res, next) => {
    try {
      const { getCheckoutSessionByToken, captureSignature, sendPaymentLinkEmail } = await import('./services/adoption-checkout');
      
      const session = await getCheckoutSessionByToken(req.params.token);

      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
      }

      const signatureSchema = z.object({
        signerName: z.string().min(1),
        signerEmail: z.string().email(),
        signatureImageData: z.string().refine(
          (val) => val.startsWith('data:image/'),
          { message: 'Signature must be a valid image' }
        ),
        templateId: z.number().optional(),
        driversLicenseNumber: z.string().max(50).optional(),
        driversLicenseImageData: z.string().optional().refine(
          (val) => !val || val.startsWith('data:image/'),
          { message: 'Driver\'s license must be a valid image' }
        ).refine(
          (val) => !val || val.length < 15 * 1024 * 1024, // ~10MB base64 limit
          { message: 'Driver\'s license image must be under 10MB' }
        ),
        // Address fields
        adopterStreetAddress: z.string().optional(),
        adopterStreetAddress2: z.string().optional(),
        adopterCity: z.string().optional(),
        adopterState: z.string().optional(),
        adopterZip: z.string().optional(),
        // Commitment date fields
        vetAppointmentDate: z.string().optional(),
        spayNeuterDate: z.string().optional(),
      });

      const signatureData = signatureSchema.parse(req.body);

      // Update session with address, date fields, and commitment dates (both metadata and actual columns)
      if (signatureData.adopterStreetAddress || signatureData.vetAppointmentDate || signatureData.spayNeuterDate) {
        const existingMetadata = (session.metadata as Record<string, any>) || {};
        await db
          .update(adoptionCheckoutSessions)
          .set({
            metadata: {
              ...existingMetadata,
              adopterStreetAddress: signatureData.adopterStreetAddress,
              adopterStreetAddress2: signatureData.adopterStreetAddress2,
              adopterCity: signatureData.adopterCity,
              adopterState: signatureData.adopterState,
              adopterZip: signatureData.adopterZip,
            },
            // Also update actual database columns for dates so PDF generation can access them
            vetAppointmentDate: signatureData.vetAppointmentDate || session.vetAppointmentDate,
            spayNeuterDate: signatureData.spayNeuterDate || session.spayNeuterDate,
            updatedAt: new Date(),
          })
          .where(eq(adoptionCheckoutSessions.id, session.id));
      }

      // captureSignature now handles waived fees automatically
      // Returns { contract, skipPayment } where skipPayment=true means fee was waived
      const { contract, skipPayment } = await captureSignature(session.id, {
        ...signatureData,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        driversLicenseNumber: signatureData.driversLicenseNumber,
        driversLicenseImageData: signatureData.driversLicenseImageData,
      });

      if (!skipPayment) {
        // Fee not waived - send payment link email
        // This continues the automated workflow: approval -> contract signing -> payment
        try {
          await sendPaymentLinkEmail(session.id, req.params.token);
        } catch (emailError) {
          console.error('Failed to send payment link email:', emailError);
          // Don't fail the signature capture if email fails
        }
      }

      res.json({ success: true, contract: { id: contract.id }, skipPayment });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * POST /api/public/adoption-checkouts/:token/create-payment-intent
   * Create a Stripe PaymentIntent for the adoption checkout (public, token-protected)
   * Called after contract is signed, before payment is collected
   */
  app.post('/api/public/adoption-checkouts/:token/create-payment-intent', async (req, res, next) => {
    try {
      const { getCheckoutSessionByToken, createAdoptionPaymentIntent, updateCheckoutSession, getCheckoutSession } = await import('./services/adoption-checkout');
      
      const session = await getCheckoutSessionByToken(req.params.token);

      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
      }

      if (session.status !== 'awaiting_payment') {
        return res.status(400).json({ error: 'Contract must be signed before creating payment intent' });
      }

      // Parse optional donation boost and cover fees from request
      const updateSchema = z.object({
        donationBoost: z.string()
          .optional()
          .refine(val => !val || !isNaN(parseFloat(val)), 'Must be a valid number')
          .refine(val => !val || parseFloat(val) >= 0, 'Must be non-negative')
          .refine(val => !val || parseFloat(val) <= 10000, 'Donation cannot exceed $10,000')
          .transform(val => val || '0'),
        coverFees: z.boolean().optional().default(false),
      });

      const updates = updateSchema.parse(req.body);

      // Update session with donation/fee selections if provided
      if (updates.donationBoost !== undefined || updates.coverFees !== undefined) {
        await updateCheckoutSession(session.tenantId, session.id, {
          donationBoost: updates.donationBoost,
          coverFees: updates.coverFees,
        });
      }

      // Create the PaymentIntent with real Stripe
      const { clientSecret, paymentIntentId } = await createAdoptionPaymentIntent(session.id);

      // Fetch updated session to get final totals
      const updatedSession = await getCheckoutSession(session.tenantId, session.id);
      
      res.json({ 
        clientSecret, 
        paymentIntentId,
        totals: updatedSession?.totals,
        message: 'PaymentIntent created successfully' 
      });
    } catch (error: any) {
      console.error('Failed to create PaymentIntent:', error);
      if (error.message?.includes('Stripe is not configured')) {
        return res.status(400).json({ 
          error: 'Payment not available',
          message: 'This organization has not configured payment processing. Please contact them directly.'
        });
      }
      next(error);
    }
  });

  /**
   * POST /api/public/adoption-checkouts/:token/payment
   * Process payment for adoption (public, token-protected)
   */
  app.post('/api/public/adoption-checkouts/:token/payment', async (req, res, next) => {
    try {
      const { getCheckoutSessionByToken, updateCheckoutSession, processPayment, finalizeAdoption, validatePaymentInputs, getCheckoutSession } = await import('./services/adoption-checkout');
      
      const session = await getCheckoutSessionByToken(req.params.token);

      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
      }

      const paymentSchema = z.object({
        processor: z.enum(['stripe']),
        paymentMethodId: z.string().optional(),
        // Validate donationBoost: must be numeric string, >= 0, reasonable upper limit
        donationBoost: z.string()
          .optional()
          .refine(val => !val || !isNaN(parseFloat(val)), 'Must be a valid number')
          .refine(val => !val || parseFloat(val) >= 0, 'Must be non-negative')
          .refine(val => !val || parseFloat(val) <= 10000, 'Donation cannot exceed $10,000')
          .transform(val => val || '0'), // Default to '0' if undefined
        // Validate coverFees: must be boolean
        coverFees: z.boolean().optional().default(false),
      });

      const paymentData = paymentSchema.parse(req.body);

      // Validate payment inputs using helper function
      validatePaymentInputs(
        paymentData.donationBoost, 
        paymentData.coverFees, 
        session.baseFee
      );

      // Update session with donation/fee selections if provided
      if (paymentData.donationBoost !== undefined || paymentData.coverFees !== undefined) {
        await updateCheckoutSession(session.tenantId, session.id, {
          donationBoost: paymentData.donationBoost,
          coverFees: paymentData.coverFees,
        });
      }

      // Get updated session to verify totals
      const updatedSession = await getCheckoutSession(session.tenantId, session.id);
      if (!updatedSession) {
        throw new Error('Failed to retrieve updated session');
      }

      // Business logic validation: verify final totals
      if (updatedSession.totals) {
        const totals = updatedSession.totals as { subtotal: string; fees: string; total: string };
        const finalTotal = parseFloat(totals.total);
        const baseFee = parseFloat(updatedSession.baseFee);

        // Ensure final total is at least the base fee (can't be negative or less than base)
        if (finalTotal < baseFee) {
          throw new Error('Invalid payment amount: total cannot be less than base adoption fee');
        }

        // Ensure total is reasonable (not absurdly high due to manipulation)
        if (finalTotal > baseFee + 10000) {
          throw new Error('Invalid payment amount: total exceeds reasonable limits');
        }
      }

      const payment = await processPayment(session.id, paymentData);

      // Finalize adoption (update animal status, create journey, send emails)
      await finalizeAdoption(session.id);

      res.json({ success: true, payment: { id: payment.id, status: payment.status } });
    } catch (error: any) {
      next(error);
    }
  });

  /**
   * GET /api/public/adoption-checkouts/:token/status
   * Check completion status (public, token-protected)
   */
  app.get('/api/public/adoption-checkouts/:token/status', async (req, res, next) => {
    try {
      const { getCheckoutSessionByToken } = await import('./services/adoption-checkout');
      
      const session = await getCheckoutSessionByToken(req.params.token);

      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
      }

      res.json({
        status: session.status,
        signedAt: session.signedAt,
        paidAt: session.paidAt,
        isComplete: session.status === 'completed',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/public/adoption-checkouts/:token/contract
   * Download signed contract PDF (public, token-protected)
   * Security: Only allows download after session is completed (signed + paid)
   * Returns a time-limited signed URL (valid for 15 minutes)
   */
  app.get('/api/public/adoption-checkouts/:token/contract', async (req, res, next) => {
    try {
      const { getCheckoutSessionByTokenForDownload } = await import('./services/adoption-checkout');
      const { adoptionContracts } = await import('@shared/schema');
      const { generateSignedContractUrl } = await import('./services/contract-pdf');
      
      const session = await getCheckoutSessionByTokenForDownload(req.params.token);

      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
      }

      // Security: Only allow downloading contract after session is completed (signed + paid)
      // This ensures the adopter has fully completed the process before accessing their contract
      if (session.status !== 'completed') {
        return res.status(403).json({ error: 'Contract is not yet available. Please complete the adoption process first.' });
      }

      // Verify signature exists
      if (!session.signedAt) {
        return res.status(400).json({ error: 'Contract has not been signed yet' });
      }

      // Fetch the contract record
      const [contract] = await db
        .select()
        .from(adoptionContracts)
        .where(eq(adoptionContracts.sessionId, session.id))
        .limit(1);

      if (!contract || !contract.contractPdfUrl) {
        return res.status(404).json({ error: 'Signed contract not found' });
      }

      // Generate time-limited signed URL (15 minutes expiry) for secure download
      const signedUrl = await generateSignedContractUrl(contract.contractPdfUrl, 900);

      res.json({
        contractPdfUrl: signedUrl,
        signedAt: contract.signedAt,
        signerName: contract.signerName,
        signerEmail: contract.signerEmail,
        expiresIn: 900, // URL expires in 15 minutes
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Contract Templates Routes (Staff only)
  // ============================================================================

  /**
   * GET /api/contract-templates
   * List all contract templates for tenant (staff only)
   */
  app.get('/api/contract-templates', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getAllTemplates, ensureDefaultTemplate, MERGE_FIELDS } = await import('./services/contract-template');
      
      // Ensure a default template exists for new tenants
      await ensureDefaultTemplate(req.tenant!.id, req.tenant!.name);
      
      const templates = await getAllTemplates(req.tenant!.id);
      res.json({ templates, mergeFields: MERGE_FIELDS });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/contract-templates
   * Create new contract template (admin only)
   */
  app.post('/api/contract-templates', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { createTemplate, validateTemplateHtml } = await import('./services/contract-template');
      const { insertAdoptionContractTemplateSchema } = await import('@shared/schema');
      
      // Validate template HTML
      const validation = validateTemplateHtml(req.body.htmlTemplate || '');
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid template HTML', 
          validationErrors: validation.errors 
        });
      }

      const data = insertAdoptionContractTemplateSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
        updatedBy: req.user!.id,
      });

      const template = await createTemplate(data);
      res.json({ template, warnings: validation.warnings });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/contract-templates/:id
   * Update contract template (admin only)
   */
  app.put('/api/contract-templates/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { updateTemplate, validateTemplateHtml } = await import('./services/contract-template');
      
      // Validate template HTML if it's being updated
      let warnings: string[] = [];
      if (req.body.htmlTemplate) {
        const validation = validateTemplateHtml(req.body.htmlTemplate);
        warnings = validation.warnings;
        if (!validation.valid) {
          return res.status(400).json({ 
            error: 'Invalid template HTML', 
            validationErrors: validation.errors 
          });
        }
      }

      const updates = {
        ...req.body,
        updatedBy: req.user!.id,
      };

      const template = await updateTemplate(req.params.id, req.tenant!.id, updates);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.json({ template, warnings });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/contract-templates/:id
   * Delete contract template (admin only)
   */
  app.delete('/api/contract-templates/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { deleteTemplate } = await import('./services/contract-template');
      
      await deleteTemplate(req.params.id, req.tenant!.id);
      res.json({ success: true, message: 'Template deleted successfully' });
    } catch (error: any) {
      if (error.message?.includes('Cannot delete the default template')) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * PUT /api/contract-templates/:id/set-default
   * Set template as default for tenant (admin only)
   */
  app.put('/api/contract-templates/:id/set-default', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { setDefaultTemplate } = await import('./services/contract-template');
      
      const template = await setDefaultTemplate(req.params.id, req.tenant!.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json({ template, message: 'Template set as default successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/contract-templates/:id/preview
   * Generate preview HTML with sample merge data (admin/staff only)
   * SECURITY: Sanitizes HTML before rendering to prevent XSS
   */
  app.get('/api/contract-templates/:id/preview', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getTemplateById, mergePlaceholders } = await import('./services/contract-template');
      const DOMPurify = (await import('isomorphic-dompurify')).default;
      
      const template = await getTemplateById(req.params.id, req.tenant!.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      // Sample merge data for preview
      const sampleData = {
        organization_name: req.tenant!.name,
        adopter_name: 'John Doe',
        adopter_email: 'john.doe@example.com',
        adopter_phone: '(555) 123-4567',
        adopter_address: '123 Main Street, Anytown, ST 12345',
        animal_name: 'Buddy',
        animal_species: 'Dog',
        animal_breed: 'Golden Retriever',
        animal_age: '3 years',
        animal_sex: 'Male',
        adoption_fee: '150.00',
        donation_amount: '50.00',
        total_amount: '200.00',
        contract_date: new Date().toLocaleDateString(),
        signature_image_url: '/placeholder-signature.png',
      };

      const mergedHtml = mergePlaceholders(template.htmlTemplate, sampleData);
      
      // Sanitize HTML before sending to client to prevent XSS
      // WHOLE_DOCUMENT: true is required to preserve <html>, <head>, <body> tags
      const sanitizedHtml = DOMPurify.sanitize(mergedHtml, {
        WHOLE_DOCUMENT: true,
        ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
        ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
        ALLOW_DATA_ATTR: false,
      });
      
      res.json({ html: sanitizedHtml });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Foster Contract Template Routes
  // ============================================================================

  /**
   * GET /api/foster-contract-templates
   * List all foster contract templates for tenant (staff only)
   */
  app.get('/api/foster-contract-templates', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getAllFosterTemplates, ensureDefaultFosterTemplate, FOSTER_MERGE_FIELDS } = await import('./services/foster-contract-template');
      
      // Ensure a default template exists for new tenants
      await ensureDefaultFosterTemplate(req.tenant!.id, req.tenant!.name);
      
      const templates = await getAllFosterTemplates(req.tenant!.id);
      res.json({ templates, mergeFields: FOSTER_MERGE_FIELDS });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-contract-templates
   * Create new foster contract template (admin only)
   */
  app.post('/api/foster-contract-templates', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { createFosterTemplate, validateFosterTemplate } = await import('./services/foster-contract-template');
      const { insertFosterContractTemplateSchema } = await import('@shared/schema');
      
      const validation = validateFosterTemplate(req.body.htmlTemplate || '');
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid template HTML', 
          validationErrors: validation.errors 
        });
      }

      const data = insertFosterContractTemplateSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
        updatedBy: req.user!.id,
      });
      
      const template = await createFosterTemplate(data);
      res.json({ template, message: 'Foster template created successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/foster-contract-templates/:id
   * Update foster contract template (admin only)
   */
  app.put('/api/foster-contract-templates/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { updateFosterTemplate, validateFosterTemplate } = await import('./services/foster-contract-template');
      const { insertFosterContractTemplateSchema } = await import('@shared/schema');
      
      if (req.body.htmlTemplate) {
        const validation = validateFosterTemplate(req.body.htmlTemplate);
        if (!validation.valid) {
          return res.status(400).json({ 
            error: 'Invalid template HTML', 
            validationErrors: validation.errors 
          });
        }
      }

      const updateSchema = insertFosterContractTemplateSchema.partial().omit({ tenantId: true });
      const validatedUpdates = updateSchema.parse(req.body);

      const updates = {
        ...validatedUpdates,
        updatedBy: req.user!.id,
      };

      const template = await updateFosterTemplate(req.params.id, req.tenant!.id, updates);
      
      if (!template) {
        return res.status(404).json({ error: 'Foster template not found' });
      }

      res.json({ template, message: 'Foster template updated successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/foster-contract-templates/:id
   * Delete foster contract template (admin only)
   */
  app.delete('/api/foster-contract-templates/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { deleteFosterTemplate, getFosterTemplateById } = await import('./services/foster-contract-template');
      
      const template = await getFosterTemplateById(req.params.id, req.tenant!.id);
      if (template?.isDefault) {
        return res.status(400).json({ error: 'Cannot delete the default template. Set another template as default first.' });
      }
      
      await deleteFosterTemplate(req.params.id, req.tenant!.id);
      res.json({ success: true, message: 'Foster template deleted successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/foster-contract-templates/:id/set-default
   * Set foster template as default for tenant (admin only)
   */
  app.put('/api/foster-contract-templates/:id/set-default', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { setDefaultFosterTemplate } = await import('./services/foster-contract-template');
      
      const template = await setDefaultFosterTemplate(req.params.id, req.tenant!.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Foster template not found' });
      }

      res.json({ template, message: 'Foster template set as default successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/foster-contract-templates/:id/preview
   * Generate preview HTML with sample merge data (admin/staff only)
   */
  app.get('/api/foster-contract-templates/:id/preview', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getFosterTemplateById, mergeFosterPlaceholders } = await import('./services/foster-contract-template');
      const DOMPurify = (await import('isomorphic-dompurify')).default;
      
      const template = await getFosterTemplateById(req.params.id, req.tenant!.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Foster template not found' });
      }

      const sampleData = {
        organization_name: req.tenant!.name,
        foster_parent_name: 'Jane Smith',
        foster_email: 'jane.smith@example.com',
        foster_phone: '(555) 987-6543',
        foster_address: '456 Oak Avenue, Petville, ST 67890',
        foster_start_date: new Date().toLocaleDateString(),
        animal_name: 'Max',
        animal_species: 'Dog',
        animal_breed: 'Labrador Mix',
        animal_sex: 'Male',
        animal_age: '2 years',
        animal_microchip: '985112012345678',
        contract_date: new Date().toLocaleDateString(),
        signature_image_url: '/placeholder-signature.png',
        signed_timestamp: new Date().toISOString(),
        signed_ip: '192.168.1.100',
      };

      const mergedHtml = mergeFosterPlaceholders(template.htmlTemplate, sampleData);
      
      // WHOLE_DOCUMENT: true is required to preserve <html>, <head>, <body> tags
      const sanitizedHtml = DOMPurify.sanitize(mergedHtml, {
        WHOLE_DOCUMENT: true,
        ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
        ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
        ALLOW_DATA_ATTR: false,
      });
      
      res.json({ html: sanitizedHtml });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/foster-contract-templates/ensure-default
   * Ensure a default foster template exists for tenant (staff only)
   */
  app.get('/api/foster-contract-templates/ensure-default', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { ensureDefaultFosterTemplate } = await import('./services/foster-contract-template');
      const template = await ensureDefaultFosterTemplate(req.tenant!.id, req.tenant!.name);
      res.json({ template, message: 'Default foster template ensured' });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Custom Forms Routes (Flexible forms with e-signature)
  // ============================================================================

  /**
   * GET /api/custom-forms
   * List all custom forms for tenant (staff only)
   */
  app.get('/api/custom-forms', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getAllForms, STANDALONE_MERGE_FIELDS, ANIMAL_MERGE_FIELDS } = await import('./services/custom-form');
      
      const forms = await getAllForms(req.tenant!.id);
      res.json({ 
        forms, 
        mergeFields: {
          standalone: STANDALONE_MERGE_FIELDS,
          animal_specific: ANIMAL_MERGE_FIELDS,
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/custom-forms/active
   * Get active forms for dropdown selection
   */
  app.get('/api/custom-forms/active', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getActiveForms } = await import('./services/custom-form');
      const forms = await getActiveForms(req.tenant!.id);
      res.json({ forms });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/custom-forms/:id
   * Get a single custom form by ID
   */
  app.get('/api/custom-forms/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getFormById, STANDALONE_MERGE_FIELDS, ANIMAL_MERGE_FIELDS } = await import('./services/custom-form');
      
      const form = await getFormById(req.params.id, req.tenant!.id);
      if (!form) {
        return res.status(404).json({ error: 'Form not found' });
      }
      
      const mergeFields = form.formType === 'animal_specific' ? ANIMAL_MERGE_FIELDS : STANDALONE_MERGE_FIELDS;
      res.json({ form, mergeFields });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/custom-forms
   * Create a new custom form (admin only)
   */
  app.post('/api/custom-forms', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { createForm, validateTemplateHtml } = await import('./services/custom-form');
      const { insertCustomFormSchema } = await import('@shared/schema');
      
      // Only validate HTML template for template mode
      const creationMode = req.body.creationMode || 'template';
      if (creationMode === 'template') {
        const validation = validateTemplateHtml(req.body.htmlTemplate || '');
        if (!validation.valid) {
          return res.status(400).json({ 
            error: 'Invalid template HTML', 
            validationErrors: validation.errors 
          });
        }
      } else if (creationMode === 'question_builder') {
        // For question_builder mode, validate that questions array is provided
        if (!req.body.questions || !Array.isArray(req.body.questions) || req.body.questions.length === 0) {
          return res.status(400).json({ 
            error: 'At least one question is required for question builder mode'
          });
        }
      }

      const data = insertCustomFormSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
        createdBy: req.user!.id,
      });

      const form = await createForm(data);
      res.json({ form, message: 'Custom form created successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/custom-forms/:id
   * Update a custom form (admin only)
   */
  app.put('/api/custom-forms/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { updateForm, validateTemplateHtml } = await import('./services/custom-form');
      
      const creationMode = req.body.creationMode || 'template';
      
      // Only validate HTML template for template mode
      if (creationMode === 'template' && req.body.htmlTemplate) {
        const validation = validateTemplateHtml(req.body.htmlTemplate);
        if (!validation.valid) {
          return res.status(400).json({ 
            error: 'Invalid template HTML', 
            validationErrors: validation.errors 
          });
        }
      } else if (creationMode === 'question_builder') {
        // For question_builder mode, validate that questions array is provided
        if (!req.body.questions || !Array.isArray(req.body.questions) || req.body.questions.length === 0) {
          return res.status(400).json({ 
            error: 'At least one question is required for question builder mode'
          });
        }
      }

      const form = await updateForm(req.params.id, req.tenant!.id, req.body);
      
      if (!form) {
        return res.status(404).json({ error: 'Form not found' });
      }

      res.json({ form, message: 'Form updated successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/custom-forms/:id
   * Delete a custom form (admin only)
   */
  app.delete('/api/custom-forms/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { deleteForm } = await import('./services/custom-form');
      
      await deleteForm(req.params.id, req.tenant!.id);
      res.json({ success: true, message: 'Form deleted successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/custom-forms/:id/preview
   * Preview a custom form with sample data
   */
  app.get('/api/custom-forms/:id/preview', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getFormById, renderFormHtml } = await import('./services/custom-form');
      
      const form = await getFormById(req.params.id, req.tenant!.id);
      if (!form) {
        return res.status(404).json({ error: 'Form not found' });
      }

      // Create sample submission for preview
      const sampleSubmission = {
        id: 'preview',
        tenantId: req.tenant!.id,
        formId: form.id,
        signerName: 'Jane Smith',
        signerEmail: 'jane.smith@example.com',
        signerPhone: '(555) 987-6543',
        signedAt: new Date(),
        signerIpAddress: '192.168.1.100',
        signatureData: '',
        status: 'completed' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Sample animal for animal-specific forms
      const sampleAnimal = form.formType === 'animal_specific' ? {
        name: 'Max',
        species: 'Dog',
        breed: 'Labrador Mix',
        age: '2 years',
        sex: 'Male',
        color: 'Yellow',
        microchipNumber: '985112012345678',
        weight: '55',
      } : undefined;

      const html = await renderFormHtml(form, sampleSubmission as any, req.tenant!.name, sampleAnimal);
      
      const sanitizedHtml = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
        ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
        ALLOW_DATA_ATTR: false,
      });
      
      res.json({ html: sanitizedHtml });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/custom-forms/:id/submissions
   * Get all submissions for a form
   */
  app.get('/api/custom-forms/:id/submissions', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getFormSubmissions } = await import('./services/custom-form');
      
      const submissions = await getFormSubmissions(req.params.id, req.tenant!.id);
      res.json({ submissions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/custom-forms/:id/send
   * Send a form to someone to fill out (creates a pending submission and emails them)
   */
  app.post('/api/custom-forms/:id/send', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getFormById, createSubmission, generateSecureToken, updateSubmission } = await import('./services/custom-form');
      const { EmailService } = await import('./lib/email-service');
      
      const form = await getFormById(req.params.id, req.tenant!.id);
      if (!form) {
        return res.status(404).json({ error: 'Form not found' });
      }

      const { 
        signerName, signerEmail, signerPhone, animalId,
        feeAmount, feeLabel, feeRequired, enableDonation, donationSuggested
      } = req.body;
      
      if (!signerName || !signerEmail) {
        return res.status(400).json({ error: 'Signer name and email are required' });
      }

      // Validate animal ID for animal-specific forms
      if (form.formType === 'animal_specific' && !animalId) {
        return res.status(400).json({ error: 'Animal selection is required for this form type' });
      }

      // Parse fee amounts (convert dollars to cents)
      const feeAmountCents = feeAmount ? Math.round(parseFloat(feeAmount) * 100) : null;
      const donationSuggestedCents = donationSuggested ? Math.round(parseFloat(donationSuggested) * 100) : null;
      
      // Determine payment status based on fee settings
      const hasPayment = (feeAmountCents && feeAmountCents > 0) || enableDonation;
      const paymentStatus = hasPayment ? 'pending' : 'not_required';

      const { token, hash } = generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 72); // 72 hours expiry

      const submission = await createSubmission({
        tenantId: req.tenant!.id,
        formId: form.id,
        animalId: animalId || null,
        signerName,
        signerEmail,
        signerPhone: signerPhone || null,
        secureTokenHash: hash,
        expiresAt,
        status: 'pending',
        // Fee/payment settings
        feeAmount: feeAmountCents,
        feeLabel: feeLabel || null,
        feeRequired: feeRequired || false,
        enableDonation: enableDonation || false,
        donationSuggested: donationSuggestedCents,
        paymentStatus,
      });

      // Build the form URL - use path-based routing for production
      const subdomain = req.tenant!.subdomain;
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? `https://irescue.life/${subdomain}`
        : `${req.protocol}://${req.get('host')}/${subdomain}`;
      
      const formUrl = `${baseUrl}/form/${token}`;

      // Try to send email to signer
      let emailSent = false;
      try {
        const emailService = await EmailService.forTenant(req.tenant!.id);
        if (emailService) {
          const tenantName = req.tenant!.name;
          // Build fee info section for email
          let feeInfoHtml = '';
          if (feeAmountCents && feeAmountCents > 0) {
            const feeDisplay = (feeAmountCents / 100).toFixed(2);
            const feeLabelDisplay = feeLabel || 'Fee';
            feeInfoHtml = `
              <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-weight: 500;">
                  ${feeLabelDisplay}: $${feeDisplay}${feeRequired ? ' (required)' : ' (optional)'}
                </p>
              </div>
            `;
          }
          if (enableDonation && donationSuggestedCents) {
            const donationDisplay = (donationSuggestedCents / 100).toFixed(2);
            feeInfoHtml += `
              <p style="color: #666; font-size: 14px; margin: 10px 0;">
                Optional donation suggested: $${donationDisplay}
              </p>
            `;
          }

          const emailResult = await emailService.send({
            to: signerEmail,
            subject: `${tenantName}: Please complete "${form.name}"`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Hello ${signerName},</h2>
                <p>${tenantName} has sent you a form to complete:</p>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #333;">${form.name}</h3>
                  ${form.description ? `<p style="color: #666;">${form.description}</p>` : ''}
                </div>
                ${feeInfoHtml}
                <p>Please click the button below to complete the form:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${formUrl}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Complete Form</a>
                </div>
                <p style="color: #666; font-size: 14px;">This link will expire in 72 hours.</p>
                <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; font-size: 12px; color: #888;">${formUrl}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                <p style="color: #888; font-size: 12px;">This email was sent by ${tenantName} via iRescue.life</p>
              </div>
            `,
          });
          
          if (emailResult.success) {
            emailSent = true;
            // Update submission to record that email was sent
            await updateSubmission(submission.id, req.tenant!.id, { emailedAt: new Date() });
            console.log(`[CustomForms] Email sent to ${signerEmail} for form ${form.id}`);
          } else {
            console.warn(`[CustomForms] Failed to send email to ${signerEmail}:`, emailResult.error);
          }
        } else {
          console.warn(`[CustomForms] No email service available for tenant ${req.tenant!.id}`);
        }
      } catch (emailError) {
        console.error(`[CustomForms] Error sending form email:`, emailError);
        // Don't fail the whole request if email fails - just log and continue
      }

      res.json({ 
        submission, 
        formUrl,
        emailSent,
        message: emailSent 
          ? 'Form has been emailed to the recipient.' 
          : 'Form link created. Share this link with the recipient.'
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Public Custom Form Routes (for form signing)
  // ============================================================================

  /**
   * GET /api/public/forms/:token
   * Get form for public signing
   */
  app.get('/api/public/forms/:token', requireTenant, async (req, res, next) => {
    try {
      const { getSubmissionByToken, getFormById, hashToken } = await import('./services/custom-form');
      
      const tokenHash = hashToken(req.params.token);
      const submission = await getSubmissionByToken(tokenHash);
      
      if (!submission) {
        return res.status(404).json({ error: 'Form not found or link has expired' });
      }

      if (submission.status !== 'pending') {
        return res.status(400).json({ error: 'This form has already been completed' });
      }

      if (submission.expiresAt && new Date() > submission.expiresAt) {
        return res.status(400).json({ error: 'This form link has expired' });
      }

      const form = await getFormById(submission.formId, submission.tenantId);
      if (!form) {
        return res.status(404).json({ error: 'Form template not found' });
      }

      // Get animal if animal-specific
      let animal = null;
      if (form.formType === 'animal_specific' && submission.animalId) {
        const [animalRecord] = await db
          .select()
          .from(animals)
          .where(eq(animals.id, submission.animalId))
          .limit(1);
        animal = animalRecord || null;
      }

      // Get tenant info
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, submission.tenantId))
        .limit(1);

      res.json({ 
        form: {
          id: form.id,
          name: form.name,
          description: form.description,
          formType: form.formType,
          creationMode: form.creationMode || 'template',
          requiresSignature: form.requiresSignature,
          htmlTemplate: form.htmlTemplate,
          customFields: form.customFields,
          questions: form.questions,
          introText: form.introText,
        },
        submission: {
          id: submission.id,
          signerName: submission.signerName,
          signerEmail: submission.signerEmail,
          signerPhone: submission.signerPhone,
          // Fee/payment settings
          feeAmount: submission.feeAmount,
          feeLabel: submission.feeLabel,
          feeRequired: submission.feeRequired,
          feeWaived: submission.feeWaived,
          enableDonation: submission.enableDonation,
          donationSuggested: submission.donationSuggested,
          paymentStatus: submission.paymentStatus,
        },
        animal,
        tenant: {
          name: tenant?.name,
          logo: tenant?.logoUrl,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/public/forms/:token/upload
   * Upload a file for a public form (no auth required since forms are public)
   */
  app.post('/api/public/forms/:token/upload', requireTenant, async (req, res, next) => {
    try {
      const multer = (await import('multer')).default;
      const { getSubmissionByToken, hashToken } = await import('./services/custom-form');
      const { TenantFileStorage } = await import('./lib/tenantFileStorage');
      
      // Verify token and get submission
      const tokenHash = hashToken(req.params.token);
      const submission = await getSubmissionByToken(tokenHash);
      
      if (!submission) {
        return res.status(404).json({ error: 'Form not found' });
      }

      if (submission.status !== 'pending') {
        return res.status(400).json({ error: 'This form has already been completed' });
      }

      if (submission.expiresAt && new Date() > submission.expiresAt) {
        return res.status(400).json({ error: 'This form link has expired' });
      }

      // Configure multer for memory storage
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB per file
        },
      }).single('file');

      // Process upload
      upload(req, res, async (err) => {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
          }
          return res.status(400).json({ error: err.message || 'Upload error' });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No file provided' });
        }

        try {
          const tenantId = submission.tenantId;
          
          // Use TenantFileStorage to upload - prioritizes Google Drive if configured
          // Use 'public' visibility so staff can access uploaded files without ACL issues
          const fileStorage = await TenantFileStorage.forTenant(tenantId);
          const uploadResult = await fileStorage.uploadFile({
            tenantId,
            userId: tenantId, // Use tenantId as owner for tenant-wide access
            category: 'form-uploads',
            visibility: 'public', // Staff need to view these files
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            content: req.file.buffer,
          });

          if (!uploadResult.success) {
            console.error('[FORM-UPLOAD] Upload failed:', uploadResult.error);
            return res.status(500).json({ error: 'Failed to upload file. Please try again.' });
          }

          res.json({
            success: true,
            fileUrl: uploadResult.fileUrl,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            storageType: uploadResult.storageType,
            driveFileId: uploadResult.driveFileId,
          });
        } catch (uploadError: any) {
          console.error('[FORM-UPLOAD] Error uploading file:', uploadError);
          res.status(500).json({ error: 'Failed to upload file. Please try again.' });
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/public/forms/:token/submit
   * Submit a completed form with signature
   */
  app.post('/api/public/forms/:token/submit', requireTenant, async (req, res, next) => {
    try {
      const { getSubmissionByToken, getFormById, updateSubmission, renderFormHtml, hashToken } = await import('./services/custom-form');
      
      const tokenHash = hashToken(req.params.token);
      const submission = await getSubmissionByToken(tokenHash);
      
      if (!submission) {
        return res.status(404).json({ error: 'Form not found' });
      }

      if (submission.status !== 'pending') {
        return res.status(400).json({ error: 'This form has already been completed' });
      }

      if (submission.expiresAt && new Date() > submission.expiresAt) {
        return res.status(400).json({ error: 'This form link has expired' });
      }

      const form = await getFormById(submission.formId, submission.tenantId);
      if (!form) {
        return res.status(404).json({ error: 'Form template not found' });
      }

      const { signatureData, formData, donationAmount } = req.body;

      if (form.requiresSignature && !signatureData) {
        return res.status(400).json({ error: 'Signature is required' });
      }

      // Store donation amount if provided
      const donationReceivedCents = donationAmount && donationAmount > 0 ? donationAmount : null;

      // Server-side validation for required fields based on form creation mode
      if (form.creationMode === 'question_builder' && form.questions && Array.isArray(form.questions)) {
        for (const question of form.questions as any[]) {
          if (question.required) {
            const value = formData?.[question.id];
            if (question.type === 'checkbox') {
              if (value !== 'true') {
                return res.status(400).json({ error: `Required checkbox not checked: ${question.question}` });
              }
            } else if (!value || (typeof value === 'string' && value.trim() === '')) {
              return res.status(400).json({ error: `Required question not answered: ${question.question}` });
            }
          }
        }
      } else if (form.customFields && Array.isArray(form.customFields)) {
        for (const field of form.customFields as any[]) {
          if (field.required) {
            const value = formData?.[field.fieldKey];
            if (field.type === 'checkbox') {
              if (value !== 'true') {
                return res.status(400).json({ error: `Required checkbox not checked: ${field.name}` });
              }
            } else if (!value || (typeof value === 'string' && value.trim() === '')) {
              return res.status(400).json({ error: `Required field not filled: ${field.name}` });
            }
          }
        }
      }

      // Get IP address
      const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '';

      // Get animal if animal-specific
      let animal = null;
      if (form.formType === 'animal_specific' && submission.animalId) {
        const [animalRecord] = await db
          .select()
          .from(animals)
          .where(eq(animals.id, submission.animalId))
          .limit(1);
        animal = animalRecord || null;
      }

      // Get tenant info
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, submission.tenantId))
        .limit(1);

      // Create updated submission object for rendering
      const updatedData = {
        ...submission,
        signatureData,
        formData,
        signedAt: new Date(),
        signerIpAddress: ipAddress,
      };

      // Render HTML with merged data
      const renderedHtml = await renderFormHtml(form, updatedData as any, tenant?.name || 'Organization', animal);

      // Determine if payment is needed
      const hasFee = submission.feeAmount && submission.feeAmount > 0 && !submission.feeWaived;
      const hasDonation = donationReceivedCents && donationReceivedCents > 0;
      const totalAmount = (hasFee ? submission.feeAmount! : 0) + (hasDonation ? donationReceivedCents : 0);
      const paymentRequired = hasFee && submission.feeRequired;
      const hasPayment = totalAmount > 0;
      
      // If payment required but no amount, cannot complete
      if (paymentRequired && !hasPayment) {
        return res.status(400).json({ error: 'Payment is required to complete this form' });
      }
      
      // Update submission - if payment needed, status stays pending until payment complete
      const submissionStatus = hasPayment ? 'pending' : 'completed';
      const paymentStatus = hasPayment ? 'pending' : 'not_required';
      
      const updated = await updateSubmission(submission.id, submission.tenantId, {
        signatureData,
        formData,
        signedAt: new Date(),
        signerIpAddress: ipAddress,
        renderedHtml,
        status: submissionStatus,
        donationReceived: donationReceivedCents,
        paymentStatus,
      });

      // Auto-advance volunteer application if this is a Hold Harmless waiver
      (async () => {
        try {
          const { volunteerApplications } = await import('@shared/schema');
          
          // First, check if any volunteer application has this form as their holdHarmlessFormId
          const [volunteerAppByFormId] = await db
            .select()
            .from(volunteerApplications)
            .where(and(
              eq(volunteerApplications.tenantId, submission.tenantId),
              eq(volunteerApplications.holdHarmlessFormId, submission.formId),
              eq(volunteerApplications.applicantEmail, submission.signerEmail),
              eq(volunteerApplications.pipelineStatus, 'waiver_needed')
            ))
            .limit(1);
          
          if (volunteerAppByFormId) {
            // Update volunteer application to active pool
            await db.update(volunteerApplications)
              .set({
                holdHarmlessSignedAt: new Date(),
                pipelineStatus: 'active_pool',
                status: 'approved',
                updatedAt: new Date()
              })
              .where(eq(volunteerApplications.id, volunteerAppByFormId.id));
            
            console.log(`[Volunteer Pipeline] Auto-advanced volunteer ${volunteerAppByFormId.applicantEmail} to active_pool after Hold Harmless signing`);
          } else if (form.name.toLowerCase().includes('hold harmless') || form.name.toLowerCase().includes('waiver')) {
            // Fallback: match by email if form name contains hold harmless/waiver
            const [volunteerApp] = await db
              .select()
              .from(volunteerApplications)
              .where(and(
                eq(volunteerApplications.tenantId, submission.tenantId),
                eq(volunteerApplications.applicantEmail, submission.signerEmail),
                eq(volunteerApplications.pipelineStatus, 'waiver_needed')
              ))
              .limit(1);
            
            if (volunteerApp) {
              await db.update(volunteerApplications)
                .set({
                  holdHarmlessSignedAt: new Date(),
                  pipelineStatus: 'active_pool',
                  status: 'approved',
                  updatedAt: new Date()
                })
                .where(eq(volunteerApplications.id, volunteerApp.id));
              
              console.log(`[Volunteer Pipeline] Auto-advanced volunteer ${volunteerApp.applicantEmail} to active_pool after Hold Harmless signing (fallback match)`);
            }
          }
        } catch (volunteerError) {
          console.error('[Volunteer Pipeline] Error auto-advancing volunteer:', volunteerError);
        }
      })();

      // Create document record and optionally generate PDF (async - don't wait)
      (async () => {
        try {
          const { documents, users } = await import('@shared/schema');
          const fileName = `${form.name.replace(/\s+/g, '_')}_${submission.signerName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
          
          // Get first admin user for uploadedBy field
          // Note: roles is an array, so we use sql to check array containment
          const [adminUser] = await db.select({ id: users.id })
            .from(users)
            .where(and(
              eq(users.tenantId, submission.tenantId),
              sql`'admin' = ANY(${users.roles})`
            ))
            .limit(1);
          
          // Try to generate PDF
          let pdfUrl = null;
          try {
            const { generateCustomFormPdf } = await import('./services/custom-form');
            const pdfResult = await generateCustomFormPdf(submission.id, submission.tenantId);
            
            if (pdfResult?.pdfUrl) {
              pdfUrl = pdfResult.pdfUrl;
              
              // Update submission with PDF URL
              await updateSubmission(submission.id, submission.tenantId, {
                pdfUrl: pdfUrl,
              });
              console.log(`[CustomForms] PDF generated for submission ${submission.id}`);
            }
          } catch (pdfError) {
            console.error(`[CustomForms] PDF generation failed for submission ${submission.id}:`, pdfError);
            // Continue anyway - we'll create document record without PDF
          }
          
          // Create document record regardless of PDF generation success
          if (adminUser) {
            await db.insert(documents).values({
              tenantId: submission.tenantId,
              title: `${form.name} - ${submission.signerName}`,
              description: pdfUrl 
                ? `Signed form submitted on ${new Date().toLocaleDateString()}`
                : `Form submitted on ${new Date().toLocaleDateString()} (PDF generation pending)`,
              fileUrl: pdfUrl || `/api/custom-forms/submissions/${submission.id}/pdf`,
              fileName: fileName,
              fileSize: pdfUrl ? 50000 : 0,
              category: 'forms',
              uploadedBy: adminUser.id,
              storageType: pdfUrl ? 'replit_object_storage' : 'pending',
              updatedAt: new Date(),
            });
            console.log(`[CustomForms] Document record created for submission ${submission.id}${pdfUrl ? ' with PDF' : ' (PDF pending)'}`);
          } else {
            console.warn(`[CustomForms] No admin user found to set as uploadedBy for document`);
          }
        } catch (docError) {
          console.error(`[CustomForms] Could not create document record:`, docError);
        }
      })();

      // Send confirmation email to signer (async - don't wait)
      (async () => {
        try {
          const { EmailService } = await import('./lib/email-service');
          const emailService = await EmailService.forTenant(submission.tenantId);
          
          if (emailService) {
            await emailService.send({
              to: submission.signerEmail,
              subject: `Form Completed: ${form.name}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">Thank you, ${submission.signerName}!</h2>
                  <p>Your submission for "${form.name}" has been received and recorded.</p>
                  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Form:</strong> ${form.name}</p>
                    <p style="margin: 10px 0 0;"><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
                  </div>
                  <p style="color: #666;">This confirmation serves as your receipt. If you have any questions, please contact ${tenant?.name || 'the organization'}.</p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                  <p style="color: #888; font-size: 12px;">This email was sent by ${tenant?.name || 'the organization'} via iRescue.life</p>
                </div>
              `,
            });
            console.log(`[CustomForms] Confirmation email sent to ${submission.signerEmail}`);
          }
        } catch (emailError) {
          console.error(`[CustomForms] Confirmation email failed:`, emailError);
        }
      })();

      // Notify staff (async - don't wait)
      (async () => {
        try {
          const { EmailService } = await import('./lib/email-service');
          const emailService = await EmailService.forTenant(submission.tenantId);
          
          if (emailService && tenant?.contactEmail) {
            await emailService.send({
              to: tenant.contactEmail,
              subject: `New Form Submission: ${form.name}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">New Form Submission Received</h2>
                  <p>A new form has been completed and submitted:</p>
                  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Form:</strong> ${form.name}</p>
                    <p style="margin: 10px 0 0;"><strong>Submitted by:</strong> ${submission.signerName} (${submission.signerEmail})</p>
                    <p style="margin: 10px 0 0;"><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                  </div>
                  <p>You can view and manage all form submissions in your admin dashboard under Custom Forms.</p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                  <p style="color: #888; font-size: 12px;">This notification was sent by iRescue.life</p>
                </div>
              `,
            });
            console.log(`[CustomForms] Staff notification sent to ${tenant.contactEmail}`);
          }
        } catch (emailError) {
          console.error(`[CustomForms] Staff notification email failed:`, emailError);
        }
      })();

      // Log to activity feed (async - don't wait)
      (async () => {
        try {
          const { activityLogs } = await import('@shared/schema');
          
          // Determine description based on payment status
          let description = `submitted form "${form.name}"`;
          if (hasPayment) {
            const totalDollars = (totalAmount / 100).toFixed(2);
            description += ` (payment pending: $${totalDollars})`;
          }
          
          await db.insert(activityLogs).values({
            tenantId: submission.tenantId,
            userId: null, // Public submission - no user ID
            entityType: 'CustomFormSubmission',
            entityId: submission.id,
            action: 'form_submitted',
            description: description,
            category: 'system',
            metadata: {
              formId: form.id,
              formName: form.name,
              signerName: submission.signerName,
              signerEmail: submission.signerEmail,
              hasPayment,
              feeAmount: submission.feeAmount,
              donationAmount: donationReceivedCents,
              animalId: submission.animalId,
              animalName: animal?.name,
            },
          });
          console.log(`[CustomForms] Activity log created for submission ${submission.id}`);
        } catch (activityError) {
          console.error(`[CustomForms] Failed to create activity log:`, activityError);
        }
      })();

      // Create inbox notification (async - don't wait)
      (async () => {
        try {
          const { inboundEmails } = await import('@shared/schema');
          const animalInfo = animal ? `\nAnimal: ${animal.name}` : '';
          
          const emailSubject = `Form Submission: ${form.name} from ${submission.signerName}`;
          const emailBody = `
Custom Form Submission Received

Form: ${form.name}${animalInfo}

Signer Information:
Name: ${submission.signerName}
Email: ${submission.signerEmail}
Phone: ${submission.signerPhone || 'Not provided'}

Submission ID: ${submission.id}
Signed: ${new Date().toLocaleString()}
IP Address: ${ipAddress}

View this submission in Custom Forms > ${form.name} > Submissions
          `.trim();

          await db.insert(inboundEmails).values({
            tenantId: submission.tenantId,
            messageId: `custom-form-${submission.id}`,
            from: submission.signerEmail,
            fromName: submission.signerName,
            to: `${tenant?.subdomain || 'forms'}@mail.irescue.life`,
            subject: emailSubject,
            textBody: emailBody,
            htmlBody: emailBody.replace(/\n/g, '<br>'),
            status: 'unprocessed',
          });
          console.log(`[CustomForms] Inbox notification created for submission ${submission.id}`);
        } catch (inboxError) {
          console.error(`[CustomForms] Failed to create inbox notification:`, inboxError);
        }
      })();

      // If payment is needed, include payment info in response
      if (hasPayment) {
        res.json({ 
          success: true, 
          message: 'Form signed successfully. Please complete payment.',
          submissionId: updated?.id,
          requiresPayment: true,
          paymentInfo: {
            feeAmount: hasFee ? submission.feeAmount : 0,
            feeLabel: submission.feeLabel || 'Fee',
            donationAmount: donationReceivedCents || 0,
            totalAmount,
          },
          paymentUrl: `/form/${req.params.token}/payment`,
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Form submitted successfully',
          submissionId: updated?.id,
          requiresPayment: false,
        });
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/custom-forms/submissions/:id/pdf
   * Get PDF download URL for a completed submission
   * Returns a fresh signed URL (15-minute expiry) on each request
   */
  app.get('/api/custom-forms/submissions/:id/pdf', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getSubmissionById, generateCustomFormPdf, updateSubmission, generateSignedFormUrl } = await import('./services/custom-form');
      
      const submission = await getSubmissionById(req.params.id, req.tenant!.id);
      
      if (!submission) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      if (submission.status !== 'completed') {
        return res.status(400).json({ error: 'Form has not been completed yet' });
      }

      // If PDF path already exists, generate a fresh signed URL
      if (submission.pdfUrl) {
        try {
          const signedUrl = await generateSignedFormUrl(submission.pdfUrl, submission.signerName, 900); // 15 min
          return res.json({ pdfUrl: signedUrl });
        } catch (urlError) {
          console.warn(`[CustomForms] Could not generate signed URL for existing PDF, regenerating:`, urlError);
          // Fall through to regenerate PDF
        }
      }

      // Generate PDF on demand if not already generated
      const pdfResult = await generateCustomFormPdf(submission.id, req.tenant!.id);
      
      if (!pdfResult?.pdfUrl) {
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }

      // Update submission with PDF path (not signed URL)
      await updateSubmission(submission.id, req.tenant!.id, {
        pdfUrl: pdfResult.pdfUrl,
      });

      // Generate fresh signed URL for download
      const signedUrl = await generateSignedFormUrl(pdfResult.pdfUrl, submission.signerName, 900);
      res.json({ pdfUrl: signedUrl });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/custom-forms/sign/:token/payment
   * Get payment information for a form submission (public)
   */
  app.get('/api/custom-forms/sign/:token/payment', requireTenant, async (req, res, next) => {
    try {
      const { getSubmissionByToken, getFormById } = await import('./services/custom-form');
      
      const submission = await getSubmissionByToken(req.params.token);
      
      if (!submission) {
        return res.status(404).json({ error: 'Form session not found' });
      }

      if (submission.tenantId !== req.tenant!.id) {
        return res.status(403).json({ error: 'Invalid tenant' });
      }

      // Must be signed but not completed (pending payment)
      if (!submission.signedAt) {
        return res.status(400).json({ error: 'Form must be signed before payment' });
      }

      if (submission.paymentStatus === 'completed') {
        return res.status(400).json({ error: 'Payment already completed' });
      }

      const form = await getFormById(submission.formId, submission.tenantId);
      
      res.json({
        success: true,
        submission: {
          id: submission.id,
          signerName: submission.signerName,
          signerEmail: submission.signerEmail,
          feeAmount: submission.feeAmount,
          feeLabel: submission.feeLabel,
          feeRequired: submission.feeRequired,
          feeWaived: submission.feeWaived,
          donationReceived: submission.donationReceived,
          enableDonation: submission.enableDonation,
          donationSuggested: submission.donationSuggested,
          paymentStatus: submission.paymentStatus,
        },
        form: form ? {
          id: form.id,
          name: form.name,
        } : null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/custom-forms/sign/:token/payment/create-intent
   * Create a Stripe PaymentIntent for form fees and donations (public)
   */
  app.post('/api/custom-forms/sign/:token/payment/create-intent', requireTenant, async (req, res, next) => {
    try {
      const { getSubmissionByToken, getFormById, updateSubmission } = await import('./services/custom-form');
      const { processFormFeePayment } = await import('./services/paw-pay');
      
      const submission = await getSubmissionByToken(req.params.token);
      
      if (!submission) {
        return res.status(404).json({ error: 'Form session not found' });
      }

      if (submission.tenantId !== req.tenant!.id) {
        return res.status(403).json({ error: 'Invalid tenant' });
      }

      // Must be signed but not completed
      if (!submission.signedAt) {
        return res.status(400).json({ error: 'Form must be signed before payment' });
      }

      if (submission.paymentStatus === 'completed') {
        return res.status(400).json({ error: 'Payment already completed' });
      }

      // Fee waived means no payment needed
      if (submission.feeWaived) {
        return res.status(400).json({ error: 'Fee has been waived - no payment required' });
      }

      const form = await getFormById(submission.formId, submission.tenantId);
      
      // Calculate amounts
      const feeAmount = submission.feeAmount || 0;
      const donationAmount = submission.donationReceived || 0;
      const totalAmount = feeAmount + donationAmount;
      
      if (totalAmount <= 0) {
        return res.status(400).json({ error: 'No payment amount specified' });
      }

      // Create payment intent using Paw Pay
      const result = await processFormFeePayment({
        tenantId: submission.tenantId,
        submissionId: submission.id,
        feeAmount: feeAmount,
        donationAmount: donationAmount,
        feeLabel: submission.feeLabel || 'Fee',
        formName: form?.name,
        payerEmail: submission.signerEmail,
        payerName: submission.signerName,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to create payment' });
      }

      // Update submission with payment intent ID and status
      await updateSubmission(submission.id, submission.tenantId, {
        paymentIntentId: result.paymentIntentId,
        paymentStatus: 'processing',
      });

      res.json({
        success: true,
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        amount: totalAmount,
        feeBreakdown: {
          feeAmount,
          feeLabel: submission.feeLabel || 'Fee',
          donationAmount,
          platformFee: result.platformFeeAmount,
          total: totalAmount,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/custom-forms/sign/:token/payment/complete
   * Complete payment and finalize form submission (public)
   */
  app.post('/api/custom-forms/sign/:token/payment/complete', requireTenant, async (req, res, next) => {
    try {
      const { getSubmissionByToken, getFormById, updateSubmission } = await import('./services/custom-form');
      const { donations } = await import('@shared/schema');
      
      const submission = await getSubmissionByToken(req.params.token);
      
      if (!submission) {
        return res.status(404).json({ error: 'Form session not found' });
      }

      if (submission.tenantId !== req.tenant!.id) {
        return res.status(403).json({ error: 'Invalid tenant' });
      }

      if (submission.paymentStatus === 'completed') {
        return res.status(400).json({ error: 'Payment already completed' });
      }

      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment intent ID required' });
      }

      // Verify payment intent ID matches the one we created for this submission
      if (submission.paymentIntentId && submission.paymentIntentId !== paymentIntentId) {
        return res.status(400).json({ error: 'Invalid payment intent ID' });
      }

      // Update submission status to completed
      const totalPaid = (submission.feeAmount || 0) + (submission.donationReceived || 0);
      
      const updated = await updateSubmission(submission.id, submission.tenantId, {
        status: 'completed',
        paymentStatus: 'completed',
        paymentIntentId: paymentIntentId,
        totalPaid: totalPaid,
      });

      // If there's a donation component, record it
      if (submission.donationReceived && submission.donationReceived > 0) {
        try {
          const form = await getFormById(submission.formId, submission.tenantId);
          await db.insert(donations).values({
            tenantId: submission.tenantId,
            donorName: submission.signerName,
            donorEmail: submission.signerEmail,
            amount: submission.donationReceived / 100, // Convert cents to dollars
            date: new Date(),
            source: 'form',
            paymentMethod: 'stripe',
            notes: `Donation via ${form?.name || 'custom form'}`,
            isAnonymous: false,
            receiptSent: true,
          });
        } catch (donationError) {
          console.error('[CustomForms] Failed to record donation:', donationError);
        }
      }

      // Log to activity feed (async - don't wait)
      (async () => {
        try {
          const { activityLogs } = await import('@shared/schema');
          const form = await getFormById(submission.formId, submission.tenantId);
          const totalDollars = (totalPaid / 100).toFixed(2);
          
          await db.insert(activityLogs).values({
            tenantId: submission.tenantId,
            userId: null, // Public submission
            entityType: 'CustomFormSubmission',
            entityId: submission.id,
            action: 'form_payment_completed',
            description: `completed payment of $${totalDollars} for form "${form?.name || 'unknown'}"`,
            category: 'finance',
            metadata: {
              formId: submission.formId,
              formName: form?.name,
              signerName: submission.signerName,
              signerEmail: submission.signerEmail,
              feeAmount: submission.feeAmount,
              donationAmount: submission.donationReceived,
              totalPaid,
              paymentIntentId,
            },
          });
          console.log(`[CustomForms] Payment activity log created for submission ${submission.id}`);
        } catch (activityError) {
          console.error(`[CustomForms] Failed to create payment activity log:`, activityError);
        }
      })();

      // Notify staff about completed payment (async - don't wait)
      (async () => {
        try {
          const { EmailService } = await import('./lib/email-service');
          const { tenants } = await import('@shared/schema');
          const form = await getFormById(submission.formId, submission.tenantId);
          const totalDollars = (totalPaid / 100).toFixed(2);
          
          const [tenant] = await db.select().from(tenants).where(eq(tenants.id, submission.tenantId)).limit(1);
          
          if (tenant?.contactEmail) {
            const emailService = await EmailService.forTenant(submission.tenantId);
            if (emailService) {
              await emailService.send({
                to: tenant.contactEmail,
                subject: `Payment Received: $${totalDollars} for ${form?.name || 'Form'}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #16a34a;">Payment Received</h2>
                    <p>A form submission payment has been completed:</p>
                    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 0;"><strong>Form:</strong> ${form?.name || 'Custom Form'}</p>
                      <p style="margin: 10px 0 0;"><strong>Submitted by:</strong> ${submission.signerName} (${submission.signerEmail})</p>
                      <p style="margin: 10px 0 0;"><strong>Amount Paid:</strong> $${totalDollars}</p>
                      ${submission.feeAmount ? `<p style="margin: 10px 0 0;"><strong>Fee:</strong> $${(submission.feeAmount / 100).toFixed(2)}</p>` : ''}
                      ${submission.donationReceived ? `<p style="margin: 10px 0 0;"><strong>Donation:</strong> $${(submission.donationReceived / 100).toFixed(2)}</p>` : ''}
                    </div>
                    <p>View this submission in your admin dashboard under Custom Forms.</p>
                  </div>
                `,
              });
              console.log(`[CustomForms] Payment notification sent to ${tenant.contactEmail}`);
            }
          }
        } catch (emailError) {
          console.error(`[CustomForms] Payment notification email failed:`, emailError);
        }
      })();

      res.json({
        success: true,
        message: 'Payment completed successfully',
        submissionId: updated?.id,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/custom-forms/submissions/:id/waive-fee
   * Waive the fee for a submission (admin/staff only)
   */
  app.post('/api/custom-forms/submissions/:id/waive-fee', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { getSubmissionById, updateSubmission } = await import('./services/custom-form');
      
      const submission = await getSubmissionById(req.params.id, req.tenant!.id);
      
      if (!submission) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      // Can only waive if not already completed
      if (submission.paymentStatus === 'completed') {
        return res.status(400).json({ error: 'Cannot waive fee - payment already completed' });
      }

      // Mark fee as waived and complete submission if it was signed
      const updateData: any = {
        feeWaived: true,
        paymentStatus: 'waived',
      };

      // If already signed, mark as completed
      if (submission.signedAt) {
        updateData.status = 'completed';
      }

      const updated = await updateSubmission(submission.id, req.tenant!.id, updateData);

      res.json({
        success: true,
        message: 'Fee waived successfully',
        submission: updated,
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Adoption Form Fields Routes (Customizable Form Questions)
  // ============================================================================

  /**
   * GET /api/adoption-form-fields
   * Get all active custom form fields for tenant (public)
   */
  app.get('/api/adoption-form-fields', requireTenant, async (req, res, next) => {
    try {
      const { adoptionFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const fields = await db.select()
        .from(adoptionFormFields)
        .where(and(
          eq(adoptionFormFields.tenantId, req.tenant!.id),
          eq(adoptionFormFields.isActive, true)
        ))
        .orderBy(adoptionFormFields.order);
      
      res.json({ fields });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/adoption-form-fields
   * Create a new custom form field (admin only)
   */
  app.post('/api/adoption-form-fields', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { adoptionFormFields, insertAdoptionFormFieldSchema } = await import('@shared/schema');
      
      const data = insertAdoptionFormFieldSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });
      
      const [field] = await db.insert(adoptionFormFields).values(data).returning();
      
      res.json({ success: true, field });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/adoption-form-fields/:id
   * Update a custom form field (admin only)
   */
  app.patch('/api/adoption-form-fields/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { adoptionFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const updateSchema = z.object({
        label: z.string().optional(),
        fieldType: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox']).optional(),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
        helpText: z.string().optional(),
        textAbove: z.string().nullable().optional(),
        textBelow: z.string().nullable().optional(),
        order: z.number().optional(),
        isActive: z.boolean().optional(),
      });
      
      const data = updateSchema.parse(req.body);
      
      const [field] = await db.update(adoptionFormFields)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(adoptionFormFields.id, req.params.id),
          eq(adoptionFormFields.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!field) {
        return res.status(404).json({ error: 'Form field not found' });
      }
      
      res.json({ success: true, field });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/adoption-form-fields/:id
   * Delete a custom form field (admin only)
   */
  app.delete('/api/adoption-form-fields/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { adoptionFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const [field] = await db.delete(adoptionFormFields)
        .where(and(
          eq(adoptionFormFields.id, req.params.id),
          eq(adoptionFormFields.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!field) {
        return res.status(404).json({ error: 'Form field not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/adoption-form-fields/reorder
   * Reorder form fields (admin only)
   */
  app.post('/api/adoption-form-fields/reorder', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { adoptionFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const schema = z.object({
        fieldIds: z.array(z.string()),
      });
      
      const { fieldIds } = schema.parse(req.body);
      
      // Update each field's order based on position in array
      await Promise.all(fieldIds.map((id, index) => 
        db.update(adoptionFormFields)
          .set({ order: index, updatedAt: new Date() })
          .where(and(
            eq(adoptionFormFields.id, id),
            eq(adoptionFormFields.tenantId, req.tenant!.id)
          ))
      ));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // VOLUNTEER FORM FIELDS
  // ============================================================================

  /**
   * GET /api/volunteer-form-fields
   * Get all active custom form fields for volunteer applications (public)
   */
  app.get('/api/volunteer-form-fields', requireTenant, async (req, res, next) => {
    try {
      const { volunteerFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const fields = await db.select()
        .from(volunteerFormFields)
        .where(and(
          eq(volunteerFormFields.tenantId, req.tenant!.id),
          eq(volunteerFormFields.isActive, true)
        ))
        .orderBy(volunteerFormFields.order);
      
      res.json({ fields });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/volunteer-form-fields
   * Create a new custom form field (admin only)
   */
  app.post('/api/volunteer-form-fields', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { volunteerFormFields, insertVolunteerFormFieldSchema } = await import('@shared/schema');
      
      const data = insertVolunteerFormFieldSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });
      
      const [field] = await db.insert(volunteerFormFields).values(data).returning();
      
      res.json({ success: true, field });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/volunteer-form-fields/:id
   * Update a custom form field (admin only)
   */
  app.patch('/api/volunteer-form-fields/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { volunteerFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const updateSchema = z.object({
        label: z.string().optional(),
        fieldType: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox']).optional(),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
        helpText: z.string().optional(),
        textAbove: z.string().nullable().optional(),
        textBelow: z.string().nullable().optional(),
        order: z.number().optional(),
        isActive: z.boolean().optional(),
      });
      
      const data = updateSchema.parse(req.body);
      
      const [field] = await db.update(volunteerFormFields)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(volunteerFormFields.id, req.params.id),
          eq(volunteerFormFields.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!field) {
        return res.status(404).json({ error: 'Form field not found' });
      }
      
      res.json({ success: true, field });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/volunteer-form-fields/:id
   * Delete a custom form field (admin only)
   */
  app.delete('/api/volunteer-form-fields/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { volunteerFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const [field] = await db.delete(volunteerFormFields)
        .where(and(
          eq(volunteerFormFields.id, req.params.id),
          eq(volunteerFormFields.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!field) {
        return res.status(404).json({ error: 'Form field not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/volunteer-form-fields/reorder
   * Reorder form fields (admin only)
   */
  app.post('/api/volunteer-form-fields/reorder', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { volunteerFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const schema = z.object({
        fieldIds: z.array(z.string()),
      });
      
      const { fieldIds } = schema.parse(req.body);
      
      await Promise.all(fieldIds.map((id, index) => 
        db.update(volunteerFormFields)
          .set({ order: index, updatedAt: new Date() })
          .where(and(
            eq(volunteerFormFields.id, id),
            eq(volunteerFormFields.tenantId, req.tenant!.id)
          ))
      ));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // FOSTER FORM FIELDS
  // ============================================================================

  /**
   * GET /api/foster-form-fields
   * Get all active custom form fields for foster applications (public)
   */
  app.get('/api/foster-form-fields', requireTenant, async (req, res, next) => {
    try {
      const { fosterFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const fields = await db.select()
        .from(fosterFormFields)
        .where(and(
          eq(fosterFormFields.tenantId, req.tenant!.id),
          eq(fosterFormFields.isActive, true)
        ))
        .orderBy(fosterFormFields.order);
      
      res.json({ fields });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-form-fields
   * Create a new custom form field (admin only)
   */
  app.post('/api/foster-form-fields', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { fosterFormFields, insertFosterFormFieldSchema } = await import('@shared/schema');
      
      const data = insertFosterFormFieldSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });
      
      const [field] = await db.insert(fosterFormFields).values(data).returning();
      
      res.json({ success: true, field });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/foster-form-fields/:id
   * Update a custom form field (admin only)
   */
  app.patch('/api/foster-form-fields/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { fosterFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const updateSchema = z.object({
        label: z.string().optional(),
        fieldType: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox']).optional(),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
        helpText: z.string().optional(),
        textAbove: z.string().nullable().optional(),
        textBelow: z.string().nullable().optional(),
        order: z.number().optional(),
        isActive: z.boolean().optional(),
      });
      
      const data = updateSchema.parse(req.body);
      
      const [field] = await db.update(fosterFormFields)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(fosterFormFields.id, req.params.id),
          eq(fosterFormFields.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!field) {
        return res.status(404).json({ error: 'Form field not found' });
      }
      
      res.json({ success: true, field });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/foster-form-fields/:id
   * Delete a custom form field (admin only)
   */
  app.delete('/api/foster-form-fields/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { fosterFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const [field] = await db.delete(fosterFormFields)
        .where(and(
          eq(fosterFormFields.id, req.params.id),
          eq(fosterFormFields.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!field) {
        return res.status(404).json({ error: 'Form field not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-form-fields/reorder
   * Reorder form fields (admin only)
   */
  app.post('/api/foster-form-fields/reorder', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { fosterFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const schema = z.object({
        fieldIds: z.array(z.string()),
      });
      
      const { fieldIds } = schema.parse(req.body);
      
      await Promise.all(fieldIds.map((id, index) => 
        db.update(fosterFormFields)
          .set({ order: index, updatedAt: new Date() })
          .where(and(
            eq(fosterFormFields.id, id),
            eq(fosterFormFields.tenantId, req.tenant!.id)
          ))
      ));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Surrender Form Fields Routes
  // ============================================================================

  /**
   * GET /api/surrender-form-fields
   * Get all active custom form fields for surrender requests (public)
   */
  app.get('/api/surrender-form-fields', requireTenant, async (req, res, next) => {
    try {
      const { surrenderFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const fields = await db.select()
        .from(surrenderFormFields)
        .where(and(
          eq(surrenderFormFields.tenantId, req.tenant!.id),
          eq(surrenderFormFields.isActive, true)
        ))
        .orderBy(surrenderFormFields.order);
      
      res.json({ fields });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/surrender-form-fields
   * Create a new custom form field (admin only)
   */
  app.post('/api/surrender-form-fields', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { surrenderFormFields, insertSurrenderFormFieldSchema } = await import('@shared/schema');
      
      const data = insertSurrenderFormFieldSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });
      
      const [field] = await db.insert(surrenderFormFields).values(data).returning();
      
      res.json({ success: true, field });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/surrender-form-fields/:id
   * Update a custom form field (admin only)
   */
  app.patch('/api/surrender-form-fields/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { surrenderFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const updateSchema = z.object({
        label: z.string().optional(),
        fieldType: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox']).optional(),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
        helpText: z.string().optional(),
        textAbove: z.string().nullable().optional(),
        textBelow: z.string().nullable().optional(),
        order: z.number().optional(),
        isActive: z.boolean().optional(),
      });
      
      const data = updateSchema.parse(req.body);
      
      const [field] = await db.update(surrenderFormFields)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(
          eq(surrenderFormFields.id, req.params.id),
          eq(surrenderFormFields.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!field) {
        return res.status(404).json({ error: 'Form field not found' });
      }
      
      res.json({ success: true, field });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/surrender-form-fields/:id
   * Delete a custom form field (admin only)
   */
  app.delete('/api/surrender-form-fields/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { surrenderFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const [field] = await db.delete(surrenderFormFields)
        .where(and(
          eq(surrenderFormFields.id, req.params.id),
          eq(surrenderFormFields.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!field) {
        return res.status(404).json({ error: 'Form field not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/surrender-form-fields/reorder
   * Reorder form fields (admin only)
   */
  app.post('/api/surrender-form-fields/reorder', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { surrenderFormFields } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const schema = z.object({
        fieldIds: z.array(z.string()),
      });
      
      const { fieldIds } = schema.parse(req.body);
      
      await Promise.all(fieldIds.map((id, index) => 
        db.update(surrenderFormFields)
          .set({ order: index, updatedAt: new Date() })
          .where(and(
            eq(surrenderFormFields.id, id),
            eq(surrenderFormFields.tenantId, req.tenant!.id)
          ))
      ));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Form Settings Routes (Intro text for forms)
  // ============================================================================

  /**
   * GET /api/form-settings/:formType
   * Get form settings (intro text) for a specific form type (public)
   */
  app.get('/api/form-settings/:formType', requireTenant, async (req, res, next) => {
    try {
      const { formSettings } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const formType = req.params.formType;
      if (!['adoption', 'volunteer', 'foster', 'surrender'].includes(formType)) {
        return res.status(400).json({ error: 'Invalid form type' });
      }

      const [setting] = await db.select()
        .from(formSettings)
        .where(and(
          eq(formSettings.tenantId, req.tenant!.id),
          eq(formSettings.formType, formType as any)
        ))
        .limit(1);

      res.json({ setting: setting || { formType, introText: null } });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/form-settings/:formType
   * Create or update form settings (admin only)
   */
  app.put('/api/form-settings/:formType', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { formSettings } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const formType = req.params.formType;
      if (!['adoption', 'volunteer', 'foster', 'surrender'].includes(formType)) {
        return res.status(400).json({ error: 'Invalid form type' });
      }

      const updateSchema = z.object({
        introText: z.string().nullable().optional(),
      });
      
      const data = updateSchema.parse(req.body);

      // Try to update first
      const [existing] = await db.select()
        .from(formSettings)
        .where(and(
          eq(formSettings.tenantId, req.tenant!.id),
          eq(formSettings.formType, formType as any)
        ))
        .limit(1);

      let setting;
      if (existing) {
        [setting] = await db.update(formSettings)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(formSettings.id, existing.id))
          .returning();
      } else {
        [setting] = await db.insert(formSettings)
          .values({
            tenantId: req.tenant!.id,
            formType: formType as any,
            ...data,
          })
          .returning();
      }

      res.json({ success: true, setting });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Public Form Photo Upload Route
  // ============================================================================

  /**
   * POST /api/public/form-photos/upload
   * Upload photos for public form submissions (no auth required)
   * Used for custom photo fields in adoption, volunteer, foster, surrender forms
   */
  app.post('/api/public/form-photos/upload', requireTenant, async (req, res, next) => {
    try {
      const multer = (await import('multer')).default;
      const { TenantFileStorage } = await import('./lib/tenantFileStorage');
      
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
      
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB limit for public uploads
        },
        fileFilter: (_req, file, cb) => {
          if (file.mimetype.startsWith('image/')) {
            cb(null, true);
          } else {
            const ext = file.originalname.toLowerCase().split('.').pop();
            if (ext && imageExtensions.includes(ext)) {
              cb(null, true);
            } else {
              cb(new Error('Only image files are allowed'));
            }
          }
        },
      }).single('file');

      upload(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }

        const file = req.file as Express.Multer.File;
        if (!file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        try {
          const tenantId = req.tenant!.id;
          const fieldId = req.body.fieldId || 'unknown';
          const formType = req.body.formType || 'form';
          
          const storage = await TenantFileStorage.forTenant(tenantId);
          
          let fileBuffer = file.buffer;
          let contentType = file.mimetype;
          
          // Convert HEIC/HEIF to JPEG for browser compatibility
          const ext = file.originalname.toLowerCase().split('.').pop();
          if (ext === 'heic' || ext === 'heif' || file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
            try {
              const heicConvert = (await import('heic-convert')).default;
              const convertedBuffer = await heicConvert({
                buffer: file.buffer,
                format: 'JPEG',
                quality: 0.8,
              });
              fileBuffer = Buffer.from(convertedBuffer);
              contentType = 'image/jpeg';
            } catch (convError) {
              console.error('HEIC conversion failed:', convError);
            }
          }
          
          // Generate unique filename
          const timestamp = Date.now();
          const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
          const fileName = `${formType}_${fieldId}_${timestamp}_${sanitizedName}`;
          
          const result = await storage.uploadFile({
            tenantId,
            userId: 'public', // No user for public uploads
            category: 'general-docs',
            visibility: 'public',
            fileName,
            mimeType: contentType,
            content: fileBuffer,
          });

          if (!result.success) {
            return res.status(500).json({ error: result.error || 'Upload failed' });
          }

          res.json({
            success: true,
            fileUrl: result.fileUrl,
            storageType: result.storageType,
            fileName: file.originalname,
          });
        } catch (uploadError) {
          console.error('Public form photo upload error:', uploadError);
          res.status(500).json({ error: 'Failed to upload photo' });
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Donations & Finance Routes
  // ============================================================================

  /**
   * POST /api/donations
   * Submit donation (public)
   */
  app.post('/api/donations', requireTenant, async (req, res, next) => {
    try {
      const { createDonation } = await import('./services/donations');
      const { insertDonationSchema } = await import('@shared/schema');
      
      const data = insertDonationSchema.omit({ tenantId: true }).parse(req.body);
      const donation = await createDonation(req.tenant!.id, data);
      
      // Log activity (non-blocking - failures won't affect response)
      try {
        const { logActivity } = await import('./lib/activity-logger');
        await logActivity({
          tenantId: req.tenant!.id,
          userId: null, // Public donation, no user
          entityType: 'Donation',
          entityId: donation.id,
          action: 'created',
          description: `received $${donation.amount} donation from ${donation.donorName || 'Anonymous'}`,
          category: 'finance',
          metadata: { amount: donation.amount, source: donation.source }
        });
      } catch (logError) {
        console.error('Failed to log donation activity:', logError);
      }
      
      res.json({ success: true, donation });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/donations
   * Get all donations for a tenant (staff only)
   */
  app.get('/api/donations', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { donations } = await import('@shared/schema');
      const { eq, desc } = await import('drizzle-orm');
      
      const allDonations = await db.select()
        .from(donations)
        .where(eq(donations.tenantId, req.tenant!.id))
        .orderBy(desc(donations.date));
      
      res.json({ donations: allDonations });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/donations/manual
   * Create a manual donation record (admin only) - supports cash and in-kind
   */
  app.post('/api/donations/manual', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { donations, donors } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const donationSchema = z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email(),
        donorAddress: z.string().optional(),
        donationType: z.enum(['cash', 'in_kind']),
        amount: z.number().optional(), // Required for cash donations
        description: z.string().optional(), // Required for in-kind donations
        message: z.string().optional(),
        date: z.string().transform(s => new Date(s)),
        sponsoredAnimalId: z.string().uuid().optional(),
      });
      
      const data = donationSchema.parse(req.body);
      
      // Validate: cash donations need amount, in-kind need description
      if (data.donationType === 'cash' && (!data.amount || data.amount <= 0)) {
        return res.status(400).json({ error: 'Cash donations require a positive amount' });
      }
      if (data.donationType === 'in_kind' && !data.description) {
        return res.status(400).json({ error: 'In-kind donations require a description of items donated' });
      }
      
      // Check if donor exists, create if not
      let [existingDonor] = await db.select()
        .from(donors)
        .where(and(
          eq(donors.tenantId, req.tenant!.id),
          eq(donors.email, data.donorEmail)
        ));
      
      if (!existingDonor) {
        [existingDonor] = await db.insert(donors)
          .values({
            tenantId: req.tenant!.id,
            email: data.donorEmail,
            name: data.donorName,
            totalDonated: data.donationType === 'cash' ? (data.amount || 0) : 0, // Amount already in cents
            lastDonationDate: data.date,
          })
          .returning();
      } else if (data.donationType === 'cash' && data.amount) {
        // Update donor's total (amount already in cents)
        await db.update(donors)
          .set({
            totalDonated: existingDonor.totalDonated + data.amount,
            lastDonationDate: data.date,
          })
          .where(eq(donors.id, existingDonor.id));
      }
      
      // Create donation record (amount is in cents)
      const [donation] = await db.insert(donations)
        .values({
          tenantId: req.tenant!.id,
          donorId: existingDonor.id,
          donorName: data.donorName,
          donorEmail: data.donorEmail,
          donorAddress: data.donorAddress,
          donationType: data.donationType,
          amount: data.donationType === 'cash' ? data.amount : null,
          description: data.description,
          message: data.message,
          sponsoredAnimalId: data.sponsoredAnimalId,
          source: 'manual',
          date: data.date,
        })
        .returning();
      
      // Log activity (convert cents to dollars for display)
      try {
        const { logActivity } = await import('./lib/activity-logger');
        await logActivity({
          tenantId: req.tenant!.id,
          userId: req.user!.id,
          entityType: 'Donation',
          entityId: donation.id,
          action: 'created',
          description: data.donationType === 'cash' 
            ? `recorded $${((data.amount || 0) / 100).toFixed(2)} cash donation from ${data.donorName}`
            : `recorded in-kind donation from ${data.donorName}: ${data.description}`,
          category: 'finance',
          metadata: { donationType: data.donationType, amount: data.amount, description: data.description }
        });
      } catch (logError) {
        console.error('Failed to log donation activity:', logError);
      }
      
      res.json({ success: true, donation });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/donations/offline
   * Record offline donation (cash, check, in-kind goods/services) with auto-contact creation
   */
  app.post('/api/donations/offline', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { donations, donors, contacts } = await import('@shared/schema');
      const { eq, and, sql } = await import('drizzle-orm');
      
      const offlineDonationSchema = z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email().nullable().optional(),
        donorAddress: z.string().nullable().optional(),
        donorCity: z.string().nullable().optional(),
        donorState: z.string().nullable().optional(),
        donorZip: z.string().nullable().optional(),
        donationType: z.enum(['cash', 'check', 'in_kind_goods', 'in_kind_services']),
        amount: z.number().positive().nullable().optional(),
        description: z.string().nullable().optional(),
        donorStatedValue: z.number().nullable().optional(),
        estimatedValue: z.number().nullable().optional(),
        checkNumber: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        donationDate: z.string().transform(s => new Date(s)),
      });
      
      const data = offlineDonationSchema.parse(req.body);
      
      const isCashOrCheck = data.donationType === 'cash' || data.donationType === 'check';
      const isInKind = data.donationType === 'in_kind_goods' || data.donationType === 'in_kind_services';
      
      // Validate required fields based on type
      if (isCashOrCheck && (!data.amount || data.amount <= 0)) {
        return res.status(400).json({ error: 'Amount is required for cash/check donations' });
      }
      if (isInKind && !data.description) {
        return res.status(400).json({ error: 'Description is required for in-kind donations' });
      }
      
      // Convert dollars to cents for storage (only for cash amounts)
      const amountInCents = data.amount ? Math.round(data.amount * 100) : null;
      const donorStatedValueCents = data.donorStatedValue ? Math.round(data.donorStatedValue * 100) : null;
      const estimatedValueCents = data.estimatedValue ? Math.round(data.estimatedValue * 100) : null;
      
      let donorId: string | null = null;
      let contactId: string | null = null;
      
      // If email provided, find or create donor and contact
      if (data.donorEmail) {
        // Handle donors table
        let [existingDonor] = await db.select()
          .from(donors)
          .where(and(
            eq(donors.tenantId, req.tenant!.id),
            eq(donors.email, data.donorEmail)
          ));
        
        const donationAmount = isCashOrCheck && amountInCents ? amountInCents : 0;
        
        if (!existingDonor) {
          [existingDonor] = await db.insert(donors)
            .values({
              tenantId: req.tenant!.id,
              email: data.donorEmail,
              name: data.donorName,
              totalDonated: donationAmount,
              lastDonationDate: data.donationDate,
            })
            .returning();
        } else if (isCashOrCheck && amountInCents) {
          await db.update(donors)
            .set({
              totalDonated: existingDonor.totalDonated + donationAmount,
              lastDonationDate: data.donationDate,
            })
            .where(eq(donors.id, existingDonor.id));
        }
        donorId = existingDonor.id;
        
        // Handle contacts table - auto-create/update contact
        let [existingContact] = await db.select()
          .from(contacts)
          .where(and(
            eq(contacts.tenantId, req.tenant!.id),
            eq(contacts.email, data.donorEmail)
          ));
        
        if (!existingContact) {
          // Create new contact with donation source
          const fullAddress = [data.donorAddress, data.donorCity, data.donorState, data.donorZip]
            .filter(Boolean)
            .join(', ');
          
          [existingContact] = await db.insert(contacts)
            .values({
              tenantId: req.tenant!.id,
              name: data.donorName,
              email: data.donorEmail,
              address: fullAddress || null,
              source: ['donation'],
              totalDonated: donationAmount,
              donationCount: 1,
              lastDonationDate: data.donationDate,
            })
            .returning();
        } else {
          // Update existing contact - add donation source if not present, update stats
          const currentSources = existingContact.source || [];
          const updatedSources = currentSources.includes('donation') 
            ? currentSources 
            : [...currentSources, 'donation'];
          
          await db.update(contacts)
            .set({
              source: updatedSources,
              totalDonated: (existingContact.totalDonated || 0) + donationAmount,
              donationCount: (existingContact.donationCount || 0) + 1,
              lastDonationDate: data.donationDate,
              updatedAt: new Date(),
            })
            .where(eq(contacts.id, existingContact.id));
        }
        contactId = existingContact.id;
      }
      
      // Build notes/message
      let message = data.notes || '';
      if (data.donationType === 'check' && data.checkNumber) {
        message = `Check #${data.checkNumber}${message ? ' - ' + message : ''}`;
      }
      
      // Determine payment method for storage
      const paymentMethod = isCashOrCheck ? data.donationType : null;
      
      // Create donation record
      const [donation] = await db.insert(donations)
        .values({
          tenantId: req.tenant!.id,
          donorId: donorId,
          contactId: contactId,
          donorName: data.donorName,
          donorEmail: data.donorEmail || '',
          donorAddress: data.donorAddress || null,
          donorCity: data.donorCity || null,
          donorState: data.donorState || null,
          donorZip: data.donorZip || null,
          donationType: data.donationType,
          amount: amountInCents,
          description: data.description || null,
          donorStatedValue: donorStatedValueCents,
          estimatedValue: estimatedValueCents,
          paymentMethod: paymentMethod,
          checkNumber: data.checkNumber || null,
          message: message || null,
          source: 'manual',
          date: data.donationDate,
        })
        .returning();
      
      // Build activity log description
      let activityDescription: string;
      if (isInKind) {
        const valueNote = estimatedValueCents ? ` (est. $${(estimatedValueCents / 100).toFixed(2)})` : '';
        activityDescription = `recorded in-kind ${data.donationType === 'in_kind_goods' ? 'goods' : 'services'} donation from ${data.donorName}: ${data.description?.substring(0, 50)}${valueNote}`;
      } else {
        activityDescription = `recorded $${(amountInCents! / 100).toFixed(2)} ${data.donationType} donation from ${data.donorName}`;
      }
      
      // Log activity
      try {
        const { logActivity } = await import('./lib/activity-logger');
        await logActivity({
          tenantId: req.tenant!.id,
          userId: req.user!.id,
          entityType: 'Donation',
          entityId: donation.id,
          action: 'created',
          description: activityDescription,
          category: 'finance',
          metadata: { 
            donationType: data.donationType,
            amount: amountInCents, 
            estimatedValue: estimatedValueCents,
            checkNumber: data.checkNumber,
            contactCreated: !!contactId
          }
        });
      } catch (logError) {
        console.error('Failed to log donation activity:', logError);
      }
      
      res.json({ success: true, donation, contactId });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/donations/:id/generate-receipt
   * Generate IRS-compliant PDF receipt (admin only)
   */
  app.post('/api/donations/:id/generate-receipt', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { generateDonationReceipt } = await import('./services/donation-receipt-service');
      
      const result = await generateDonationReceipt({
        donationId: req.params.id,
        tenantId: req.tenant!.id,
      });
      
      if (!result.success) {
        return res.status(result.requiresManualReview ? 400 : 500).json({ 
          error: result.message,
          requiresManualReview: result.requiresManualReview 
        });
      }
      
      // Send PDF as downloadable file
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Receipt_${result.receiptNumber}.pdf"`);
      res.send(result.pdfBuffer);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/donations/:id/send-receipt
   * Generate and email IRS-compliant receipt to donor (admin only)
   */
  app.post('/api/donations/:id/send-receipt', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { generateAndEmailReceipt } = await import('./services/donation-receipt-service');
      
      const result = await generateAndEmailReceipt({
        donationId: req.params.id,
        tenantId: req.tenant!.id,
      });
      
      if (!result.success) {
        return res.status(result.requiresManualReview ? 400 : 500).json({ 
          error: result.message,
          requiresManualReview: result.requiresManualReview 
        });
      }
      
      // Log activity
      try {
        const { logActivity } = await import('./lib/activity-logger');
        await logActivity({
          tenantId: req.tenant!.id,
          userId: req.user!.id,
          entityType: 'Donation',
          entityId: req.params.id,
          action: 'updated',
          description: `sent tax receipt #${result.receiptNumber} to donor`,
          category: 'finance',
          metadata: { receiptNumber: result.receiptNumber }
        });
      } catch (logError) {
        console.error('Failed to log receipt activity:', logError);
      }
      
      res.json({ 
        success: true, 
        message: result.message,
        receiptNumber: result.receiptNumber 
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/donation-links
   * Get all donation links for tenant (staff only)
   */
  app.get('/api/donation-links', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { donationLinks } = await import('@shared/schema');
      
      const links = await db.select()
        .from(donationLinks)
        .where(eq(donationLinks.tenantId, req.tenant!.id))
        .orderBy(desc(donationLinks.createdAt));
      
      res.json({ donationLinks: links });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/donation-links
   * Create a new donation link via Stripe Connect (admin only)
   */
  app.post('/api/donation-links', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { donationLinks } = await import('@shared/schema');
      const { getPlatformStripeSecretKey, getPlatformFeePercent } = await import('./config/platform');
      const Stripe = (await import('stripe')).default;
      
      const createDonationLinkSchema = z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        amount: z.number().min(100), // Minimum $1.00
        isRecurring: z.boolean().default(true),
        interval: z.enum(['month', 'year']).default('month'),
        imageUrl: z.string().url().optional(),
        // Campaign type fields
        campaignType: z.enum(['general', 'sponsor_pet', 'virtual_kennel', 'emergency_fund', 'event']).default('general'),
        animalId: z.string().uuid().optional(), // For sponsor_pet campaigns
        tierName: z.string().optional(), // For virtual_kennel: "bronze", "silver", "gold"
        goalAmount: z.number().optional(), // For emergency_fund: target amount in cents
      });
      
      const data = createDonationLinkSchema.parse(req.body);
      const tenant = req.tenant!;
      
      // Check if tenant has Stripe Connect configured
      if (!tenant.stripeConnectedAccountId) {
        return res.status(400).json({ 
          error: 'Stripe Connect is not configured. Please connect your Stripe account first.' 
        });
      }
      
      const platformStripeKey = getPlatformStripeSecretKey();
      if (!platformStripeKey) {
        return res.status(500).json({ 
          error: 'Platform Stripe key not configured.' 
        });
      }
      
      const stripe = new Stripe(platformStripeKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      
      // Get platform fee percent based on tenant tier (pass tenant override if set)
      const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier as 'free' | 'professional', tenant.platformFeePercent);
      
      // Build Stripe metadata for campaign tracking
      const stripeMetadata: Record<string, string> = {
        campaign_type: data.campaignType,
        tenant_id: tenant.id,
        created_by: req.user!.id,
      };
      if (data.animalId) stripeMetadata.pet_id = data.animalId;
      if (data.tierName) stripeMetadata.tier_name = data.tierName;
      if (data.goalAmount) stripeMetadata.goal_amount = String(data.goalAmount);
      
      // 1. Create the Product on the connected account
      const productParams: Stripe.ProductCreateParams = {
        name: data.title,
        description: data.description || `Donation to support ${tenant.name}`,
        metadata: stripeMetadata,
      };
      if (data.imageUrl) {
        productParams.images = [data.imageUrl];
      }
      
      const product = await stripe.products.create(
        productParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      // 2. Create the Price (recurring or one-time)
      const priceParams: Stripe.PriceCreateParams = {
        product: product.id,
        unit_amount: data.amount,
        currency: 'usd',
      };
      
      if (data.isRecurring) {
        priceParams.recurring = { interval: data.interval };
      }
      
      const price = await stripe.prices.create(
        priceParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      // 3. Create the Payment Link with platform fee
      const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
        line_items: [{ price: price.id, quantity: 1 }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
      };
      
      // Apply platform fee only if > 0 (Stripe requires max 2 decimal places)
      if (platformFeePercent > 0) {
        paymentLinkParams.application_fee_percent = Math.round(platformFeePercent * 100) / 100;
      }
      
      const paymentLink = await stripe.paymentLinks.create(
        paymentLinkParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      // 4. Save to database
      const [newLink] = await db.insert(donationLinks).values({
        tenantId: tenant.id,
        title: data.title,
        description: data.description,
        amount: data.amount,
        isRecurring: data.isRecurring,
        interval: data.interval,
        imageUrl: data.imageUrl,
        campaignType: data.campaignType,
        animalId: data.animalId,
        tierName: data.tierName,
        goalAmount: data.goalAmount,
        stripeProductId: product.id,
        stripePriceId: price.id,
        stripePaymentLinkId: paymentLink.id,
        stripePaymentLinkUrl: paymentLink.url,
        createdById: req.user!.id,
      }).returning();
      
      res.json({ 
        success: true, 
        donationLink: newLink,
        paymentLinkUrl: paymentLink.url,
      });
    } catch (error: any) {
      console.error('[DONATION_LINK] Error creating donation link:', error);
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * DELETE /api/donation-links/:id
   * Deactivate a donation link (admin only)
   */
  app.delete('/api/donation-links/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { donationLinks } = await import('@shared/schema');
      const { getPlatformStripeSecretKey } = await import('./config/platform');
      const Stripe = (await import('stripe')).default;
      
      const linkId = req.params.id;
      if (!isValidUUID(linkId)) {
        return res.status(400).json({ error: 'Invalid link ID' });
      }
      
      // Find the link
      const [link] = await db.select()
        .from(donationLinks)
        .where(and(
          eq(donationLinks.id, linkId),
          eq(donationLinks.tenantId, req.tenant!.id)
        ));
      
      if (!link) {
        return res.status(404).json({ error: 'Donation link not found' });
      }
      
      const tenant = req.tenant!;
      const platformStripeKey = getPlatformStripeSecretKey();
      
      // Deactivate the payment link on Stripe if possible
      if (platformStripeKey && tenant.stripeConnectedAccountId) {
        try {
          const stripe = new Stripe(platformStripeKey, {
            apiVersion: '2025-09-30.clover',
            typescript: true,
          });
          
          await stripe.paymentLinks.update(
            link.stripePaymentLinkId,
            { active: false },
            { stripeAccount: tenant.stripeConnectedAccountId }
          );
        } catch (stripeError) {
          console.error('[DONATION_LINK] Error deactivating on Stripe:', stripeError);
          // Continue to mark as inactive in our DB even if Stripe fails
        }
      }
      
      // Mark as inactive in database
      await db.update(donationLinks)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(donationLinks.id, linkId));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:animalId/sponsor-link
   * Create a "Sponsor This Pet" donation link for a specific animal
   */
  app.post('/api/animals/:animalId/sponsor-link', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { donationLinks, animals } = await import('@shared/schema');
      const { getPlatformStripeSecretKey, getPlatformFeePercent } = await import('./config/platform');
      const Stripe = (await import('stripe')).default;
      
      const { animalId } = req.params;
      if (!isValidUUID(animalId)) {
        return res.status(400).json({ error: 'Invalid animal ID' });
      }
      
      const sponsorSchema = z.object({
        amount: z.number().min(500).default(2500), // Default $25 one-time donation
      });
      
      const data = sponsorSchema.parse(req.body);
      const tenant = req.tenant!;
      
      // Fetch the animal
      const [animal] = await db.select()
        .from(animals)
        .where(and(
          eq(animals.id, animalId),
          eq(animals.tenantId, tenant.id)
        ));
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      // Check if a sponsor link already exists for this animal
      const [existingLink] = await db.select()
        .from(donationLinks)
        .where(and(
          eq(donationLinks.animalId, animalId),
          eq(donationLinks.campaignType, 'sponsor_pet'),
          eq(donationLinks.isActive, true)
        ));
      
      if (existingLink) {
        return res.json({ 
          success: true, 
          donationLink: existingLink,
          paymentLinkUrl: existingLink.stripePaymentLinkUrl,
          existing: true,
        });
      }
      
      if (!tenant.stripeConnectedAccountId) {
        return res.status(400).json({ error: 'Stripe Connect is not configured.' });
      }
      
      const platformStripeKey = getPlatformStripeSecretKey();
      if (!platformStripeKey) {
        return res.status(500).json({ error: 'Platform Stripe key not configured.' });
      }
      
      const stripe = new Stripe(platformStripeKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      
      const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier as 'free' | 'professional', tenant.platformFeePercent);
      
      // Build the product with pet metadata (one-time donation, not recurring)
      const title = `Sponsor ${animal.name}`;
      const description = `Help cover ${animal.name}'s care costs with a one-time sponsorship donation.`;
      const imageUrl = animal.photoUrls?.[0];
      
      const stripeMetadata: Record<string, string> = {
        campaign_type: 'sponsor_pet',
        pet_id: animal.id,
        pet_name: animal.name,
        tenant_id: tenant.id,
      };
      
      const productParams: Stripe.ProductCreateParams = {
        name: title,
        description,
        metadata: stripeMetadata,
      };
      if (imageUrl) {
        productParams.images = [imageUrl];
      }
      
      const product = await stripe.products.create(
        productParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      // Create one-time price (not recurring) to avoid subscription management issues when animal is adopted
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: data.amount,
        currency: 'usd',
        // No recurring - this is a one-time sponsorship donation
      }, { stripeAccount: tenant.stripeConnectedAccountId });
      
      const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
        line_items: [{ price: price.id, quantity: 1 }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
      };
      
      // Stripe requires max 2 decimal places for application_fee_percent
      if (platformFeePercent > 0) {
        paymentLinkParams.application_fee_percent = Math.round(platformFeePercent * 100) / 100;
      }
      
      const paymentLink = await stripe.paymentLinks.create(
        paymentLinkParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      const [newLink] = await db.insert(donationLinks).values({
        tenantId: tenant.id,
        title,
        description,
        amount: data.amount,
        isRecurring: false, // One-time sponsorship - no subscription to cancel when adopted
        imageUrl,
        campaignType: 'sponsor_pet',
        animalId: animal.id,
        stripeProductId: product.id,
        stripePriceId: price.id,
        stripePaymentLinkId: paymentLink.id,
        stripePaymentLinkUrl: paymentLink.url,
        createdById: req.user!.id,
      }).returning();
      
      res.json({ 
        success: true, 
        donationLink: newLink,
        paymentLinkUrl: paymentLink.url,
      });
    } catch (error: any) {
      console.error('[SPONSOR_PET] Error creating sponsor link:', error);
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * POST /api/donation-links/virtual-kennel
   * Create "Virtual Kennel" subscription tiers (Bronze, Silver, Gold)
   */
  app.post('/api/donation-links/virtual-kennel', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { donationLinks } = await import('@shared/schema');
      const { getPlatformStripeSecretKey, getPlatformFeePercent } = await import('./config/platform');
      const Stripe = (await import('stripe')).default;
      
      const tenant = req.tenant!;
      
      if (!tenant.stripeConnectedAccountId) {
        return res.status(400).json({ error: 'Stripe Connect is not configured.' });
      }
      
      const platformStripeKey = getPlatformStripeSecretKey();
      if (!platformStripeKey) {
        return res.status(500).json({ error: 'Platform Stripe key not configured.' });
      }
      
      // Check if virtual kennel tiers already exist
      const existingTiers = await db.select()
        .from(donationLinks)
        .where(and(
          eq(donationLinks.tenantId, tenant.id),
          eq(donationLinks.campaignType, 'virtual_kennel'),
          eq(donationLinks.isActive, true)
        ));
      
      if (existingTiers.length > 0) {
        return res.json({ 
          success: true, 
          tiers: existingTiers,
          existing: true,
        });
      }
      
      const stripe = new Stripe(platformStripeKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      
      const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier as 'free' | 'professional', tenant.platformFeePercent);
      
      // Define the 3 tiers
      const tiers = [
        { name: 'bronze', title: 'Bowl Filler', amount: 1000, description: 'Help keep our food bowls full! Your monthly contribution feeds our animals.' },
        { name: 'silver', title: 'Bed Warmer', amount: 2500, description: 'Provide cozy bedding and comfort for animals waiting for their forever homes.' },
        { name: 'gold', title: 'Kennel Keeper', amount: 5000, description: 'Sponsor an entire kennel! Cover all care costs for shelter animals each month.' },
      ];
      
      const createdLinks = [];
      
      for (const tier of tiers) {
        const stripeMetadata: Record<string, string> = {
          campaign_type: 'virtual_kennel',
          tier_name: tier.name,
          tenant_id: tenant.id,
        };
        
        const product = await stripe.products.create({
          name: `${tier.title} - Virtual Kennel Sponsor`,
          description: tier.description,
          metadata: stripeMetadata,
        }, { stripeAccount: tenant.stripeConnectedAccountId });
        
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: tier.amount,
          currency: 'usd',
          recurring: { interval: 'month' },
        }, { stripeAccount: tenant.stripeConnectedAccountId });
        
        const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
          line_items: [{ price: price.id, quantity: 1 }],
          allow_promotion_codes: false,
          billing_address_collection: 'auto',
        };
        
        // Stripe requires max 2 decimal places for application_fee_percent
        if (platformFeePercent > 0) {
          paymentLinkParams.application_fee_percent = Math.round(platformFeePercent * 100) / 100;
        }
        
        const paymentLink = await stripe.paymentLinks.create(
          paymentLinkParams,
          { stripeAccount: tenant.stripeConnectedAccountId }
        );
        
        const [newLink] = await db.insert(donationLinks).values({
          tenantId: tenant.id,
          title: `${tier.title} - Virtual Kennel Sponsor`,
          description: tier.description,
          amount: tier.amount,
          isRecurring: true,
          interval: 'month',
          campaignType: 'virtual_kennel',
          tierName: tier.name,
          stripeProductId: product.id,
          stripePriceId: price.id,
          stripePaymentLinkId: paymentLink.id,
          stripePaymentLinkUrl: paymentLink.url,
          createdById: req.user!.id,
        }).returning();
        
        createdLinks.push(newLink);
      }
      
      res.json({ 
        success: true, 
        tiers: createdLinks,
      });
    } catch (error: any) {
      console.error('[VIRTUAL_KENNEL] Error creating tiers:', error);
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * POST /api/donation-links/emergency-fund
   * Create an "Emergency Vet Fund" campaign (one-time donations)
   */
  app.post('/api/donation-links/emergency-fund', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { donationLinks } = await import('@shared/schema');
      const { getPlatformStripeSecretKey, getPlatformFeePercent } = await import('./config/platform');
      const Stripe = (await import('stripe')).default;
      
      const emergencySchema = z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        goalAmount: z.number().min(10000), // Minimum $100 goal
        suggestedAmount: z.number().min(500).default(2500), // Default $25 suggestion
        imageUrl: z.string().url().optional(),
        animalId: z.string().uuid().optional(), // Optional link to specific animal
      });
      
      const data = emergencySchema.parse(req.body);
      const tenant = req.tenant!;
      
      if (!tenant.stripeConnectedAccountId) {
        return res.status(400).json({ error: 'Stripe Connect is not configured.' });
      }
      
      const platformStripeKey = getPlatformStripeSecretKey();
      if (!platformStripeKey) {
        return res.status(500).json({ error: 'Platform Stripe key not configured.' });
      }
      
      const stripe = new Stripe(platformStripeKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      
      const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier as 'free' | 'professional', tenant.platformFeePercent);
      
      const stripeMetadata: Record<string, string> = {
        campaign_type: 'emergency_fund',
        goal_amount: String(data.goalAmount),
        tenant_id: tenant.id,
      };
      if (data.animalId) stripeMetadata.pet_id = data.animalId;
      
      const productParams: Stripe.ProductCreateParams = {
        name: data.title,
        description: data.description || `Emergency fundraising campaign - Goal: $${(data.goalAmount / 100).toFixed(0)}`,
        metadata: stripeMetadata,
      };
      if (data.imageUrl) {
        productParams.images = [data.imageUrl];
      }
      
      const product = await stripe.products.create(
        productParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      // Create a one-time price (not recurring)
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: data.suggestedAmount,
        currency: 'usd',
        // No recurring - this is a one-time donation
      }, { stripeAccount: tenant.stripeConnectedAccountId });
      
      const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
        line_items: [{ 
          price: price.id, 
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 100 }, // Allow donors to adjust amount
        }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
      };
      
      // Stripe requires max 2 decimal places for application_fee_percent
      if (platformFeePercent > 0) {
        paymentLinkParams.application_fee_percent = Math.round(platformFeePercent * 100) / 100;
      }
      
      const paymentLink = await stripe.paymentLinks.create(
        paymentLinkParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      const [newLink] = await db.insert(donationLinks).values({
        tenantId: tenant.id,
        title: data.title,
        description: data.description,
        amount: data.suggestedAmount,
        isRecurring: false, // Emergency fund is one-time
        campaignType: 'emergency_fund',
        animalId: data.animalId,
        goalAmount: data.goalAmount,
        imageUrl: data.imageUrl,
        stripeProductId: product.id,
        stripePriceId: price.id,
        stripePaymentLinkId: paymentLink.id,
        stripePaymentLinkUrl: paymentLink.url,
        createdById: req.user!.id,
      }).returning();
      
      res.json({ 
        success: true, 
        donationLink: newLink,
        paymentLinkUrl: paymentLink.url,
      });
    } catch (error: any) {
      console.error('[EMERGENCY_FUND] Error creating campaign:', error);
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * POST /api/donation-links/event-flyer
   * Generate a QR code flyer for adoption events
   */
  app.post('/api/donation-links/event-flyer', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { donationLinks } = await import('@shared/schema');
      const { getPlatformStripeSecretKey, getPlatformFeePercent } = await import('./config/platform');
      const Stripe = (await import('stripe')).default;
      const QRCode = (await import('qrcode')).default;
      
      const flyerSchema = z.object({
        eventName: z.string().min(1).max(200).default('Adoption Event'),
        amount: z.number().min(500).default(2000), // Default $20
        isRecurring: z.boolean().default(true), // Monthly by default
      });
      
      const data = flyerSchema.parse(req.body);
      const tenant = req.tenant!;
      
      if (!tenant.stripeConnectedAccountId) {
        return res.status(400).json({ error: 'Stripe Connect is not configured.' });
      }
      
      const platformStripeKey = getPlatformStripeSecretKey();
      if (!platformStripeKey) {
        return res.status(500).json({ error: 'Platform Stripe key not configured.' });
      }
      
      const stripe = new Stripe(platformStripeKey, {
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      
      const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier as 'free' | 'professional', tenant.platformFeePercent);
      
      const title = `${data.eventName} - Donate Now`;
      const stripeMetadata: Record<string, string> = {
        campaign_type: 'event',
        event_name: data.eventName,
        tenant_id: tenant.id,
      };
      
      const product = await stripe.products.create({
        name: title,
        description: `Support ${tenant.name} at ${data.eventName}`,
        metadata: stripeMetadata,
      }, { stripeAccount: tenant.stripeConnectedAccountId });
      
      const priceParams: Stripe.PriceCreateParams = {
        product: product.id,
        unit_amount: data.amount,
        currency: 'usd',
      };
      
      if (data.isRecurring) {
        priceParams.recurring = { interval: 'month' };
      }
      
      const price = await stripe.prices.create(
        priceParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
        line_items: [{ price: price.id, quantity: 1 }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
      };
      
      // Stripe requires max 2 decimal places for application_fee_percent
      if (platformFeePercent > 0) {
        paymentLinkParams.application_fee_percent = Math.round(platformFeePercent * 100) / 100;
      }
      
      const paymentLink = await stripe.paymentLinks.create(
        paymentLinkParams,
        { stripeAccount: tenant.stripeConnectedAccountId }
      );
      
      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(paymentLink.url, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      
      const [newLink] = await db.insert(donationLinks).values({
        tenantId: tenant.id,
        title,
        description: `Event donation link for ${data.eventName}`,
        amount: data.amount,
        isRecurring: data.isRecurring,
        interval: data.isRecurring ? 'month' : null,
        campaignType: 'event',
        stripeProductId: product.id,
        stripePriceId: price.id,
        stripePaymentLinkId: paymentLink.id,
        stripePaymentLinkUrl: paymentLink.url,
        createdById: req.user!.id,
      }).returning();
      
      res.json({ 
        success: true, 
        donationLink: newLink,
        paymentLinkUrl: paymentLink.url,
        qrCodeDataUrl,
        tenantName: tenant.name,
        tenantLogo: tenant.logoUrl,
      });
    } catch (error: any) {
      console.error('[EVENT_FLYER] Error creating flyer:', error);
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * GET /api/finance
   * Get financial data (staff only)
   */
  app.get('/api/finance', requireTenant, requireAuth, requireRole('admin', 'board_member', 'staff'), async (req, res, next) => {
    try {
      const { getDonationsByTenant, getExpendituresByTenant, getFinancialSummary } = await import('./services/donations');
      
      const [donations, expenditures, summary] = await Promise.all([
        getDonationsByTenant(req.tenant!.id),
        getExpendituresByTenant(req.tenant!.id),
        getFinancialSummary(req.tenant!.id),
      ]);
      
      res.json({ donations, expenditures, summary });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/expenditures
   * Create expenditure (admin only)
   */
  app.post('/api/expenditures', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { createExpenditure } = await import('./services/donations');
      const { insertExpenditureSchema } = await import('@shared/schema');
      
      const data = insertExpenditureSchema.omit({ tenantId: true }).parse(req.body);
      const expenditure = await createExpenditure(req.tenant!.id, data);
      
      res.json({ success: true, expenditure });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/finance/import-csv
   * Import donations and expenditures from CSV (admin only)
   */
  app.post('/api/finance/import-csv', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { donations, expenditures, insertDonationSchema, insertExpenditureSchema } = await import('@shared/schema');
      
      const importSchema = z.object({
        type: z.enum(['donations', 'expenditures']),
        data: z.array(z.object({
          donorName: z.string().optional(),
          donorEmail: z.string().optional(),
          amount: z.number(),
          date: z.string(),
          source: z.string().optional(),
          vendor: z.string().optional(),
          category: z.string().optional(),
          notes: z.string().optional(),
        })),
      });

      const { type, data } = importSchema.parse(req.body);
      const results = { imported: 0, failed: 0, errors: [] as string[] };

      if (type === 'donations') {
        for (const row of data) {
          try {
            const donationData = {
              tenantId: req.tenant!.id,
              donorName: row.donorName || 'Anonymous',
              donorEmail: row.donorEmail || 'csv-import@unknown.com', // Use a placeholder email for CSV imports
              amount: row.amount,
              date: new Date(row.date),
              source: (row.source || 'quickbooks_import') as 'manual' | 'online_form' | 'quickbooks_import',
            };
            
            await db.insert(donations).values([donationData]);
            results.imported++;
          } catch (error: any) {
            results.failed++;
            results.errors.push(`Row with donor ${row.donorName}: ${error.message}`);
          }
        }
      } else {
        for (const row of data) {
          try {
            const expenditureData = {
              tenantId: req.tenant!.id,
              vendor: row.vendor || 'Unknown',
              amount: row.amount,
              date: new Date(row.date),
              category: (row.category?.toLowerCase() || 'other') as 'vet' | 'food' | 'supplies' | 'admin' | 'transport' | 'other',
              notes: row.notes || null,
            };
            
            await db.insert(expenditures).values([expenditureData]);
            results.imported++;
          } catch (error: any) {
            results.failed++;
            results.errors.push(`Row with vendor ${row.vendor}: ${error.message}`);
          }
        }
      }

      res.json({ 
        success: true, 
        imported: results.imported,
        failed: results.failed,
        errors: results.errors.slice(0, 10), // Return first 10 errors only
      });
    } catch (error) {
      next(error);
    }
  });

  // PayPal sync route removed - Stripe is the sole payment processor

  /**
   * GET /api/donors
   * Get all donors with email addresses (admin only - for newsletters)
   */
  app.get('/api/donors', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { donors } = await import('@shared/schema');
      
      const donorList = await db
        .select()
        .from(donors)
        .where(eq(donors.tenantId, req.tenant!.id))
        .orderBy(desc(donors.lastDonationDate));
      
      res.json({ donors: donorList });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Grant Management Routes
  // ============================================================================

  /**
   * GET /api/grants
   * Get all grants for tenant (admin/staff only)
   */
  app.get('/api/grants', requireTenant, requireAuth, requireRole('admin', 'board_member', 'staff'), async (req, res, next) => {
    try {
      const { grants } = await import('@shared/schema');
      
      const grantList = await db
        .select()
        .from(grants)
        .where(eq(grants.tenantId, req.tenant!.id))
        .orderBy(desc(grants.createdAt));
      
      res.json({ grants: grantList });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/grants
   * Create new grant (admin only)
   */
  app.post('/api/grants', requireTenant, requireAuth, requireRole('admin', 'board_member'), async (req, res, next) => {
    try {
      const { grants, insertGrantSchema } = await import('@shared/schema');
      
      const data = insertGrantSchema.omit({ tenantId: true }).parse(req.body);
      const [grant] = await db.insert(grants).values({
        ...data,
        tenantId: req.tenant!.id,
      }).returning();
      
      res.json({ success: true, grant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/grants/:id
   * Update grant (admin only)
   */
  app.patch('/api/grants/:id', requireTenant, requireAuth, requireRole('admin', 'board_member'), async (req, res, next) => {
    try {
      const { grants } = await import('@shared/schema');
      
      const [grant] = await db
        .update(grants)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(and(
          eq(grants.id, req.params.id),
          eq(grants.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!grant) {
        return res.status(404).json({ error: 'Grant not found' });
      }
      
      res.json({ success: true, grant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/grants/:id
   * Delete grant (admin only)
   */
  app.delete('/api/grants/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { grants } = await import('@shared/schema');
      
      await db
        .delete(grants)
        .where(and(
          eq(grants.id, req.params.id),
          eq(grants.tenantId, req.tenant!.id)
        ));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/grants/metrics
   * Get real-time grant reporting metrics (admin/staff only)
   */
  app.get('/api/grants/metrics', requireTenant, requireAuth, requireRole('admin', 'board_member', 'staff'), async (req, res, next) => {
    try {
      const { 
        animals, 
        adoptionApplications, 
        fosterPlacements, 
        volunteerOpportunities,
        donations,
        expenditures,
        vaccinations,
        procedures
      } = await import('@shared/schema');
      
      const now = new Date();
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const lastQuarterStart = new Date(quarterStart);
      lastQuarterStart.setMonth(lastQuarterStart.getMonth() - 3);
      
      // Animal Statistics
      const allAnimals = await db
        .select()
        .from(animals)
        .where(eq(animals.tenantId, req.tenant!.id));
      
      const totalIntake = allAnimals.length;
      const intakeThisQuarter = allAnimals.filter(a => 
        a.intakeDate && new Date(a.intakeDate) >= quarterStart
      ).length;
      
      const adopted = allAnimals.filter(a => a.status === 'adopted');
      const adoptedThisQuarter = adopted.filter(a => 
        a.adoptionDate && new Date(a.adoptionDate) >= quarterStart
      ).length;
      
      const inFoster = allAnimals.filter(a => a.status === 'foster').length;
      const inShelter = allAnimals.filter(a => 
        a.status !== 'adopted' && a.status !== 'deceased' && a.status !== 'foster'
      ).length;
      
      // Calculate average length of stay
      const adoptedWithDates = adopted.filter(a => a.intakeDate && a.adoptionDate);
      const avgLengthOfStay = adoptedWithDates.length > 0 
        ? Math.round(
            adoptedWithDates.reduce((sum, a) => {
              const days = Math.floor((new Date(a.adoptionDate!).getTime() - new Date(a.intakeDate!).getTime()) / (1000 * 60 * 60 * 24));
              return sum + days;
            }, 0) / adoptedWithDates.length
          )
        : 0;
      
      // Spay/neuter count from procedures
      const spayNeuterProcedures = await db
        .select()
        .from(procedures)
        .where(eq(procedures.tenantId, req.tenant!.id));
      
      const spayNeuterCount = spayNeuterProcedures.filter(p => 
        p.procedureType && (
          p.procedureType.toLowerCase().includes('spay') || 
          p.procedureType.toLowerCase().includes('neuter')
        )
      ).length;
      
      // Financial data
      const allDonations = await db
        .select()
        .from(donations)
        .where(eq(donations.tenantId, req.tenant!.id));
      
      const totalDonations = allDonations.reduce((sum, d) => sum + parseFloat(d.amount), 0);
      
      const allExpenditures = await db
        .select()
        .from(expenditures)
        .where(eq(expenditures.tenantId, req.tenant!.id));
      
      const totalExpenses = allExpenditures.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const costPerAnimal = totalIntake > 0 ? totalExpenses / totalIntake : 0;
      
      // Volunteer statistics
      const volunteerShifts = await db
        .select()
        .from(volunteerOpportunities)
        .where(eq(volunteerOpportunities.tenantId, req.tenant!.id));
      
      const totalVolunteerSlots = volunteerShifts.reduce((sum, s) => sum + s.slotsFilled, 0);
      
      // Foster statistics
      const fosterList = await db
        .select()
        .from(fosterPlacements)
        .where(eq(fosterPlacements.tenantId, req.tenant!.id));
      
      const activeFosterHomes = new Set(
        fosterList.filter(f => !f.returnedDate).map(f => f.fosterFamilyId)
      ).size;
      
      res.json({
        animalStatistics: {
          totalIntake,
          intakeThisQuarter,
          adoptions: adopted.length,
          adoptionsThisQuarter,
          avgLengthOfStay,
          currentInFoster: inFoster,
          currentInShelter: inShelter,
          spayNeuterCount,
          bySpecies: {
            dogs: allAnimals.filter(a => a.species.toLowerCase() === 'dog').length,
            cats: allAnimals.filter(a => a.species.toLowerCase() === 'cat').length,
            other: allAnimals.filter(a => !['dog', 'cat'].includes(a.species.toLowerCase())).length,
          },
        },
        financial: {
          totalDonations: totalDonations.toFixed(2),
          totalExpenses: totalExpenses.toFixed(2),
          costPerAnimal: costPerAnimal.toFixed(2),
          adoptionFeesCollected: allDonations
            .filter(d => d.source === 'online_form')
            .reduce((sum, d) => sum + parseFloat(d.amount), 0)
            .toFixed(2),
        },
        operational: {
          totalVolunteerHours: totalVolunteerSlots * 4, // Estimate 4 hours per shift
          activeFosterHomes,
          pendingApplications: await db
            .select({ count: sql<number>`count(*)` })
            .from(adoptionApplications)
            .where(and(
              eq(adoptionApplications.tenantId, req.tenant!.id),
              inArray(adoptionApplications.status, ['new', 'under_review', 'home_visit_scheduled'])
            ))
            .then(r => r[0]?.count || 0),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/grants/success-stories
   * Get flagged animals for grant narratives (admin/staff only)
   */
  app.get('/api/grants/success-stories', requireTenant, requireAuth, requireRole('admin', 'board_member', 'staff'), async (req, res, next) => {
    try {
      const { animals, animalNotes } = await import('@shared/schema');
      
      // Get query params for filtering
      const tagFilter = req.query.tag as string | undefined;
      
      let query = db
        .select()
        .from(animals)
        .where(and(
          eq(animals.tenantId, req.tenant!.id),
          eq(animals.flaggedForStory, true)
        ));
      
      const flaggedAnimals = await query.orderBy(desc(animals.updatedAt));
      
      // Filter by tag if provided
      let filtered = flaggedAnimals;
      if (tagFilter && tagFilter !== 'all') {
        filtered = flaggedAnimals.filter(a => 
          a.storyTags && a.storyTags.includes(tagFilter)
        );
      }
      
      // Get notes for each animal
      const animalsWithNotes = await Promise.all(
        filtered.map(async (animal) => {
          const notes = await db
            .select()
            .from(animalNotes)
            .where(eq(animalNotes.animalId, animal.id))
            .orderBy(desc(animalNotes.createdAt))
            .limit(5);
          
          return { ...animal, recentNotes: notes };
        })
      );
      
      res.json({ animals: animalsWithNotes });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/animals/:id/story-flag
   * Toggle success story flag for an animal (admin/staff only)
   */
  app.patch('/api/animals/:id/story-flag', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { animals } = await import('@shared/schema');
      
      const updateSchema = z.object({
        flaggedForStory: z.boolean(),
        storyTags: z.array(z.string()).optional(),
      });
      
      const data = updateSchema.parse(req.body);
      
      const [animal] = await db
        .update(animals)
        .set({
          flaggedForStory: data.flaggedForStory,
          storyTags: data.storyTags,
          updatedAt: new Date(),
        })
        .where(and(
          eq(animals.id, req.params.id),
          eq(animals.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }
      
      res.json({ success: true, animal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/grants/:grantId/expenses
   * Get expenses tagged to specific grant (admin only)
   */
  app.get('/api/grants/:grantId/expenses', requireTenant, requireAuth, requireRole('admin', 'board_member', 'staff'), async (req, res, next) => {
    try {
      const { expenditures, medicalBills, medicalPrescriptions, animals, grantAllocations } = await import('@shared/schema');
      
      // Get regular expenditures
      const expenses = await db
        .select()
        .from(expenditures)
        .where(and(
          eq(expenditures.tenantId, req.tenant!.id),
          eq(expenditures.grantId, req.params.grantId)
        ))
        .orderBy(desc(expenditures.date));
      
      // Get medical bills tagged to this grant
      const medicalExpenses = await db
        .select({
          id: medicalBills.id,
          vendor: medicalBills.vendor,
          amount: medicalBills.amount,
          category: sql<string>`'medical'`,
          date: medicalBills.billDate,
          notes: medicalBills.description,
          animalName: animals.name,
        })
        .from(medicalBills)
        .leftJoin(animals, eq(medicalBills.animalId, animals.id))
        .where(and(
          eq(medicalBills.tenantId, req.tenant!.id),
          eq(medicalBills.grantId, req.params.grantId)
        ))
        .orderBy(desc(medicalBills.billDate));
      
      // Get prescriptions with billing info tagged to this grant
      const prescriptionExpenses = await db
        .select({
          id: medicalPrescriptions.id,
          vendor: medicalPrescriptions.billVendor,
          amount: medicalPrescriptions.billAmount,
          category: sql<string>`'medical'`,
          date: medicalPrescriptions.startDate,
          notes: sql<string>`'Medication: ' || ${medicalPrescriptions.medicationName}`,
          animalName: animals.name,
        })
        .from(medicalPrescriptions)
        .leftJoin(animals, eq(medicalPrescriptions.animalId, animals.id))
        .where(and(
          eq(medicalPrescriptions.tenantId, req.tenant!.id),
          eq(medicalPrescriptions.grantId, req.params.grantId),
          sql`${medicalPrescriptions.billAmount} IS NOT NULL`
        ))
        .orderBy(desc(medicalPrescriptions.startDate));
      
      // Get grant allocations (adoption fee waivers) for this grant
      const allocationExpenses = await db
        .select({
          id: grantAllocations.id,
          amount: grantAllocations.waiverAmount,
          category: sql<string>`'adoption_fee_waiver'`,
          date: grantAllocations.allocatedAt,
          notes: sql<string>`'Adoption fee waiver'`,
        })
        .from(grantAllocations)
        .where(eq(grantAllocations.grantId, req.params.grantId))
        .orderBy(desc(grantAllocations.allocatedAt));
      
      // Combine all expenses
      const allExpenses = [
        ...expenses.map(e => ({
          ...e,
          type: 'expenditure' as const,
        })),
        ...medicalExpenses.map(e => ({
          ...e,
          type: 'medical_bill' as const,
        })),
        ...prescriptionExpenses.map(e => ({
          ...e,
          type: 'prescription' as const,
        })),
        ...allocationExpenses.map(e => ({
          id: e.id,
          vendor: 'Adoption Fee Waiver',
          amount: e.amount,
          category: e.category,
          date: e.date,
          notes: e.notes,
          type: 'adoption_fee_waiver' as const,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      const totalSpent = allExpenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
      
      res.json({ 
        expenses: allExpenses,
        totalSpent: totalSpent.toFixed(2),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/grants/budget-report
   * Get budget report for all awarded grants with expenditure tracking (admin/staff only)
   */
  app.get('/api/grants/budget-report', requireTenant, requireAuth, requireRole('admin', 'board_member', 'staff'), async (req, res, next) => {
    try {
      const { grants, expenditures, medicalBills, medicalPrescriptions, animals, grantAllocations } = await import('@shared/schema');
      
      // Fetch all awarded grants for this tenant
      const awardedGrants = await db
        .select()
        .from(grants)
        .where(and(
          eq(grants.tenantId, req.tenant!.id),
          eq(grants.status, 'awarded')
        ))
        .orderBy(desc(grants.awardDate));
      
      // For each grant, fetch expenditures and calculate totals
      const grantsWithBudget = await Promise.all(
        awardedGrants.map(async (grant) => {
          // Fetch regular expenditures for this grant
          const grantExpenditures = await db
            .select()
            .from(expenditures)
            .where(and(
              eq(expenditures.tenantId, req.tenant!.id),
              eq(expenditures.grantId, grant.id)
            ))
            .orderBy(desc(expenditures.date));
          
          // Fetch medical bills for this grant
          const grantMedicalBills = await db
            .select({
              id: medicalBills.id,
              vendor: medicalBills.vendor,
              amount: medicalBills.amount,
              category: sql<string>`'medical'`,
              date: medicalBills.billDate,
              notes: medicalBills.description,
              animalName: animals.name,
            })
            .from(medicalBills)
            .leftJoin(animals, eq(medicalBills.animalId, animals.id))
            .where(and(
              eq(medicalBills.tenantId, req.tenant!.id),
              eq(medicalBills.grantId, grant.id)
            ))
            .orderBy(desc(medicalBills.billDate));
          
          // Fetch prescriptions with billing for this grant
          const grantPrescriptions = await db
            .select({
              id: medicalPrescriptions.id,
              vendor: medicalPrescriptions.billVendor,
              amount: medicalPrescriptions.billAmount,
              category: sql<string>`'medical'`,
              date: medicalPrescriptions.startDate,
              notes: sql<string>`'Medication: ' || ${medicalPrescriptions.medicationName}`,
              animalName: animals.name,
            })
            .from(medicalPrescriptions)
            .leftJoin(animals, eq(medicalPrescriptions.animalId, animals.id))
            .where(and(
              eq(medicalPrescriptions.tenantId, req.tenant!.id),
              eq(medicalPrescriptions.grantId, grant.id),
              sql`${medicalPrescriptions.billAmount} IS NOT NULL`
            ))
            .orderBy(desc(medicalPrescriptions.startDate));
          
          // Fetch grant allocations (adoption fee waivers) for this grant
          const grantAllocationsList = await db
            .select({
              id: grantAllocations.id,
              amount: grantAllocations.waiverAmount,
              category: sql<string>`'adoption_fee_waiver'`,
              date: grantAllocations.allocatedAt,
              notes: sql<string>`'Adoption fee waiver'`,
              sessionId: grantAllocations.sessionId,
            })
            .from(grantAllocations)
            .where(eq(grantAllocations.grantId, grant.id))
            .orderBy(desc(grantAllocations.allocatedAt));
          
          // Combine all expenses
          const allExpenses = [
            ...grantExpenditures.map(e => ({
              id: e.id,
              vendor: e.vendor,
              amount: parseFloat(e.amount),
              category: e.category,
              date: e.date,
              notes: e.notes,
              type: 'expenditure' as const,
            })),
            ...grantMedicalBills.map(e => ({
              id: e.id,
              vendor: e.vendor,
              amount: parseFloat(e.amount || '0'),
              category: e.category,
              date: e.date,
              notes: e.notes,
              animalName: e.animalName,
              type: 'medical_bill' as const,
            })),
            ...grantPrescriptions.map(e => ({
              id: e.id,
              vendor: e.vendor || '',
              amount: parseFloat(e.amount || '0'),
              category: e.category,
              date: e.date,
              notes: e.notes,
              animalName: e.animalName,
              type: 'prescription' as const,
            })),
            ...grantAllocationsList.map(e => ({
              id: e.id,
              vendor: 'Adoption Fee Waiver',
              amount: parseFloat(e.amount || '0'),
              category: e.category,
              date: e.date,
              notes: e.notes,
              type: 'adoption_fee_waiver' as const,
            })),
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          // Calculate totals
          const totalSpent = allExpenses.reduce((sum, e) => sum + e.amount, 0);
          const amountAwarded = parseFloat(grant.amountAwarded || '0');
          const remaining = amountAwarded - totalSpent;
          const percentUsed = amountAwarded > 0 ? (totalSpent / amountAwarded) * 100 : 0;
          
          return {
            id: grant.id,
            name: grant.programName,
            funderName: grant.funderName,
            amountAwarded: grant.amountAwarded,
            totalSpent,
            remaining,
            percentUsed,
            expenditures: allExpenses,
          };
        })
      );
      
      res.json({ grants: grantsWithBudget });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/grants/documents
   * Get all grant documents including boilerplate (admin only)
   */
  app.get('/api/grants/documents', requireTenant, requireAuth, requireRole('admin', 'board_member', 'staff'), async (req, res, next) => {
    try {
      const { grantDocuments, users } = await import('@shared/schema');
      
      const docs = await db
        .select({
          id: grantDocuments.id,
          grantId: grantDocuments.grantId,
          documentType: grantDocuments.documentType,
          title: grantDocuments.title,
          fileUrl: grantDocuments.fileUrl,
          fileName: grantDocuments.fileName,
          fileSize: grantDocuments.fileSize,
          notes: grantDocuments.notes,
          createdAt: grantDocuments.createdAt,
          uploadedByName: users.fullName,
        })
        .from(grantDocuments)
        .leftJoin(users, eq(grantDocuments.uploadedBy, users.id))
        .where(eq(grantDocuments.tenantId, req.tenant!.id))
        .orderBy(desc(grantDocuments.createdAt));
      
      res.json({ documents: docs });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/grants/documents
   * Upload grant document (admin only)
   */
  app.post('/api/grants/documents', requireTenant, requireAuth, requireRole('admin', 'board_member'), async (req, res, next) => {
    try {
      const { grantDocuments, insertGrantDocumentSchema } = await import('@shared/schema');
      
      const data = insertGrantDocumentSchema.omit({ tenantId: true, uploadedBy: true }).parse(req.body);
      const [document] = await db.insert(grantDocuments).values({
        ...data,
        tenantId: req.tenant!.id,
        uploadedBy: req.user!.id,
      }).returning();
      
      res.json({ success: true, document });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/grants/documents/:id
   * Delete grant document (admin only)
   */
  app.delete('/api/grants/documents/:id', requireTenant, requireAuth, requireRole('admin', 'board_member'), async (req, res, next) => {
    try {
      const { grantDocuments } = await import('@shared/schema');
      const { TenantFileStorage } = await import('./lib/tenantFileStorage');
      
      // Get the document first to get the file URL
      const [document] = await db
        .select()
        .from(grantDocuments)
        .where(and(
          eq(grantDocuments.id, req.params.id),
          eq(grantDocuments.tenantId, req.tenant!.id)
        ))
        .limit(1);
      
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Delete from database
      await db
        .delete(grantDocuments)
        .where(and(
          eq(grantDocuments.id, req.params.id),
          eq(grantDocuments.tenantId, req.tenant!.id)
        ));
      
      // Try to delete from storage (Google Drive or Replit Object Storage)
      try {
        const fileStorage = new TenantFileStorage(req.tenant!.id);
        const deleteResult = await fileStorage.deleteFile(document.fileUrl);
        if (!deleteResult.success) {
          console.warn(`Grant document deletion from storage failed: ${deleteResult.error}`);
        }
      } catch (error) {
        console.error('Error deleting grant document from storage:', error);
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Contacts Directory Routes
  // ============================================================================

  /**
   * GET /api/contacts
   * Get all contacts for the directory (staff+ only)
   */
  app.get('/api/contacts', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      // Get all contacts with optional user linkage
      const contactList = await db
        .select({
          id: contacts.id,
          userId: contacts.userId,
          name: contacts.name,
          email: contacts.email,
          phone: contacts.phone,
          address: contacts.address,
          source: contacts.source,
          role: contacts.role,
          totalDonated: contacts.totalDonated,
          donationCount: contacts.donationCount,
          lastDonationDate: contacts.lastDonationDate,
          tags: contacts.tags,
          notes: contacts.notes,
          createdAt: contacts.createdAt,
          updatedAt: contacts.updatedAt,
          userFullName: users.fullName,
          userIsActive: users.isActive,
        })
        .from(contacts)
        .leftJoin(users, eq(contacts.userId, users.id))
        .where(eq(contacts.tenantId, req.tenant!.id))
        .orderBy(desc(contacts.updatedAt));
      
      res.json({ contacts: contactList });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/contacts
   * Manually add a new contact (staff+ only)
   */
  app.post('/api/contacts', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const data = insertContactSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
        source: req.body.source || ['manual'], // Default to manual if not specified
      });

      const [contact] = await db
        .insert(contacts)
        .values([data as any])
        .returning();

      res.json({ success: true, contact });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/contacts/:id
   * Update a contact (staff+ only)
   */
  app.patch('/api/contacts/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const contactId = req.params.id;
      
      const [updated] = await db
        .update(contacts)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(and(
          eq(contacts.id, contactId),
          eq(contacts.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      res.json({ success: true, contact: updated });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/contacts/:id
   * Delete a contact (admin only)
   */
  app.delete('/api/contacts/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const contactId = req.params.id;
      
      const [deleted] = await db
        .delete(contacts)
        .where(and(
          eq(contacts.id, contactId),
          eq(contacts.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/contacts/import
   * Bulk import contacts from CSV file
   * Supports: email (required), name, phone, address, notes, tags (comma-separated)
   * Handles duplicates by skipping or updating based on mode parameter
   */
  app.post('/api/contacts/import', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const Papa = await import('papaparse');
      const multer = (await import('multer')).default;
      
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 },
      });
      
      upload.single('file')(req, res, async (err) => {
        try {
          if (err) {
            return res.status(400).json({ error: err.message || 'File upload failed' });
          }
          
          if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
          }

          const mode = (req.body.mode || 'skip') as 'skip' | 'update';
          const csvContent = req.file.buffer.toString('utf-8');
        
          // First pass: parse without headers to find the real header row
          const rawResults = Papa.default.parse(csvContent, {
            header: false,
            skipEmptyLines: true,
          });
          
          if (rawResults.errors.length > 0) {
            return res.status(400).json({ 
              error: 'CSV parsing error', 
              details: rawResults.errors.slice(0, 5) 
            });
          }
          
          const rawRows = rawResults.data as string[][];
          
          if (rawRows.length === 0) {
            return res.status(400).json({ error: 'CSV file is empty' });
          }
          
          // Helper to trim trailing empty cells from an array
          const trimTrailingEmpty = (arr: string[]): string[] => {
            const result = [...arr];
            while (result.length > 0 && (result[result.length - 1] || '').trim() === '') {
              result.pop();
            }
            return result;
          };
          
          // Find the header row - look for a row containing "email" (case-insensitive)
          // Scan up to 50 rows or entire file for small files
          let headerRowIndex = -1;
          let rawHeaders: string[] = [];
          
          const scanLimit = Math.min(rawRows.length, 50);
          for (let i = 0; i < scanLimit; i++) {
            const row = rawRows[i];
            const normalizedRow = row.map(cell => (cell || '').trim().toLowerCase());
            if (normalizedRow.includes('email')) {
              headerRowIndex = i;
              rawHeaders = trimTrailingEmpty(normalizedRow); // Trim trailing empties but keep leading for alignment
              break;
            }
          }
          
          if (headerRowIndex === -1) {
            return res.status(400).json({ 
              error: 'Could not find header row. Make sure your CSV has an "email" column header.' 
            });
          }
          
          // Map header names to handle common variations (e.g., "tag" -> "tags")
          const headerMapping: Record<string, string> = {
            'tag': 'tags',
            'note': 'notes',
          };
          
          // Convert remaining rows to objects using the detected headers
          // Preserve column position alignment - empty headers are skipped but positions match
          const dataRows = rawRows.slice(headerRowIndex + 1);
          const rows: Record<string, string>[] = dataRows.map(rawRow => {
            // Trim trailing empty cells from data row to match header trimming
            const row = trimTrailingEmpty(rawRow.map(cell => (cell || '').trim()));
            const obj: Record<string, string> = {};
            rawHeaders.forEach((header, idx) => {
              if (header.length > 0 && idx < row.length) {
                const normalizedHeader = headerMapping[header] || header;
                obj[normalizedHeader] = row[idx];
              }
            });
            return obj;
          }).filter(row => Object.values(row).some(v => v.length > 0)); // Skip completely empty rows
          
          if (rows.length === 0) {
            return res.status(400).json({ error: 'No data rows found after header' });
          }

          if (rows.length > 5000) {
            return res.status(400).json({ error: 'File too large. Maximum 5,000 rows allowed.' });
          }

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const summary = {
            total: rows.length,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [] as { row: number; email: string; reason: string }[],
          };

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;
            
            const email = (row.email || '').trim().toLowerCase();
            const name = (row.name || '').trim();
            
            if (!email) {
              summary.errors.push({ row: rowNum, email: '', reason: 'Missing email' });
              continue;
            }

            if (!emailRegex.test(email)) {
              summary.errors.push({ row: rowNum, email, reason: 'Invalid email format' });
              continue;
            }

            const phone = (row.phone || '').trim() || null;
            const address = (row.address || '').trim() || null;
            const notes = (row.notes || '').trim() || null;
            const tagsStr = (row.tags || '').trim();
            const tags = tagsStr ? tagsStr.split(/[,|]/).map(t => t.trim()).filter(Boolean) : [];

            try {
              const existingContact = await db
                .select()
                .from(contacts)
                .where(and(
                  eq(contacts.tenantId, req.tenant!.id),
                  eq(contacts.email, email)
                ))
                .limit(1);

              if (existingContact.length > 0) {
                if (mode === 'update') {
                  const existing = existingContact[0];
                  const updateData: Record<string, any> = {
                    source: [...new Set([...(existing.source || []), 'manual'])],
                    updatedAt: new Date(),
                  };
                  
                  if (name && name.length > 0) {
                    updateData.name = name;
                  }
                  if (phone && phone.length > 0) {
                    updateData.phone = phone;
                  }
                  if (address && address.length > 0) {
                    updateData.address = address;
                  }
                  if (notes && notes.length > 0) {
                    updateData.notes = notes;
                  }
                  if (tags.length > 0) {
                    updateData.tags = [...new Set([...(existing.tags || []), ...tags])];
                  }
                  
                  await db
                    .update(contacts)
                    .set(updateData)
                    .where(eq(contacts.id, existing.id));
                  summary.updated++;
                } else {
                  summary.skipped++;
                }
              } else {
                await db.insert(contacts).values({
                  tenantId: req.tenant!.id,
                  email,
                  name: name || email.split('@')[0],
                  phone,
                  address,
                  notes,
                  tags,
                  source: ['manual'],
                });
                summary.created++;
              }
            } catch (err: any) {
              summary.errors.push({ row: rowNum, email, reason: err.message || 'Database error' });
            }
          }

          res.json({ 
            success: true, 
            summary,
            message: `Imported ${summary.created} new contacts${summary.updated > 0 ? `, updated ${summary.updated}` : ''}${summary.skipped > 0 ? `, skipped ${summary.skipped} duplicates` : ''}`
          });
        } catch (error) {
          next(error);
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/contacts/import/template
   * Download sample CSV template for contact import
   */
  app.get('/api/contacts/import/template', requireTenant, requireAuth, requireRole('admin', 'staff'), (req, res) => {
    const template = 'email,name,phone,address,notes,tags\njohn@example.com,John Doe,555-1234,123 Main St,Past donor - 2024,donor|vip\njane@example.com,Jane Smith,555-5678,456 Oak Ave,Monthly supporter,donor';
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts-import-template.csv"');
    res.send(template);
  });

  // ============================================================================
  // Partner Organizations Routes
  // ============================================================================

  /**
   * GET /api/partner-organizations
   * Get all partner organizations for the tenant
   */
  app.get('/api/partner-organizations', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { partnerOrganizations } = await import('@shared/schema');
      const includeArchived = req.query.includeArchived === 'true';
      
      let query = db
        .select()
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.tenantId, req.tenant!.id));
      
      if (!includeArchived) {
        query = query.where(eq(partnerOrganizations.isActive, true)) as any;
      }
      
      const orgs = await query.orderBy(partnerOrganizations.name);
      res.json({ organizations: orgs });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/partner-organizations/:id
   * Get a single partner organization
   */
  app.get('/api/partner-organizations/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { partnerOrganizations } = await import('@shared/schema');
      
      const [org] = await db
        .select()
        .from(partnerOrganizations)
        .where(and(
          eq(partnerOrganizations.id, req.params.id),
          eq(partnerOrganizations.tenantId, req.tenant!.id)
        ));
      
      if (!org) {
        return res.status(404).json({ error: 'Partner organization not found' });
      }
      
      res.json({ organization: org });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/partner-organizations
   * Create a new partner organization
   */
  app.post('/api/partner-organizations', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { partnerOrganizations, insertPartnerOrganizationSchema } = await import('@shared/schema');
      
      const parsed = insertPartnerOrganizationSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });
      
      const [org] = await db
        .insert(partnerOrganizations)
        .values(parsed)
        .returning();
      
      res.status(201).json({ organization: org });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/partner-organizations/:id
   * Update a partner organization
   */
  app.patch('/api/partner-organizations/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { partnerOrganizations } = await import('@shared/schema');
      
      const [org] = await db
        .update(partnerOrganizations)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(and(
          eq(partnerOrganizations.id, req.params.id),
          eq(partnerOrganizations.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!org) {
        return res.status(404).json({ error: 'Partner organization not found' });
      }
      
      res.json({ organization: org });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/partner-organizations/:id
   * Archive (soft delete) a partner organization
   */
  app.delete('/api/partner-organizations/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { partnerOrganizations } = await import('@shared/schema');
      
      const [org] = await db
        .update(partnerOrganizations)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(
          eq(partnerOrganizations.id, req.params.id),
          eq(partnerOrganizations.tenantId, req.tenant!.id)
        ))
        .returning();
      
      if (!org) {
        return res.status(404).json({ error: 'Partner organization not found' });
      }
      
      res.json({ success: true, message: 'Partner organization archived' });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Happy Tails Routes
  // ============================================================================

  /**
   * GET /api/happy-tails
   * Get all happy tails for the tenant
   * Staff: See both published and unpublished
   * Public: See only published (when implemented)
   */
  app.get('/api/happy-tails', requireTenant, async (req, res, next) => {
    try {
      const { happyTails } = await import('@shared/schema');
      
      // Check if user is authenticated and has staff role
      const isStaff = req.user && req.user.roles.some(role => 
        ['admin', 'board_member', 'staff'].includes(role)
      );

      let query = db
        .select()
        .from(happyTails)
        .where(eq(happyTails.tenantId, req.tenant!.id));

      // If not staff, only show published happy tails
      if (!isStaff) {
        query = query.where(eq(happyTails.isPublished, true)) as any;
      }

      const tails = await query.orderBy(desc(happyTails.createdAt));

      res.json({ happyTails: tails });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/happy-tails
   * Create a new happy tail (admin and staff only)
   */
  app.post('/api/happy-tails', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { happyTails, insertHappyTailSchema } = await import('@shared/schema');
      
      const data = insertHappyTailSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });

      const [happyTail] = await db
        .insert(happyTails)
        .values([data as any])
        .returning();

      res.json({ success: true, happyTail });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/happy-tails/:id
   * Update a happy tail (admin and staff only)
   */
  app.patch('/api/happy-tails/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { happyTails, updateHappyTailSchema } = await import('@shared/schema');
      const happyTailId = req.params.id;

      // Validate and sanitize request body - excludes tenantId and id
      const validatedData = updateHappyTailSchema.parse(req.body);

      const [updated] = await db
        .update(happyTails)
        .set(validatedData)
        .where(and(
          eq(happyTails.id, happyTailId),
          eq(happyTails.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Happy tail not found' });
      }

      res.json({ success: true, happyTail: updated });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/happy-tails/:id
   * Delete a happy tail (admin and staff only)
   */
  app.delete('/api/happy-tails/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { happyTails } = await import('@shared/schema');
      const happyTailId = req.params.id;

      const [deleted] = await db
        .delete(happyTails)
        .where(and(
          eq(happyTails.id, happyTailId),
          eq(happyTails.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Happy tail not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Foster Management Routes
  // ============================================================================

  /**
   * POST /api/foster-applications
   * Submit foster application (public route)
   */
  app.post('/api/foster-applications', requireTenant, async (req, res, next) => {
    try {
      const { fosterApplications, insertFosterApplicationSchema, inboundEmails } = await import('@shared/schema');
      
      const data = insertFosterApplicationSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });

      const [application] = await db
        .insert(fosterApplications)
        .values([data as any])
        .returning();

      // Create/update contact from this foster application
      try {
        const { createContactFromFosterApplication } = await import('./services/contacts');
        await createContactFromFosterApplication(
          req.tenant!.id,
          data.applicantName,
          data.applicantEmail,
          data.applicantPhone,
          data.address
        );
      } catch (error) {
        console.error('Failed to create contact from foster application:', error);
        // Don't fail the application submission if contact creation fails
      }

      // Create inbound email record for inbox
      try {
        const emailSubject = `New Foster Application from ${data.applicantName}`;
        const emailBody = `
Foster Application Received

Name: ${data.applicantName}
Email: ${data.applicantEmail}
Phone: ${data.applicantPhone || 'Not provided'}
Address: ${data.address || 'Not provided'}

Experience with Animals:
${data.experience}

Home Type: ${data.homeType}
Has Yard: ${data.hasYard ? 'Yes' : 'No'}
Has Other Pets: ${data.hasOtherPets ? 'Yes' : 'No'}
${data.otherPetsDetails ? `Other Pets: ${data.otherPetsDetails}` : ''}

Availability:
${data.availability}

Preferred Animals: ${data.preferredAnimals || 'Not specified'}

Emergency Contact:
${data.emergencyContactName || 'Not provided'} - ${data.emergencyContactPhone || 'Not provided'}

Application ID: ${application.id}
Submitted: ${new Date().toLocaleString()}
        `.trim();

        await db.insert(inboundEmails).values({
          tenantId: req.tenant!.id,
          messageId: `foster-app-${application.id}`,
          from: data.applicantEmail,
          fromName: data.applicantName,
          to: `${req.tenant!.subdomain}@mail.irescue.life`,
          subject: emailSubject,
          textBody: emailBody,
          htmlBody: emailBody.replace(/\n/g, '<br>'),
          status: 'unprocessed',
        });
      } catch (error) {
        console.error('Failed to create inbound email record:', error);
      }

      // Send email notification to staff if enabled
      try {
        const { sendFormSubmissionNotification } = await import('./services/form-notifications');
        await sendFormSubmissionNotification({
          formType: 'foster',
          tenantId: req.tenant!.id,
          applicantName: data.applicantName,
          applicantEmail: data.applicantEmail,
          applicantPhone: data.applicantPhone,
          applicationId: application.id,
          additionalDetails: `Home Type: ${data.homeType}, Has Yard: ${data.hasYard ? 'Yes' : 'No'}`,
        });
      } catch (error) {
        console.error('Failed to send form notification email:', error);
      }

      // Send confirmation email to applicant
      try {
        const { EmailService } = await import('./lib/email-service');
        const emailService = await EmailService.forTenant(req.tenant!.id);
        
        if (emailService && data.applicantEmail) {
          const safeApplicantName = escapeHtml(data.applicantName);
          const safeTenantName = escapeHtml(req.tenant!.name);
          const dateFormatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

          await emailService.send({
            to: data.applicantEmail,
            subject: `Thank you for your foster application - ${safeTenantName}`,
            html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Thank You, ${safeApplicantName}!</h2>
  
  <p>We've received your application to become a foster with ${safeTenantName}. Thank you for your interest in helping animals in need!</p>
  
  <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Application Type:</strong> Foster</p>
    <p style="margin: 5px 0;"><strong>Date Submitted:</strong> ${dateFormatted}</p>
    <p style="margin: 5px 0;"><strong>Reference ID:</strong> ${application.id.slice(0, 8).toUpperCase()}</p>
  </div>
  
  <h3 style="color: #374151;">What Happens Next?</h3>
  <p>Our team will review your application and reach out to you within 3-5 business days. We may contact you to schedule a brief phone interview or home visit.</p>
  
  <p>In the meantime, if you have any questions, please don't hesitate to reach out to us.</p>
  
  <p>Thank you for opening your heart and home to animals in need!</p>
  
  <p>With gratitude,<br/>
  <strong>The ${safeTenantName} Team</strong></p>
</div>
            `.trim()
          });
          console.log(`[Application] Foster confirmation email sent to ${data.applicantEmail}`);
        }
      } catch (emailError) {
        console.error('Failed to send foster application confirmation email:', emailError);
        // Don't fail the application submission if email fails
      }

      res.json({ 
        success: true, 
        application,
        message: "Thank you for applying to become a foster! We'll review your application and get back to you soon." 
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/foster-applications
   * List foster applications (admin/staff only)
   */
  app.get('/api/foster-applications', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { fosterApplications } = await import('@shared/schema');
      
      const applications = await db
        .select()
        .from(fosterApplications)
        .where(eq(fosterApplications.tenantId, req.tenant!.id))
        .orderBy(desc(fosterApplications.createdAt));
      
      res.json({ applications });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/foster-applications/:id
   * Update foster application (admin/staff only)
   */
  app.patch('/api/foster-applications/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid application ID format' });
      }
      
      const { fosterApplications } = await import('@shared/schema');
      
      const updateSchema = z.object({
        status: z.enum(['new_app', 'interview', 'home_check', 'orientation', 'agreement', 'active_pool', 'rejected', 'pending', 'approved']).optional(),
        notes: z.string().optional(),
        hasFencedYard: z.boolean().optional(),
        acceptsLargeDogs: z.boolean().optional(),
        acceptsCats: z.boolean().optional(),
        acceptsPuppies: z.boolean().optional(),
        acceptsSeniors: z.boolean().optional(),
        acceptsMedicalNeeds: z.boolean().optional(),
        maxAnimals: z.number().optional(),
      });

      const data = updateSchema.parse(req.body);

      const [updatedApplication] = await db
        .update(fosterApplications)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(fosterApplications.id, req.params.id),
            eq(fosterApplications.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updatedApplication) {
        return res.status(404).json({ error: 'Foster application not found' });
      }

      res.json({ success: true, application: updatedApplication });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/foster-applications/:id/status
   * Update foster application status (Kanban stage transition)
   */
  app.patch('/api/foster-applications/:id/status', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid application ID format' });
      }
      
      const { fosterApplications } = await import('@shared/schema');
      
      const updateSchema = z.object({
        status: z.enum(['new_app', 'interview', 'home_check', 'orientation', 'agreement', 'active_pool', 'rejected']),
      });

      const data = updateSchema.parse(req.body);

      const [updatedApplication] = await db
        .update(fosterApplications)
        .set({
          status: data.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(fosterApplications.id, req.params.id),
            eq(fosterApplications.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updatedApplication) {
        return res.status(404).json({ error: 'Foster application not found' });
      }

      res.json({ success: true, application: updatedApplication });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Foster Agreement Sessions
  // ============================================================================

  /**
   * GET /api/foster-agreements/sessions
   * List foster agreement sessions (admin/staff only)
   */
  app.get('/api/foster-agreements/sessions', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { fosterAgreementSessions } = await import('@shared/schema');
      
      const sessions = await db
        .select()
        .from(fosterAgreementSessions)
        .where(eq(fosterAgreementSessions.tenantId, req.tenant!.id))
        .orderBy(desc(fosterAgreementSessions.createdAt));
      
      res.json({ sessions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-agreements/sessions
   * Create a new foster agreement session
   */
  app.post('/api/foster-agreements/sessions', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { fosterAgreementSessions, contractTemplates } = await import('@shared/schema');
      
      const createSchema = z.object({
        fosterApplicationId: z.string().uuid(),
        fosterName: z.string(),
        fosterEmail: z.string().email(),
        contractTemplateId: z.string().uuid().optional(),
      });

      const data = createSchema.parse(req.body);

      // Generate secure token
      const token = randomUUID();
      
      // Set expiration to 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Find default foster contract template if not specified
      let templateId = data.contractTemplateId;
      if (!templateId) {
        const defaultTemplate = await db
          .select()
          .from(contractTemplates)
          .where(
            and(
              eq(contractTemplates.tenantId, req.tenant!.id),
              eq(contractTemplates.type, 'foster_agreement'),
              eq(contractTemplates.isDefault, true)
            )
          )
          .limit(1);
        
        if (defaultTemplate.length > 0) {
          templateId = defaultTemplate[0].id;
        }
      }

      const [session] = await db
        .insert(fosterAgreementSessions)
        .values({
          id: randomUUID(),
          tenantId: req.tenant!.id,
          fosterApplicationId: data.fosterApplicationId,
          fosterName: data.fosterName,
          fosterEmail: data.fosterEmail,
          contractTemplateId: templateId || null,
          token,
          status: 'initiated',
          expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json({ success: true, session });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-agreements/sessions/:id/send-link
   * Send foster agreement signing link via email
   */
  app.post('/api/foster-agreements/sessions/:id/send-link', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { fosterAgreementSessions } = await import('@shared/schema');
      const { EmailService } = await import('./lib/email-service');
      
      const sendSchema = z.object({
        fosterEmail: z.string().email(),
        fosterName: z.string(),
      });

      const data = sendSchema.parse(req.body);

      // Get the session
      const [session] = await db
        .select()
        .from(fosterAgreementSessions)
        .where(
          and(
            eq(fosterAgreementSessions.id, req.params.id),
            eq(fosterAgreementSessions.tenantId, req.tenant!.id)
          )
        );

      if (!session) {
        return res.status(404).json({ error: 'Foster agreement session not found' });
      }

      // Generate signing link
      const baseUrl = req.tenant!.customDomain 
        ? `https://${req.tenant!.customDomain}` 
        : `https://${req.tenant!.subdomain}.irescue.life`;
      const signingLink = `${baseUrl}/foster-agreement/${session.token}`;

      // Send email
      const emailService = await EmailService.forTenant(req.tenant!.id);
      if (emailService) {
        await emailService.send({
          to: data.fosterEmail,
          subject: `Foster Care Agreement - ${req.tenant!.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Foster Care Agreement</h2>
              <p>Dear ${data.fosterName},</p>
              <p>Congratulations on being approved to foster with ${req.tenant!.name}! Please review and sign our Foster Care Agreement to complete your onboarding.</p>
              <p style="margin: 30px 0;">
                <a href="${signingLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Review & Sign Agreement
                </a>
              </p>
              <p style="color: #666; font-size: 14px;">This link will expire in 7 days. If you have any questions, please contact us.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
              <p style="color: #999; font-size: 12px;">Sent by ${req.tenant!.name}</p>
            </div>
          `,
          text: `
Foster Care Agreement - ${req.tenant!.name}

Dear ${data.fosterName},

Congratulations on being approved to foster with ${req.tenant!.name}! Please review and sign our Foster Care Agreement to complete your onboarding.

Sign your agreement here: ${signingLink}

This link will expire in 7 days. If you have any questions, please contact us.

Sent by ${req.tenant!.name}
          `.trim(),
        });
      }

      // Update session status
      await db
        .update(fosterAgreementSessions)
        .set({
          status: 'awaiting_signature',
          updatedAt: new Date(),
        })
        .where(eq(fosterAgreementSessions.id, session.id));

      res.json({ success: true, message: 'Foster agreement link sent successfully' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/foster-agreement/:token
   * Get foster agreement session by token (public route for signing)
   */
  app.get('/api/foster-agreement/:token', requireTenant, async (req, res, next) => {
    try {
      const { fosterAgreementSessions, contractTemplates, tenants } = await import('@shared/schema');
      
      const [session] = await db
        .select()
        .from(fosterAgreementSessions)
        .where(
          and(
            eq(fosterAgreementSessions.token, req.params.token),
            eq(fosterAgreementSessions.tenantId, req.tenant!.id)
          )
        );

      if (!session) {
        return res.status(404).json({ error: 'Foster agreement session not found' });
      }

      // Check if expired
      if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
        return res.status(410).json({ error: 'This foster agreement link has expired' });
      }

      // Check if already completed
      if (session.status === 'completed') {
        return res.status(400).json({ error: 'This foster agreement has already been signed' });
      }

      // Get contract template content if available
      let contractContent = null;
      if (session.contractTemplateId) {
        const [template] = await db
          .select()
          .from(contractTemplates)
          .where(eq(contractTemplates.id, session.contractTemplateId));
        
        if (template) {
          contractContent = template.content;
        }
      }

      // Get tenant info
      const [tenant] = await db
        .select({
          name: tenants.name,
          logoUrl: tenants.logoUrl,
        })
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id));

      res.json({
        session: {
          id: session.id,
          fosterName: session.fosterName,
          fosterEmail: session.fosterEmail,
          status: session.status,
        },
        contractContent,
        tenant,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-agreement/:token/sign
   * Sign foster agreement (public route)
   */
  app.post('/api/foster-agreement/:token/sign', requireTenant, async (req, res, next) => {
    try {
      const { fosterAgreementSessions, fosterContracts, fosterApplications } = await import('@shared/schema');
      
      const signSchema = z.object({
        signatureImage: z.string(),
        fosterAddress: z.string().optional(),
        fosterPhone: z.string().optional(),
      });

      const data = signSchema.parse(req.body);

      // Get the session
      const [session] = await db
        .select()
        .from(fosterAgreementSessions)
        .where(
          and(
            eq(fosterAgreementSessions.token, req.params.token),
            eq(fosterAgreementSessions.tenantId, req.tenant!.id)
          )
        );

      if (!session) {
        return res.status(404).json({ error: 'Foster agreement session not found' });
      }

      // Check if expired
      if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
        return res.status(410).json({ error: 'This foster agreement link has expired' });
      }

      // Check if already completed
      if (session.status === 'completed') {
        return res.status(400).json({ error: 'This foster agreement has already been signed' });
      }

      // Get client IP
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      const signedAt = new Date();

      // Create foster contract record
      const [contract] = await db
        .insert(fosterContracts)
        .values({
          id: randomUUID(),
          tenantId: req.tenant!.id,
          fosterAgreementSessionId: session.id,
          fosterApplicationId: session.fosterApplicationId,
          fosterName: session.fosterName,
          fosterEmail: session.fosterEmail,
          fosterAddress: data.fosterAddress || null,
          fosterPhone: data.fosterPhone || null,
          contractTemplateId: session.contractTemplateId,
          signatureImage: data.signatureImage,
          signedAt,
          signedIp: String(clientIp),
          createdAt: new Date(),
        })
        .returning();

      // Update session status to completed
      await db
        .update(fosterAgreementSessions)
        .set({
          status: 'completed',
          completedAt: signedAt,
          updatedAt: new Date(),
        })
        .where(eq(fosterAgreementSessions.id, session.id));

      // Optionally update foster application status to active_pool
      if (session.fosterApplicationId) {
        await db
          .update(fosterApplications)
          .set({
            status: 'active_pool',
            updatedAt: new Date(),
          })
          .where(eq(fosterApplications.id, session.fosterApplicationId));
      }

      res.json({ success: true, contract });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Public Contact Form Route
  // ============================================================================

  /**
   * POST /api/public/contact
   * Submit contact form (public route - no auth required)
   * Rate limited to prevent spam (10 emails per hour)
   */
  app.post('/api/public/contact', requireTenant, emailLimiter, async (req, res, next) => {
    try {
      const { inboundEmails } = await import('@shared/schema');
      const { EmailService } = await import('./lib/email-service');
      
      const contactSchema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        subject: z.string().min(1),
        message: z.string().min(10),
      });

      const data = contactSchema.parse(req.body);

      // Send email notification to tenant contact email
      try {
        if (req.tenant!.contactEmail) {
          const emailService = await EmailService.forTenant(req.tenant!.id);
          if (emailService) {
            await emailService.send({
              to: req.tenant!.contactEmail,
              subject: `Contact Form: ${data.subject}`,
            html: `
              <h2>New Contact Form Submission</h2>
              <p><strong>From:</strong> ${data.name} (${data.email})</p>
              ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
              <p><strong>Subject:</strong> ${data.subject}</p>
              <p><strong>Message:</strong></p>
              <p style="white-space: pre-wrap;">${data.message}</p>
              <hr>
              <p style="color: #666; font-size: 12px;">Submitted via ${req.tenant!.name} website contact form</p>
            `,
            text: `
New Contact Form Submission

From: ${data.name} (${data.email})
${data.phone ? `Phone: ${data.phone}\n` : ''}Subject: ${data.subject}

Message:
${data.message}

---
Submitted via ${req.tenant!.name} website contact form
            `.trim(),
            });
          }
        } else {
          // Log warning if no contact email configured
          console.warn(`Contact form submission received but tenant ${req.tenant!.id} has no contactEmail configured`);
        }
      } catch (error) {
        console.error('Failed to send contact form email:', error);
        // Don't fail the request - submission is still saved to inbox
      }

      // Create inbound email record for inbox
      try {
        const emailBody = `
Contact Form Message

From: ${data.name}
Email: ${data.email}
Phone: ${data.phone || 'Not provided'}
Subject: ${data.subject}

Message:
${data.message}

Submitted: ${new Date().toLocaleString()}
        `.trim();

        await db.insert(inboundEmails).values({
          tenantId: req.tenant!.id,
          messageId: `contact-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          from: data.email,
          fromName: data.name,
          to: req.tenant!.contactEmail || `${req.tenant!.subdomain}@mail.irescue.life`,
          emailSubject: `Contact Form: ${data.subject}`,
          textBody: emailBody,
          htmlBody: emailBody.replace(/\n/g, '<br>'),
          status: 'unprocessed',
          createdAt: new Date(),
        });
      } catch (error) {
        console.error('Failed to create inbound email record:', error);
      }

      res.json({ 
        success: true,
        message: "Thank you for contacting us! We'll get back to you as soon as possible." 
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Volunteer Application Routes
  // ============================================================================

  /**
   * POST /api/volunteer-applications
   * Submit volunteer application (public route)
   */
  app.post('/api/volunteer-applications', requireTenant, async (req, res, next) => {
    try {
      const { volunteerApplications, insertVolunteerApplicationSchema, inboundEmails } = await import('@shared/schema');
      
      const data = insertVolunteerApplicationSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });

      const [application] = await db
        .insert(volunteerApplications)
        .values([data as any])
        .returning();

      // Create/update contact from this volunteer application
      try {
        const { createContactFromVolunteerApplication } = await import('./services/contacts');
        await createContactFromVolunteerApplication(
          req.tenant!.id,
          data.applicantName,
          data.applicantEmail,
          data.applicantPhone,
          data.address
        );
      } catch (error) {
        console.error('Failed to create contact from volunteer application:', error);
      }

      // Create inbound email record for inbox
      try {
        const emailSubject = `New Volunteer Application from ${data.applicantName}`;
        const emailBody = `
Volunteer Application Received

Name: ${data.applicantName}
Email: ${data.applicantEmail}
Phone: ${data.applicantPhone || 'Not provided'}
Address: ${data.address || 'Not provided'}

Experience with Animals:
${data.experience}

Availability:
${data.availability}

Areas of Interest:
${data.interests || 'Not specified'}

Special Skills:
${data.skills || 'Not specified'}

Emergency Contact:
${data.emergencyContactName || 'Not provided'} - ${data.emergencyContactPhone || 'Not provided'}

Application ID: ${application.id}
Submitted: ${new Date().toLocaleString()}
        `.trim();

        await db.insert(inboundEmails).values({
          tenantId: req.tenant!.id,
          messageId: `volunteer-app-${application.id}`,
          from: data.applicantEmail,
          fromName: data.applicantName,
          to: `${req.tenant!.subdomain}@mail.irescue.life`,
          subject: emailSubject,
          textBody: emailBody,
          htmlBody: emailBody.replace(/\n/g, '<br>'),
          status: 'unprocessed',
        });
      } catch (error) {
        console.error('Failed to create inbound email record:', error);
      }

      // Send email notification to staff if enabled
      try {
        const { sendFormSubmissionNotification } = await import('./services/form-notifications');
        await sendFormSubmissionNotification({
          formType: 'volunteer',
          tenantId: req.tenant!.id,
          applicantName: data.applicantName,
          applicantEmail: data.applicantEmail,
          applicantPhone: data.applicantPhone,
          applicationId: application.id,
          additionalDetails: data.interests || undefined,
        });
      } catch (error) {
        console.error('Failed to send form notification email:', error);
      }

      // Send confirmation email to applicant
      try {
        const { EmailService } = await import('./lib/email-service');
        const emailService = await EmailService.forTenant(req.tenant!.id);
        
        if (emailService && data.applicantEmail) {
          const safeApplicantName = escapeHtml(data.applicantName);
          const safeTenantName = escapeHtml(req.tenant!.name);
          const dateFormatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

          await emailService.send({
            to: data.applicantEmail,
            subject: `Thank you for your volunteer application - ${safeTenantName}`,
            html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Thank You, ${safeApplicantName}!</h2>
  
  <p>We've received your application to volunteer with ${safeTenantName}. Thank you for your interest in making a difference for animals in need!</p>
  
  <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Application Type:</strong> Volunteer</p>
    <p style="margin: 5px 0;"><strong>Date Submitted:</strong> ${dateFormatted}</p>
    <p style="margin: 5px 0;"><strong>Reference ID:</strong> ${application.id.slice(0, 8).toUpperCase()}</p>
  </div>
  
  <h3 style="color: #374151;">What Happens Next?</h3>
  <p>Our volunteer coordinator will review your application and reach out to you within 3-5 business days with next steps, which may include orientation information or training schedules.</p>
  
  <p>In the meantime, if you have any questions, please don't hesitate to reach out to us.</p>
  
  <p>Thank you for wanting to help animals in need!</p>
  
  <p>With gratitude,<br/>
  <strong>The ${safeTenantName} Team</strong></p>
</div>
            `.trim()
          });
          console.log(`[Application] Volunteer confirmation email sent to ${data.applicantEmail}`);
        }
      } catch (emailError) {
        console.error('Failed to send volunteer application confirmation email:', emailError);
        // Don't fail the application submission if email fails
      }

      res.json({ 
        success: true, 
        application,
        message: "Thank you for applying to volunteer! We'll review your application and get back to you soon." 
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/volunteer-applications
   * List volunteer applications (admin/staff only)
   */
  app.get('/api/volunteer-applications', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { volunteerApplications } = await import('@shared/schema');
      
      const applications = await db
        .select()
        .from(volunteerApplications)
        .where(eq(volunteerApplications.tenantId, req.tenant!.id))
        .orderBy(desc(volunteerApplications.createdAt));
      
      res.json({ applications });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/volunteer-applications/:id
   * Update volunteer application status (admin/staff only)
   */
  app.patch('/api/volunteer-applications/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) =>{
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid application ID format' });
      }
      
      const { volunteerApplications } = await import('@shared/schema');
      
      const updateSchema = z.object({
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
        pipelineStatus: z.enum(['new_applicant', 'orientation_scheduled', 'waiver_needed', 'active_pool', 'rejected']).optional(),
        notes: z.string().optional(),
      });

      const data = updateSchema.parse(req.body);

      // If moving to active_pool via pipeline, also set status to approved
      const updateData: any = {
        ...data,
        updatedAt: new Date(),
      };
      if (data.pipelineStatus === 'active_pool') {
        updateData.status = 'approved';
      } else if (data.pipelineStatus === 'rejected') {
        updateData.status = 'rejected';
      }

      const [updatedApplication] = await db
        .update(volunteerApplications)
        .set(updateData)
        .where(
          and(
            eq(volunteerApplications.id, req.params.id),
            eq(volunteerApplications.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updatedApplication) {
        return res.status(404).json({ error: 'Volunteer application not found' });
      }

      res.json({ success: true, application: updatedApplication });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/volunteer-applications/:id/pipeline-status
   * Update volunteer application pipeline status for Kanban drag-and-drop (admin/staff only)
   */
  app.patch('/api/volunteer-applications/:id/pipeline-status', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid application ID format' });
      }
      
      const { volunteerApplications } = await import('@shared/schema');
      
      const updateSchema = z.object({
        pipelineStatus: z.enum(['new_applicant', 'orientation_scheduled', 'waiver_needed', 'active_pool', 'rejected']),
      });

      const { pipelineStatus } = updateSchema.parse(req.body);

      // Prepare update data
      const updateData: any = {
        pipelineStatus,
        updatedAt: new Date(),
      };
      
      // Sync legacy status field with pipeline status
      if (pipelineStatus === 'active_pool') {
        updateData.status = 'approved';
      } else if (pipelineStatus === 'rejected') {
        updateData.status = 'rejected';
      }

      const [updatedApplication] = await db
        .update(volunteerApplications)
        .set(updateData)
        .where(
          and(
            eq(volunteerApplications.id, req.params.id),
            eq(volunteerApplications.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updatedApplication) {
        return res.status(404).json({ error: 'Volunteer application not found' });
      }

      res.json({ success: true, application: updatedApplication });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/volunteer-applications/:id/send-waiver
   * Send Hold Harmless waiver form to a volunteer applicant (admin/staff only)
   */
  app.post('/api/volunteer-applications/:id/send-waiver', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid application ID format' });
      }
      
      const { volunteerApplications, customForms } = await import('@shared/schema');
      const { getFormById, createSubmission, generateSecureToken, updateSubmission } = await import('./services/custom-form');
      const { EmailService } = await import('./lib/email-service');
      
      // Find the volunteer application
      const [application] = await db
        .select()
        .from(volunteerApplications)
        .where(
          and(
            eq(volunteerApplications.id, req.params.id),
            eq(volunteerApplications.tenantId, req.tenant!.id)
          )
        );

      if (!application) {
        return res.status(404).json({ error: 'Volunteer application not found' });
      }

      // Find the Hold Harmless form for this tenant
      const holdHarmlessForms = await db
        .select()
        .from(customForms)
        .where(
          and(
            eq(customForms.tenantId, req.tenant!.id),
            eq(customForms.isActive, true),
            ilike(customForms.name, '%hold%harmless%')
          )
        )
        .limit(1);

      if (holdHarmlessForms.length === 0) {
        return res.status(404).json({ 
          error: 'Hold Harmless form not found. Please create a custom form with "Hold Harmless" in the name.' 
        });
      }

      const form = holdHarmlessForms[0];

      // Generate secure token for form signing
      const { token, hash } = generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      // Create form submission
      const submission = await createSubmission({
        tenantId: req.tenant!.id,
        formId: form.id,
        signerName: application.applicantName,
        signerEmail: application.applicantEmail,
        status: 'pending',
        tokenHash: hash,
        expiresAt,
      });

      // Update volunteer application with form reference
      await db
        .update(volunteerApplications)
        .set({
          holdHarmlessFormId: form.id,
          updatedAt: new Date(),
        })
        .where(eq(volunteerApplications.id, application.id));

      // Send email with signing link
      const emailService = await EmailService.create(req.tenant!.id);
      const signingUrl = `${req.protocol}://${req.get('host')}/sign-form/${token}`;
      
      await emailService.send({
        to: application.applicantEmail,
        subject: `Please sign the Hold Harmless Waiver - ${req.tenant!.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Hold Harmless Waiver Required</h2>
            <p>Hello ${application.applicantName},</p>
            <p>Thank you for your interest in volunteering with ${req.tenant!.name}!</p>
            <p>Before you can start volunteering, we need you to review and sign our Hold Harmless waiver. This is a standard form that protects both you and our organization.</p>
            <p style="margin: 24px 0;">
              <a href="${signingUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Review and Sign Waiver
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">This link will expire in 7 days.</p>
            <p>If you have any questions, please don't hesitate to contact us.</p>
            <p>Thank you,<br>${req.tenant!.name} Team</p>
          </div>
        `,
      });

      res.json({ 
        success: true, 
        message: 'Hold Harmless waiver sent successfully',
        submissionId: submission.id,
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Animal Surrender Routes
  // ============================================================================

  /**
   * POST /api/animal-surrenders
   * Submit animal surrender request (public route)
   */
  app.post('/api/animal-surrenders', requireTenant, async (req, res, next) => {
    try {
      const { animalSurrenders, insertAnimalSurrenderSchema, inboundEmails } = await import('@shared/schema');
      
      const data = insertAnimalSurrenderSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });

      const [surrender] = await db
        .insert(animalSurrenders)
        .values([data as any])
        .returning();

      // Create/update contact from this surrender request
      try {
        const { upsertContact } = await import('./services/contacts');
        await upsertContact({
          tenantId: req.tenant!.id,
          name: data.submitterName,
          email: data.submitterEmail,
          phone: data.submitterPhone,
          address: data.address || undefined,
          source: 'manual',
          tags: ['animal-surrender'],
        });
      } catch (contactError) {
        console.error('Failed to create contact from surrender:', contactError);
      }

      // Create inbound email record for inbox
      try {
        const emailSubject = `Animal Surrender Request from ${data.submitterName}${data.isEmergency ? ' [EMERGENCY]' : ''}`;
        const emailBody = `
Animal Surrender Request${data.isEmergency ? ' - EMERGENCY' : ''}

Submitter Information:
Name: ${data.submitterName}
Email: ${data.submitterEmail}
Phone: ${data.submitterPhone}
Address: ${data.address || 'Not provided'}

Animal Information:
Type: ${data.animalType}
Breed: ${data.breed || 'Not specified'}
Age: ${data.age || 'Unknown'}
Gender: ${data.gender || 'Unknown'}
Name: ${data.animalName || 'Unnamed'}
${data.isSpayedNeutered !== null ? `Spayed/Neutered: ${data.isSpayedNeutered ? 'Yes' : 'No'}` : ''}

Medical History:
${data.medicalHistory || 'None provided'}

Behavioral Notes:
${data.behaviorNotes || 'None provided'}

Reason for Surrender:
${data.surrenderReason}

${data.isEmergency ? '⚠️ THIS IS AN EMERGENCY SURRENDER - Immediate action required' : ''}

Surrender ID: ${surrender.id}
Submitted: ${new Date().toLocaleString()}
        `.trim();

        await db.insert(inboundEmails).values({
          tenantId: req.tenant!.id,
          messageId: `surrender-${surrender.id}`,
          from: data.submitterEmail,
          fromName: data.submitterName,
          to: `${req.tenant!.subdomain}@mail.irescue.life`,
          subject: emailSubject,
          textBody: emailBody,
          htmlBody: emailBody.replace(/\n/g, '<br>'),
          status: 'unprocessed',
        });
      } catch (error) {
        console.error('Failed to create inbound email record:', error);
      }

      // Send email notification to staff if enabled
      try {
        const { sendFormSubmissionNotification } = await import('./services/form-notifications');
        await sendFormSubmissionNotification({
          formType: 'surrender',
          tenantId: req.tenant!.id,
          applicantName: data.submitterName,
          applicantEmail: data.submitterEmail,
          applicantPhone: data.submitterPhone,
          applicationId: surrender.id,
          additionalDetails: `${data.animalType}${data.breed ? ` - ${data.breed}` : ''}${data.isEmergency ? ' [EMERGENCY]' : ''}`,
        });
      } catch (error) {
        console.error('Failed to send form notification email:', error);
      }

      res.json({ success: true, surrender });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animal-surrenders
   * List animal surrender requests (admin/staff only)
   */
  app.get('/api/animal-surrenders', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { animalSurrenders } = await import('@shared/schema');
      
      const surrenders = await db
        .select()
        .from(animalSurrenders)
        .where(eq(animalSurrenders.tenantId, req.tenant!.id))
        .orderBy(desc(animalSurrenders.createdAt));
      
      res.json({ surrenders });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/animal-surrenders/:id
   * Update animal surrender status (admin/staff only)
   */
  app.patch('/api/animal-surrenders/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { animalSurrenders } = await import('@shared/schema');
      
      const updateSchema = z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'completed']),
        notes: z.string().optional(),
      });

      const data = updateSchema.parse(req.body);

      const [updatedSurrender] = await db
        .update(animalSurrenders)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(animalSurrenders.id, req.params.id),
            eq(animalSurrenders.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updatedSurrender) {
        return res.status(404).json({ error: 'Animal surrender request not found' });
      }

      res.json({ success: true, surrender: updatedSurrender });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/foster-animals
   * List foster animals (role-based access: fosters see theirs, admins see all)
   */
  app.get('/api/foster-animals', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { fosterAnimals, animals, users } = await import('@shared/schema');
      
      let fosterAnimalList;
      
      // If user is a foster, only show their animals
      if (req.user!.activeRole === 'foster') {
        fosterAnimalList = await db
          .select({
            id: fosterAnimals.id,
            animalId: fosterAnimals.animalId,
            fosterId: fosterAnimals.fosterId,
            startDate: fosterAnimals.startDate,
            expectedReturnDate: fosterAnimals.expectedReturnDate,
            actualReturnDate: fosterAnimals.actualReturnDate,
            status: fosterAnimals.status,
            notes: fosterAnimals.notes,
            createdAt: fosterAnimals.createdAt,
            updatedAt: fosterAnimals.updatedAt,
            animalName: animals.name,
            animalSpecies: animals.species,
            animalBreed: animals.breed,
            animalPhotoUrls: animals.photoUrls,
            animalStatus: animals.status,
            fosterName: users.fullName,
            fosterEmail: users.email,
          })
          .from(fosterAnimals)
          .leftJoin(animals, eq(fosterAnimals.animalId, animals.id))
          .leftJoin(users, eq(fosterAnimals.fosterId, users.id))
          .where(
            and(
              eq(fosterAnimals.tenantId, req.tenant!.id),
              eq(fosterAnimals.fosterId, req.user!.id)
            )
          )
          .orderBy(desc(fosterAnimals.createdAt));
      } else {
        // Admin/staff see all foster animals
        fosterAnimalList = await db
          .select({
            id: fosterAnimals.id,
            animalId: fosterAnimals.animalId,
            fosterId: fosterAnimals.fosterId,
            startDate: fosterAnimals.startDate,
            expectedReturnDate: fosterAnimals.expectedReturnDate,
            actualReturnDate: fosterAnimals.actualReturnDate,
            status: fosterAnimals.status,
            notes: fosterAnimals.notes,
            createdAt: fosterAnimals.createdAt,
            updatedAt: fosterAnimals.updatedAt,
            animalName: animals.name,
            animalSpecies: animals.species,
            animalBreed: animals.breed,
            animalPhotoUrls: animals.photoUrls,
            animalStatus: animals.status,
            fosterName: users.fullName,
            fosterEmail: users.email,
          })
          .from(fosterAnimals)
          .leftJoin(animals, eq(fosterAnimals.animalId, animals.id))
          .leftJoin(users, eq(fosterAnimals.fosterId, users.id))
          .where(eq(fosterAnimals.tenantId, req.tenant!.id))
          .orderBy(desc(fosterAnimals.createdAt));
      }
      
      // Transform flat results into nested structure for backwards compatibility
      // Use primary key checks for null guards to handle empty strings correctly
      const transformedResults = fosterAnimalList.map(row => ({
        id: row.id,
        animalId: row.animalId,
        fosterId: row.fosterId,
        startDate: row.startDate,
        expectedReturnDate: row.expectedReturnDate,
        actualReturnDate: row.actualReturnDate,
        status: row.status,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        animal: row.animalId ? {
          id: row.animalId,
          name: row.animalName,
          species: row.animalSpecies,
          breed: row.animalBreed,
          photoUrls: row.animalPhotoUrls,
          status: row.animalStatus,
        } : null,
        foster: row.fosterId ? {
          id: row.fosterId,
          fullName: row.fosterName,
          email: row.fosterEmail,
        } : null,
      }));
      
      res.json({ fosterAnimals: transformedResults });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/fosters/eligible
   * List eligible foster parents (admin/staff only)
   */
  app.get('/api/fosters/eligible', requireTenant, requireAuth, async (req, res, next) => {
    // Check if user is admin or staff
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin or staff role required' });
    }
    try {
      const { users } = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // Find users with 'foster' role
      const eligibleFosters = await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          roles: users.roles,
        })
        .from(users)
        .where(
          and(
            eq(users.tenantId, req.tenant!.id),
            eq(users.isActive, true),
            sql`${users.roles} @> ARRAY['foster']::text[]`
          )
        )
        .orderBy(users.fullName);
      
      res.json({ fosters: eligibleFosters });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:id/foster-matches
   * Smart Foster Matching - find best foster matches for a specific animal
   * Returns fosters ranked by compatibility with match badges
   */
  app.get('/api/animals/:id/foster-matches', requireTenant, requireAuth, async (req, res, next) => {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin or staff role required' });
    }
    try {
      const { animals, users } = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // First, get the animal to check compatibility requirements
      const [animal] = await db
        .select()
        .from(animals)
        .where(
          and(
            eq(animals.id, req.params.id),
            eq(animals.tenantId, req.tenant!.id)
          )
        )
        .limit(1);

      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }

      // Get all active fosters with matching profiles
      const allFosters = await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
          fosterStatus: users.fosterStatus,
          hasCats: users.hasCats,
          hasKids: users.hasKids,
          hasFencedYard: users.hasFencedYard,
          sizePreference: users.sizePreference,
        })
        .from(users)
        .where(
          and(
            eq(users.tenantId, req.tenant!.id),
            eq(users.isActive, true),
            sql`${users.roles} @> ARRAY['foster']::text[]`
          )
        )
        .orderBy(users.fullName);

      // Map petfinderSize to simple size category
      const animalSize = animal.petfinderSize?.toLowerCase() === 'extra large' 
        ? 'large' 
        : animal.petfinderSize?.toLowerCase() as 'small' | 'medium' | 'large' | undefined;

      // Filter and score each foster based on matching criteria
      const matches = allFosters
        .filter(foster => {
          // Only include active fosters
          if (foster.fosterStatus && foster.fosterStatus !== 'active') {
            return false;
          }
          
          // Filter 1: If animal is NOT good with cats, exclude fosters who have cats
          if (animal.catFriendly === false && foster.hasCats === true) {
            return false;
          }
          
          // Filter 2: If animal is NOT good with kids, exclude fosters who have kids
          if (animal.childFriendly === false && foster.hasKids === true) {
            return false;
          }
          
          // Filter 3: If animal needs fence, exclude fosters without fenced yard
          if (animal.needsFence === true && foster.hasFencedYard === false) {
            return false;
          }
          
          // Filter 4: Size preference must match (unless foster prefers "any")
          if (foster.sizePreference && foster.sizePreference !== 'any' && animalSize) {
            if (foster.sizePreference !== animalSize) {
              return false;
            }
          }
          
          return true;
        })
        .map(foster => {
          // Calculate match badges (positive compatibility indicators)
          const badges: string[] = [];
          let matchScore = 0;
          
          // Fence compatibility
          if (animal.needsFence === true && foster.hasFencedYard === true) {
            badges.push('Has Fence');
            matchScore += 25;
          } else if (!animal.needsFence) {
            matchScore += 10; // No fence needed, slight bonus
          }
          
          // Cat compatibility
          if (foster.hasCats === false) {
            badges.push('No Cats');
            matchScore += 20;
          } else if (animal.catFriendly === true && foster.hasCats === true) {
            badges.push('Cat-Friendly Home');
            matchScore += 15;
          }
          
          // Kid compatibility
          if (foster.hasKids === false) {
            badges.push('No Kids');
            matchScore += 20;
          } else if (animal.childFriendly === true && foster.hasKids === true) {
            badges.push('Kid-Friendly Home');
            matchScore += 15;
          }
          
          // Size match
          if (foster.sizePreference === 'any') {
            badges.push('Any Size');
            matchScore += 15;
          } else if (foster.sizePreference && animalSize && foster.sizePreference === animalSize) {
            badges.push(`Prefers ${foster.sizePreference.charAt(0).toUpperCase() + foster.sizePreference.slice(1)}`);
            matchScore += 20;
          }
          
          // Foster status bonus
          if (foster.fosterStatus === 'active') {
            badges.push('Active Foster');
            matchScore += 10;
          }
          
          return {
            id: foster.id,
            fullName: foster.fullName,
            email: foster.email,
            phone: foster.phone,
            fosterStatus: foster.fosterStatus,
            hasCats: foster.hasCats,
            hasKids: foster.hasKids,
            hasFencedYard: foster.hasFencedYard,
            sizePreference: foster.sizePreference,
            badges,
            matchScore,
          };
        })
        .sort((a, b) => b.matchScore - a.matchScore); // Sort by match score descending

      res.json({ 
        animal: {
          id: animal.id,
          name: animal.name,
          species: animal.species,
          breed: animal.breed,
          petfinderSize: animal.petfinderSize,
          catFriendly: animal.catFriendly,
          childFriendly: animal.childFriendly,
          needsFence: animal.needsFence,
        },
        matches,
        totalFosters: allFosters.length,
        matchingFosters: matches.length,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:id/foster-request
   * Send a foster request to a specific foster parent
   */
  app.post('/api/animals/:id/foster-request', requireTenant, requireAuth, async (req, res, next) => {
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin or staff role required' });
    }
    try {
      const { animals, users, tenants } = await import('@shared/schema');
      const { fosterId } = z.object({ fosterId: z.string().uuid() }).parse(req.body);
      
      // Get the animal
      const [animal] = await db
        .select()
        .from(animals)
        .where(
          and(
            eq(animals.id, req.params.id),
            eq(animals.tenantId, req.tenant!.id)
          )
        )
        .limit(1);

      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }

      // Get the foster user
      const [foster] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, fosterId),
            eq(users.tenantId, req.tenant!.id),
            eq(users.isActive, true)
          )
        )
        .limit(1);

      if (!foster) {
        return res.status(404).json({ error: 'Foster not found' });
      }

      // Get tenant for branding
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      // Send foster request email
      const { EmailService } = await import('./lib/email-service');
      const emailService = await EmailService.forTenant(req.tenant!.id);
      
      if (!emailService) {
        return res.status(500).json({ error: 'Email service not configured for this organization' });
      }
      
      // Build animal profile link
      const baseUrl = tenant?.customDomain && tenant?.customDomainVerified
        ? `https://${tenant.customDomain}`
        : `${process.env.BASE_URL || 'https://irescue.life'}/${tenant?.subdomain}`;
      const animalUrl = `${baseUrl}/dashboard/animals/${animal.id}`;
      
      const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 ? animal.photoUrls[0] : null;
      
      await emailService.send({
        to: foster.email,
        subject: `Foster Match: We have a match for you! Meet ${animal.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2563eb;">Hi ${foster.fullName.split(' ')[0]}, we have a match for you!</h1>
            
            ${photoUrl ? `<img src="${photoUrl}" alt="${animal.name}" style="width: 100%; max-width: 400px; border-radius: 8px; margin: 20px 0;" />` : ''}
            
            <h2 style="color: #1f2937;">Meet ${animal.name}</h2>
            <p style="color: #4b5563; font-size: 16px;">
              <strong>Species:</strong> ${animal.species}<br />
              <strong>Breed:</strong> ${animal.breed}<br />
              ${animal.petfinderSize ? `<strong>Size:</strong> ${animal.petfinderSize}<br />` : ''}
              ${animal.petfinderAge ? `<strong>Age:</strong> ${animal.petfinderAge}<br />` : ''}
            </p>
            
            ${animal.bio ? `<p style="color: #4b5563; font-size: 14px; background: #f3f4f6; padding: 15px; border-radius: 8px;">${animal.bio}</p>` : ''}
            
            <p style="color: #4b5563; font-size: 16px;">
              Based on your foster profile, we think ${animal.name} would be a great fit for your home!
            </p>
            
            <div style="margin: 30px 0;">
              <a href="${animalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                View ${animal.name}'s Profile
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">
              If you're interested in fostering ${animal.name}, please log in to your account or reply to this email.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
            
            <p style="color: #9ca3af; font-size: 12px;">
              This email was sent by ${tenant?.name || 'iRescue.life'}.
              If you no longer wish to receive foster match notifications, please update your preferences in your account settings.
            </p>
          </div>
        `,
      });

      res.json({ 
        success: true, 
        message: `Foster request sent to ${foster.fullName}`,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-animals
   * Create foster animal assignment (admin/staff only)
   */
  app.post('/api/foster-animals', requireTenant, requireAuth, async (req, res, next) => {
    // Check if user is admin or staff
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin or staff role required' });
    }
    try {
      const { fosterAnimals, insertFosterAnimalSchema, animals } = await import('@shared/schema');
      
      const data = insertFosterAnimalSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });

      const [fosterAnimal] = await db
        .insert(fosterAnimals)
        .values([data as any])
        .returning();

      // Update animal status to "foster"
      await db
        .update(animals)
        .set({ status: 'foster' })
        .where(eq(animals.id, data.animalId));

      res.json({ success: true, fosterAnimal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/foster-animals/:id
   * Update foster animal (admin/staff or assigned foster)
   */
  app.patch('/api/foster-animals/:id', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { fosterAnimals, animals } = await import('@shared/schema');
      
      // Fetch the foster animal to check permissions
      const [fosterAnimal] = await db
        .select()
        .from(fosterAnimals)
        .where(
          and(
            eq(fosterAnimals.id, req.params.id),
            eq(fosterAnimals.tenantId, req.tenant!.id)
          )
        )
        .limit(1);

      if (!fosterAnimal) {
        return res.status(404).json({ error: 'Foster animal not found' });
      }

      // Check permissions: admin/staff can update any, fosters can only update their own
      if (req.user!.activeRole === 'foster' && fosterAnimal.fosterId !== req.user!.id) {
        return res.status(403).json({ error: 'You can only update your own foster animals' });
      }

      const updateSchema = z.object({
        expectedReturnDate: z.coerce.date().optional(),
        actualReturnDate: z.coerce.date().optional(),
        status: z.enum(['active', 'completed', 'returned']).optional(),
        notes: z.string().optional(),
      });

      const data = updateSchema.parse(req.body);

      const [updatedFosterAnimal] = await db
        .update(fosterAnimals)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(fosterAnimals.id, req.params.id))
        .returning();

      // If status changed to "returned" or "completed", update animal status back to "available"
      if (data.status === 'returned' || data.status === 'completed') {
        await db
          .update(animals)
          .set({ status: 'available' })
          .where(eq(animals.id, fosterAnimal.animalId));
      }

      res.json({ success: true, fosterAnimal: updatedFosterAnimal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/foster-animals/:id
   * Delete foster animal assignment (admin only)
   */
  app.delete('/api/foster-animals/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { fosterAnimals, animals } = await import('@shared/schema');
      
      const [fosterAnimal] = await db
        .select()
        .from(fosterAnimals)
        .where(
          and(
            eq(fosterAnimals.id, req.params.id),
            eq(fosterAnimals.tenantId, req.tenant!.id)
          )
        )
        .limit(1);

      if (!fosterAnimal) {
        return res.status(404).json({ error: 'Foster animal not found' });
      }

      await db
        .delete(fosterAnimals)
        .where(eq(fosterAnimals.id, req.params.id));

      // Update animal status back to "available"
      await db
        .update(animals)
        .set({ status: 'available' })
        .where(eq(animals.id, fosterAnimal.animalId));

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Supply Requests Routes (Foster Features)
  // ============================================================================

  /**
   * GET /api/supply-requests
   * List supply requests (fosters see theirs, staff see all)
   */
  app.get('/api/supply-requests', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { supplyRequests, animals, users } = await import('@shared/schema');
      
      let requests;
      
      // Fosters see only their requests
      if (req.user!.activeRole === 'foster') {
        requests = await db
          .select({
            id: supplyRequests.id,
            fosterId: supplyRequests.fosterId,
            animalId: supplyRequests.animalId,
            category: supplyRequests.category,
            item: supplyRequests.item,
            quantity: supplyRequests.quantity,
            notes: supplyRequests.notes,
            status: supplyRequests.status,
            createdAt: supplyRequests.createdAt,
            updatedAt: supplyRequests.updatedAt,
            animalName: animals.name,
            animalSpecies: animals.species,
            animalPhotoUrls: animals.photoUrls,
            fosterName: users.fullName,
            fosterEmail: users.email,
          })
          .from(supplyRequests)
          .leftJoin(animals, eq(supplyRequests.animalId, animals.id))
          .leftJoin(users, eq(supplyRequests.fosterId, users.id))
          .where(
            and(
              eq(supplyRequests.tenantId, req.tenant!.id),
              eq(supplyRequests.fosterId, req.user!.id)
            )
          )
          .orderBy(desc(supplyRequests.createdAt));
      } else {
        // Staff/admin see all requests
        requests = await db
          .select({
            id: supplyRequests.id,
            fosterId: supplyRequests.fosterId,
            animalId: supplyRequests.animalId,
            category: supplyRequests.category,
            item: supplyRequests.item,
            quantity: supplyRequests.quantity,
            notes: supplyRequests.notes,
            status: supplyRequests.status,
            createdAt: supplyRequests.createdAt,
            updatedAt: supplyRequests.updatedAt,
            animalName: animals.name,
            animalSpecies: animals.species,
            animalPhotoUrls: animals.photoUrls,
            fosterName: users.fullName,
            fosterEmail: users.email,
          })
          .from(supplyRequests)
          .leftJoin(animals, eq(supplyRequests.animalId, animals.id))
          .leftJoin(users, eq(supplyRequests.fosterId, users.id))
          .where(eq(supplyRequests.tenantId, req.tenant!.id))
          .orderBy(desc(supplyRequests.createdAt));
      }
      
      // Transform flat results into nested structure for backwards compatibility
      // Use primary key checks for null guards to handle empty strings correctly
      const transformedRequests = requests.map(row => ({
        id: row.id,
        fosterId: row.fosterId,
        animalId: row.animalId,
        category: row.category,
        item: row.item,
        quantity: row.quantity,
        notes: row.notes,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        animal: row.animalId ? {
          id: row.animalId,
          name: row.animalName,
          species: row.animalSpecies,
          photoUrls: row.animalPhotoUrls,
        } : null,
        user: row.fosterId ? {
          id: row.fosterId,
          fullName: row.fosterName,
          email: row.fosterEmail,
        } : null,
      }));
      
      res.json({ supplyRequests: transformedRequests });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/supply-requests
   * Create supply request (fosters only)
   */
  app.post('/api/supply-requests', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { supplyRequests, insertSupplyRequestSchema, tasks } = await import('@shared/schema');
      
      // Parse request body (without tenantId/fosterId)
      const validatedData = insertSupplyRequestSchema.parse(req.body);
      
      // Add server-side fields after validation
      const data = {
        ...validatedData,
        tenantId: req.tenant!.id,
        fosterId: req.user!.id,
      };

      const [request] = await db
        .insert(supplyRequests)
        .values([data as any])
        .returning();

      // Create task for foster coordinator
      await db
        .insert(tasks)
        .values([{
          tenantId: req.tenant!.id,
          title: `Supply Request: ${data.item}`,
          description: `Foster ${req.user!.fullName} requested ${data.quantity} of ${data.item} (${data.category})`,
          taskType: 'supply_request',
          assignedTo: 'foster_coordinator',
          priority: 'normal',
          status: 'pending',
          relatedSupplyRequestId: request.id,
          relatedAnimalId: data.animalId || null,
          createdBy: req.user!.id,
        } as any]);

      // Send email notification to admins and staff
      try {
        const { EmailService } = await import('./lib/email-service');
        const { users, animals } = await import('@shared/schema');
        
        // HTML escape function to prevent injection
        const escapeHtml = (text: string) => {
          return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        };
        
        // Get admin/staff emails
        const staffUsers = await db
          .select({ email: users.email, fullName: users.fullName })
          .from(users)
          .where(
            and(
              eq(users.tenantId, req.tenant!.id),
              sql`${users.roles} && ARRAY['admin', 'staff']::varchar[]`
            )
          );

        // Get animal name if applicable
        let animalName = 'N/A';
        if (data.animalId) {
          const [animal] = await db
            .select({ name: animals.name })
            .from(animals)
            .where(eq(animals.id, data.animalId))
            .limit(1);
          if (animal) animalName = escapeHtml(animal.name);
        }

        if (staffUsers.length > 0) {
          const emailService = await EmailService.forTenant(req.tenant!.id);
          if (emailService) {
            const subject = `New Supply Request: ${escapeHtml(data.item)}`;
            const html = `
              <h2>New Supply Request</h2>
              <p><strong>${escapeHtml(req.user!.fullName)}</strong> has submitted a supply request.</p>
              
              <h3>Request Details:</h3>
              <ul>
                <li><strong>Item:</strong> ${escapeHtml(data.item)}</li>
                <li><strong>Category:</strong> ${escapeHtml(data.category)}</li>
                <li><strong>Quantity:</strong> ${escapeHtml(String(data.quantity))}</li>
                <li><strong>Animal:</strong> ${animalName}</li>
                ${data.notes ? `<li><strong>Notes:</strong> ${escapeHtml(data.notes)}</li>` : ''}
              </ul>
              
              <p>Please review and fulfill this request in your admin portal.</p>
            `;

            // Send to all staff/admin users
            await emailService.sendBulk({
              recipients: staffUsers.map(u => u.email),
              subject,
              html,
            });
          }
        }
      } catch (error) {
        // Don't fail the request if email fails
        console.error('Failed to send supply request email notification:', error);
      }

      res.json({ success: true, supplyRequest: request });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/supply-requests/:id
   * Update supply request status (admin/staff only)
   */
  app.patch('/api/supply-requests/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { supplyRequests } = await import('@shared/schema');
      
      const updateSchema = z.object({
        status: z.enum(['pending', 'approved', 'fulfilled', 'denied']),
      });

      const data = updateSchema.parse(req.body);

      // Calculate archivedAt for terminal statuses (fulfilled/denied)
      const now = new Date();
      const archivedAt = (data.status === 'fulfilled' || data.status === 'denied')
        ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        : null;

      const [updated] = await db
        .update(supplyRequests)
        .set({
          ...data,
          archivedAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(supplyRequests.id, req.params.id),
            eq(supplyRequests.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Supply request not found' });
      }

      res.json({ success: true, supplyRequest: updated });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Foster Updates Routes
  // ============================================================================

  /**
   * GET /api/foster-updates
   * List foster updates (fosters see theirs, staff see all)
   */
  app.get('/api/foster-updates', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { fosterUpdates, animals, users } = await import('@shared/schema');
      
      const animalIdFilter = req.query.animalId as string | undefined;
      
      let updates;
      
      // Fosters see only their updates
      if (req.user!.activeRole === 'foster') {
        const conditions = [
          eq(fosterUpdates.tenantId, req.tenant!.id),
          eq(fosterUpdates.fosterId, req.user!.id),
        ];
        
        if (animalIdFilter) {
          conditions.push(eq(fosterUpdates.animalId, animalIdFilter));
        }
        
        updates = await db
          .select({
            id: fosterUpdates.id,
            fosterId: fosterUpdates.fosterId,
            animalId: fosterUpdates.animalId,
            updateType: fosterUpdates.updateType,
            description: fosterUpdates.description,
            photoUrls: fosterUpdates.photoUrls,
            priority: fosterUpdates.priority,
            status: fosterUpdates.status,
            createdAt: fosterUpdates.createdAt,
            updatedAt: fosterUpdates.updatedAt,
            animalName: animals.name,
            animalSpecies: animals.species,
            animalPhotoUrls: animals.photoUrls,
            fosterName: users.fullName,
            fosterEmail: users.email,
          })
          .from(fosterUpdates)
          .leftJoin(animals, eq(fosterUpdates.animalId, animals.id))
          .leftJoin(users, eq(fosterUpdates.fosterId, users.id))
          .where(and(...conditions))
          .orderBy(desc(fosterUpdates.createdAt));
      } else {
        // Staff/admin see all updates
        const conditions = [eq(fosterUpdates.tenantId, req.tenant!.id)];
        
        if (animalIdFilter) {
          conditions.push(eq(fosterUpdates.animalId, animalIdFilter));
        }
        
        updates = await db
          .select({
            id: fosterUpdates.id,
            fosterId: fosterUpdates.fosterId,
            animalId: fosterUpdates.animalId,
            updateType: fosterUpdates.updateType,
            description: fosterUpdates.description,
            photoUrls: fosterUpdates.photoUrls,
            priority: fosterUpdates.priority,
            status: fosterUpdates.status,
            createdAt: fosterUpdates.createdAt,
            updatedAt: fosterUpdates.updatedAt,
            animalName: animals.name,
            animalSpecies: animals.species,
            animalPhotoUrls: animals.photoUrls,
            fosterName: users.fullName,
            fosterEmail: users.email,
          })
          .from(fosterUpdates)
          .leftJoin(animals, eq(fosterUpdates.animalId, animals.id))
          .leftJoin(users, eq(fosterUpdates.fosterId, users.id))
          .where(and(...conditions))
          .orderBy(desc(fosterUpdates.createdAt));
      }
      
      // Transform flat results into nested structure for backwards compatibility
      // Use primary key checks for null guards to handle empty strings correctly
      const transformedUpdates = updates.map(row => ({
        id: row.id,
        fosterId: row.fosterId,
        animalId: row.animalId,
        updateType: row.updateType,
        description: row.description,
        photoUrls: row.photoUrls,
        priority: row.priority,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        animal: row.animalId ? {
          id: row.animalId,
          name: row.animalName,
          species: row.animalSpecies,
          photoUrls: row.animalPhotoUrls,
        } : null,
        foster: row.fosterId ? {
          id: row.fosterId,
          fullName: row.fosterName,
          email: row.fosterEmail,
        } : null,
      }));
      
      res.json({ fosterUpdates: transformedUpdates });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-updates
   * Create foster update/concern (fosters only)
   */
  app.post('/api/foster-updates', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { fosterUpdates, insertFosterUpdateSchema, tasks } = await import('@shared/schema');
      
      // Parse request body (without tenantId/fosterId)
      const validatedData = insertFosterUpdateSchema.parse(req.body);
      
      // Add server-side fields after validation
      const data = {
        ...validatedData,
        tenantId: req.tenant!.id,
        fosterId: req.user!.id,
      };

      // Set priority based on update type
      const priority = data.updateType === 'medical_concern' ? 'high' : 'normal';

      const [update] = await db
        .insert(fosterUpdates)
        .values([{ ...data, priority } as any])
        .returning();

      // Create task based on update type
      let assignedTo: 'medical_team' | 'adoption_coordinator' | 'foster_coordinator' = 'foster_coordinator';
      let taskPriority: 'low' | 'normal' | 'high' | 'urgent' = 'normal';
      
      if (data.updateType === 'medical_concern') {
        assignedTo = 'medical_team';
        taskPriority = 'high';
      } else if (data.updateType === 'behavioral_note') {
        assignedTo = 'adoption_coordinator';
      }

      await db
        .insert(tasks)
        .values([{
          tenantId: req.tenant!.id,
          title: `Foster Update: ${data.updateType.replace('_', ' ')}`,
          description: data.description,
          taskType: data.updateType === 'medical_concern' ? 'medical_concern' : 
                    data.updateType === 'behavioral_note' ? 'behavioral_note' : 'general',
          assignedTo,
          priority: taskPriority,
          status: 'pending',
          relatedFosterUpdateId: update.id,
          relatedAnimalId: data.animalId,
          createdBy: req.user!.id,
        } as any]);

      // Send push notification for urgent medical concerns
      if (data.updateType === 'medical_concern' && priority === 'high') {
        try {
          const { animals } = await import('@shared/schema');
          
          // Get animal name for notification
          const [animal] = await db
            .select({ name: animals.name })
            .from(animals)
            .where(eq(animals.id, data.animalId))
            .limit(1);

          // Notify staff and medical team about urgent medical concern
          await PushNotificationService.sendToTenantRoles(
            req.tenant!.id,
            ['staff', 'admin'],
            {
              title: '🚨 Urgent Medical Concern',
              body: `Foster family reported medical concern for ${animal?.name || 'an animal'}: ${data.description.substring(0, 100)}`,
              icon: '/icon-192.png',
              tag: `medical-concern-${update.id}`,
              requireInteraction: true,
              data: {
                type: 'medical_concern',
                fosterUpdateId: update.id,
                animalId: data.animalId,
              },
            }
          );
        } catch (error) {
          // Don't fail the request if notification fails
          console.error('Failed to send push notification:', error);
        }
      }

      // Send email notification to admins and staff
      try {
        const { EmailService } = await import('./lib/email-service');
        const { users, animals } = await import('@shared/schema');
        
        // HTML escape function to prevent injection
        const escapeHtml = (text: string) => {
          return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        };
        
        // Get admin/staff emails
        const staffUsers = await db
          .select({ email: users.email, fullName: users.fullName })
          .from(users)
          .where(
            and(
              eq(users.tenantId, req.tenant!.id),
              sql`${users.roles} && ARRAY['admin', 'staff']::varchar[]`
            )
          );

        // Get animal name only if animalId exists
        let animalName = 'Unknown';
        if (data.animalId) {
          const [animal] = await db
            .select({ name: animals.name })
            .from(animals)
            .where(eq(animals.id, data.animalId))
            .limit(1);
          if (animal) animalName = escapeHtml(animal.name);
        }

        if (staffUsers.length > 0) {
          const emailService = await EmailService.forTenant(req.tenant!.id);
          if (emailService) {
            const updateTypeLabel = data.updateType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const isMedicalConcern = data.updateType === 'medical_concern';
            const subject = isMedicalConcern 
              ? `🚨 URGENT: Medical Concern for ${animalName}`
              : `Foster Update: ${updateTypeLabel} - ${animalName}`;
            
            const html = `
              ${isMedicalConcern ? '<div style="background-color: #fee; border-left: 4px solid #f00; padding: 15px; margin-bottom: 20px;"><strong>⚠️ URGENT MEDICAL CONCERN</strong></div>' : ''}
              
              <h2>Foster Update: ${updateTypeLabel}</h2>
              <p><strong>${escapeHtml(req.user!.fullName)}</strong> has submitted a foster update.</p>
              
              <h3>Update Details:</h3>
              <ul>
                <li><strong>Animal:</strong> ${animalName}</li>
                <li><strong>Update Type:</strong> ${updateTypeLabel}</li>
                <li><strong>Priority:</strong> ${priority.toUpperCase()}</li>
                ${data.photoUrls && data.photoUrls.length > 0 ? `<li><strong>Photos:</strong> ${data.photoUrls.length} attached</li>` : ''}
              </ul>
              
              <h3>Description:</h3>
              <p>${escapeHtml(data.description)}</p>
              
              ${isMedicalConcern ? '<p style="color: #c00; font-weight: bold;">⚠️ This is a high-priority medical concern that requires immediate attention.</p>' : ''}
              
              <p>Please review this update in your admin portal.</p>
            `;

            // Send to all staff/admin users
            await emailService.sendBulk({
              recipients: staffUsers.map(u => u.email),
              subject,
              html,
            });
          }
        }
      } catch (error) {
        // Don't fail the request if email fails
        console.error('Failed to send foster update email notification:', error);
      }

      res.json({ success: true, fosterUpdate: update });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/foster-updates/photos/upload
   * Upload photos for foster updates
   */
  app.post('/api/foster-updates/photos/upload', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const multer = (await import('multer')).default;
      const { ObjectStorageService } = await import('./objectStorage');
      const { randomUUID } = await import('crypto');
      
      // Allowed image extensions (for HEIC/HEIF files that may have incorrect MIME types)
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif', 'bmp', 'ico', 'avif'];
      
      // Configure multer for memory storage
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB
        },
        fileFilter: (_req, file, cb) => {
          // Check MIME type first
          if (file.mimetype.startsWith('image/')) {
            cb(null, true);
          } else {
            // Fallback to extension check for HEIC/HEIF files (often have incorrect MIME types)
            const ext = file.originalname.toLowerCase().split('.').pop();
            if (ext && imageExtensions.includes(ext)) {
              cb(null, true);
            } else {
              cb(new Error('Only image files are allowed'));
            }
          }
        },
      }).array('files', 5); // Accept up to 5 files for foster updates

      // Process upload
      upload(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ error: 'No files uploaded' });
        }

        try {
          const objectStorageService = new ObjectStorageService();
          const { objectStorageClient } = await import('./objectStorage');
          const privateObjectDir = objectStorageService.getPrivateObjectDir();
          const uploadedPaths: string[] = [];

          // Upload each file to object storage
          for (const file of files) {
            let fileBuffer = file.buffer;
            let contentType = file.mimetype;
            
            // Convert HEIC/HEIF to JPEG for browser compatibility
            const ext = file.originalname.toLowerCase().split('.').pop();
            if (ext === 'heic' || ext === 'heif' || file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
              try {
                const heicConvert = (await import('heic-convert')).default;
                const convertedBuffer = await heicConvert({
                  buffer: file.buffer,
                  format: 'JPEG',
                  quality: 0.9
                });
                fileBuffer = Buffer.from(convertedBuffer);
                contentType = 'image/jpeg';
                console.log(`Converted HEIC file to JPEG: ${file.originalname}`);
              } catch (conversionError) {
                console.error('HEIC conversion failed, uploading original:', conversionError);
              }
            }
            
            const tenantId = req.tenant!.id;
            const objectId = randomUUID();
            // Use tenant-scoped path for proper multi-tenant isolation
            const fullPath = `${privateObjectDir}/${tenantId}/foster-updates/${objectId}`;
            
            // Use the parseObjectPath helper to correctly parse bucket and object names
            const parseObjectPath = (path: string): { bucketName: string; objectName: string } => {
              if (!path.startsWith("/")) {
                path = `/${path}`;
              }
              const pathParts = path.split("/");
              if (pathParts.length < 3) {
                throw new Error("Invalid path: must contain at least a bucket name");
              }
              const bucketName = pathParts[1];
              const objectName = pathParts.slice(2).join("/");
              return { bucketName, objectName };
            };
            
            const { bucketName, objectName } = parseObjectPath(fullPath);

            // Get bucket and upload file
            const bucket = objectStorageClient.bucket(bucketName);
            const fileObj = bucket.file(objectName);

            await fileObj.save(fileBuffer, {
              metadata: {
                contentType: contentType,
              },
            });

            // Set ACL to public - use the normalized path format expected by trySetObjectEntityAclPolicy
            const normalizedPath = `/objects/${tenantId}/foster-updates/${objectId}`;
            await objectStorageService.trySetObjectEntityAclPolicy(
              normalizedPath,
              {
                owner: req.session.userId!,
                visibility: 'public',
              }
            );

            uploadedPaths.push(normalizedPath);
          }

          res.json({ uploadedPaths });
        } catch (error: any) {
          console.error('Error uploading files:', error);
          return res.status(500).json({ error: 'Failed to upload files' });
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/foster-updates/:id
   * Update foster update status (admin/staff only)
   */
  app.patch('/api/foster-updates/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { fosterUpdates } = await import('@shared/schema');
      
      const updateSchema = z.object({
        status: z.enum(['pending', 'acknowledged', 'resolved']),
      });

      const data = updateSchema.parse(req.body);

      // Calculate archivedAt for terminal status (resolved)
      const now = new Date();
      const archivedAt = (data.status === 'resolved')
        ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        : null;

      const [updated] = await db
        .update(fosterUpdates)
        .set({
          ...data,
          archivedAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(fosterUpdates.id, req.params.id),
            eq(fosterUpdates.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Foster update not found' });
      }

      res.json({ success: true, fosterUpdate: updated });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Adoptions Routes
  // ============================================================================

  /**
   * POST /api/adoptions
   * Record a new adoption (admin/staff only)
   */
  app.post('/api/adoptions', requireTenant, requireAuth, async (req, res, next) => {
    // Check if user is admin or staff
    if (req.user!.activeRole !== 'admin' && req.user!.activeRole !== 'staff') {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin or staff role required' });
    }
    
    try {
      const { adoptions, animals, applications, insertAdoptionSchema } = await import('@shared/schema');
      
      // Validate request body
      const validatedData = insertAdoptionSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });

      // Create adoption record
      const [adoption] = await db
        .insert(adoptions)
        .values(validatedData)
        .returning();

      // Update animal status to 'adopted' and set adoption date
      await db
        .update(animals)
        .set({ 
          status: 'adopted',
          adoptionDate: validatedData.adoptionDate || new Date(),
          updatedAt: new Date() 
        })
        .where(eq(animals.id, validatedData.animalId));

      // If an application is linked, update its stage to 'adopted'
      if (validatedData.applicationId) {
        await db
          .update(applications)
          .set({
            stage: 'adopted',
            updatedAt: new Date()
          })
          .where(and(
            eq(applications.id, validatedData.applicationId),
            eq(applications.tenantId, req.tenant!.id)
          ));
      }
      
      // Log activity for adoption (non-blocking - failures won't affect response)
      try {
        const { logActivity } = await import('./lib/activity-logger');
        const [animalRecord] = await db.select({ name: animals.name }).from(animals).where(eq(animals.id, validatedData.animalId));
        await logActivity({
          tenantId: req.tenant!.id,
          userId: req.session.userId,
          entityType: 'Adoption',
          entityId: adoption.id,
          action: 'created',
          description: `finalized adoption for "${animalRecord?.name || 'Unknown'}" to ${validatedData.adopterName}`,
          category: 'adoption',
          metadata: { animalId: validatedData.animalId, adopterName: validatedData.adopterName }
        });
        
        // Move animal folder to archive in Google Drive (if configured)
        try {
          const { TenantFileStorage } = await import('./lib/tenantFileStorage');
          const storage = await TenantFileStorage.forTenant(req.tenant!.id);
          const adoptedYear = validatedData.adoptionDate ? new Date(validatedData.adoptionDate).getFullYear() : new Date().getFullYear();
          await storage.moveAnimalToArchive({
            id: validatedData.animalId,
            name: animalRecord?.name || 'Unknown',
            status: 'adopted',
            adoptedYear,
          });
        } catch (archiveError) {
          console.error('Failed to archive animal folder in Drive:', archiveError);
        }
      } catch (logError) {
        console.error('Failed to log adoption activity:', logError);
      }

      res.json({ adoption });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Tasks Routes
  // ============================================================================

  /**
   * GET /api/tasks
   * List tasks (role-based access)
   */
  app.get('/api/tasks', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { tasks, animals, users } = await import('@shared/schema');
      
      const role = req.user!.activeRole;
      let taskList;
      
      // Map roles to task assignment types
      const roleToAssignedTo: Record<string, string> = {
        'admin': 'admin',
        'staff': 'medical_team', // Staff can see medical team tasks
        'foster': 'foster_coordinator', // This shouldn't happen but handle it
      };
      
      // Admin sees all tasks
      if (role === 'admin') {
        taskList = await db
          .select({
            id: tasks.id,
            title: tasks.title,
            description: tasks.description,
            taskType: tasks.taskType,
            assignedTo: tasks.assignedTo,
            priority: tasks.priority,
            status: tasks.status,
            relatedAnimalId: tasks.relatedAnimalId,
            createdBy: tasks.createdBy,
            completedAt: tasks.completedAt,
            completedBy: tasks.completedBy,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            animalName: animals.name,
            animalSpecies: animals.species,
            animalPhotoUrls: animals.photoUrls,
            creatorName: users.fullName,
            creatorEmail: users.email,
          })
          .from(tasks)
          .leftJoin(animals, eq(tasks.relatedAnimalId, animals.id))
          .leftJoin(users, eq(tasks.createdBy, users.id))
          .where(eq(tasks.tenantId, req.tenant!.id))
          .orderBy(desc(tasks.createdAt));
      } else if (role === 'staff') {
        // Staff see medical team and foster coordinator tasks
        taskList = await db
          .select({
            id: tasks.id,
            title: tasks.title,
            description: tasks.description,
            taskType: tasks.taskType,
            assignedTo: tasks.assignedTo,
            priority: tasks.priority,
            status: tasks.status,
            relatedAnimalId: tasks.relatedAnimalId,
            createdBy: tasks.createdBy,
            completedAt: tasks.completedAt,
            completedBy: tasks.completedBy,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            animalName: animals.name,
            animalSpecies: animals.species,
            animalPhotoUrls: animals.photoUrls,
            creatorName: users.fullName,
            creatorEmail: users.email,
          })
          .from(tasks)
          .leftJoin(animals, eq(tasks.relatedAnimalId, animals.id))
          .leftJoin(users, eq(tasks.createdBy, users.id))
          .where(
            and(
              eq(tasks.tenantId, req.tenant!.id),
              or(
                eq(tasks.assignedTo, 'medical_team'),
                eq(tasks.assignedTo, 'foster_coordinator')
              )
            )
          )
          .orderBy(desc(tasks.createdAt));
      } else {
        // Other roles don't see tasks
        taskList = [];
      }
      
      // Transform flat results into nested structure for backwards compatibility
      // Use primary key checks for null guards to handle empty strings correctly
      const transformedTasks = taskList.map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        taskType: row.taskType,
        assignedTo: row.assignedTo,
        priority: row.priority,
        status: row.status,
        relatedAnimalId: row.relatedAnimalId,
        createdBy: row.createdBy,
        completedAt: row.completedAt,
        completedBy: row.completedBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        animal: row.relatedAnimalId ? {
          id: row.relatedAnimalId,
          name: row.animalName,
          species: row.animalSpecies,
          photoUrls: row.animalPhotoUrls,
        } : null,
        creator: row.createdBy ? {
          id: row.createdBy,
          fullName: row.creatorName,
          email: row.creatorEmail,
        } : null,
      }));
      
      res.json({ tasks: transformedTasks });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tasks/:id
   * Update task status (staff/admin only)
   */
  app.patch('/api/tasks/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { tasks } = await import('@shared/schema');
      
      const updateSchema = z.object({
        status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
        assignedUserId: z.string().uuid().optional(),
      });

      const data = updateSchema.parse(req.body);
      
      const updateData: any = {
        ...data,
        updatedAt: new Date(),
      };
      
      if (data.status === 'completed') {
        updateData.completedAt = new Date();
        updateData.completedBy = req.user!.id;
      }

      const [updated] = await db
        .update(tasks)
        .set(updateData)
        .where(
          and(
            eq(tasks.id, req.params.id),
            eq(tasks.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json({ success: true, task: updated });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Rescue Contacts Routes
  // ============================================================================

  /**
   * GET /api/rescue-contacts
   * List rescue contacts (all authenticated users)
   */
  app.get('/api/rescue-contacts', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { rescueContacts } = await import('@shared/schema');
      
      const contacts = await db
        .select()
        .from(rescueContacts)
        .where(
          and(
            eq(rescueContacts.tenantId, req.tenant!.id),
            eq(rescueContacts.isActive, true)
          )
        )
        .orderBy(rescueContacts.displayOrder, desc(rescueContacts.createdAt));
      
      res.json({ rescueContacts: contacts });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/rescue-contacts
   * Create rescue contact (admin only)
   */
  app.post('/api/rescue-contacts', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { rescueContacts, insertRescueContactSchema } = await import('@shared/schema');
      
      const data = insertRescueContactSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });

      const [contact] = await db
        .insert(rescueContacts)
        .values([data as any])
        .returning();

      res.json({ success: true, rescueContact: contact });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/rescue-contacts/:id
   * Update rescue contact (admin only)
   */
  app.patch('/api/rescue-contacts/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { rescueContacts } = await import('@shared/schema');
      
      const updateSchema = z.object({
        contactType: z.enum(['medical_emergency', 'supplies', 'adoption_questions', 'foster_coordinator', 'general', 'after_hours']).optional(),
        name: z.string().optional(),
        role: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        availability: z.string().optional(),
        notes: z.string().optional(),
        displayOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      });

      const data = updateSchema.parse(req.body);

      const [updated] = await db
        .update(rescueContacts)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rescueContacts.id, req.params.id),
            eq(rescueContacts.tenantId, req.tenant!.id)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Rescue contact not found' });
      }

      res.json({ success: true, rescueContact: updated });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/rescue-contacts/:id
   * Delete rescue contact (admin only)
   */
  app.delete('/api/rescue-contacts/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { rescueContacts } = await import('@shared/schema');
      
      await db
        .delete(rescueContacts)
        .where(
          and(
            eq(rescueContacts.id, req.params.id),
            eq(rescueContacts.tenantId, req.tenant!.id)
          )
        );

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Tenant Settings Routes
  // ============================================================================

  /**
   * GET /api/tenant/settings
   * Get tenant configuration (admin only)
   * Returns full tenant data for settings page
   */
  app.get('/api/tenant/settings', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      // Fetch full tenant data from database (req.tenant is limited subset)
      const [fullTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);
      
      if (!fullTenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      
      res.json({ tenant: fullTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings
   * Update tenant payment settings (owner only)
   */
  app.patch('/api/tenant/settings', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const settingsSchema = z.object({
        stripeLink: z.string().url().optional().or(z.literal("")),
        passFeesToAdopter: z.boolean().optional(),
        requireSpayNeuterContract: z.boolean().optional(),
        enableTransferAgreement: z.boolean().optional(),
      });

      const parsedSettings = settingsSchema.parse(req.body);
      
      // Only include fields that are actually provided (not undefined)
      // This prevents overwriting existing values with null
      const settingsToUpdate: Record<string, any> = {};
      if (parsedSettings.stripeLink !== undefined) settingsToUpdate.stripeLink = parsedSettings.stripeLink;
      if (parsedSettings.passFeesToAdopter !== undefined) settingsToUpdate.passFeesToAdopter = parsedSettings.passFeesToAdopter;
      if (parsedSettings.requireSpayNeuterContract !== undefined) settingsToUpdate.requireSpayNeuterContract = parsedSettings.requireSpayNeuterContract;
      if (parsedSettings.enableTransferAgreement !== undefined) settingsToUpdate.enableTransferAgreement = parsedSettings.enableTransferAgreement;

      const [updatedTenant] = await db
        .update(tenants)
        .set(settingsToUpdate)
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });


  /**
   * PATCH /api/tenant/settings/stripe
   * Configure Stripe API keys (owner only)
   */
  app.patch('/api/tenant/settings/stripe', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { encrypt } = await import('./lib/encryption');
      const { stripeService } = await import('./lib/stripe-service');

      const stripeSettingsSchema = z.object({
        stripePublishableKey: z.string().min(1).startsWith("pk_"),
        stripeSecretKey: z.string().min(1).startsWith("sk_"),
        stripeWebhookSecret: z.string().optional(),
      });

      const settings = stripeSettingsSchema.parse(req.body);

      const isValid = await stripeService.validateApiKey(settings.stripeSecretKey);
      if (!isValid) {
        return res.status(400).json({ 
          error: "Invalid Stripe API keys. Please verify your keys and try again." 
        });
      }

      const encryptedSecretKey = encrypt(settings.stripeSecretKey);
      const encryptedWebhookSecret = settings.stripeWebhookSecret 
        ? encrypt(settings.stripeWebhookSecret) 
        : null;

      const [updatedTenant] = await db
        .update(tenants)
        .set({
          stripePublishableKey: settings.stripePublishableKey,
          stripeSecretKeyEncrypted: encryptedSecretKey,
          stripeWebhookSecretEncrypted: encryptedWebhookSecret,
          stripeEnabled: true,
        })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      stripeService.clearCache(req.tenant!.id);

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/tenant/stripe/status
   * Check if Stripe is configured for the tenant (for medical funds, donations, etc.)
   */
  app.get('/api/tenant/stripe/status', requireTenant, requireAuth, async (req, res) => {
    const tenant = req.tenant!;
    // Check if tenant has Stripe Connect configured (stripeConnectedAccountId)
    // This is required for medical fund campaigns and donation links
    const enabled = !!tenant.stripeConnectedAccountId;
    res.json({ enabled });
  });

  /**
   * GET /api/tenant/settings/google-ads
   * Get Google Ads configuration status (owner only)
   */
  app.get('/api/tenant/settings/google-ads', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { getTenantGoogleAdsStatus } = await import('./googleAds');
      const status = await getTenantGoogleAdsStatus(req.tenant!.id);
      
      res.json({
        success: true,
        googleAds: {
          enabled: status.enabled,
          configured: status.configured,
          customerId: status.customerId,
          conversionActionId: status.conversionActionId,
          hasClientId: !!req.tenant!.googleAdsClientIdEncrypted,
          hasRefreshToken: !!req.tenant!.googleAdsRefreshTokenEncrypted,
          hasDeveloperToken: !!req.tenant!.googleAdsDeveloperToken,
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/google-ads
   * Configure Google Ads Grant credentials (owner only)
   */
  app.patch('/api/tenant/settings/google-ads', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { encrypt } = await import('./lib/encryption');

      const googleAdsSettingsSchema = z.object({
        googleAdsCustomerId: z.string().min(1, "Customer ID is required").regex(/^\d{3}-\d{3}-\d{4}$/, "Customer ID must be in format 123-456-7890"),
        googleAdsClientId: z.string().min(1, "OAuth Client ID is required"),
        googleAdsClientSecret: z.string().min(1, "OAuth Client Secret is required"),
        googleAdsDeveloperToken: z.string().min(1, "Developer Token is required"),
        googleAdsRefreshToken: z.string().min(1, "Refresh Token is required"),
        googleAdsConversionActionId: z.string().min(1, "Conversion Action ID is required"),
      });

      const settings = googleAdsSettingsSchema.parse(req.body);

      const encryptedClientId = encrypt(settings.googleAdsClientId);
      const encryptedClientSecret = encrypt(settings.googleAdsClientSecret);
      const encryptedRefreshToken = encrypt(settings.googleAdsRefreshToken);

      const [updatedTenant] = await db
        .update(tenants)
        .set({
          googleAdsCustomerId: settings.googleAdsCustomerId,
          googleAdsClientIdEncrypted: encryptedClientId,
          googleAdsClientSecretEncrypted: encryptedClientSecret,
          googleAdsDeveloperToken: settings.googleAdsDeveloperToken,
          googleAdsRefreshTokenEncrypted: encryptedRefreshToken,
          googleAdsConversionActionId: settings.googleAdsConversionActionId,
          googleAdsEnabled: true,
        })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ 
        success: true, 
        message: "Google Ads credentials saved successfully",
        googleAdsEnabled: true,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/tenant/settings/google-ads
   * Disable Google Ads integration (owner only)
   */
  app.delete('/api/tenant/settings/google-ads', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      await db
        .update(tenants)
        .set({
          googleAdsEnabled: false,
        })
        .where(eq(tenants.id, req.tenant!.id));

      res.json({ 
        success: true, 
        message: "Google Ads integration disabled",
      });
    } catch (error) {
      next(error);
    }
  });

  // PayPal settings route removed - Stripe is the sole payment processor

  /**
   * POST /api/animals/:id/flyer
   * Save a designed flyer for an animal (manual upload)
   */
  app.post('/api/animals/:id/flyer', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const flyerSchema = z.object({
        exportUrl: z.string().url(),
      });

      const { exportUrl } = flyerSchema.parse(req.body);
      const animalId = req.params.id;

      // Get current animal
      const [animal] = await db
        .select()
        .from(animals)
        .where(and(
          eq(animals.id, animalId),
          eq(animals.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!animal) {
        return res.status(404).json({ error: 'Animal not found' });
      }

      // Add new flyer URL to existing ones
      const currentFlyers = animal.flyerUrls || [];
      const updatedFlyers = [...currentFlyers, exportUrl];

      // Update animal with new flyer URL
      const [updatedAnimal] = await db
        .update(animals)
        .set({
          flyerUrls: updatedFlyers,
          updatedAt: new Date(),
        })
        .where(and(
          eq(animals.id, animalId),
          eq(animals.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ success: true, animal: updatedAnimal });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/twilio
   * Configure Twilio credentials for SMS (owner only)
   */
  app.patch('/api/tenant/settings/twilio', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { encrypt } = await import('./lib/encryption');
      
      const twilioSettingsSchema = z.object({
        twilioAccountSid: z.string().min(1, "Account SID is required").startsWith("AC"),
        twilioAuthToken: z.string().min(1, "Auth Token is required"),
        twilioPhoneNumber: z.string().min(1, "Phone number is required").regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +15551234567)"),
      });

      const settings = twilioSettingsSchema.parse(req.body);

      // Encrypt the credentials
      const encryptedAccountSid = encrypt(settings.twilioAccountSid);
      const encryptedAuthToken = encrypt(settings.twilioAuthToken);

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set({
          twilioAccountSidEncrypted: encryptedAccountSid,
          twilioAuthTokenEncrypted: encryptedAuthToken,
          twilioPhoneNumber: settings.twilioPhoneNumber,
          twilioEnabled: true,
        })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/tenant/settings/twilio
   * Disable Twilio integration (owner only)
   */
  app.delete('/api/tenant/settings/twilio', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const [updatedTenant] = await db
        .update(tenants)
        .set({
          twilioAccountSidEncrypted: null,
          twilioAuthTokenEncrypted: null,
          twilioPhoneNumber: null,
          twilioEnabled: false,
        })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/tenant/settings/twilio/status
   * Check if Twilio is configured (owner only)
   */
  app.get('/api/tenant/settings/twilio/status', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { isTwilioEnabled } = await import('./lib/twilio-service');
      const enabled = await isTwilioEnabled(req.tenant!.id);
      
      res.json({ 
        enabled,
        phoneNumber: req.tenant!.twilioPhoneNumber || null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/tenant/settings/twilio/test
   * Send a test SMS (admin only)
   */
  app.post('/api/tenant/settings/twilio/test', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { sendSms } = await import('./lib/twilio-service');
      
      const testSchema = z.object({
        phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format"),
      });

      const { phoneNumber } = testSchema.parse(req.body);

      const result = await sendSms(
        req.tenant!.id,
        phoneNumber,
        `Test message from ${req.tenant!.name || 'iRescue'}! Your Twilio integration is working.`,
        'other',
        { sentBy: { id: req.user!.id, name: req.user!.name || req.user!.email } }
      );

      if (result.status === 'failed') {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, sid: result.sid });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/webhooks/twilio/incoming
   * Webhook for incoming SMS messages (no auth - Twilio validates with signature)
   */
  app.post('/api/webhooks/twilio/incoming', async (req, res, next) => {
    try {
      const { handleIncomingSms } = await import('./lib/twilio-service');
      
      const { From, To, Body } = req.body;
      
      if (!From || !To || !Body) {
        return res.status(400).send('Missing required fields');
      }

      const result = await handleIncomingSms(From, To, Body);
      
      // Return TwiML response (empty - we already forwarded the message)
      res.set('Content-Type', 'text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      console.error('Twilio webhook error:', error);
      res.set('Content-Type', 'text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  });

  /**
   * POST /api/transports/:id/sms-broadcast
   * Send SMS broadcast to transport subscribers (staff only)
   */
  app.post('/api/transports/:id/sms-broadcast', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { broadcastTransportUpdate, getTransportSmsSubscribers } = await import('./lib/twilio-service');
      
      const broadcastSchema = z.object({
        message: z.string().min(1).max(1600), // SMS length limit
      });

      const { message } = broadcastSchema.parse(req.body);
      const transportId = req.params.id;

      // Verify transport exists and belongs to tenant
      const [transport] = await db
        .select()
        .from(transportEvents)
        .where(and(
          eq(transportEvents.id, transportId),
          eq(transportEvents.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!transport) {
        return res.status(404).json({ error: 'Transport not found' });
      }

      const subscribers = await getTransportSmsSubscribers(transportId);
      
      if (subscribers.length === 0) {
        return res.status(400).json({ error: 'No SMS subscribers for this transport' });
      }

      const results = await broadcastTransportUpdate(
        req.tenant!.id,
        transportId,
        message,
        subscribers,
        { id: req.user!.id, name: req.user!.name || req.user!.email }
      );

      const sent = results.filter(r => r.status === 'sent').length;
      const failed = results.filter(r => r.status === 'failed').length;

      res.json({ 
        success: true, 
        sent, 
        failed,
        results 
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/transports/:id/sms-subscribe
   * Subscribe a phone number to transport updates
   */
  app.post('/api/transports/:id/sms-subscribe', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { addTransportSmsSubscriber } = await import('./lib/twilio-service');
      
      const subscribeSchema = z.object({
        phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format"),
      });

      const { phoneNumber } = subscribeSchema.parse(req.body);
      const transportId = req.params.id;

      // Verify transport exists and belongs to tenant
      const [transport] = await db
        .select()
        .from(transportEvents)
        .where(and(
          eq(transportEvents.id, transportId),
          eq(transportEvents.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!transport) {
        return res.status(404).json({ error: 'Transport not found' });
      }

      await addTransportSmsSubscriber(transportId, phoneNumber);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/transports/:id/sms-unsubscribe
   * Unsubscribe a phone number from transport updates
   */
  app.delete('/api/transports/:id/sms-unsubscribe', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { removeTransportSmsSubscriber } = await import('./lib/twilio-service');
      
      const unsubscribeSchema = z.object({
        phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format"),
      });

      const { phoneNumber } = unsubscribeSchema.parse(req.body);
      const transportId = req.params.id;

      await removeTransportSmsSubscriber(transportId, phoneNumber);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/sms/proxy-session
   * Create a new SMS proxy session for foster/adopter communication
   */
  app.post('/api/sms/proxy-session', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { createProxySession } = await import('./lib/twilio-service');
      
      const sessionSchema = z.object({
        partyAPhone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format"),
        partyBPhone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format"),
        partyAAlias: z.string().optional(),
        partyBAlias: z.string().optional(),
        partyAUserId: z.string().uuid().optional(),
        partyBContactId: z.string().uuid().optional(),
        animalId: z.string().uuid().optional(),
        applicationId: z.string().uuid().optional(),
        expiresAt: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
      });

      const data = sessionSchema.parse(req.body);

      const session = await createProxySession(
        req.tenant!.id,
        data.partyAPhone,
        data.partyBPhone,
        {
          partyAAlias: data.partyAAlias,
          partyBAlias: data.partyBAlias,
          partyAUserId: data.partyAUserId,
          partyBContactId: data.partyBContactId,
          animalId: data.animalId,
          applicationId: data.applicationId,
          expiresAt: data.expiresAt,
        }
      );

      if (!session) {
        return res.status(400).json({ error: 'Twilio not configured for this organization' });
      }

      res.json({ success: true, sessionId: session.id });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/sms/proxy-session/:id
   * End an SMS proxy session
   */
  app.delete('/api/sms/proxy-session/:id', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { endProxySession } = await import('./lib/twilio-service');
      
      await endProxySession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/sms/logs
   * Get SMS message logs for this tenant (admin only)
   */
  app.get('/api/sms/logs', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const logs = await db
        .select()
        .from(smsMessageLogs)
        .where(eq(smsMessageLogs.tenantId, req.tenant!.id))
        .orderBy(sql`${smsMessageLogs.createdAt} DESC`)
        .limit(100);

      res.json(logs);
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // DocuSign eSignature Integration Routes
  // ============================================================================

  /**
   * PATCH /api/tenant/settings/docusign
   * Configure DocuSign credentials for eSignature (owner only)
   */
  app.patch('/api/tenant/settings/docusign', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { encrypt } = await import('./lib/encryption');

      const docusignSettingsSchema = z.object({
        integrationKey: z.string().min(1, "Integration Key is required"),
        userId: z.string().uuid("User ID must be a valid GUID"),
        accountId: z.string().min(1, "Account ID is required"),
        privateKey: z.string().min(1, "Private Key is required"),
        environment: z.enum(["demo", "production"]).default("demo"),
        connectKey: z.string().optional(), // Connect Key for webhook HMAC verification
      });

      const settings = docusignSettingsSchema.parse(req.body);

      const updateData: any = {
        docusignIntegrationKeyEncrypted: encrypt(settings.integrationKey),
        docusignUserIdEncrypted: encrypt(settings.userId),
        docusignAccountIdEncrypted: encrypt(settings.accountId),
        docusignPrivateKeyEncrypted: encrypt(settings.privateKey),
        docusignEnvironment: settings.environment,
        docusignEnabled: true,
      };

      // Only set Connect Key if provided
      if (settings.connectKey) {
        updateData.docusignConnectKeyEncrypted = encrypt(settings.connectKey);
      }

      const [updatedTenant] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({
        success: true,
        environment: settings.environment,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      next(error);
    }
  });

  /**
   * DELETE /api/tenant/settings/docusign
   * Disable DocuSign integration (owner only)
   */
  app.delete('/api/tenant/settings/docusign', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { clearTokenCache } = await import('./lib/docusign-service');

      await db
        .update(tenants)
        .set({
          docusignIntegrationKeyEncrypted: null,
          docusignUserIdEncrypted: null,
          docusignAccountIdEncrypted: null,
          docusignPrivateKeyEncrypted: null,
          docusignConnectKeyEncrypted: null,
          docusignEnvironment: 'demo',
          docusignEnabled: false,
        })
        .where(eq(tenants.id, req.tenant!.id));

      clearTokenCache(req.tenant!.id);

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/tenant/settings/docusign/status
   * Check if DocuSign is configured (owner only)
   */
  app.get('/api/tenant/settings/docusign/status', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { isDocusignEnabled } = await import('./lib/docusign-service');
      const enabled = await isDocusignEnabled(req.tenant!.id);

      res.json({
        enabled,
        environment: req.tenant!.docusignEnvironment || 'demo',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/docusign/send-contract
   * Send adoption contract for eSignature (staff only)
   */
  app.post('/api/docusign/send-contract', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { sendEnvelope, isDocusignEnabled } = await import('./lib/docusign-service');

      const enabled = await isDocusignEnabled(req.tenant!.id);
      if (!enabled) {
        return res.status(400).json({ error: 'DocuSign is not configured for this organization' });
      }

      const contractSchema = z.object({
        applicationId: z.string().uuid(),
        animalId: z.string().uuid(),
        signerEmail: z.string().email(),
        signerName: z.string().min(1),
        documentBase64: z.string().min(1),
        documentName: z.string().default("Adoption Contract.pdf"),
        emailSubject: z.string().default("Please sign your Adoption Contract"),
        emailBody: z.string().optional(),
        signHereTabs: z.array(z.object({
          documentId: z.string(),
          pageNumber: z.string(),
          xPosition: z.string(),
          yPosition: z.string(),
        })).optional(),
        dateSignedTabs: z.array(z.object({
          documentId: z.string(),
          pageNumber: z.string(),
          xPosition: z.string(),
          yPosition: z.string(),
        })).optional(),
        contractTemplateId: z.string().uuid().optional(),
      });

      const data = contractSchema.parse(req.body);

      const result = await sendEnvelope({
        tenantId: req.tenant!.id,
        applicationId: data.applicationId,
        animalId: data.animalId,
        signerEmail: data.signerEmail,
        signerName: data.signerName,
        documentBase64: data.documentBase64,
        documentName: data.documentName,
        emailSubject: data.emailSubject,
        emailBody: data.emailBody,
        signHereTabs: data.signHereTabs,
        dateSignedTabs: data.dateSignedTabs,
        sentBy: req.user!.id,
        sentByName: req.user!.fullName,
        contractTemplateId: data.contractTemplateId,
      });

      res.json({
        success: true,
        envelopeId: result.envelopeId,
        status: result.status,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      if (error.message?.includes('consent required')) {
        return res.status(400).json({ error: error.message, requiresConsent: true });
      }
      next(error);
    }
  });

  /**
   * GET /api/docusign/envelopes
   * List DocuSign envelopes for the tenant (staff only)
   */
  app.get('/api/docusign/envelopes', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { listEnvelopes } = await import('./lib/docusign-service');
      const envelopes = await listEnvelopes(req.tenant!.id);

      res.json({ envelopes });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/docusign/envelope/:envelopeId
   * Get envelope status (staff only)
   */
  app.get('/api/docusign/envelope/:envelopeId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { getEnvelopeStatus, isDocusignEnabled } = await import('./lib/docusign-service');

      const enabled = await isDocusignEnabled(req.tenant!.id);
      if (!enabled) {
        return res.status(400).json({ error: 'DocuSign is not configured' });
      }

      const status = await getEnvelopeStatus(req.tenant!.id, req.params.envelopeId);

      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/docusign/envelope/:applicationId/by-application
   * Get envelope by application ID (staff only)
   */
  app.get('/api/docusign/envelope/:applicationId/by-application', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { getEnvelopeByApplication } = await import('./lib/docusign-service');

      const envelope = await getEnvelopeByApplication(req.tenant!.id, req.params.applicationId);

      res.json({ envelope });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/webhooks/docusign
   * Webhook for DocuSign envelope status updates
   * DocuSign Connect sends XML or JSON payloads with HMAC signature verification
   */
  app.post('/api/webhooks/docusign', express.raw({ type: '*/*' }), async (req, res, next) => {
    try {
      const { handleWebhook, downloadSignedDocument, verifyWebhookForEnvelope } = await import('./lib/docusign-service');

      // Get the raw body for signature verification
      const rawBody = req.body.toString('utf8');
      let envelopeId: string | undefined;
      let status: string | undefined;
      let statusDateTime: string = new Date().toISOString();
      let tenantId: string | undefined;
      let isJson = false;
      
      // Try JSON first (newer DocuSign Connect format)
      try {
        const payload = JSON.parse(rawBody);
        if (payload.envelopeId) {
          envelopeId = payload.envelopeId;
          status = payload.status;
          statusDateTime = payload.statusDateTime || statusDateTime;
          isJson = true;
        }
      } catch (e) {
        // Not JSON - try XML parsing
      }

      // Parse XML if not JSON (DocuSign default format)
      if (!isJson) {
        // Extract envelope ID from XML using regex (handles both DocuSign Connect formats)
        const envelopeIdMatch = rawBody.match(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i) 
          || rawBody.match(/<envelopeId>([^<]+)<\/envelopeId>/i);
        const statusMatch = rawBody.match(/<Status>([^<]+)<\/Status>/i)
          || rawBody.match(/<status>([^<]+)<\/status>/i);
        const timeMatch = rawBody.match(/<StatusChangedDateTime>([^<]+)<\/StatusChangedDateTime>/i)
          || rawBody.match(/<statusDateTime>([^<]+)<\/statusDateTime>/i);

        if (envelopeIdMatch) {
          envelopeId = envelopeIdMatch[1];
          status = statusMatch ? statusMatch[1] : undefined;
          statusDateTime = timeMatch ? timeMatch[1] : statusDateTime;
        }
      }

      // If we couldn't extract envelope ID from either format, log and return
      if (!envelopeId) {
        console.log('DocuSign webhook: could not parse envelope ID from payload');
        return res.status(200).send('OK');
      }

      if (!status) {
        console.log('DocuSign webhook: could not parse status from payload');
        return res.status(200).send('OK');
      }

      // Get the signature from DocuSign Connect headers
      const signature = req.headers['x-docusign-signature-1'] as string | undefined;
      
      // Verify the webhook signature (works for both JSON and XML)
      const { valid, tenantId: foundTenantId } = await verifyWebhookForEnvelope(
        envelopeId,
        rawBody,
        signature
      );

      if (!valid) {
        console.error('DocuSign webhook: signature verification failed for envelope', envelopeId, isJson ? '(JSON)' : '(XML)');
        // Return 200 to prevent retries but log the security issue
        return res.status(200).send('OK');
      }

      if (!foundTenantId) {
        console.log('DocuSign webhook: envelope not found', envelopeId);
        return res.status(200).send('OK');
      }

      tenantId = foundTenantId;

      if (!tenantId) {
        console.log('DocuSign webhook: tenant not found for envelope', envelopeId);
        return res.status(200).send('OK');
      }

      // Handle the webhook
      await handleWebhook(tenantId, envelopeId, status, statusDateTime);

      // If completed, try to download signed document and save to Google Drive
      if (status.toLowerCase() === 'completed') {
        try {
          const signedPdf = await downloadSignedDocument(tenantId, envelopeId);

          // Check if Google Drive is configured
          const { isGoogleWorkspaceEnabled, uploadFile } = await import('./lib/googleWorkspace');
          const driveEnabled = await isGoogleWorkspaceEnabled(tenantId, 'drive');

          if (driveEnabled) {
            // Get envelope details for file naming
            const { docusignEnvelopes, applications, animals } = await import('@shared/schema');
            const [envelope] = await db
              .select({
                signerName: docusignEnvelopes.signerName,
                applicationId: docusignEnvelopes.applicationId,
                animalId: docusignEnvelopes.animalId,
              })
              .from(docusignEnvelopes)
              .where(eq(docusignEnvelopes.envelopeId, envelopeId));

            if (envelope) {
              // Get animal name for file naming
              const [animal] = await db
                .select({ name: animals.name })
                .from(animals)
                .where(eq(animals.id, envelope.animalId));

              const fileName = `Adoption Contract - ${animal?.name || 'Unknown'} - ${envelope.signerName} - ${new Date().toISOString().split('T')[0]}.pdf`;

              const fileResult = await uploadFile(tenantId, {
                name: fileName,
                mimeType: 'application/pdf',
                content: signedPdf,
                folderId: 'adoption-contracts', // Would need a dedicated folder
              });

              // Update envelope with file info
              await db
                .update(docusignEnvelopes)
                .set({
                  signedDocumentUrl: fileResult.webViewLink || undefined,
                  signedDocumentId: fileResult.id,
                  updatedAt: new Date(),
                })
                .where(eq(docusignEnvelopes.envelopeId, envelopeId));
            }
          }
        } catch (driveError) {
          console.error('Failed to save signed document to Google Drive:', driveError);
          // Don't fail the webhook - the status update is more important
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('DocuSign webhook error:', error);
      // Always return 200 to prevent retries
      res.status(200).send('OK');
    }
  });

  /**
   * PATCH /api/tenant/settings/email
   * Configure email service API keys (owner only)
   * Supports both BYOK mode (provide all fields) and platform mode (send null to clear)
   */
  app.patch('/api/tenant/settings/email', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const { encrypt } = await import('./lib/encryption');
      
      const emailSettingsSchema = z.object({
        resendApiKey: z.string().min(1).startsWith("re_").nullable().optional(),
        resendFromEmail: z.string().email().nullable().optional(),
        resendFromName: z.string().min(1).nullable().optional(),
        constantContactApiKey: z.string().nullable().optional(),
      });

      const settings = emailSettingsSchema.parse(req.body);

      // Prepare update object
      const updateData: any = {};

      // If any Resend field is provided (not null), encrypt and save
      if (settings.resendApiKey && settings.resendFromEmail && settings.resendFromName) {
        updateData.resendApiKeyEncrypted = encrypt(settings.resendApiKey);
        updateData.resendFromEmail = settings.resendFromEmail;
        updateData.resendFromName = settings.resendFromName;
        updateData.resendEnabled = true;
      } else if (settings.resendApiKey === null || settings.resendFromEmail === null || settings.resendFromName === null) {
        // Clear BYOK settings - use platform credits
        updateData.resendApiKeyEncrypted = null;
        updateData.resendFromEmail = null;
        updateData.resendFromName = null;
        updateData.resendEnabled = false;
      }

      // Handle ConstantContact
      if (settings.constantContactApiKey) {
        updateData.constantContactApiKeyEncrypted = encrypt(settings.constantContactApiKey);
        updateData.constantContactEnabled = true;
      } else if (settings.constantContactApiKey === null) {
        updateData.constantContactApiKeyEncrypted = null;
        updateData.constantContactEnabled = false;
      }

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/email-copy
   * Configure email copy recipients (owner only)
   */
  app.patch('/api/tenant/settings/email-copy', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const emailCopySchema = z.object({
        emailCopyRecipients: z.array(z.string().email()).optional().nullable(),
      });

      const { emailCopyRecipients } = emailCopySchema.parse(req.body);

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set({
          emailCopyRecipients: emailCopyRecipients || null,
        })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  // Branding & Appearance Settings (owner only)
  app.patch('/api/tenant/settings/branding', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const sponsorLogoSchema = z.object({
        id: z.string(),
        imageUrl: z.string(),
        altText: z.string(),
        linkUrl: z.string().optional(),
      });

      const brandingSettingsSchema = z.object({
        name: z.string().min(1, "Organization name is required").optional(),
        tagline: z.string().optional(),
        missionStatement: z.string().optional(),
        // Accept either full URLs or relative paths from object storage
        logoUrl: z.string().optional().or(z.literal("")),
        heroImageUrl: z.string().optional().or(z.literal("")),
        heroMobileImageUrl: z.string().optional().or(z.literal("")),
        heroHeadline: z.string().optional(),
        heroButtonText: z.string().optional(),
        heroButton2Text: z.string().optional(),
        heroFocalPoint: z.enum(["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
        announcementBarEnabled: z.boolean().optional(),
        announcementBarText: z.string().optional(),
        announcementBarLinkText: z.string().optional(),
        announcementBarLinkUrl: z.string().optional(),
        announcementBarStyle: z.enum(["info", "warning", "urgent"]).optional(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        successColor: z.string().optional(),
        warningColor: z.string().optional(),
        destructiveColor: z.string().optional(),
        contactEmail: z.string().email().optional().or(z.literal("")),
        contactPhone: z.string().optional(),
        formNotificationsEnabled: z.boolean().optional(),
        // Allow comma-separated email addresses for multiple recipients
        formNotificationEmail: z.string().optional().or(z.literal("")).refine(
          (val) => {
            if (!val || val === "") return true;
            const emails = val.split(",").map(e => e.trim()).filter(e => e);
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emails.every(email => emailRegex.test(email));
          },
          { message: "Invalid email format. Use comma-separated emails for multiple recipients." }
        ),
        footerText: z.string().optional(),
        footerHours: z.string().optional(),
        footerAddress: z.string().optional(),
        socialFacebook: z.string().url().optional().or(z.literal("")),
        socialInstagram: z.string().url().optional().or(z.literal("")),
        socialYoutube: z.string().url().optional().or(z.literal("")),
        socialTiktok: z.string().url().optional().or(z.literal("")),
        sponsorLogos: z.array(sponsorLogoSchema).optional(),
      });

      const settings = brandingSettingsSchema.parse(req.body);

      // Prepare update object
      const updateData: any = {};
      
      if (settings.name !== undefined) updateData.name = settings.name;
      if (settings.tagline !== undefined) updateData.tagline = settings.tagline;
      if (settings.missionStatement !== undefined) updateData.missionStatement = settings.missionStatement || null;
      if (settings.logoUrl !== undefined) updateData.logoUrl = settings.logoUrl || null;
      if (settings.heroImageUrl !== undefined) updateData.heroImageUrl = settings.heroImageUrl || null;
      if (settings.heroMobileImageUrl !== undefined) updateData.heroMobileImageUrl = settings.heroMobileImageUrl || null;
      if (settings.heroHeadline !== undefined) updateData.heroHeadline = settings.heroHeadline || null;
      if (settings.heroButtonText !== undefined) updateData.heroButtonText = settings.heroButtonText || null;
      if (settings.heroButton2Text !== undefined) updateData.heroButton2Text = settings.heroButton2Text || null;
      if (settings.heroFocalPoint !== undefined) updateData.heroFocalPoint = settings.heroFocalPoint || 'center';
      if (settings.contactEmail !== undefined) updateData.contactEmail = settings.contactEmail || null;
      if (settings.contactPhone !== undefined) updateData.contactPhone = settings.contactPhone || null;
      if (settings.formNotificationsEnabled !== undefined) updateData.formNotificationsEnabled = settings.formNotificationsEnabled;
      if (settings.formNotificationEmail !== undefined) updateData.formNotificationEmail = settings.formNotificationEmail || null;
      if (settings.footerText !== undefined) updateData.footerText = settings.footerText || null;
      if (settings.footerHours !== undefined) updateData.footerHours = settings.footerHours || null;
      if (settings.footerAddress !== undefined) updateData.footerAddress = settings.footerAddress || null;
      if (settings.socialFacebook !== undefined) updateData.socialFacebook = settings.socialFacebook || null;
      if (settings.socialInstagram !== undefined) updateData.socialInstagram = settings.socialInstagram || null;
      if (settings.socialYoutube !== undefined) updateData.socialYoutube = settings.socialYoutube || null;
      if (settings.socialTiktok !== undefined) updateData.socialTiktok = settings.socialTiktok || null;
      if (settings.sponsorLogos !== undefined) updateData.sponsorLogos = settings.sponsorLogos || null;
      
      // Handle branding colors (stored in jsonb)
      if (settings.primaryColor !== undefined || 
          settings.secondaryColor !== undefined ||
          settings.accentColor !== undefined ||
          settings.successColor !== undefined ||
          settings.warningColor !== undefined ||
          settings.destructiveColor !== undefined) {
        const currentBranding = req.tenant!.branding || {};
        updateData.branding = {
          ...currentBranding,
          primaryColor: settings.primaryColor !== undefined ? (settings.primaryColor || undefined) : (currentBranding as any).primaryColor,
          secondaryColor: settings.secondaryColor !== undefined ? (settings.secondaryColor || undefined) : (currentBranding as any).secondaryColor,
          accentColor: settings.accentColor !== undefined ? (settings.accentColor || undefined) : (currentBranding as any).accentColor,
          successColor: settings.successColor !== undefined ? (settings.successColor || undefined) : (currentBranding as any).successColor,
          warningColor: settings.warningColor !== undefined ? (settings.warningColor || undefined) : (currentBranding as any).warningColor,
          destructiveColor: settings.destructiveColor !== undefined ? (settings.destructiveColor || undefined) : (currentBranding as any).destructiveColor,
        };
      }

      // Handle announcement bar (stored in jsonb)
      if (settings.announcementBarEnabled !== undefined || 
          settings.announcementBarText !== undefined ||
          settings.announcementBarLinkText !== undefined ||
          settings.announcementBarLinkUrl !== undefined ||
          settings.announcementBarStyle !== undefined) {
        const currentAnnouncementBar = (req.tenant!.announcementBar as any) || {};
        updateData.announcementBar = {
          ...currentAnnouncementBar,
          enabled: settings.announcementBarEnabled ?? currentAnnouncementBar.enabled,
          text: settings.announcementBarText ?? currentAnnouncementBar.text,
          linkText: settings.announcementBarLinkText ?? currentAnnouncementBar.linkText,
          linkUrl: settings.announcementBarLinkUrl ?? currentAnnouncementBar.linkUrl,
          style: settings.announcementBarStyle ?? currentAnnouncementBar.style,
        };
      }

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/action-circle
   * Update action circle configuration for hero section (owner only)
   */
  app.patch('/api/tenant/settings/action-circle', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const actionConfigSchema = z.object({
        imageUrl: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
      });

      const actionCircleSchema = z.object({
        enabled: z.boolean().optional(),
        rotationSpeed: z.number().min(1).max(30).optional(),
        position: z.enum(['top-right', 'bottom-right', 'center']).optional(),
        size: z.enum(['sm', 'md', 'lg']).optional(),
        actions: z.object({
          adopt: actionConfigSchema.optional(),
          foster: actionConfigSchema.optional(),
          volunteer: actionConfigSchema.optional(),
          donate: actionConfigSchema.optional(),
        }).optional(),
      });

      const settings = actionCircleSchema.parse(req.body);

      // Merge with existing action circle settings
      const currentActionCircle = req.tenant!.actionCircle || {};
      const updatedActionCircle = {
        ...currentActionCircle,
        ...settings,
        actions: {
          ...(currentActionCircle as any)?.actions,
          ...settings.actions,
        },
      };

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set({ actionCircle: updatedActionCircle })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/hero-layout
   * Update hero layout type (owner only)
   */
  app.patch('/api/tenant/settings/hero-layout', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const heroLayoutSchema = z.object({
        heroLayoutType: z.enum(['none', 'action_circle', 'three_doors', 'both']),
      });

      const settings = heroLayoutSchema.parse(req.body);

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set({ heroLayoutType: settings.heroLayoutType })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/three-doors
   * Update Three Doors configuration (owner only)
   */
  app.patch('/api/tenant/settings/three-doors', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const doorSchema = z.object({
        title: z.string().max(50).optional(),
        description: z.string().max(100).optional(),
        linkText: z.string().max(50).optional(),
        linkUrl: z.string().max(200).optional(),
        icon: z.enum(['paw', 'home', 'heart', 'dollar']).optional(),
        headerColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
        buttonColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
      }).optional();

      const threeDoorsSchema = z.object({
        door1: doorSchema,
        door2: doorSchema,
        door3: doorSchema,
      });

      const settings = threeDoorsSchema.parse(req.body);

      // Helper to clean door config - remove empty strings and undefined values
      const cleanDoorConfig = (doorSettings: any, existingDoor: any) => {
        if (!doorSettings) return existingDoor;
        const merged = { ...existingDoor };
        for (const [key, value] of Object.entries(doorSettings)) {
          if (value === '' || value === undefined) {
            // Remove the field (reset to default)
            delete merged[key];
          } else {
            merged[key] = value;
          }
        }
        return Object.keys(merged).length > 0 ? merged : undefined;
      };

      // Get existing config and merge
      const existingConfig = (req.tenant as any)?.threeDoorsConfig || {};
      const updatedConfig = {
        door1: cleanDoorConfig(settings.door1, existingConfig.door1),
        door2: cleanDoorConfig(settings.door2, existingConfig.door2),
        door3: cleanDoorConfig(settings.door3, existingConfig.door3),
      };

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set({ threeDoorsConfig: updatedConfig })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/mascot
   * Update mascot widget configuration (owner only)
   */
  app.patch('/api/tenant/settings/mascot', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const mascotSchema = z.object({
        enabled: z.boolean().optional(),
        speechText: z.string().max(120).optional(),
      });

      const settings = mascotSchema.parse(req.body);

      // Merge with existing mascot settings
      const currentMascot = req.tenant!.mascot || {};
      const updatedMascot = {
        ...currentMascot,
        ...settings,
      };

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set({ mascot: updatedMascot })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/donation-section
   * Update donation section customization (owner only)
   */
  app.patch('/api/tenant/settings/donation-section', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const donationSectionSchema = z.object({
        sectionHeading: z.string().max(100).optional().nullable(),
        sectionDescription: z.string().max(500).optional().nullable(),
        sectionDescriptionExtended: z.string().max(1000).optional().nullable(),
        sectionImageUrl: z.string().refine(
          (val) => !val || val === "" || val.startsWith("/") || val.startsWith("http://") || val.startsWith("https://"),
          { message: "Must be a valid URL or storage path" }
        ).optional().nullable().or(z.literal("")),
        impactStatement: z.string().max(500).optional().nullable(),
        sectionLabel: z.string().max(100).optional().nullable(),
        monthlyGivingTitle: z.string().max(100).optional().nullable(),
        monthlyGivingDescription: z.string().max(500).optional().nullable(),
        monthlyGivingIcon: z.enum(["shield", "heart", "paw", "star", "hand-heart", "users", "home"]).optional().nullable(),
        oneTimeButtonText: z.string().max(50).optional().nullable(),
        monthlyButtonText: z.string().max(50).optional().nullable(),
        // New donate page customization fields
        pageTitle: z.string().max(100).optional().nullable(),
        pageSubtitle: z.string().max(500).optional().nullable(),
        oneTimeAmounts: z.array(z.number().min(1).max(10000)).max(4).optional().nullable(),
        showCustomAmount: z.boolean().optional().nullable(),
        mailingAddressLabel: z.string().max(100).optional().nullable(),
        donateMailingAddress: z.string().max(500).optional().nullable(),
        // External wish list links
        amazonWishListUrl: z.string().url().optional().nullable().or(z.literal("")),
        chewyWishListUrl: z.string().url().optional().nullable().or(z.literal("")),
      });

      // Accept either direct fields or nested donationSection object
      const body = req.body.donationSection || req.body;
      const settings = donationSectionSchema.parse(body);

      // Merge with existing donation section settings
      const currentDonationSection = (req.tenant as any)?.donationSection || {};
      const updatedDonationSection = {
        ...currentDonationSection,
        ...settings,
      };

      // Update tenant settings
      const [updatedTenant] = await db
        .update(tenants)
        .set({ donationSection: updatedDonationSection })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/settings/donation-landing
   * Update donation landing page settings for QR code mobile page (owner only)
   */
  app.patch('/api/tenant/settings/donation-landing', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const donationLandingSchema = z.object({
        donationLandingHeader: z.string().nullable().optional(),
        donationLandingButtonLabel: z.string().nullable().optional(),
        donationLandingButtonUrl: z.string().nullable().optional(),
        donationLandingMailingAddress: z.string().nullable().optional(),
        donationLandingMailingText: z.string().nullable().optional(),
      });

      const settings = donationLandingSchema.parse(req.body);

      // Validate URL if provided
      if (settings.donationLandingButtonUrl) {
        try {
          const url = new URL(settings.donationLandingButtonUrl);
          if (!['http:', 'https:'].includes(url.protocol)) {
            return res.status(400).json({
              error: 'Invalid URL',
              message: 'URL must use http or https protocol'
            });
          }
        } catch {
          return res.status(400).json({
            error: 'Invalid URL format',
            message: 'Please provide a valid URL'
          });
        }
      }

      // Update tenant settings (only provided fields)
      const updateData: Record<string, any> = {};
      if ('donationLandingHeader' in settings) updateData.donationLandingHeader = settings.donationLandingHeader || null;
      if ('donationLandingButtonLabel' in settings) updateData.donationLandingButtonLabel = settings.donationLandingButtonLabel || null;
      if ('donationLandingButtonUrl' in settings) updateData.donationLandingButtonUrl = settings.donationLandingButtonUrl || null;
      if ('donationLandingMailingAddress' in settings) updateData.donationLandingMailingAddress = settings.donationLandingMailingAddress || null;
      if ('donationLandingMailingText' in settings) updateData.donationLandingMailingText = settings.donationLandingMailingText || null;

      const [updatedTenant] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      res.json({ success: true, tenant: updatedTenant });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Custom Domain Configuration Routes
  // ============================================================================

  /**
   * PATCH /api/tenant/custom-domain
   * Set or update custom domain for tenant (admin only)
   */
  app.patch('/api/tenant/custom-domain', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const customDomainSchema = z.object({
        customDomain: z.string().min(1).regex(/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i, "Invalid domain format"),
      });

      const { customDomain } = customDomainSchema.parse(req.body);

      // Normalize domain (remove protocol, trailing slash, www prefix if present)
      let normalizedDomain = customDomain.toLowerCase().trim();
      normalizedDomain = normalizedDomain.replace(/^(https?:\/\/)?(www\.)?/, '');
      normalizedDomain = normalizedDomain.replace(/\/$/, '');

      // Check if domain is already in use by another tenant
      const [existingTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.customDomain, normalizedDomain))
        .limit(1);

      if (existingTenant && existingTenant.id !== req.tenant!.id) {
        return res.status(400).json({ 
          error: 'Domain already in use',
          message: 'This custom domain is already configured for another organization'
        });
      }

      // Update tenant with new custom domain (mark as unverified)
      const [updatedTenant] = await db
        .update(tenants)
        .set({
          customDomain: normalizedDomain,
          customDomainVerified: false,
        })
        .where(eq(tenants.id, req.tenant!.id))
        .returning();

      // Send notification email to platform admin about custom domain request
      try {
        const { EmailService } = await import('./lib/email-service');
        await EmailService.sendCustomDomainRequest({
          tenantName: updatedTenant.name,
          tenantSubdomain: updatedTenant.subdomain,
          customDomain: normalizedDomain,
          adminEmail: req.user!.email,
        });
        console.log(`[CUSTOM DOMAIN] Notification sent to platform admin for ${normalizedDomain}`);
      } catch (emailError) {
        console.error('[CUSTOM DOMAIN] Failed to send platform admin notification:', emailError);
        // Don't fail the request if email fails - domain is still saved
      }

      res.json({ 
        success: true, 
        customDomain: normalizedDomain,
        verified: false,
        message: 'Custom domain saved. Please configure DNS and verify.'
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/tenant/custom-domain/verify
   * Verify DNS configuration for custom domain (admin only)
   */
  app.post('/api/tenant/custom-domain/verify', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const dns = await import('dns').then(m => m.promises);

      // Get current tenant data
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      if (!tenant || !tenant.customDomain) {
        return res.status(400).json({ 
          error: 'No custom domain configured',
          message: 'Please set a custom domain first'
        });
      }

      const customDomain = tenant.customDomain;
      const expectedSubdomain = `${tenant.subdomain}.irescue.life`;

      try {
        // Check CNAME record
        const cnameRecords = await dns.resolveCname(customDomain).catch(() => null);
        
        if (cnameRecords && cnameRecords.includes(expectedSubdomain)) {
          // CNAME is correctly configured
          let applePayRegistered = false;
          let applePayError: string | null = null;
          
          // Try to register domain for Apple Pay with Stripe
          try {
            const platformStripeKey = process.env.STRIPE_SECRET_KEY;
            if (platformStripeKey) {
              const Stripe = (await import('stripe')).default;
              const stripe = new Stripe(platformStripeKey, { 
                apiVersion: '2025-09-30.clover',
                typescript: true,
              });
              
              // Register the custom domain for Apple Pay
              await stripe.applePayDomains.create({
                domain_name: customDomain,
              });
              applePayRegistered = true;
              console.log(`[APPLE PAY] Successfully registered domain ${customDomain} for Apple Pay`);
            }
          } catch (applePayErr: any) {
            // Don't fail the whole verification if Apple Pay registration fails
            applePayError = applePayErr.message || 'Unknown error';
            console.error(`[APPLE PAY] Failed to register domain ${customDomain}: ${applePayError}`);
          }
          
          await db
            .update(tenants)
            .set({ 
              customDomainVerified: true,
              applePayDomainRegistered: applePayRegistered,
            })
            .where(eq(tenants.id, req.tenant!.id));

          return res.json({ 
            success: true, 
            verified: true,
            applePayRegistered,
            applePayError,
            message: applePayRegistered 
              ? 'Custom domain verified and Apple Pay enabled!'
              : 'Custom domain verified! Apple Pay registration pending.'
          });
        }

        // If CNAME doesn't match, provide error details
        return res.status(400).json({ 
          error: 'DNS verification failed',
          message: cnameRecords 
            ? `CNAME points to ${cnameRecords[0]} but should point to ${expectedSubdomain}`
            : `No CNAME record found. Please add: CNAME ${customDomain} → ${expectedSubdomain}`,
          verified: false
        });
      } catch (dnsError: any) {
        return res.status(400).json({ 
          error: 'DNS verification failed',
          message: `Could not verify DNS records: ${dnsError.message}`,
          verified: false
        });
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/tenant/custom-domain
   * Remove custom domain configuration (admin only)
   */
  app.delete('/api/tenant/custom-domain', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      await db
        .update(tenants)
        .set({
          customDomain: null,
          customDomainVerified: false,
          applePayDomainRegistered: false,
        })
        .where(eq(tenants.id, req.tenant!.id));

      res.json({ 
        success: true,
        message: 'Custom domain removed successfully'
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/tenant/custom-domain/register-apple-pay
   * Manually register custom domain for Apple Pay (admin only)
   */
  app.post('/api/tenant/custom-domain/register-apple-pay', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      // Get current tenant data
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      if (!tenant || !tenant.customDomain || !tenant.customDomainVerified) {
        return res.status(400).json({ 
          error: 'No verified custom domain',
          message: 'Please verify your custom domain first'
        });
      }

      if (tenant.applePayDomainRegistered) {
        return res.json({ 
          success: true,
          message: 'Apple Pay is already registered for this domain'
        });
      }

      const platformStripeKey = process.env.STRIPE_SECRET_KEY;
      if (!platformStripeKey) {
        return res.status(500).json({ 
          error: 'Configuration error',
          message: 'Stripe is not configured on the platform'
        });
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(platformStripeKey, { 
        apiVersion: '2025-09-30.clover',
        typescript: true,
      });
      
      // Register the custom domain for Apple Pay
      await stripe.applePayDomains.create({
        domain_name: tenant.customDomain,
      });

      await db
        .update(tenants)
        .set({ applePayDomainRegistered: true })
        .where(eq(tenants.id, req.tenant!.id));

      console.log(`[APPLE PAY] Successfully registered domain ${tenant.customDomain} for Apple Pay (manual)`);

      res.json({ 
        success: true,
        message: 'Apple Pay enabled for your custom domain!'
      });
    } catch (error: any) {
      console.error(`[APPLE PAY] Manual registration failed:`, error.message);
      res.status(400).json({ 
        error: 'Apple Pay registration failed',
        message: error.message || 'Could not register domain with Stripe'
      });
    }
  });

  // ============================================================================
  // Email Usage Tracking Routes
  // ============================================================================

  /**
   * GET /api/tenant/email-usage
   * Get email usage statistics for current tenant
   */
  app.get('/api/tenant/email-usage', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const [tenant] = await db
        .select({
          emailsSentThisMonth: tenants.emailsSentThisMonth,
          emailQuotaLimit: tenants.emailQuotaLimit,
          lastEmailQuotaReset: tenants.lastEmailQuotaReset,
          resendEnabled: tenants.resendEnabled,
        })
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const remaining = Math.max(0, tenant.emailQuotaLimit - tenant.emailsSentThisMonth);
      const usePlatformKey = !tenant.resendEnabled && !!process.env.PLATFORM_RESEND_API_KEY;

      res.json({
        sent: tenant.emailsSentThisMonth,
        limit: tenant.emailQuotaLimit,
        remaining,
        lastReset: tenant.lastEmailQuotaReset,
        usePlatformKey,
        hasOwnApiKey: tenant.resendEnabled,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/tenant/email-quota
   * Update email quota limit (admin only)
   */
  app.patch('/api/tenant/email-quota', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const quotaSchema = z.object({
        emailQuotaLimit: z.number().int().min(0).max(100000),
      });

      const { emailQuotaLimit } = quotaSchema.parse(req.body);

      const [updatedTenant] = await db
        .update(tenants)
        .set({ emailQuotaLimit })
        .where(eq(tenants.id, req.tenant!.id))
        .returning({
          emailsSentThisMonth: tenants.emailsSentThisMonth,
          emailQuotaLimit: tenants.emailQuotaLimit,
        });

      res.json({
        success: true,
        sent: updatedTenant.emailsSentThisMonth,
        limit: updatedTenant.emailQuotaLimit,
        remaining: Math.max(0, updatedTenant.emailQuotaLimit - updatedTenant.emailsSentThisMonth),
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Stripe Connect Onboarding Routes
  // ============================================================================

  /**
   * GET /api/stripe/config
   * Get Stripe configuration for the frontend (public key, test mode status)
   * This endpoint is public so donation forms can load proper Stripe.js
   */
  app.get('/api/stripe/config', (req, res) => {
    const isTestMode = process.env.STRIPE_TEST_MODE === 'true';
    
    // In test mode, prefer testing keys
    const publicKey = isTestMode
      ? (process.env.TESTING_VITE_STRIPE_PUBLIC_KEY || process.env.VITE_STRIPE_PUBLIC_KEY)
      : process.env.VITE_STRIPE_PUBLIC_KEY;
    
    res.json({
      testMode: isTestMode,
      publicKey: publicKey || null,
      configured: !!publicKey,
    });
  });

  /**
   * GET /api/stripe/connect/status
   * Check the current Stripe Connect status for this tenant
   */
  app.get('/api/stripe/connect/status', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // If no connected account, return disconnected status
      if (!tenant.stripeConnectedAccountId) {
        return res.json({
          connected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          accountId: null,
        });
      }

      // Check account status with Stripe
      const stripe = await import('stripe');
      const isTestMode = process.env.STRIPE_TEST_MODE === 'true';
      const platformStripeKey = isTestMode
        ? (process.env.TESTING_STRIPE_SECRET_KEY || process.env.PLATFORM_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY)
        : (process.env.PLATFORM_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
      
      if (!platformStripeKey) {
        return res.status(500).json({ error: 'Stripe not configured on platform' });
      }

      const stripeClient = new stripe.default(platformStripeKey, { apiVersion: '2025-09-30.clover' });
      
      try {
        const account = await stripeClient.accounts.retrieve(tenant.stripeConnectedAccountId);
        
        // Update stripeEnabled based on actual charges_enabled status
        // This ensures donations are only enabled when Stripe says they're ready
        if (account.charges_enabled && !tenant.stripeEnabled) {
          await db
            .update(tenants)
            .set({ stripeEnabled: true })
            .where(eq(tenants.id, req.tenant!.id));
        } else if (!account.charges_enabled && tenant.stripeEnabled) {
          await db
            .update(tenants)
            .set({ stripeEnabled: false })
            .where(eq(tenants.id, req.tenant!.id));
        }
        
        res.json({
          connected: true,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          accountId: account.id,
        });
      } catch (stripeError: any) {
        // If account doesn't exist anymore, clear the ID
        if (stripeError.code === 'account_invalid') {
          await db
            .update(tenants)
            .set({ stripeConnectedAccountId: null })
            .where(eq(tenants.id, req.tenant!.id));
          
          return res.json({
            connected: false,
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
            accountId: null,
          });
        }
        throw stripeError;
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/stripe/connect
   * Generate Stripe Standard Connect OAuth authorization URL
   * Redirects tenant to Stripe to authorize their existing account
   */
  app.get('/api/stripe/connect', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const isTestMode = process.env.STRIPE_TEST_MODE === 'true';
      // In test mode, prefer TESTING_STRIPE_CLIENT_ID; fallback to STRIPE_CLIENT_ID
      const rawClientId = isTestMode
        ? (process.env.TESTING_STRIPE_CLIENT_ID || process.env.STRIPE_CLIENT_ID)
        : process.env.STRIPE_CLIENT_ID;
      
      // Trim whitespace that might have been accidentally included
      const clientId = rawClientId?.trim();
      
      console.log('[STRIPE DEBUG] OAuth URL generation:', {
        isTestMode,
        usingTestClientId: isTestMode && !!process.env.TESTING_STRIPE_CLIENT_ID,
        hasClientId: !!clientId,
        clientIdStart: clientId?.substring(0, 6),
      });
      
      if (!clientId) {
        return res.status(500).json({ 
          error: 'Stripe Connect not configured', 
          message: 'STRIPE_CLIENT_ID environment variable is required. Find it in Stripe Dashboard > Settings > Connect > Settings.' 
        });
      }
      
      // Validate client ID format
      if (!clientId.startsWith('ca_')) {
        console.error('[STRIPE DEBUG] Invalid client ID format - should start with ca_');
        return res.status(500).json({
          error: 'Invalid Stripe Client ID',
          message: 'STRIPE_CLIENT_ID should start with "ca_". Please check your Stripe Connect settings.'
        });
      }

      // Generate cryptographically secure state token for CSRF protection
      // Format: tenantId:randomToken - allows tenant identification while preventing CSRF
      const crypto = await import('crypto');
      const csrfToken = crypto.randomBytes(32).toString('hex');
      const state = `${req.tenant!.id}:${csrfToken}`;
      
      // Store CSRF token in session for validation on callback
      (req.session as any).stripeConnectState = {
        token: csrfToken,
        tenantId: req.tenant!.id,
        createdAt: Date.now(),
      };
      
      // Determine the callback URL
      // Priority: STRIPE_REDIRECT_BASE_URL > request host (dynamic)
      // For production: Set STRIPE_REDIRECT_BASE_URL to your deployed app URL (e.g., https://yourapp.replit.app)
      let redirectUri: string;
      const host = req.get('host') || '';
      const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
      
      if (process.env.STRIPE_REDIRECT_BASE_URL) {
        // Custom domain configured - use it (for production or custom setup)
        const baseUrl = process.env.STRIPE_REDIRECT_BASE_URL.replace(/\/$/, '');
        redirectUri = `${baseUrl}/api/stripe/callback`;
        console.log('[STRIPE DEBUG] Using STRIPE_REDIRECT_BASE_URL:', redirectUri);
      } else if (host) {
        // Use the current request host - works for both dev and production
        // NOTE: In Replit, dev domains change on restart. For stable OAuth:
        // - Set STRIPE_REDIRECT_BASE_URL to your published app URL (e.g., https://yourapp.replit.app)
        // - Add that URL to Stripe Dashboard > Connect > Settings > Redirects
        redirectUri = `https://${host}/api/stripe/callback`;
        console.log('[STRIPE DEBUG] Using request host:', redirectUri);
        if (process.env.REPLIT_DEV_DOMAIN) {
          console.log('[STRIPE DEBUG] TIP: For stable OAuth, set STRIPE_REDIRECT_BASE_URL to your published .replit.app URL');
        }
      } else {
        // Fallback for edge cases
        redirectUri = `https://localhost:5000/api/stripe/callback`;
        console.log('[STRIPE DEBUG] Using localhost fallback:', redirectUri);
      }
      
      // Build the OAuth authorization URL for Standard Connect
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'read_write',
        redirect_uri: redirectUri,
        state: state,
      });
      
      const authorizeUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
      
      console.log('[STRIPE STANDARD CONNECT] Generating OAuth URL:', {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        tenantId: req.tenant!.id,
        testMode: isTestMode,
      });

      res.json({ url: authorizeUrl });
    } catch (error: any) {
      console.error('[STRIPE STANDARD CONNECT] Error generating OAuth URL:', error.message);
      next(error);
    }
  });

  /**
   * GET /api/stripe/callback
   * Handle Stripe Standard Connect OAuth callback
   * Exchanges authorization code for connected account ID
   * Validates CSRF state token stored in session
   */
  app.get('/api/stripe/callback', async (req, res, next) => {
    try {
      const { code, state, error, error_description } = req.query;
      
      // Parse state to extract tenant ID for error redirects
      const stateStr = state as string || '';
      const [tenantIdFromState, csrfTokenFromState] = stateStr.split(':');
      
      // Handle errors from Stripe
      if (error) {
        console.error('[STRIPE CALLBACK] OAuth error:', error, error_description);
        // Try to find tenant for redirect
        if (tenantIdFromState) {
          const [tenant] = await db
            .select({ subdomain: tenants.subdomain })
            .from(tenants)
            .where(eq(tenants.id, tenantIdFromState))
            .limit(1);
          if (tenant) {
            return res.redirect(`/${tenant.subdomain}/settings?stripe_error=${encodeURIComponent(error_description as string || error as string)}`);
          }
        }
        return res.status(400).send(`Stripe authorization failed: ${error_description || error}`);
      }
      
      if (!code || !state || !tenantIdFromState) {
        console.error('[STRIPE CALLBACK] Missing code, state, or invalid state format');
        return res.status(400).send('Missing or invalid authorization parameters');
      }
      
      // Validate CSRF token from session (Strict Mode)
      // Rejects requests with mismatched CSRF tokens to prevent CSRF attacks
      const sessionState = (req.session as any)?.stripeConnectState;
      if (sessionState) {
        // Session exists - enforce strict CSRF validation
        if (!csrfTokenFromState || sessionState.token !== csrfTokenFromState) {
          console.error('[STRIPE CALLBACK] CSRF token mismatch - rejecting request (Strict Mode)');
          // Clear the state from session
          delete (req.session as any).stripeConnectState;
          return res.status(403).send('CSRF validation failed. Please try connecting your Stripe account again.');
        }
        if (sessionState.tenantId !== tenantIdFromState) {
          console.error('[STRIPE CALLBACK] Tenant ID mismatch in session state - rejecting request');
          delete (req.session as any).stripeConnectState;
          return res.status(403).send('Session mismatch. Please try connecting your Stripe account again.');
        }
        // Clear the state from session (one-time use)
        delete (req.session as any).stripeConnectState;
      } else {
        // No session state - reject in strict mode
        // This prevents callbacks without a valid session
        console.error('[STRIPE CALLBACK] No session state found - rejecting request (Strict Mode)');
        return res.status(403).send('Session expired or invalid. Please try connecting your Stripe account again.');
      }
      
      const tenantId = tenantIdFromState;
      
      // Verify tenant exists
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      
      if (!tenant) {
        console.error('[STRIPE CALLBACK] Tenant not found:', tenantId);
        return res.status(400).send('Tenant not found');
      }
      
      // Exchange authorization code for access token and account ID
      const stripe = await import('stripe');
      const isTestMode = process.env.STRIPE_TEST_MODE === 'true';
      const hasTestingKey = !!process.env.TESTING_STRIPE_SECRET_KEY;
      const platformStripeKey = isTestMode
        ? (process.env.TESTING_STRIPE_SECRET_KEY || process.env.PLATFORM_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY)
        : (process.env.PLATFORM_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
      
      console.log('[STRIPE CALLBACK] Credential check:', {
        isTestMode,
        hasTestingSecretKey: hasTestingKey,
        usingKeyPrefix: platformStripeKey?.substring(0, 8),
        keySource: isTestMode 
          ? (hasTestingKey ? 'TESTING_STRIPE_SECRET_KEY' : 'PLATFORM_STRIPE_SECRET_KEY')
          : 'PLATFORM_STRIPE_SECRET_KEY',
      });
      
      if (!platformStripeKey) {
        return res.redirect(`/${tenant.subdomain}/dashboard/settings?stripe_error=${encodeURIComponent('Stripe not configured on platform')}`);
      }
      
      const stripeClient = new stripe.default(platformStripeKey, { apiVersion: '2025-09-30.clover' });
      
      // Exchange the authorization code for connected account info
      const response = await stripeClient.oauth.token({
        grant_type: 'authorization_code',
        code: code as string,
      });
      
      const connectedAccountId = response.stripe_user_id;
      
      if (!connectedAccountId) {
        console.error('[STRIPE CALLBACK] No stripe_user_id in response:', response);
        return res.redirect(`/${tenant.subdomain}/dashboard/settings?stripe_error=no_account_id`);
      }
      
      console.log('[STRIPE CALLBACK] Successfully connected account:', {
        tenantId,
        tenantName: tenant.name,
        connectedAccountId,
      });
      
      // Update tenant with connected account ID and enable Stripe
      await db
        .update(tenants)
        .set({ 
          stripeConnectedAccountId: connectedAccountId,
          stripeEnabled: true, // Standard accounts are already fully set up
          stripeConnectedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
      
      // Redirect back to settings with success
      res.redirect(`/${tenant.subdomain}/dashboard/settings?stripe_return=true`);
      
    } catch (error: any) {
      console.error('[STRIPE CALLBACK] Error exchanging code:', error.message, error.type, error.code);
      
      // Try to extract tenant subdomain from state for redirect
      const stateStr = req.query.state as string || '';
      const [tenantIdFromState] = stateStr.split(':');
      if (tenantIdFromState) {
        const [tenant] = await db
          .select({ subdomain: tenants.subdomain })
          .from(tenants)
          .where(eq(tenants.id, tenantIdFromState))
          .limit(1);
        
        if (tenant) {
          return res.redirect(`/${tenant.subdomain}/dashboard/settings?stripe_error=${encodeURIComponent(error.message)}`);
        }
      }
      
      next(error);
    }
  });

  /**
   * POST /api/stripe/connect/disconnect
   * Disconnect the Stripe account from this tenant
   */
  app.post('/api/stripe/connect/disconnect', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      // Deauthorize the connected account (optional, but good practice)
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);
      
      if (tenant?.stripeConnectedAccountId) {
        try {
          const stripe = await import('stripe');
          const isTestMode = process.env.STRIPE_TEST_MODE === 'true';
          const clientId = isTestMode
            ? (process.env.TESTING_STRIPE_CLIENT_ID || process.env.STRIPE_CLIENT_ID)
            : process.env.STRIPE_CLIENT_ID;
          const platformStripeKey = isTestMode
            ? (process.env.TESTING_STRIPE_SECRET_KEY || process.env.PLATFORM_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY)
            : (process.env.PLATFORM_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
          
          if (platformStripeKey && clientId) {
            const stripeClient = new stripe.default(platformStripeKey, { apiVersion: '2025-09-30.clover' });
            await stripeClient.oauth.deauthorize({
              client_id: clientId,
              stripe_user_id: tenant.stripeConnectedAccountId,
            });
          }
        } catch (deauthError: any) {
          // Log but don't fail - the account may already be disconnected on Stripe's side
          console.warn('[STRIPE DISCONNECT] Deauthorization warning:', deauthError.message);
        }
      }
      
      // Clear the connected account from our database
      await db
        .update(tenants)
        .set({ 
          stripeConnectedAccountId: null,
          stripeEnabled: false,
          stripeConnectedAt: null,
        })
        .where(eq(tenants.id, req.tenant!.id));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Stripe Checkout Routes
  // ============================================================================

  /**
   * GET /api/stripe/fee-calculation
   * Calculate fees for "Donor Covers Fees" feature
   * Returns the breakdown of processing fees and platform fees
   */
  app.get('/api/stripe/fee-calculation', requireTenant, async (req, res, next) => {
    try {
      const { calculateDonorCoversFees, getPlatformFeePercent, STRIPE_PROCESSING_FEE_PERCENT } = await import('./config/platform');
      
      const amountSchema = z.object({
        amount: z.string().transform(val => parseInt(val, 10)).refine(val => val >= 100, 'Amount must be at least 100 cents'),
      });

      const { amount } = amountSchema.parse(req.query);
      
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      const subscriptionTier = tenant?.subscriptionTier || 'free';
      const tenantPlatformFeePercent = tenant?.platformFeePercent;
      const feeCalc = calculateDonorCoversFees(amount, subscriptionTier, tenantPlatformFeePercent);
      const platformFeePercent = getPlatformFeePercent(subscriptionTier, tenantPlatformFeePercent);
      
      res.json({
        baseAmount: feeCalc.baseAmount,
        totalAmount: feeCalc.totalAmount,
        feesCovered: feeCalc.feesCovered,
        stripeFee: feeCalc.stripeFee,
        platformFee: feeCalc.platformFee,
        platformFeePercent,
        stripeProcessingPercent: STRIPE_PROCESSING_FEE_PERCENT,
        hasPlatformFee: platformFeePercent > 0,
        isPaidTier: subscriptionTier === 'professional',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/stripe/create-checkout-session
   * Create a Stripe checkout session for donations
   */
  app.post('/api/stripe/create-checkout-session', requireTenant, async (req, res, next) => {
    try {
      const { stripeService } = await import('./lib/stripe-service');

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      if (!tenant || !tenant.stripeEnabled) {
        return res.status(400).json({ 
          error: "Stripe is not configured for this rescue" 
        });
      }

      const { calculateDonorCoversFees } = await import('./config/platform');
      
      const checkoutSchema = z.object({
        amount: z.number().int().min(100),
        currency: z.string().default("usd"),
        customerEmail: z.string().email().optional(),
        isRecurring: z.boolean().default(false),
        interval: z.enum(["month", "year"]).optional(),
        donorCoversFees: z.boolean().default(false),
        metadata: z.record(z.string()).optional(),
      });

      const data = checkoutSchema.parse(req.body);

      const { calculatePlatformFee, getPlatformFeePercent } = await import('./config/platform');

      // If donor covers fees, calculate the grossed-up amount
      let chargeAmount = data.amount;
      let feesCovered = 0;
      if (data.donorCoversFees) {
        const feeCalc = calculateDonorCoversFees(data.amount, tenant.subscriptionTier || 'free', tenant.platformFeePercent);
        chargeAmount = feeCalc.totalAmount;
        feesCovered = feeCalc.feesCovered;
      }

      // Calculate platform fee on the charge amount (pass tenant override if set)
      const platformFeeAmount = calculatePlatformFee(chargeAmount, tenant.subscriptionTier || 'free', tenant.platformFeePercent);
      const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier || 'free', tenant.platformFeePercent);

      // Check if using custom domain - if so, don't include tenant path
      const isCustomDomain = tenant.customDomain && tenant.customDomainVerified;
      const baseUrl = isCustomDomain 
        ? `https://${tenant.customDomain}`
        : `${req.protocol}://${req.get('host')}`;
      // Only include tenant subdomain path when NOT using custom domain
      const tenantPath = isCustomDomain ? '' : (tenant.subdomain ? `/${tenant.subdomain}` : '');
      
      const session = await stripeService.createCheckoutSession(tenant, {
        amount: chargeAmount,
        currency: data.currency,
        customerEmail: data.customerEmail,
        isRecurring: data.isRecurring,
        interval: data.interval,
        successUrl: `${baseUrl}${tenantPath}/?donation=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}${tenantPath}/?donation=cancelled`,
        platformFeeAmount: platformFeeAmount,
        connectedAccountId: tenant.stripeConnectedAccountId || undefined,
        metadata: {
          ...data.metadata,
          baseAmount: data.amount.toString(),
          chargeAmount: chargeAmount.toString(),
          donorCoveredFees: data.donorCoversFees.toString(),
          feesCovered: feesCovered.toString(),
          platformFeeAmount: platformFeeAmount.toString(),
          platformFeePercent: platformFeePercent.toString(),
          // Fee is actually collected only when Connect is configured AND fee > 0
          platformFeeCollected: (tenant.stripeConnectedAccountId && platformFeeAmount > 0 ? 'true' : 'false'),
        },
      });

      if (!session) {
        return res.status(500).json({ 
          error: "Failed to create checkout session" 
        });
      }

      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error('[Stripe Checkout Error]', {
        message: error?.message,
        type: error?.type,
        code: error?.code,
        statusCode: error?.statusCode,
        tenantId: req.tenant?.id,
        stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
      });
      
      // Return a more descriptive error to the client
      const errorMessage = error?.message || 'Failed to create checkout session';
      res.status(error?.statusCode || 500).json({ 
        error: errorMessage,
        code: error?.code,
      });
    }
  });

  /**
   * POST /api/stripe/webhook
   * Handle Stripe webhook events for automatic donation tracking
   * 
   * Security: Signature verification happens BEFORE any payload processing
   * Stripe Connect payments are verified with PLATFORM_STRIPE_WEBHOOK_SECRET
   * since they're routed through the platform's connected account infrastructure.
   */
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        return res.status(400).send('Missing stripe-signature header');
      }

      const { decrypt } = await import('./lib/encryption');
      const { donors, payments, subscriptions } = await import('@shared/schema');
      const { stripeService } = await import('./lib/stripe-service');

      // SECURITY: Verify signature FIRST before any payload processing
      // For Stripe Connect, platform webhook secret is required
      const platformWebhookSecret = process.env.PLATFORM_STRIPE_WEBHOOK_SECRET;
      
      if (!platformWebhookSecret) {
        console.error('[Webhook] PLATFORM_STRIPE_WEBHOOK_SECRET not configured');
        return res.status(500).send('Webhook secret not configured');
      }

      // Verify the webhook signature with platform secret
      let event;
      try {
        event = await stripeService.handleWebhook(
          req.body,
          signature,
          platformWebhookSecret
        );
      } catch (verifyError: any) {
        console.error('[Webhook] Signature verification failed:', verifyError.message);
        return res.status(400).send('Webhook signature verification failed');
      }

      console.log(`[Webhook] Verified with platform secret, event type: ${event.type}`);

      // NOW safe to extract tenant info from verified event
      const eventData = event.data.object as any;
      let metadata = eventData.metadata || {};
      let tenantId = metadata.tenantId;

      // If no tenantId in metadata, try to resolve from subscription
      if (!tenantId && eventData.subscription) {
        const subscriptionId = eventData.subscription;
        const subscription = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
          .limit(1)
          .then(rows => rows[0]);
        
        if (subscription) {
          tenantId = subscription.tenantId;
        }
      }

      if (!tenantId) {
        console.error('[Webhook] Missing tenantId in verified event metadata');
        return res.status(400).send('Missing tenant information');
      }

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant || !tenant.stripeEnabled) {
        console.error('[Webhook] Tenant not found or Stripe not enabled:', tenantId);
        return res.status(400).send('Stripe not configured for this tenant');
      }

      console.log(`[Webhook] Processing ${event.type} for tenant: ${tenant.name}`);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          const customerEmail = session.customer_email || session.customer_details?.email;
          const customerName = session.customer_details?.name || 'Anonymous Donor';
          const customerAddress = session.customer_details?.address || {};
          const donorCity = customerAddress.city || null;
          const donorState = customerAddress.state || null;
          const donorCountry = customerAddress.country || null;

          if (!customerEmail) {
            console.error('Checkout session completed without customer email');
            break;
          }

          // Idempotency check: Skip if this payment was already processed
          if (session.payment_intent) {
            const existingPayment = await db
              .select({ id: payments.id })
              .from(payments)
              .where(eq(payments.stripePaymentIntentId, session.payment_intent))
              .limit(1)
              .then(rows => rows[0]);

            if (existingPayment) {
              console.log(`[Webhook] Payment ${session.payment_intent} already processed, skipping (idempotency)`);
              return res.status(200).json({ received: true, idempotent: true });
            }
          }

          // For ACH payments, payment_status may be 'unpaid' until bank transfer completes
          // We still create the donor and payment record, but mark status appropriately
          const isPaymentComplete = session.payment_status === 'paid';
          const paymentStatus = isPaymentComplete ? 'succeeded' : 'pending';

          let donor = await db
            .select()
            .from(donors)
            .where(
              and(
                eq(donors.tenantId, tenant.id),
                eq(donors.email, customerEmail)
              )
            )
            .limit(1)
            .then(rows => rows[0]);

          if (!donor) {
            [donor] = await db.insert(donors).values({
              tenantId: tenant.id,
              email: customerEmail,
              name: customerName,
              stripeCustomerId: session.customer,
              totalDonated: isPaymentComplete ? (session.amount_total || 0) : 0,
              lastDonationDate: isPaymentComplete ? new Date() : null,
            }).returning();
          } else if (isPaymentComplete) {
            [donor] = await db
              .update(donors)
              .set({
                totalDonated: (donor.totalDonated || 0) + (session.amount_total || 0),
                lastDonationDate: new Date(),
                stripeCustomerId: session.customer || donor.stripeCustomerId,
              })
              .where(eq(donors.id, donor.id))
              .returning();
          }

          await db.insert(payments).values({
            tenantId: tenant.id,
            donorId: donor.id,
            stripePaymentIntentId: session.payment_intent,
            stripeCheckoutSessionId: session.id,
            amount: session.amount_total || 0,
            currency: session.currency || 'usd',
            status: paymentStatus,
            paymentMethod: 'stripe',
            isRecurring: session.mode === 'subscription',
            message: session.metadata?.message,
            donorCity,
            donorState,
            donorCountry,
            isPublic: true,
          });

          // Create or update contact record for the donor
          try {
            const { createContactFromDonation } = await import('./services/contacts');
            await createContactFromDonation(
              tenant.id,
              customerName,
              customerEmail,
              (session.amount_total || 0) / 100
            );
          } catch (contactError) {
            console.error('Failed to create contact from Stripe donation:', contactError);
            // Don't fail the webhook if contact creation fails
          }

          // Create a donation record for ALL completed Stripe payments
          // This ensures they appear in Analytics Financial Overview
          // Note: Primary idempotency is enforced above via payments.stripePaymentIntentId check
          // - If payment already exists, we return early before reaching this code
          // - The only theoretical race is simultaneous webhook delivery, which is extremely rare
          const campaignType = session.metadata?.campaign_type;
          const petId = session.metadata?.pet_id;
          if (isPaymentComplete) {
            try {
              const amountCents = session.amount_total || 0;
              
              const donationData: any = {
                tenantId: tenant.id,
                donorId: donor.id,
                donorName: customerName,
                donorEmail: customerEmail,
                donorCity,
                donorState,
                donorCountry,
                donationType: 'cash',
                amount: amountCents, // Store in cents to match schema
                source: 'stripe',
                date: new Date(),
                message: `Stripe payment: ${session.payment_intent || session.id}`, // Track payment reference
              };
              
              // Include sponsoredAnimalId if this is a sponsor-pet campaign
              if (campaignType === 'sponsor_pet' && petId) {
                donationData.sponsoredAnimalId = petId;
              }
              
              await db.insert(donations).values(donationData);
              console.log(`[Webhook] Created donation record for ${customerEmail}, amount: ${amountCents} cents, payment: ${session.payment_intent}`);
            } catch (donationError) {
              console.error('[Webhook] Failed to create donation record:', donationError);
              // Don't fail the webhook if donation record creation fails
            }
          }

          // Send appropriate email based on payment status
          try {
            const { EmailService } = await import('./lib/email-service');
            const emailService = await EmailService.forTenant(tenant.id);
            
            if (emailService && customerEmail) {
              const amountFormatted = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: session.currency || 'usd'
              }).format((session.amount_total || 0) / 100);

              const isRecurring = session.mode === 'subscription';
              const dateFormatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
              
              // Escape user-provided content to prevent XSS
              const safeCustomerName = escapeHtml(customerName);
              const safeTenantName = escapeHtml(tenant.name);
              const safeMessage = escapeHtml(session.metadata?.message);
              const safeEin = escapeHtml(tenant.ein);
              const einSection = safeEin ? ` EIN: ${safeEin}` : '';
              const messageSection = safeMessage 
                ? `<p style="margin: 5px 0;"><strong>Your message:</strong> ${safeMessage}</p>` 
                : '';

              if (isPaymentComplete) {
                // Card payment - send immediate thank-you
                const donationType = isRecurring ? 'recurring donation' : 'donation';
                const recurringNote = isRecurring 
                  ? '<p>Your recurring donation will automatically process each month. You can manage your subscription at any time.</p>' 
                  : '';

                await emailService.send({
                  to: customerEmail,
                  subject: `Thank you for your ${donationType} to ${safeTenantName}!`,
                  html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Thank You, ${safeCustomerName}!</h2>
  
  <p>Your generous ${donationType} of <strong>${amountFormatted}</strong> to ${safeTenantName} has been received.</p>
  
  ${recurringNote}
  
  <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Amount:</strong> ${amountFormatted}</p>
    <p style="margin: 5px 0;"><strong>Date:</strong> ${dateFormatted}</p>
    ${messageSection}
  </div>
  
  <p>Your support makes a real difference in the lives of the animals we rescue and care for. Every dollar helps us provide food, shelter, medical care, and love to animals in need.</p>
  
  <p>With heartfelt gratitude,<br/>
  <strong>The ${safeTenantName} Team</strong></p>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
  
  <p style="font-size: 12px; color: #6b7280;">
    ${safeTenantName} is a registered 501(c)(3) nonprofit organization.${einSection}<br/>
    This email serves as your donation confirmation. An official tax receipt may be sent separately.
  </p>
</div>
                  `.trim()
                });
                console.log(`[Webhook] Thank-you email sent to ${customerEmail} for donation to ${tenant.name}`);
              } else {
                // ACH payment pending - send processing notice
                console.log(`[Webhook] ACH payment pending for ${customerEmail}, session ${session.id}`);
                await emailService.send({
                  to: customerEmail,
                  subject: `Your bank transfer to ${safeTenantName} is processing`,
                  html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Thank You, ${safeCustomerName}!</h2>
  
  <p>We've received your bank transfer donation request of <strong>${amountFormatted}</strong> to ${safeTenantName}.</p>
  
  <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; color: #92400e;"><strong>Your bank transfer is processing</strong></p>
    <p style="margin: 5px 0 0 0; color: #92400e; font-size: 14px;">ACH bank transfers typically take 3-5 business days to complete. We'll send you a confirmation email once your donation has been received.</p>
  </div>
  
  <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Amount:</strong> ${amountFormatted}</p>
    <p style="margin: 5px 0;"><strong>Date Initiated:</strong> ${dateFormatted}</p>
    <p style="margin: 5px 0;"><strong>Payment Method:</strong> Bank Transfer (ACH)</p>
    ${messageSection}
  </div>
  
  <p>Thank you for choosing to support our mission. Your generosity makes a real difference!</p>
  
  <p>With gratitude,<br/>
  <strong>The ${safeTenantName} Team</strong></p>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
  
  <p style="font-size: 12px; color: #6b7280;">
    ${safeTenantName} is a registered 501(c)(3) nonprofit organization.${einSection}<br/>
    A tax receipt will be sent once your bank transfer has been processed.
  </p>
</div>
                  `.trim()
                });
                console.log(`[Webhook] ACH pending notice sent to ${customerEmail} for donation to ${tenant.name}`);
              }
            }
          } catch (emailError) {
            // Don't fail the webhook if email fails - log and continue
            console.error('[Webhook] Failed to send email:', emailError);
          }

          if (session.subscription) {
            await db.insert(subscriptions).values({
              tenantId: tenant.id,
              donorId: donor.id,
              stripeSubscriptionId: session.subscription,
              amount: session.amount_total || 0,
              currency: session.currency || 'usd',
              interval: 'month',
              status: 'active',
            });
          }

          // Handle supply item (wishlist) donations
          if (session.metadata?.supplyItemId && isPaymentComplete) {
            try {
              const { supplyDonations, supplyItems } = await import('@shared/schema');
              
              const supplyItemId = session.metadata.supplyItemId;
              const quantity = parseInt(session.metadata.quantity || '1', 10);
              
              // Create supply donation record
              await db.insert(supplyDonations).values({
                tenantId: tenant.id,
                supplyItemId,
                donorName: customerName,
                donorEmail: customerEmail,
                quantity,
                amount: ((session.amount_total || 0) / 100).toFixed(2),
                currency: session.currency || 'usd',
                donationType: 'monetary',
                paymentMethod: 'stripe',
                stripePaymentIntentId: session.payment_intent,
                fulfillmentStatus: 'received',
              });

              // Increment the supply item's fulfilled quantity
              await db
                .update(supplyItems)
                .set({
                  quantityFulfilled: sql`${supplyItems.quantityFulfilled} + ${quantity}`,
                  updatedAt: new Date(),
                })
                .where(eq(supplyItems.id, supplyItemId));

              console.log(`[Webhook] Supply item donation recorded: ${quantity}x ${session.metadata.supplyItemTitle} from ${customerName}`);
            } catch (supplyError) {
              // Don't fail the webhook if supply donation recording fails
              console.error('[Webhook] Failed to record supply donation:', supplyError);
            }
          }

          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as any;
          if (!invoice.subscription) break;

          // Idempotency check: Skip if this invoice payment was already processed
          if (invoice.id) {
            const existingPayment = await db
              .select({ id: payments.id })
              .from(payments)
              .where(eq(payments.stripeInvoiceId, invoice.id))
              .limit(1)
              .then(rows => rows[0]);

            if (existingPayment) {
              console.log(`[Webhook] Invoice ${invoice.id} already processed, skipping (idempotency)`);
              return res.status(200).json({ received: true, idempotent: true });
            }
          }

          const donor = await db
            .select()
            .from(donors)
            .where(
              and(
                eq(donors.tenantId, tenant.id),
                eq(donors.stripeCustomerId, invoice.customer)
              )
            )
            .limit(1)
            .then(rows => rows[0]);

          if (donor) {
            const subscription = await db
              .select()
              .from(subscriptions)
              .where(
                and(
                  eq(subscriptions.tenantId, tenant.id),
                  eq(subscriptions.stripeSubscriptionId, invoice.subscription)
                )
              )
              .limit(1)
              .then(rows => rows[0]);

            await db.insert(payments).values({
              tenantId: tenant.id,
              donorId: donor.id,
              stripeInvoiceId: invoice.id,
              subscriptionId: subscription?.id,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              status: 'succeeded',
              paymentMethod: 'stripe',
              isRecurring: true,
            });

            await db
              .update(donors)
              .set({
                totalDonated: (donor.totalDonated || 0) + invoice.amount_paid,
                lastDonationDate: new Date(),
              })
              .where(eq(donors.id, donor.id));

            // Send thank-you email for recurring payment
            try {
              const { EmailService } = await import('./lib/email-service');
              const emailService = await EmailService.forTenant(tenant.id);
              
              if (emailService && donor.email) {
                const amountFormatted = new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: invoice.currency || 'usd'
                }).format(invoice.amount_paid / 100);
                
                const dateFormatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                
                // Escape user-provided content to prevent XSS
                const safeDonorName = escapeHtml(donor.name);
                const safeTenantName = escapeHtml(tenant.name);
                const safeEin = escapeHtml(tenant.ein);
                const einSection = safeEin ? ` EIN: ${safeEin}` : '';

                await emailService.send({
                  to: donor.email,
                  subject: `Thank you for your continued support of ${safeTenantName}!`,
                  html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Thank You, ${safeDonorName}!</h2>
  
  <p>Your recurring donation of <strong>${amountFormatted}</strong> to ${safeTenantName} has been processed successfully.</p>
  
  <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Amount:</strong> ${amountFormatted}</p>
    <p style="margin: 5px 0;"><strong>Date:</strong> ${dateFormatted}</p>
  </div>
  
  <p>Your ongoing support helps us continue our mission to rescue and care for animals in need. Thank you for being a vital part of our community!</p>
  
  <p>With heartfelt gratitude,<br/>
  <strong>The ${safeTenantName} Team</strong></p>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
  
  <p style="font-size: 12px; color: #6b7280;">
    ${safeTenantName} is a registered 501(c)(3) nonprofit organization.${einSection}<br/>
    This email serves as your donation confirmation for this payment period.
  </p>
</div>
                  `.trim()
                });
                console.log(`[Webhook] Recurring payment thank-you email sent to ${donor.email}`);
              }
            } catch (emailError) {
              console.error('[Webhook] Failed to send recurring payment thank-you email:', emailError);
            }
          }
          break;
        }

        case 'customer.subscription.updated': 
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as any;
          
          await db
            .update(subscriptions)
            .set({
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
            })
            .where(
              and(
                eq(subscriptions.tenantId, tenant.id),
                eq(subscriptions.stripeSubscriptionId, subscription.id)
              )
            );
          break;
        }

        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as any;
          console.log(`[Webhook] ACH payment succeeded for session ${session.id}`);
          
          // Update the pending payment to succeeded
          const [updatedPayment] = await db
            .update(payments)
            .set({ status: 'succeeded' })
            .where(
              and(
                eq(payments.tenantId, tenant.id),
                eq(payments.stripeCheckoutSessionId, session.id)
              )
            )
            .returning();

          if (updatedPayment) {
            // Update donor totals now that payment succeeded
            const donor = await db
              .select()
              .from(donors)
              .where(eq(donors.id, updatedPayment.donorId!))
              .limit(1)
              .then(rows => rows[0]);

            if (donor) {
              await db
                .update(donors)
                .set({
                  totalDonated: (donor.totalDonated || 0) + updatedPayment.amount,
                  lastDonationDate: new Date(),
                })
                .where(eq(donors.id, donor.id));

              // Send thank-you email now that ACH payment cleared
              try {
                const { EmailService } = await import('./lib/email-service');
                const emailService = await EmailService.forTenant(tenant.id);
                
                if (emailService && donor.email) {
                  const amountFormatted = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: updatedPayment.currency || 'usd'
                  }).format(updatedPayment.amount / 100);

                  const dateFormatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                  const safeDonorName = escapeHtml(donor.name);
                  const safeTenantName = escapeHtml(tenant.name);
                  const safeEin = escapeHtml(tenant.ein);
                  const einSection = safeEin ? ` EIN: ${safeEin}` : '';

                  await emailService.send({
                    to: donor.email,
                    subject: `Your bank transfer donation to ${safeTenantName} has been received!`,
                    html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Thank You, ${safeDonorName}!</h2>
  
  <p>Great news! Your bank transfer donation of <strong>${amountFormatted}</strong> to ${safeTenantName} has been successfully processed.</p>
  
  <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Amount:</strong> ${amountFormatted}</p>
    <p style="margin: 5px 0;"><strong>Date Cleared:</strong> ${dateFormatted}</p>
    <p style="margin: 5px 0;"><strong>Payment Method:</strong> Bank Transfer (ACH)</p>
  </div>
  
  <p>Your support makes a real difference in the lives of the animals we rescue and care for. Thank you for choosing to give via bank transfer!</p>
  
  <p>With heartfelt gratitude,<br/>
  <strong>The ${safeTenantName} Team</strong></p>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
  
  <p style="font-size: 12px; color: #6b7280;">
    ${safeTenantName} is a registered 501(c)(3) nonprofit organization.${einSection}<br/>
    This email serves as your donation confirmation.
  </p>
</div>
                    `.trim()
                  });
                  console.log(`[Webhook] ACH payment confirmation email sent to ${donor.email}`);
                }
              } catch (emailError) {
                console.error('[Webhook] Failed to send ACH payment confirmation email:', emailError);
              }
            }
          }
          break;
        }

        case 'checkout.session.async_payment_failed': {
          const session = event.data.object as any;
          console.log(`[Webhook] ACH payment failed for session ${session.id}`);
          
          // Update the pending payment to failed
          const [failedPayment] = await db
            .update(payments)
            .set({ status: 'failed' })
            .where(
              and(
                eq(payments.tenantId, tenant.id),
                eq(payments.stripeCheckoutSessionId, session.id)
              )
            )
            .returning();

          // Notify donor that their bank transfer failed
          if (failedPayment) {
            const donor = await db
              .select()
              .from(donors)
              .where(eq(donors.id, failedPayment.donorId!))
              .limit(1)
              .then(rows => rows[0]);

            if (donor) {
              try {
                const { EmailService } = await import('./lib/email-service');
                const emailService = await EmailService.forTenant(tenant.id);
                
                if (emailService && donor.email) {
                  const amountFormatted = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: failedPayment.currency || 'usd'
                  }).format(failedPayment.amount / 100);

                  const safeDonorName = escapeHtml(donor.name);
                  const safeTenantName = escapeHtml(tenant.name);

                  await emailService.send({
                    to: donor.email,
                    subject: `Your bank transfer to ${safeTenantName} could not be completed`,
                    html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626;">Bank Transfer Update</h2>
  
  <p>Hi ${safeDonorName},</p>
  
  <p>Unfortunately, your bank transfer donation of <strong>${amountFormatted}</strong> to ${safeTenantName} could not be completed.</p>
  
  <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
    <p style="margin: 0; color: #991b1b;"><strong>Payment Failed</strong></p>
    <p style="margin: 5px 0 0 0; color: #991b1b; font-size: 14px;">This can happen if there were insufficient funds, the account was closed, or bank details were incorrect.</p>
  </div>
  
  <p>If you'd still like to support our mission, you can try again with a different payment method or contact your bank for more information.</p>
  
  <p>Thank you for your intended support. We appreciate your generosity!</p>
  
  <p>Best regards,<br/>
  <strong>The ${safeTenantName} Team</strong></p>
</div>
                    `.trim()
                  });
                  console.log(`[Webhook] ACH failure notification sent to ${donor.email}`);
                }
              } catch (emailError) {
                console.error('[Webhook] Failed to send ACH failure notification:', emailError);
              }
            }
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).send(`Webhook Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  /**
   * POST /api/resend/inbound
   * Handle Resend inbound email webhook - Email to iRescue feature
   */
  app.post('/api/resend/inbound', express.json(), async (req, res) => {
    try {
      const event = req.body;
      
      // Verify this is an email.received event
      if (event.type !== 'email.received') {
        return res.json({ received: true });
      }

      const emailData = event.data;
      
      // Extract tenant subdomain from the "to" address
      // Expected format: subdomain@mail.irescue.life or similar
      const toAddress = Array.isArray(emailData.to) ? emailData.to[0] : emailData.to;
      const emailMatch = toAddress.match(/^([^@]+)@/);
      if (!emailMatch) {
        console.error('Could not extract subdomain from email address:', toAddress);
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const subdomain = emailMatch[1];

      // Find tenant by subdomain
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.subdomain, subdomain))
        .limit(1);

      if (!tenant) {
        console.error('Tenant not found for subdomain:', subdomain);
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Get Resend API key for this tenant or use platform key
      const { decrypt } = await import('./lib/encryption');
      const { Resend } = await import('resend');
      
      let resendApiKey = process.env.PLATFORM_RESEND_API_KEY;
      if (tenant.resendApiKeyEncrypted && tenant.resendEnabled) {
        resendApiKey = decrypt(tenant.resendApiKeyEncrypted);
      }

      if (!resendApiKey) {
        console.error('No Resend API key available for tenant:', tenant.id);
        return res.status(500).json({ error: 'Email service not configured' });
      }

      const resend = new Resend(resendApiKey);

      // Fetch full email content from Resend
      const { data: email, error: emailError } = await resend.emails.receiving.get(emailData.email_id);
      if (emailError || !email) {
        console.error('Failed to fetch email from Resend:', emailError);
        return res.status(500).json({ error: 'Failed to fetch email content' });
      }

      // Process attachments if any
      let attachmentsList = [];
      if (emailData.attachments && emailData.attachments.length > 0) {
        try {
          const { data: attachments } = await resend.attachments.receiving.list({ 
            inboundId: emailData.email_id 
          });

          if (attachments && attachments.length > 0) {
            // TODO: Upload attachments to object storage
            // For now, store metadata only
            attachmentsList = emailData.attachments.map((att: any) => ({
              filename: att.filename,
              contentType: att.content_type,
              size: 0, // Will be updated when we upload to storage
              url: '', // Will be set after upload
            }));
          }
        } catch (attachError) {
          console.error('Failed to fetch attachments:', attachError);
        }
      }

      // Save to inbound_emails table
      const { inboundEmails } = await import('@shared/schema');
      
      const [savedEmail] = await db.insert(inboundEmails).values({
        tenantId: tenant.id,
        messageId: emailData.email_id,
        from: emailData.from || '',
        fromName: emailData.from?.match(/^(.+?)\s*</) ? emailData.from.match(/^(.+?)\s*</)?.[1] : null,
        to: toAddress,
        subject: emailData.subject || '(no subject)',
        textBody: email.text || null,
        htmlBody: email.html || null,
        attachments: attachmentsList.length > 0 ? attachmentsList : null,
        status: 'unprocessed',
        receivedAt: new Date(event.created_at),
      }).returning();

      console.log(`Saved inbound email ${savedEmail.id} for tenant ${tenant.subdomain}`);
      
      // Auto-CC: Send copies to configured recipients
      if (tenant.emailCopyRecipients && tenant.emailCopyRecipients.length > 0) {
        try {
          // Prepare from address for the copy
          const fromAddress = tenant.resendFromEmail || 'noreply@mail.irescue.life';
          const fromName = tenant.resendFromName || tenant.name;

          // Send a copy to each configured recipient
          for (const recipient of tenant.emailCopyRecipients) {
            await resend.emails.send({
              from: `${fromName} <${fromAddress}>`,
              to: recipient,
              subject: `[Copy] ${emailData.subject || '(no subject)'}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">
                      <strong>Copy of inbound email to:</strong> ${toAddress}
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">
                      <strong>From:</strong> ${emailData.from}
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">
                      <strong>Received:</strong> ${new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div style="border-left: 4px solid #e5e7eb; padding-left: 16px;">
                    ${email.html || `<pre style="white-space: pre-wrap; font-family: sans-serif;">${email.text || '(no content)'}</pre>`}
                  </div>
                  ${attachmentsList.length > 0 ? `
                    <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 8px;">
                      <p style="margin: 0; font-size: 14px; color: #92400e;">
                        ⚠️ This email had ${attachmentsList.length} attachment(s). View them in the platform inbox.
                      </p>
                    </div>
                  ` : ''}
                </div>
              `,
              text: `
Copy of inbound email to: ${toAddress}
From: ${emailData.from}
Received: ${new Date(event.created_at).toLocaleString()}

---

${email.text || '(no content)'}

${attachmentsList.length > 0 ? `\n⚠️ This email had ${attachmentsList.length} attachment(s). View them in the platform inbox.` : ''}
              `.trim(),
            });
          }
          
          console.log(`Sent email copies to ${tenant.emailCopyRecipients.length} recipient(s) for tenant ${tenant.subdomain}`);
        } catch (copyError) {
          console.error('Failed to send email copies:', copyError);
          // Don't fail the whole webhook if copy fails
        }
      }
      
      res.json({ received: true, emailId: savedEmail.id });
    } catch (error) {
      console.error('Inbound email webhook error:', error);
      res.status(400).send(`Webhook Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  /**
   * GET /api/inbound-emails
   * List inbound emails for staff (admin, board_member, staff)
   */
  app.get('/api/inbound-emails', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { inboundEmails, animals, users } = await import('@shared/schema');
      const { status } = req.query;

      const conditions = [eq(inboundEmails.tenantId, req.tenant!.id)];
      
      if (status) {
        conditions.push(eq(inboundEmails.status, status as any));
      }

      const emails = await db
        .select({
          id: inboundEmails.id,
          from: inboundEmails.from,
          fromName: inboundEmails.fromName,
          to: inboundEmails.to,
          subject: inboundEmails.subject,
          textBody: inboundEmails.textBody,
          status: inboundEmails.status,
          linkedAnimalId: inboundEmails.linkedAnimalId,
          linkedDocumentId: inboundEmails.linkedDocumentId,
          processedBy: inboundEmails.processedBy,
          processedAt: inboundEmails.processedAt,
          receivedAt: inboundEmails.receivedAt,
          attachments: inboundEmails.attachments,
          linkedAnimal: animals,
          processor: users,
        })
        .from(inboundEmails)
        .leftJoin(animals, eq(inboundEmails.linkedAnimalId, animals.id))
        .leftJoin(users, eq(inboundEmails.processedBy, users.id))
        .where(and(...conditions))
        .orderBy(desc(inboundEmails.receivedAt));

      res.json({ emails });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/inbound-emails/unprocessed/count
   * Get count of unprocessed emails for badge notification
   * NOTE: Must be defined before the :id route to avoid route conflicts
   */
  app.get('/api/inbound-emails/unprocessed/count', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { inboundEmails } = await import('@shared/schema');

      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(inboundEmails)
        .where(and(
          eq(inboundEmails.tenantId, req.tenant!.id),
          eq(inboundEmails.status, 'unprocessed')
        ));

      res.json({ count: result[0]?.count || 0 });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/inbound-emails/counts
   * Get counts of emails by status for badge notifications
   * NOTE: Must be defined before the :id route to avoid route conflicts
   */
  app.get('/api/inbound-emails/counts', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { inboundEmails } = await import('@shared/schema');

      const result = await db
        .select({ 
          status: inboundEmails.status,
          count: sql<number>`count(*)::int` 
        })
        .from(inboundEmails)
        .where(eq(inboundEmails.tenantId, req.tenant!.id))
        .groupBy(inboundEmails.status);

      const counts = {
        unprocessed: 0,
        processed: 0,
        archived: 0,
      };
      
      for (const row of result) {
        if (row.status in counts) {
          counts[row.status as keyof typeof counts] = row.count;
        }
      }

      res.json(counts);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/inbound-emails/:id
   * Get specific inbound email with full content
   */
  app.get('/api/inbound-emails/:id', requireTenant, requireAuth, async (req, res, next) => {
    try {
      // Validate UUID to prevent database errors
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid email ID format' });
      }
      
      const { inboundEmails, animals, documents, users } = await import('@shared/schema');

      const [email] = await db
        .select({
          id: inboundEmails.id,
          from: inboundEmails.from,
          fromName: inboundEmails.fromName,
          to: inboundEmails.to,
          subject: inboundEmails.subject,
          textBody: inboundEmails.textBody,
          htmlBody: inboundEmails.htmlBody,
          attachments: inboundEmails.attachments,
          status: inboundEmails.status,
          linkedAnimalId: inboundEmails.linkedAnimalId,
          linkedDocumentId: inboundEmails.linkedDocumentId,
          processedBy: inboundEmails.processedBy,
          processedAt: inboundEmails.processedAt,
          notes: inboundEmails.notes,
          receivedAt: inboundEmails.receivedAt,
          linkedAnimal: animals,
          linkedDocument: documents,
          processor: users,
        })
        .from(inboundEmails)
        .leftJoin(animals, eq(inboundEmails.linkedAnimalId, animals.id))
        .leftJoin(documents, eq(inboundEmails.linkedDocumentId, documents.id))
        .leftJoin(users, eq(inboundEmails.processedBy, users.id))
        .where(and(
          eq(inboundEmails.id, req.params.id),
          eq(inboundEmails.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!email) {
        return res.status(404).json({ error: 'Email not found' });
      }

      res.json({ email });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/inbound-emails/:id
   * Update inbound email (mark processed, add notes, link to animal/document)
   */
  app.patch('/api/inbound-emails/:id', requireTenant, requireAuth, async (req, res, next) => {
    try {
      // Validate UUID to prevent database errors
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: 'Invalid email ID format' });
      }
      
      const { inboundEmails } = await import('@shared/schema');

      const updateSchema = z.object({
        status: z.enum(['unprocessed', 'processed', 'archived']).optional(),
        notes: z.string().optional(),
        linkedAnimalId: z.string().uuid().nullable().optional(),
        linkedDocumentId: z.string().uuid().nullable().optional(),
      });

      const data = updateSchema.parse(req.body);

      const updateData: any = {};
      if (data.status) updateData.status = data.status;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.linkedAnimalId !== undefined) updateData.linkedAnimalId = data.linkedAnimalId;
      if (data.linkedDocumentId !== undefined) updateData.linkedDocumentId = data.linkedDocumentId;

      // If marking as processed, record who processed it
      if (data.status === 'processed') {
        updateData.processedBy = req.user!.id;
        updateData.processedAt = new Date();
      }

      const [updated] = await db
        .update(inboundEmails)
        .set(updateData)
        .where(and(
          eq(inboundEmails.id, req.params.id),
          eq(inboundEmails.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Email not found' });
      }

      res.json({ email: updated });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Email & Newsletter Routes
  // ============================================================================

  /**
   * GET /api/adopters/count
   * Get count of unique adopters with email addresses (for email campaigns)
   */
  app.get('/api/adopters/count', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { adoptions } = await import('@shared/schema');
      
      // Count unique adopter emails
      const result = await db
        .selectDistinct({ email: adoptions.adopterEmail })
        .from(adoptions)
        .where(eq(adoptions.tenantId, req.tenant!.id));
      
      res.json({ count: result.length });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/email-templates
   * Get available email newsletter templates
   */
  app.get('/api/email-templates', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { EMAIL_TEMPLATES } = await import('./lib/email-templates');
      
      // Return template metadata (without HTML)
      const templates = EMAIL_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        variables: t.variables,
      }));

      res.json({ templates });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/emails/sender-info
   * Get the current email sender configuration for the tenant
   */
  app.get('/api/emails/sender-info', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const [tenant] = await db
        .select({
          name: tenants.name,
          resendFromEmail: tenants.resendFromEmail,
          resendFromName: tenants.resendFromName,
          resendEnabled: tenants.resendEnabled,
        })
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Check for Google Workspace Gmail integration first
      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'google_workspace'),
          eq(platformIntegrations.isEnabled, true)
        ))
        .limit(1);

      if (integration?.googleFeatures?.useGmail) {
        // Get saved sender addresses
        const senderAddresses = integration.googleFeatures.senderAddresses || [];
        
        // Get default sender - first try senderAddresses default, then fall back to legacy fields
        const defaultAddress = senderAddresses.find(a => a.isDefault);
        const senderEmail = defaultAddress?.email || 
                           integration.googleFeatures.senderEmail || 
                           integration.googleFeatures.connectedEmail;
        const senderName = defaultAddress?.name ||
                          integration.googleFeatures.senderName || 
                          tenant.resendFromName || 
                          tenant.name;
        
        if (senderEmail) {
          return res.json({
            provider: 'gmail',
            senderName,
            senderEmail,
            senderAddresses,
          });
        }
      }

      // Check if tenant has their own Resend configured
      if (tenant.resendEnabled) {
        return res.json({
          provider: 'resend',
          senderName: tenant.resendFromName || tenant.name,
          senderEmail: tenant.resendFromEmail || 'noreply@example.com',
        });
      }

      // Fall back to platform defaults
      return res.json({
        provider: 'platform',
        senderName: tenant.resendFromName || tenant.name,
        senderEmail: tenant.resendFromEmail || 'noreply@irescue.life',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/emails/send
   * Send email campaign to selected audiences (admin only)
   * Supports both template-based and custom HTML emails
   */
  app.post('/api/emails/send', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { EmailService } = await import('./lib/email-service');
      const { users, donors, newsletterSubscribers, adoptions } = await import('@shared/schema');
      
      const sendSchema = z.object({
        subject: z.string().min(1),
        recipientTypes: z.array(z.enum(['team', 'donors', 'newsletter', 'adopters', 'custom'])).optional(),
        customEmails: z.array(z.string().email()).optional(),
        // Template-based email
        templateId: z.string().optional(),
        templateVariables: z.record(z.string()).optional(),
        // OR custom HTML
        htmlBody: z.string().optional(),
        // Optional sender override (from saved addresses)
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
      });

      const data = sendSchema.parse(req.body);
      
      // Get email service for this tenant
      const emailService = await EmailService.forTenant(req.tenant!.id);
      if (!emailService) {
        return res.status(400).json({ 
          error: 'Email service not configured. Please add your Resend API key in Settings.' 
        });
      }

      // Collect recipient email addresses using Set for case-insensitive deduplication
      // This prevents counting "Test@example.com" and "test@example.com" as separate recipients
      const recipientSet = new Set<string>();

      // Custom emails (normalize to lowercase)
      if (data.customEmails) {
        data.customEmails.forEach(email => {
          recipientSet.add(email.toLowerCase().trim());
        });
      }

      // Team members
      if (data.recipientTypes?.includes('team')) {
        const teamMembers = await db
          .select({ email: users.email })
          .from(users)
          .where(
            and(
              eq(users.tenantId, req.tenant!.id),
              eq(users.isActive, true)
            )
          );

        teamMembers.forEach(member => {
          recipientSet.add(member.email.toLowerCase().trim());
        });
      }

      // Donors
      if (data.recipientTypes?.includes('donors')) {
        const donorList = await db
          .select({ email: donors.email })
          .from(donors)
          .where(eq(donors.tenantId, req.tenant!.id))
          .groupBy(donors.email);

        donorList.forEach(donor => {
          recipientSet.add(donor.email.toLowerCase().trim());
        });
      }

      // Newsletter subscribers
      if (data.recipientTypes?.includes('newsletter')) {
        const subscribers = await db
          .select({ email: newsletterSubscribers.email })
          .from(newsletterSubscribers)
          .where(
            and(
              eq(newsletterSubscribers.tenantId, req.tenant!.id),
              eq(newsletterSubscribers.status, 'active')
            )
          );

        subscribers.forEach(sub => {
          recipientSet.add(sub.email.toLowerCase().trim());
        });
      }

      // Adopters (people who have completed adoptions)
      if (data.recipientTypes?.includes('adopters')) {
        const adopterList = await db
          .select({ email: adoptions.adopterEmail })
          .from(adoptions)
          .where(eq(adoptions.tenantId, req.tenant!.id))
          .groupBy(adoptions.adopterEmail);

        adopterList.forEach(adopter => {
          if (adopter.email) {
            recipientSet.add(adopter.email.toLowerCase().trim());
          }
        });
      }

      // Convert Set to array for sending
      const recipientEmails = Array.from(recipientSet);

      if (recipientEmails.length === 0) {
        return res.status(400).json({ error: 'No recipients selected' });
      }

      // Prepare email HTML
      let emailHtml: string;

      if (data.templateId && data.templateVariables) {
        // Use template
        const { getTemplateById, replaceTemplateVariables } = await import('./lib/email-templates');
        const template = getTemplateById(data.templateId);
        
        if (!template) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        emailHtml = replaceTemplateVariables(template.html, data.templateVariables);
      } else if (data.htmlBody) {
        // Use custom HTML
        emailHtml = data.htmlBody;
      } else {
        return res.status(400).json({ error: 'Either templateId or htmlBody must be provided' });
      }

      // Send emails with optional sender override
      const result = await emailService.sendBulk({
        recipients: recipientEmails,
        subject: data.subject,
        html: emailHtml,
        fromName: data.fromName,
        fromEmail: data.fromEmail,
      });

      res.json({ 
        success: true,
        sent: result.successful,
        failed: result.failed,
        total: result.total,
        errors: result.errors,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/newsletter/subscribe
   * Public newsletter subscription
   */
  app.post('/api/newsletter/subscribe', requireTenant, async (req, res, next) => {
    try {
      const { newsletterSubscribers, insertNewsletterSubscriberSchema } = await import('@shared/schema');
      const crypto = await import('crypto');
      
      const subscribeSchema = z.object({
        email: z.string().email(),
        name: z.string().optional(),
        source: z.enum(['website', 'donation', 'application', 'manual']).optional(),
      });

      const data = subscribeSchema.parse(req.body);

      // Check if already subscribed
      const existing = await db
        .select()
        .from(newsletterSubscribers)
        .where(
          and(
            eq(newsletterSubscribers.tenantId, req.tenant!.id),
            eq(newsletterSubscribers.email, data.email)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        if (existing[0].status === 'active') {
          return res.status(400).json({ error: 'Already subscribed to newsletter' });
        } else {
          // Reactivate subscription
          await db
            .update(newsletterSubscribers)
            .set({ 
              status: 'active',
              subscribedAt: new Date(),
              unsubscribedAt: null,
            })
            .where(eq(newsletterSubscribers.id, existing[0].id));

          return res.json({ success: true, message: 'Subscription reactivated' });
        }
      }

      // Create new subscription
      const unsubscribeToken = crypto.randomBytes(32).toString('hex');
      
      const subscriberData = insertNewsletterSubscriberSchema.parse({
        tenantId: req.tenant!.id,
        email: data.email,
        name: data.name,
        source: data.source || 'website',
        status: 'active',
        unsubscribeToken,
      });

      await db
        .insert(newsletterSubscribers)
        .values([subscriberData as any]);

      res.json({ success: true, message: 'Successfully subscribed to newsletter' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/newsletter/unsubscribe/:token
   * One-click unsubscribe from newsletter
   */
  app.get('/api/newsletter/unsubscribe/:token', async (req, res, next) => {
    try {
      const { newsletterSubscribers } = await import('@shared/schema');
      
      const [subscriber] = await db
        .select()
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.unsubscribeToken, req.params.token))
        .limit(1);

      if (!subscriber) {
        return res.status(404).send('<html><body><h1>Invalid unsubscribe link</h1></body></html>');
      }

      if (subscriber.status === 'unsubscribed') {
        return res.send('<html><body><h1>Already Unsubscribed</h1><p>You have already been unsubscribed from this newsletter.</p></body></html>');
      }

      await db
        .update(newsletterSubscribers)
        .set({ 
          status: 'unsubscribed',
          unsubscribedAt: new Date(),
        })
        .where(eq(newsletterSubscribers.id, subscriber.id));

      res.send('<html><body><h1>Successfully Unsubscribed</h1><p>You have been removed from the newsletter.</p></body></html>');
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/newsletter/subscribers
   * Get newsletter subscribers count and list (admin only)
   */
  app.get('/api/newsletter/subscribers', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { newsletterSubscribers } = await import('@shared/schema');
      
      const subscribers = await db
        .select({
          id: newsletterSubscribers.id,
          email: newsletterSubscribers.email,
          name: newsletterSubscribers.name,
          status: newsletterSubscribers.status,
          source: newsletterSubscribers.source,
          subscribedAt: newsletterSubscribers.subscribedAt,
        })
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.tenantId, req.tenant!.id))
        .orderBy(desc(newsletterSubscribers.subscribedAt));

      const activeCount = subscribers.filter(s => s.status === 'active').length;

      res.json({ 
        subscribers,
        activeCount,
        totalCount: subscribers.length,
      });
    } catch (error) {
      next(error);
    }
  });

  // ===========================
  // NEWSLETTER CAMPAIGNS (React Email)
  // ===========================

  /**
   * GET /api/newsletter/campaigns
   * List all newsletter campaigns for the tenant
   */
  app.get('/api/newsletter/campaigns', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { newsletterCampaigns } = await import('@shared/schema');
      
      const campaigns = await db
        .select()
        .from(newsletterCampaigns)
        .where(eq(newsletterCampaigns.tenantId, req.tenant!.id))
        .orderBy(desc(newsletterCampaigns.createdAt));

      res.json(campaigns);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/newsletter/campaigns/:id
   * Get a specific newsletter campaign
   */
  app.get('/api/newsletter/campaigns/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { newsletterCampaigns } = await import('@shared/schema');
      
      const [campaign] = await db
        .select()
        .from(newsletterCampaigns)
        .where(and(
          eq(newsletterCampaigns.id, req.params.id),
          eq(newsletterCampaigns.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      res.json(campaign);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/newsletter/campaigns
   * Create a new newsletter campaign
   */
  app.post('/api/newsletter/campaigns', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { newsletterCampaigns, insertNewsletterCampaignSchema } = await import('@shared/schema');
      
      const campaignData = insertNewsletterCampaignSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
        createdBy: req.user!.id,
        createdByName: req.user!.fullName,
      });

      const [campaign] = await db
        .insert(newsletterCampaigns)
        .values(campaignData)
        .returning();

      res.status(201).json(campaign);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/newsletter/campaigns/:id
   * Update a newsletter campaign
   */
  app.patch('/api/newsletter/campaigns/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { newsletterCampaigns } = await import('@shared/schema');
      
      const updateSchema = z.object({
        name: z.string().optional(),
        subject: z.string().optional(),
        previewText: z.string().optional(),
        templateType: z.enum(['new_arrivals', 'success_stories', 'urgent_needs', 'monthly_roundup', 'event_announcement', 'custom']).optional(),
        content: z.record(z.any()).optional(),
        status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'failed']).optional(),
        scheduledFor: z.string().datetime().nullable().optional(),
      });

      const updates = updateSchema.parse(req.body);
      
      // Build update object with proper scheduledFor handling
      const updateData: Record<string, any> = {
        ...updates,
        updatedAt: new Date(),
      };
      
      // Handle scheduledFor: null clears the date, string sets it, undefined leaves it unchanged
      if ('scheduledFor' in req.body) {
        updateData.scheduledFor = updates.scheduledFor ? new Date(updates.scheduledFor) : null;
      }

      const [campaign] = await db
        .update(newsletterCampaigns)
        .set(updateData)
        .where(and(
          eq(newsletterCampaigns.id, req.params.id),
          eq(newsletterCampaigns.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      res.json(campaign);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/newsletter/campaigns/:id
   * Delete a newsletter campaign
   */
  app.delete('/api/newsletter/campaigns/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { newsletterCampaigns } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(newsletterCampaigns)
        .where(and(
          eq(newsletterCampaigns.id, req.params.id),
          eq(newsletterCampaigns.tenantId, req.tenant!.id),
          // Only allow deleting drafts
          eq(newsletterCampaigns.status, 'draft')
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Campaign not found or cannot be deleted' });
      }

      res.json({ success: true, message: 'Campaign deleted' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/newsletter/campaigns/:id/preview
   * Generate a preview of the newsletter
   */
  app.post('/api/newsletter/campaigns/:id/preview', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { newsletterCampaigns, animals, happyTails } = await import('@shared/schema');
      const { renderNewsletterTemplate } = await import('./emails/newsletter-renderer');
      
      const [campaign] = await db
        .select()
        .from(newsletterCampaigns)
        .where(and(
          eq(newsletterCampaigns.id, req.params.id),
          eq(newsletterCampaigns.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Fetch animals if needed
      const allAnimals = await db
        .select()
        .from(animals)
        .where(eq(animals.tenantId, req.tenant!.id));

      // Fetch happy tails if needed
      const allHappyTails = await db
        .select()
        .from(happyTails)
        .where(eq(happyTails.tenantId, req.tenant!.id));

      // Determine base URL
      const baseUrl = req.tenant!.customDomain 
        ? `https://${req.tenant!.customDomain}`
        : `${req.protocol}://${req.get('host')}/${req.tenant!.subdomain}`;

      const { html } = await renderNewsletterTemplate({
        campaign,
        tenant: req.tenant!,
        animals: allAnimals,
        happyTails: allHappyTails,
        baseUrl,
        unsubscribeUrl: `${baseUrl}/unsubscribe?token=preview`,
      });

      res.json({ html });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/newsletter/campaigns/:id/send
   * Send the newsletter campaign to subscribers
   */
  app.post('/api/newsletter/campaigns/:id/send', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      // CRITICAL: Capture tenant data at handler start to prevent context loss during async operations
      const tenantId = req.tenant!.id;
      const tenantSubdomain = req.tenant!.subdomain;
      const tenantCustomDomain = req.tenant!.customDomain;
      const tenantData = { ...req.tenant! }; // Deep copy for template rendering
      
      console.log(`[Newsletter Send] ========================================`);
      console.log(`[Newsletter Send] Starting campaign send for tenant ${tenantId} (${tenantSubdomain})`);
      console.log(`[Newsletter Send] Campaign ID: ${req.params.id}`);
      console.log(`[Newsletter Send] Timestamp: ${new Date().toISOString()}`);
      console.log(`[Newsletter Send] Build version: ${BUILD_VERSION}`);
      
      // Import email utilities (schema tables imported at top level to avoid dynamic import issues)
      const { renderNewsletterTemplate } = await import('./emails/newsletter-renderer');
      const { EmailService, cleanSubjectLine, htmlToPlainText, generateUnsubscribeHeader } = await import('./lib/email-service');
      
      const [campaign] = await db
        .select()
        .from(newsletterCampaigns)
        .where(and(
          eq(newsletterCampaigns.id, req.params.id),
          eq(newsletterCampaigns.tenantId, tenantId)
        ))
        .limit(1);

      if (!campaign) {
        console.log(`[Newsletter Send] Campaign not found: ${req.params.id} for tenant ${tenantId}`);
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      console.log(`[Newsletter Send] Found campaign: ${campaign.name} (${campaign.id})`);

      if (campaign.status === 'sent') {
        return res.status(400).json({ error: 'Campaign already sent' });
      }

      // Update status to sending
      await db
        .update(newsletterCampaigns)
        .set({ status: 'sending', updatedAt: new Date() })
        .where(eq(newsletterCampaigns.id, campaign.id));

      // Get active subscribers - using captured tenantId
      console.log(`[Newsletter Send] Querying subscribers with tenantId: ${tenantId}, status: 'active'`);
      const subscribers = await db
        .select()
        .from(newsletterSubscribers)
        .where(and(
          eq(newsletterSubscribers.tenantId, tenantId),
          eq(newsletterSubscribers.status, 'active')
        ));
      
      console.log(`[Newsletter Send] Found ${subscribers.length} active subscribers for tenant ${tenantId}`);
      if (subscribers.length > 0) {
        console.log(`[Newsletter Send] Subscribers: ${subscribers.map(s => s.email).join(', ')}`);
      } else {
        console.log(`[Newsletter Send] ⚠️ NO SUBSCRIBERS FOUND - checking raw query...`);
        // Debug query to understand why no subscribers
        const allSubs = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.tenantId, tenantId));
        console.log(`[Newsletter Send] All subscribers for tenant (any status): ${allSubs.length}`);
        if (allSubs.length > 0) {
          console.log(`[Newsletter Send] Subscriber statuses: ${allSubs.map(s => `${s.email}:${s.status}`).join(', ')}`);
        }
      }

      if (subscribers.length === 0) {
        await db
          .update(newsletterCampaigns)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(newsletterCampaigns.id, campaign.id));
        console.log(`[Newsletter Send] ❌ Campaign failed - no active subscribers`);
        return res.status(400).json({ error: 'No active subscribers to send to' });
      }

      // Fetch required data using captured tenantId
      const allAnimals = await db
        .select()
        .from(animals)
        .where(eq(animals.tenantId, tenantId));

      const allHappyTails = await db
        .select()
        .from(happyTails)
        .where(eq(happyTails.tenantId, tenantId));

      // Determine base URL using captured tenant data
      const baseUrl = tenantCustomDomain 
        ? `https://${tenantCustomDomain}`
        : `${req.protocol}://${req.get('host')}/${tenantSubdomain}`;

      // Initialize email service using factory method with captured tenantId
      console.log(`[Newsletter Send] Creating email service for tenant ${tenantId}...`);
      const emailService = await EmailService.forTenant(tenantId);
      
      if (!emailService) {
        console.log(`[Newsletter Send] ❌ Email service creation failed for tenant ${tenantId}`);
        await db
          .update(newsletterCampaigns)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(newsletterCampaigns.id, campaign.id));
        return res.status(400).json({ 
          error: 'Email service not configured. Please configure Gmail via Google Workspace or Resend in Settings.' 
        });
      }
      console.log(`[Newsletter Send] ✅ Email service created successfully`);

      // CRITICAL: Check Gmail quota before sending (2,000/day limit for Workspace)
      const isUsingGmail = emailService.isUsingGmail();
      const delayMs = isUsingGmail ? 2000 : 200;
      const providerName = isUsingGmail ? 'Gmail Integration' : 'Resend';
      
      if (isUsingGmail) {
        const gmailQuota = await emailService.checkGmailQuota(subscribers.length);
        console.log(`[Newsletter Send] Gmail quota check: ${gmailQuota.used}/${EmailService.getDailyLimit()} used, ${gmailQuota.remaining} remaining, need ${subscribers.length}`);
        
        // Check if we would exceed the daily limit
        if (gmailQuota.wouldExceed) {
          // Reset campaign status to draft
          await db
            .update(newsletterCampaigns)
            .set({ status: 'draft', updatedAt: new Date() })
            .where(eq(newsletterCampaigns.id, campaign.id));
          
          console.log(`[Newsletter Send] ⚠️ Gmail daily limit would be exceeded`);
          return res.status(429).json({ 
            error: 'Gmail daily sending limit would be exceeded',
            gmailQuota: {
              used: gmailQuota.used,
              remaining: gmailQuota.remaining,
              limit: EmailService.getDailyLimit(),
              requested: subscribers.length,
              batchRecommended: EmailService.shouldBatchCampaign(subscribers.length),
              batchThreshold: EmailService.getBatchThreshold()
            },
            message: `You've sent ${gmailQuota.used} emails in the last 24 hours. Gmail allows ${EmailService.getDailyLimit()} per day. You need to send ${subscribers.length} emails but only have ${gmailQuota.remaining} quota remaining. Consider scheduling this campaign in batches or waiting until your quota resets.`
          });
        }
        
        // Warn if approaching limit (>80% used)
        const usagePercent = (gmailQuota.used / EmailService.getDailyLimit()) * 100;
        if (usagePercent > 80) {
          console.log(`[Newsletter Send] ⚠️ Gmail quota at ${usagePercent.toFixed(1)}% - approaching daily limit`);
        }
        
        // Recommend batching for large campaigns
        if (EmailService.shouldBatchCampaign(subscribers.length)) {
          console.log(`[Newsletter Send] ℹ️ Large campaign (${subscribers.length} recipients) - batch scheduling recommended`);
        }
      }

      let successCount = 0;
      let errorCount = 0;

      // CRITICAL (Anti-Spam): Use 2-second delay for Gmail API to avoid 429 rate limit errors
      // Gmail has a rate limit of ~1 request/sec; exceeding this triggers spam flags

      // Send to each subscriber with personalized unsubscribe link
      console.log(`[Newsletter] Starting to send to ${subscribers.length} subscribers via ${providerName} (delay: ${delayMs}ms per email)`);
      
      for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];
        try {
          const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe/${subscriber.unsubscribeToken}`;
          
          const { html, text } = await renderNewsletterTemplate({
            campaign,
            tenant: tenantData,  // Use captured tenant data
            animals: allAnimals,
            happyTails: allHappyTails,
            baseUrl,
            unsubscribeUrl,
          });

          const unsubscribeHeader = generateUnsubscribeHeader(subscriber.email, tenantSubdomain);
          
          console.log(`[Newsletter] [${i + 1}/${subscribers.length}] Sending to ${subscriber.email} via ${providerName}...`);
          
          const result = await emailService.send({
            to: subscriber.email,
            subject: cleanSubjectLine(campaign.subject),
            html,
            text,
            headers: {
              'List-Unsubscribe': unsubscribeHeader,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });
          
          if (result.success) {
            console.log(`[Newsletter] ✅ Sent via ${providerName} to ${subscriber.email}, messageId: ${result.messageId}`);
            successCount++;
          } else {
            console.error(`[Newsletter] ❌ Failed to send to ${subscriber.email}: ${result.error}`);
            errorCount++;
          }

          // Rate limit delay between emails - CRITICAL for Gmail to avoid 429 errors
          // Only delay if there are more emails to send
          if (i < subscribers.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          console.error(`[Newsletter] ❌ Exception sending to ${subscriber.email}:`, error);
          errorCount++;
        }
      }
      
      console.log(`[Newsletter] Campaign ${campaign.id} complete: ${successCount} success, ${errorCount} errors`);

      // Update campaign with final status
      await db
        .update(newsletterCampaigns)
        .set({
          status: errorCount === subscribers.length ? 'failed' : 'sent',
          sentAt: new Date(),
          recipientCount: successCount,
          updatedAt: new Date(),
        })
        .where(eq(newsletterCampaigns.id, campaign.id));
      
      // Create audit log for newsletter send
      const { createAuditLog } = await import('./audit');
      await createAuditLog({
        userId: req.user!.id,
        tenantId: tenantId,  // Use captured tenantId
        action: 'newsletter.send',
        entityType: 'newsletter_campaign',
        entityId: campaign.id,
        metadata: {
          campaignName: campaign.name,
          successCount,
          errorCount,
          totalSubscribers: subscribers.length,
        },
        req,
      });

      res.json({
        success: true,
        message: `Newsletter sent to ${successCount} subscribers`,
        successCount,
        errorCount,
        totalSubscribers: subscribers.length,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/newsletter/gmail-quota
   * Get Gmail sending quota information for the tenant
   * Returns: used, remaining, limit, and batch recommendations
   */
  app.get('/api/newsletter/gmail-quota', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { EmailService } = await import('./lib/email-service');
      
      // Check if Gmail is configured for this tenant
      const emailService = await EmailService.forTenant(req.tenant!.id);
      
      if (!emailService || !emailService.isUsingGmail()) {
        return res.json({
          gmailEnabled: false,
          message: 'Gmail integration is not enabled for this tenant. Using Resend for email delivery.'
        });
      }
      
      // Get Gmail quota
      const quota = await EmailService.getGmailRemainingQuota(req.tenant!.id);
      const usagePercent = (quota.used / quota.limit) * 100;
      
      res.json({
        gmailEnabled: true,
        used: quota.used,
        remaining: quota.remaining,
        limit: quota.limit,
        usagePercent: usagePercent.toFixed(1),
        batchThreshold: EmailService.getBatchThreshold(),
        warning: usagePercent > 80 ? `You've used ${usagePercent.toFixed(1)}% of your daily Gmail limit. Consider spacing out email sends.` : null,
        message: `Gmail: ${quota.used}/${quota.limit} emails sent in last 24 hours (${quota.remaining} remaining)`
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/newsletter/templates
   * Get available newsletter template types
   */
  app.get('/api/newsletter/templates', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { templateInfo } = await import('./emails/templates');
      res.json(templateInfo);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/newsletter/templates/:type/preview
   * Get a preview of a template type with mock data
   */
  app.post('/api/newsletter/templates/:type/preview', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { renderPreview } = await import('./emails/newsletter-renderer');
      const templateType = req.params.type as any;

      const validTypes = ['new_arrivals', 'success_stories', 'urgent_needs', 'monthly_roundup', 'event_announcement'];
      if (!validTypes.includes(templateType)) {
        return res.status(400).json({ error: 'Invalid template type' });
      }

      const baseUrl = req.tenant!.customDomain 
        ? `https://${req.tenant!.customDomain}`
        : `${req.protocol}://${req.get('host')}/${req.tenant!.subdomain}`;

      const html = await renderPreview(templateType, req.tenant!, baseUrl);
      res.json({ html });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/newsletter/campaigns/:id/schedule-batches
   * Schedule a large campaign to be sent in daily batches (for campaigns >500 recipients)
   * This respects Gmail's 2,000/day limit by splitting across multiple days
   */
  app.post('/api/newsletter/campaigns/:id/schedule-batches', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { EmailService } = await import('./lib/email-service');
      const { createBatchSchedule } = await import('./lib/newsletter-batch-processor');
      
      const tenantId = req.tenant!.id;
      
      const [campaign] = await db
        .select()
        .from(newsletterCampaigns)
        .where(and(
          eq(newsletterCampaigns.id, req.params.id),
          eq(newsletterCampaigns.tenantId, tenantId)
        ))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      if (campaign.status !== 'draft') {
        return res.status(400).json({ error: 'Can only schedule campaigns in draft status' });
      }

      const subscribers = await db
        .select({ id: newsletterSubscribers.id })
        .from(newsletterSubscribers)
        .where(and(
          eq(newsletterSubscribers.tenantId, tenantId),
          eq(newsletterSubscribers.status, 'active')
        ));

      if (subscribers.length === 0) {
        return res.status(400).json({ error: 'No active subscribers to send to' });
      }

      const subscriberIds = subscribers.map(s => s.id);
      const batchSize = req.body.batchSize || EmailService.getBatchThreshold();
      
      const result = await createBatchSchedule(
        campaign.id,
        tenantId,
        subscriberIds,
        batchSize
      );

      const { createAuditLog } = await import('./audit');
      await createAuditLog({
        userId: req.user!.id,
        tenantId,
        action: 'newsletter.schedule_batches',
        entityType: 'newsletter_campaign',
        entityId: campaign.id,
        metadata: {
          campaignName: campaign.name,
          subscriberCount: subscriberIds.length,
          batchCount: result.batchCount,
          scheduledDates: result.scheduledFor.map(d => d.toISOString()),
        },
        req,
      });

      res.json({
        success: true,
        message: `Campaign scheduled in ${result.batchCount} batches`,
        batchCount: result.batchCount,
        subscriberCount: subscriberIds.length,
        scheduledFor: result.scheduledFor,
        batchSize,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/admin/reset-email-quotas
   * Reset monthly email quotas for all tenants (platform admin only)
   * This should be called by a scheduled job at the beginning of each month
   */
  app.post('/api/admin/reset-email-quotas', requireAuth, async (req, res, next) => {
    try {
      // Only platform admins can reset quotas
      if (!req.user?.roles.includes('platform_admin')) {
        return res.status(403).json({ error: 'Platform admin access required' });
      }

      // Reset all tenants' email quotas
      const result = await db
        .update(tenants)
        .set({
          emailsSentThisMonth: 0,
          lastEmailQuotaReset: new Date(),
        })
        .returning({ id: tenants.id, name: tenants.name });

      res.json({
        success: true,
        message: `Reset email quotas for ${result.length} tenants`,
        resetCount: result.length,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/admin/tenants/:id/subscription
   * Update tenant subscription tier and adjust email quota (platform admin only)
   */
  app.patch('/api/admin/tenants/:id/subscription', requireAuth, async (req, res, next) => {
    try {
      // Only platform admins can update subscriptions
      if (!req.user?.roles.includes('platform_admin')) {
        return res.status(403).json({ error: 'Platform admin access required' });
      }

      const updateSchema = z.object({
        subscriptionTier: z.enum(['free', 'professional']),
        subscriptionStatus: z.enum(['pending', 'active', 'trial', 'cancelled', 'suspended']).optional(),
      });

      const data = updateSchema.parse(req.body);

      // Calculate new quota based on tier
      const newQuota = getEmailQuotaForTier(data.subscriptionTier);

      const updateData: any = {
        subscriptionTier: data.subscriptionTier,
        emailQuotaLimit: newQuota,
      };

      if (data.subscriptionStatus) {
        updateData.subscriptionStatus = data.subscriptionStatus;
      }

      const [updated] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      res.json({
        success: true,
        tenant: updated,
        message: `Updated subscription to ${data.subscriptionTier} tier with ${newQuota} emails/month`,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/admin/tenants/:id/custom-domain
   * Verify or revoke custom domain verification (platform admin only)
   * This is used after Replit has verified the domain in deployment settings
   */
  app.patch('/api/admin/tenants/:id/custom-domain', requireAuth, async (req, res, next) => {
    try {
      // Only platform admins can verify/revoke custom domains
      if (!req.user?.roles.includes('platform_admin')) {
        return res.status(403).json({ error: 'Platform admin access required' });
      }

      const updateSchema = z.object({
        verified: z.boolean(),
      });

      const { verified } = updateSchema.parse(req.body);

      // Get the tenant first to check if they have a custom domain
      const [tenant] = await db
        .select({
          id: tenants.id,
          subdomain: tenants.subdomain,
          name: tenants.name,
          customDomain: tenants.customDomain,
        })
        .from(tenants)
        .where(eq(tenants.id, req.params.id))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      if (!tenant.customDomain) {
        return res.status(400).json({ 
          error: 'No custom domain configured',
          message: 'This tenant does not have a custom domain configured'
        });
      }

      // Update the verification status
      const [updated] = await db
        .update(tenants)
        .set({ 
          customDomainVerified: verified,
        })
        .where(eq(tenants.id, req.params.id))
        .returning({
          id: tenants.id,
          subdomain: tenants.subdomain,
          name: tenants.name,
          customDomain: tenants.customDomain,
          customDomainVerified: tenants.customDomainVerified,
        });

      console.log(`[CUSTOM DOMAIN] Platform admin ${req.user.email} ${verified ? 'verified' : 'revoked'} custom domain ${tenant.customDomain} for tenant ${tenant.subdomain}`);

      res.json({
        success: true,
        tenant: updated,
        message: verified 
          ? `Custom domain ${tenant.customDomain} has been verified. Users can now access the site via this domain.`
          : `Custom domain verification has been revoked. Users will need to use the subdomain URL.`,
      });
    } catch (error) {
      next(error);
    }
  });

  // Alternative payments route removed - Stripe is the sole payment processor

  /**
   * POST /api/admin/fix-animal-photo-acls
   * Clear ACL metadata from animal photos so they default to public read
   * This fixes social media sharing for photos that were uploaded with ACL metadata
   */
  app.post('/api/admin/fix-animal-photo-acls', requireAuth, async (req, res, next) => {
    try {
      // Only platform admins can run this fix
      if (!req.user?.roles.includes('platform_admin')) {
        return res.status(403).json({ error: 'Platform admin access required' });
      }

      const { animals } = await import('@shared/schema');
      const { clearObjectAclPolicy, getObjectAclPolicy } = await import('./objectAcl');
      const { ObjectStorageService } = await import('./objectStorage');
      
      const objectStorage = new ObjectStorageService();
      
      // Get all animals with photos
      const allAnimals = await db
        .select({
          id: animals.id,
          name: animals.name,
          photoUrls: animals.photoUrls,
          tenantId: animals.tenantId,
        })
        .from(animals);
      
      let fixed = 0;
      let skipped = 0;
      let errors: string[] = [];
      
      for (const animal of allAnimals) {
        if (!animal.photoUrls || animal.photoUrls.length === 0) continue;
        
        for (const photoUrl of animal.photoUrls) {
          try {
            // Only process new-format URLs with tenant ID
            if (!photoUrl.includes('/animal-photos/')) {
              skipped++;
              continue;
            }
            
            const file = await objectStorage.getObjectEntityFile(photoUrl);
            const aclPolicy = await getObjectAclPolicy(file);
            
            // If file has ACL metadata, clear it
            if (aclPolicy) {
              await clearObjectAclPolicy(file);
              fixed++;
              console.log(`[FIX-ACL] Cleared ACL from: ${photoUrl}`);
            } else {
              skipped++;
            }
          } catch (error: any) {
            errors.push(`${animal.name} (${photoUrl}): ${error.message}`);
          }
        }
      }
      
      console.log(`[FIX-ACL] Complete: fixed=${fixed}, skipped=${skipped}, errors=${errors.length}`);
      
      res.json({
        success: true,
        fixed,
        skipped,
        errors: errors.slice(0, 10), // Return first 10 errors only
        message: `Fixed ${fixed} photos, skipped ${skipped} (no ACL or old format)`,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * ===========================
   * CALENDAR ROUTES
   * ===========================
   */

  /**
   * GET /api/calendars
   * Get all calendars for the tenant
   */
  app.get('/api/calendars', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { calendars, calendarPermissions, calendarRolePermissions } = await import('@shared/schema');
      
      // Get all calendars for this tenant
      const allCalendars = await db
        .select()
        .from(calendars)
        .where(eq(calendars.tenantId, req.tenant!.id))
        .orderBy(calendars.createdAt);

      // For non-admins, check both user and role permissions
      if (req.user!.activeRole !== 'admin') {
        // Get user-specific permissions with all capability flags
        const userPermissions = await db
          .select({
            calendarId: calendarPermissions.calendarId,
            canEdit: calendarPermissions.canEdit,
            canAdd: calendarPermissions.canAdd,
            canDelete: calendarPermissions.canDelete,
            canAssignOthers: calendarPermissions.canAssignOthers,
          })
          .from(calendarPermissions)
          .where(and(
            eq(calendarPermissions.userId, req.user!.id),
            eq(calendarPermissions.tenantId, req.tenant!.id)
          ));
        
        // Get role-based permissions for all user's roles with all capability flags
        const rolePermissions = await db
          .select({
            calendarId: calendarRolePermissions.calendarId,
            canEdit: calendarRolePermissions.canEdit,
            canAdd: calendarRolePermissions.canAdd,
            canDelete: calendarRolePermissions.canDelete,
            canAssignOthers: calendarRolePermissions.canAssignOthers,
          })
          .from(calendarRolePermissions)
          .where(and(
            eq(calendarRolePermissions.tenantId, req.tenant!.id),
            sql`${calendarRolePermissions.role} = ANY(${sql.raw(`ARRAY[${req.user!.roles.map(r => `'${r}'`).join(',')}]::text[]`)})`
          ));
        
        // Build permission map - merge user and role permissions (user permissions take precedence, then OR with role permissions)
        const permissionMap = new Map<string, { canEdit: boolean; canAdd: boolean; canDelete: boolean; canAssignOthers: boolean }>();
        
        // First add role permissions
        for (const perm of rolePermissions) {
          const existing = permissionMap.get(perm.calendarId);
          if (existing) {
            permissionMap.set(perm.calendarId, {
              canEdit: existing.canEdit || perm.canEdit,
              canAdd: existing.canAdd || perm.canAdd,
              canDelete: existing.canDelete || perm.canDelete,
              canAssignOthers: existing.canAssignOthers || perm.canAssignOthers,
            });
          } else {
            permissionMap.set(perm.calendarId, {
              canEdit: perm.canEdit,
              canAdd: perm.canAdd,
              canDelete: perm.canDelete,
              canAssignOthers: perm.canAssignOthers,
            });
          }
        }
        
        // Then add/merge user-specific permissions (these override/supplement role permissions)
        for (const perm of userPermissions) {
          const existing = permissionMap.get(perm.calendarId);
          if (existing) {
            permissionMap.set(perm.calendarId, {
              canEdit: existing.canEdit || perm.canEdit,
              canAdd: existing.canAdd || perm.canAdd,
              canDelete: existing.canDelete || perm.canDelete,
              canAssignOthers: existing.canAssignOthers || perm.canAssignOthers,
            });
          } else {
            permissionMap.set(perm.calendarId, {
              canEdit: perm.canEdit,
              canAdd: perm.canAdd,
              canDelete: perm.canDelete,
              canAssignOthers: perm.canAssignOthers,
            });
          }
        }
        
        // Return calendars with granular permission info
        const calendarsWithPermissions = allCalendars.map(cal => {
          const perms = permissionMap.get(cal.id);
          return {
            ...cal,
            canEdit: perms?.canEdit ?? false,
            canAdd: perms?.canAdd ?? false,
            canDelete: perms?.canDelete ?? false,
            canAssignOthers: perms?.canAssignOthers ?? false,
          };
        });
        
        return res.json({ calendars: calendarsWithPermissions });
      }

      // Admins can do everything on all calendars
      const calendarsWithPermissions = allCalendars.map(cal => ({
        ...cal,
        canEdit: true,
        canAdd: true,
        canDelete: true,
        canAssignOthers: true,
      }));

      res.json({ calendars: calendarsWithPermissions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/calendars
   * Create new calendar (admin only)
   * If calendar sync is enabled, also creates a corresponding Google Calendar
   */
  app.post('/api/calendars', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendars, platformIntegrations } = await import('@shared/schema');
      
      const createSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['volunteer', 'events', 'fundraising', 'vet_appointments', 'custom']),
        color: z.string().default('#3b82f6'),
        isActive: z.boolean().default(true),
        isPublic: z.boolean().default(false),
      });
      
      const calendarData = createSchema.parse(req.body);
      
      // Check if calendar sync is enabled for this tenant
      let googleCalendarId: string | undefined;
      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'google_workspace'),
          eq(platformIntegrations.isEnabled, true)
        ))
        .limit(1);
      
      if (integration?.googleFeatures?.syncCalendar === true) {
        try {
          const { CalendarService } = await import('./lib/googleWorkspace');
          const calendarService = await CalendarService.forTenant(req.tenant!.id);
          
          if (calendarService) {
            const result = await calendarService.createCalendar({
              summary: `${calendarData.name} (${req.tenant!.name})`,
              description: calendarData.description || `Calendar synced from iRescue.life`,
              color: calendarData.color,
            });
            
            if (result.success && result.calendarId) {
              googleCalendarId = result.calendarId;
              console.log(`Created Google Calendar ${result.calendarId} for iRescue calendar "${calendarData.name}"`);
            } else {
              console.error('Failed to create Google Calendar:', result.error);
            }
          }
        } catch (syncError) {
          console.error('Error syncing calendar to Google:', syncError);
        }
      }
      
      const [newCalendar] = await db
        .insert(calendars)
        .values({
          ...calendarData,
          tenantId: req.tenant!.id,
          googleCalendarId,
        })
        .returning();

      res.json({ success: true, calendar: newCalendar });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/calendars/:id
   * Update calendar (admin only)
   * If calendar is synced to Google, also updates the Google Calendar
   */
  app.patch('/api/calendars/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendars } = await import('@shared/schema');
      
      const fieldSettingSchema = z.object({
        visible: z.boolean().optional(),
        required: z.boolean().optional(),
        label: z.string().optional(),
      }).optional();

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        type: z.enum(['volunteer', 'events', 'fundraising', 'vet_appointments', 'custom']).optional(),
        color: z.string().optional(),
        isActive: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        themeSettings: z.object({
          headerColor: z.string().optional(),
          headerTextColor: z.string().optional(),
          accentColor: z.string().optional(),
          headerBackgroundImageUrl: z.string().optional(),
        }).nullish(),
        eventFormSettings: z.object({
          simplifiedVolunteerMode: z.boolean().optional(),
          title: fieldSettingSchema,
          description: fieldSettingSchema,
          location: fieldSettingSchema,
          meetLink: fieldSettingSchema,
          customPage: fieldSettingSchema,
        }).nullish(),
      });

      const data = updateSchema.parse(req.body);

      const [updatedCalendar] = await db
        .update(calendars)
        .set(data)
        .where(and(
          eq(calendars.id, req.params.id),
          eq(calendars.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!updatedCalendar) {
        return res.status(404).json({ error: 'Calendar not found' });
      }

      // If calendar is synced to Google, update the Google Calendar too
      if (updatedCalendar.googleCalendarId && (data.name || data.description)) {
        try {
          const { CalendarService } = await import('./lib/googleWorkspace');
          const calendarService = await CalendarService.forTenant(req.tenant!.id);
          
          if (calendarService) {
            await calendarService.updateCalendar(updatedCalendar.googleCalendarId, {
              summary: data.name ? `${data.name} (${req.tenant!.name})` : undefined,
              description: data.description,
            });
          }
        } catch (syncError) {
          console.error('Failed to sync calendar update to Google:', syncError);
        }
      }

      res.json({ success: true, calendar: updatedCalendar });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/calendars/:id
   * Delete calendar (admin only)
   * If calendar is synced to Google, also deletes the Google Calendar
   */
  app.delete('/api/calendars/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendars } = await import('@shared/schema');
      
      // Get the calendar first to check for Google sync
      const [existingCalendar] = await db
        .select()
        .from(calendars)
        .where(and(
          eq(calendars.id, req.params.id),
          eq(calendars.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingCalendar) {
        return res.status(404).json({ error: 'Calendar not found' });
      }

      // If calendar is synced to Google, delete the Google Calendar too
      if (existingCalendar.googleCalendarId) {
        try {
          const { CalendarService } = await import('./lib/googleWorkspace');
          const calendarService = await CalendarService.forTenant(req.tenant!.id);
          
          if (calendarService) {
            await calendarService.deleteCalendar(existingCalendar.googleCalendarId);
          }
        } catch (syncError) {
          console.error('Failed to delete Google Calendar:', syncError);
        }
      }
      
      await db
        .delete(calendars)
        .where(and(
          eq(calendars.id, req.params.id),
          eq(calendars.tenantId, req.tenant!.id)
        ));

      res.json({ success: true, message: 'Calendar deleted' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/calendars/:id/events
   * Get all events for a specific calendar
   */
  app.get('/api/calendars/:id/events', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { calendarEvents } = await import('@shared/schema');
      
      const events = await db
        .select()
        .from(calendarEvents)
        .where(and(
          eq(calendarEvents.calendarId, req.params.id),
          eq(calendarEvents.tenantId, req.tenant!.id)
        ))
        .orderBy(calendarEvents.startTime);

      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/events
   * Get all events across all calendars (with optional filtering)
   */
  app.get('/api/events', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { calendarEvents, calendars } = await import('@shared/schema');
      
      const { customPages } = await import('@shared/schema');
      
      const events = await db
        .select({
          id: calendarEvents.id,
          calendarId: calendarEvents.calendarId,
          tenantId: calendarEvents.tenantId,
          title: calendarEvents.title,
          description: calendarEvents.description,
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
          location: calendarEvents.location,
          customPageId: calendarEvents.customPageId,
          customPageSlug: customPages.slug,
          createdBy: calendarEvents.createdBy,
          createdAt: calendarEvents.createdAt,
          updatedAt: calendarEvents.updatedAt,
          calendarName: calendars.name,
          calendarColor: calendars.color,
          calendarType: calendars.type,
          virtualMeetingLink: calendarEvents.virtualMeetingLink,
          virtualMeetingProvider: calendarEvents.virtualMeetingProvider,
          syncStatus: calendarEvents.syncStatus,
          syncError: calendarEvents.syncError,
          googleEventId: calendarEvents.googleEventId,
          volunteerContactId: calendarEvents.volunteerContactId,
        })
        .from(calendarEvents)
        .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
        .leftJoin(customPages, eq(calendarEvents.customPageId, customPages.id))
        .where(eq(calendarEvents.tenantId, req.tenant!.id))
        .orderBy(calendarEvents.startTime);

      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/public-events
   * Get upcoming public events (no auth required) for homepage display
   * Only returns events from public calendars of type "events" or "fundraising"
   */
  app.get('/api/public-events', requireTenant, async (req, res, next) => {
    try {
      const { calendarEvents, calendars, customPages } = await import('@shared/schema');
      
      const now = new Date();
      
      const events = await db
        .select({
          id: calendarEvents.id,
          title: calendarEvents.title,
          description: calendarEvents.description,
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
          location: calendarEvents.location,
          customPageSlug: customPages.slug,
          calendarName: calendars.name,
          calendarColor: calendars.color,
          calendarType: calendars.type,
        })
        .from(calendarEvents)
        .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
        .leftJoin(customPages, eq(calendarEvents.customPageId, customPages.id))
        .where(and(
          eq(calendarEvents.tenantId, req.tenant!.id),
          eq(calendars.isPublic, true),
          eq(calendars.isActive, true),
          sql`${calendars.type} IN ('events', 'fundraising')`,
          sql`${calendarEvents.startTime} >= ${now.toISOString()}`
        ))
        .orderBy(calendarEvents.startTime)
        .limit(6);

      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/events/:id
   * Get a single event by ID (no auth required for public viewing)
   */
  app.get('/api/events/:id', requireTenant, async (req, res, next) => {
    try {
      const { calendarEvents, calendars, customPages } = await import('@shared/schema');
      
      const eventId = req.params.id;
      
      const events = await db
        .select({
          id: calendarEvents.id,
          title: calendarEvents.title,
          description: calendarEvents.description,
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
          location: calendarEvents.location,
          customPageSlug: customPages.slug,
          calendarName: calendars.name,
          calendarColor: calendars.color,
          calendarType: calendars.type,
        })
        .from(calendarEvents)
        .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
        .leftJoin(customPages, eq(calendarEvents.customPageId, customPages.id))
        .where(and(
          eq(calendarEvents.id, eventId),
          eq(calendarEvents.tenantId, req.tenant!.id),
          eq(calendars.isPublic, true),
          eq(calendars.isActive, true)
        ))
        .limit(1);

      if (events.length === 0) {
        return res.status(404).json({ 
          error: 'Event not found',
          message: 'The requested event does not exist or is not public.' 
        });
      }

      res.json({ event: events[0] });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/events
   * Create new event
   */
  app.post('/api/events', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { calendarEvents, calendars, calendarPermissions } = await import('@shared/schema');
      
      // Validate only the fields the frontend should provide
      const eventSchema = z.object({
        calendarId: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().optional(),
        startTime: z.string().transform(str => new Date(str)),
        endTime: z.string().transform(str => new Date(str)),
        location: z.string().optional(),
        customPageId: z.string().uuid().optional().or(z.literal("")),
        includeMeetLink: z.boolean().optional().default(false),
        volunteerContactId: z.string().uuid().optional().nullable(),
      });
      
      const validatedData = eventSchema.parse(req.body);
      
      // If Meet link is requested, verify Google Workspace is connected
      if (validatedData.includeMeetLink) {
        const { CalendarService } = await import('./lib/googleWorkspace');
        const calendarService = await CalendarService.forTenant(req.tenant!.id);
        
        if (!calendarService) {
          return res.status(400).json({ 
            error: 'Google Workspace not connected',
            message: 'To create events with Google Meet links, you must first connect your Google Workspace account in Settings > Integrations.'
          });
        }
      }
      
      // Prepare full event data with backend-controlled fields
      // Note: volunteerContactId is excluded because the schema references contacts table 
      // but frontend sends user IDs. This field should not be used for volunteer scheduling.
      const { volunteerContactId: _unused, ...validatedDataWithoutVolunteer } = validatedData;
      const eventData = {
        ...validatedDataWithoutVolunteer,
        customPageId: validatedData.customPageId && validatedData.customPageId !== "" ? validatedData.customPageId : null,
        tenantId: req.tenant!.id,
        createdBy: req.user!.id,
      };
      
      // Check if user has permission to create events in this calendar
      const [calendar] = await db
        .select()
        .from(calendars)
        .where(and(
          eq(calendars.id, eventData.calendarId),
          eq(calendars.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!calendar) {
        return res.status(404).json({ error: 'Calendar not found' });
      }

      // Admins can create events in any calendar
      if (req.user!.activeRole !== 'admin') {
        // Check if user has permission to add events (either user-specific or role-based)
        const { calendarRolePermissions } = await import('@shared/schema');
        
        // Check user-specific permission for adding events
        const [userPermission] = await db
          .select()
          .from(calendarPermissions)
          .where(and(
            eq(calendarPermissions.calendarId, eventData.calendarId),
            eq(calendarPermissions.userId, req.user!.id),
            eq(calendarPermissions.canAdd, true)
          ))
          .limit(1);

        // Check role-based permission for adding events
        const [rolePermission] = await db
          .select()
          .from(calendarRolePermissions)
          .where(and(
            eq(calendarRolePermissions.calendarId, eventData.calendarId),
            eq(calendarRolePermissions.tenantId, req.tenant!.id),
            eq(calendarRolePermissions.canAdd, true),
            sql`${calendarRolePermissions.role} = ANY(${sql.raw(`ARRAY[${req.user!.roles.map(r => `'${r}'`).join(',')}]::text[]`)})`
          ))
          .limit(1);

        if (!userPermission && !rolePermission) {
          return res.status(403).json({ error: 'You do not have permission to add events to this calendar' });
        }

        // For volunteer calendars, check if user is trying to assign someone else
        // If the title ends with " - Signup" and contains a different name, check canAssignOthers
        if (calendar.type === 'volunteer' && eventData.title.endsWith(' - Signup')) {
          const volunteerName = eventData.title.replace(' - Signup', '').trim().toLowerCase();
          const userName = (req.user!.fullName || '').toLowerCase();
          const userEmail = (req.user!.email || '').toLowerCase();
          
          // If the volunteer name doesn't match the current user, require canAssignOthers permission
          if (volunteerName !== userName && volunteerName !== userEmail) {
            const [userAssignPermission] = await db
              .select()
              .from(calendarPermissions)
              .where(and(
                eq(calendarPermissions.calendarId, eventData.calendarId),
                eq(calendarPermissions.userId, req.user!.id),
                eq(calendarPermissions.canAssignOthers, true)
              ))
              .limit(1);

            const [roleAssignPermission] = await db
              .select()
              .from(calendarRolePermissions)
              .where(and(
                eq(calendarRolePermissions.calendarId, eventData.calendarId),
                eq(calendarRolePermissions.tenantId, req.tenant!.id),
                eq(calendarRolePermissions.canAssignOthers, true),
                sql`${calendarRolePermissions.role} = ANY(${sql.raw(`ARRAY[${req.user!.roles.map(r => `'${r}'`).join(',')}]::text[]`)})`
              ))
              .limit(1);

            if (!userAssignPermission && !roleAssignPermission) {
              return res.status(403).json({ error: 'You do not have permission to schedule other volunteers. You can only sign up yourself.' });
            }
          }
        }
      }

      // Create the event in database
      const [newEvent] = await db
        .insert(calendarEvents)
        .values({
          ...eventData,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
        })
        .returning();

      // Check if Google Calendar sync is enabled for this tenant
      let shouldSyncToGoogle = validatedData.includeMeetLink;
      let googleIntegration = null;
      
      if (!shouldSyncToGoogle) {
        // Check if syncCalendar feature is enabled
        const { platformIntegrations } = await import('@shared/schema');
        const [integration] = await db
          .select()
          .from(platformIntegrations)
          .where(and(
            eq(platformIntegrations.tenantId, req.tenant!.id),
            eq(platformIntegrations.platform, 'google_workspace'),
            eq(platformIntegrations.isEnabled, true)
          ))
          .limit(1);
        
        googleIntegration = integration;
        shouldSyncToGoogle = integration?.googleFeatures?.syncCalendar === true;
      }

      // Sync to Google Calendar if Meet link requested OR syncCalendar is enabled
      let finalEvent = newEvent;
      if (shouldSyncToGoogle) {
        const { CalendarService } = await import('./lib/googleWorkspace');
        const calendarService = await CalendarService.forTenant(req.tenant!.id);
        
        if (calendarService) {
          // Set sync status to pending
          await db
            .update(calendarEvents)
            .set({ syncStatus: 'pending' })
            .where(eq(calendarEvents.id, newEvent.id));

          // Determine which Google Calendar to use:
          // 1. If the iRescue calendar has a googleCalendarId, use that (secondary calendar)
          // 2. Otherwise fall back to 'primary'
          const targetGoogleCalendarId = calendar.googleCalendarId || 'primary';

          // Create Google Calendar event (with optional Meet link)
          const result = await calendarService.createEventInCalendar(targetGoogleCalendarId, {
            summary: validatedData.title,
            description: validatedData.description,
            start: validatedData.startTime,
            end: validatedData.endTime,
            includeMeetLink: validatedData.includeMeetLink,
          });

          if (result.success && result.eventId) {
            // Update event with sync success
            const updateData: any = {
              googleEventId: result.eventId,
              googleCalendarId: targetGoogleCalendarId,
              syncStatus: 'synced',
              lastSyncedAt: new Date(),
              syncError: null,
            };
            
            // Add Meet link details if present
            if (result.meetLink) {
              updateData.virtualMeetingProvider = 'google_meet';
              updateData.virtualMeetingLink = result.meetLink;
            }
            
            const [updated] = await db
              .update(calendarEvents)
              .set(updateData)
              .where(eq(calendarEvents.id, newEvent.id))
              .returning();
            
            finalEvent = updated;
          } else {
            // Update event with sync error
            const [updated] = await db
              .update(calendarEvents)
              .set({
                syncStatus: 'error',
                syncError: result.error || 'Failed to sync to Google Calendar',
              })
              .where(eq(calendarEvents.id, newEvent.id))
              .returning();
            
            finalEvent = updated;
          }
        }
      }

      res.json({ success: true, event: finalEvent });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/events/:id
   * Update event
   */
  app.patch('/api/events/:id', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { calendarEvents, calendarPermissions, calendarRolePermissions } = await import('@shared/schema');
      
      const updateSchema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        startTime: z.string().datetime().optional(),
        endTime: z.string().datetime().optional(),
        location: z.string().optional(),
        customPageId: z.string().uuid().optional().or(z.literal("")),
        volunteerContactId: z.string().uuid().optional().nullable(),
      });

      const validatedData = updateSchema.parse(req.body);
      
      // Convert empty string customPageId to null
      const data = {
        ...validatedData,
        customPageId: validatedData.customPageId && validatedData.customPageId !== "" ? validatedData.customPageId : null,
      };

      // Get the event to check calendar
      const [event] = await db
        .select()
        .from(calendarEvents)
        .where(and(
          eq(calendarEvents.id, req.params.id),
          eq(calendarEvents.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Check permissions (both user-specific and role-based)
      if (req.user!.activeRole !== 'admin') {
        const [userPermission] = await db
          .select()
          .from(calendarPermissions)
          .where(and(
            eq(calendarPermissions.calendarId, event.calendarId),
            eq(calendarPermissions.userId, req.user!.id),
            eq(calendarPermissions.canEdit, true)
          ))
          .limit(1);

        const [rolePermission] = await db
          .select()
          .from(calendarRolePermissions)
          .where(and(
            eq(calendarRolePermissions.calendarId, event.calendarId),
            eq(calendarRolePermissions.tenantId, req.tenant!.id),
            eq(calendarRolePermissions.canEdit, true),
            sql`${calendarRolePermissions.role} = ANY(${sql.raw(`ARRAY[${req.user!.roles.map(r => `'${r}'`).join(',')}]::text[]`)})`
          ))
          .limit(1);

        if (!userPermission && !rolePermission) {
          return res.status(403).json({ error: 'You do not have permission to edit events in this calendar' });
        }

        // For volunteer calendars, check if user is trying to change title to assign someone else
        if (data.title && data.title.endsWith(' - Signup')) {
          const { calendars } = await import('@shared/schema');
          const [calendar] = await db
            .select()
            .from(calendars)
            .where(eq(calendars.id, event.calendarId))
            .limit(1);

          if (calendar?.type === 'volunteer') {
            const volunteerName = data.title.replace(' - Signup', '').trim().toLowerCase();
            const userName = (req.user!.fullName || '').toLowerCase();
            const userEmail = (req.user!.email || '').toLowerCase();
            
            if (volunteerName !== userName && volunteerName !== userEmail) {
              const [userAssignPermission] = await db
                .select()
                .from(calendarPermissions)
                .where(and(
                  eq(calendarPermissions.calendarId, event.calendarId),
                  eq(calendarPermissions.userId, req.user!.id),
                  eq(calendarPermissions.canAssignOthers, true)
                ))
                .limit(1);

              const [roleAssignPermission] = await db
                .select()
                .from(calendarRolePermissions)
                .where(and(
                  eq(calendarRolePermissions.calendarId, event.calendarId),
                  eq(calendarRolePermissions.tenantId, req.tenant!.id),
                  eq(calendarRolePermissions.canAssignOthers, true),
                  sql`${calendarRolePermissions.role} = ANY(${sql.raw(`ARRAY[${req.user!.roles.map(r => `'${r}'`).join(',')}]::text[]`)})`
                ))
                .limit(1);

              if (!userAssignPermission && !roleAssignPermission) {
                return res.status(403).json({ error: 'You do not have permission to schedule other volunteers. You can only sign up yourself.' });
              }
            }
          }
        }
      }

      // Convert datetime strings to Date objects if provided
      const updateData: any = { updatedAt: new Date() };
      if (data.startTime) updateData.startTime = new Date(data.startTime);
      if (data.endTime) updateData.endTime = new Date(data.endTime);
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.location !== undefined) updateData.location = data.location;
      if (data.customPageId !== undefined) updateData.customPageId = data.customPageId;

      const [updatedEvent] = await db
        .update(calendarEvents)
        .set(updateData)
        .where(eq(calendarEvents.id, req.params.id))
        .returning();

      // If event was synced to Google Calendar, update it there too
      if (event.googleEventId && event.googleCalendarId) {
        try {
          const { CalendarService } = await import('./lib/googleWorkspace');
          const calendarService = await CalendarService.forTenant(req.tenant!.id);
          
          if (calendarService) {
            await calendarService.updateEvent(event.googleCalendarId, event.googleEventId, {
              summary: updatedEvent.title,
              description: updatedEvent.description || undefined,
              start: updatedEvent.startTime,
              end: updatedEvent.endTime,
            });
          }
        } catch (syncError) {
          console.error('Failed to sync event update to Google Calendar:', syncError);
        }
      }

      res.json({ success: true, event: updatedEvent });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/events/:id
   * Delete event
   */
  app.delete('/api/events/:id', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { calendarEvents, calendarPermissions, calendarRolePermissions } = await import('@shared/schema');
      
      // Get the event to check calendar
      const [event] = await db
        .select()
        .from(calendarEvents)
        .where(and(
          eq(calendarEvents.id, req.params.id),
          eq(calendarEvents.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Check permissions to delete events (both user-specific and role-based)
      if (req.user!.activeRole !== 'admin') {
        const [userPermission] = await db
          .select()
          .from(calendarPermissions)
          .where(and(
            eq(calendarPermissions.calendarId, event.calendarId),
            eq(calendarPermissions.userId, req.user!.id),
            eq(calendarPermissions.canDelete, true)
          ))
          .limit(1);

        const [rolePermission] = await db
          .select()
          .from(calendarRolePermissions)
          .where(and(
            eq(calendarRolePermissions.calendarId, event.calendarId),
            eq(calendarRolePermissions.tenantId, req.tenant!.id),
            eq(calendarRolePermissions.canDelete, true),
            sql`${calendarRolePermissions.role} = ANY(${sql.raw(`ARRAY[${req.user!.roles.map(r => `'${r}'`).join(',')}]::text[]`)})`
          ))
          .limit(1);

        if (!userPermission && !rolePermission) {
          return res.status(403).json({ error: 'You do not have permission to delete events in this calendar' });
        }
      }

      // If event was synced to Google Calendar, delete it there too
      if (event.googleEventId && event.googleCalendarId) {
        try {
          const { CalendarService } = await import('./lib/googleWorkspace');
          const calendarService = await CalendarService.forTenant(req.tenant!.id);
          
          if (calendarService) {
            console.log(`Attempting to delete Google Calendar event: ${event.googleEventId} from calendar: ${event.googleCalendarId}`);
            const deleteResult = await calendarService.deleteEvent(event.googleCalendarId, event.googleEventId);
            
            if (deleteResult.success) {
              console.log(`Successfully deleted Google Calendar event: ${event.googleEventId}`);
            } else {
              console.error(`Failed to delete Google Calendar event: ${event.googleEventId}`, deleteResult.error);
            }
          } else {
            console.log(`Google Workspace not connected for tenant ${req.tenant!.id}, skipping Google Calendar deletion`);
          }
        } catch (syncError) {
          console.error('Failed to delete event from Google Calendar:', syncError);
        }
      } else {
        console.log(`Event ${event.id} has no Google sync data (googleEventId: ${event.googleEventId}, googleCalendarId: ${event.googleCalendarId}), skipping Google Calendar deletion`);
      }

      await db
        .delete(calendarEvents)
        .where(eq(calendarEvents.id, req.params.id));

      res.json({ success: true, message: 'Event deleted' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/calendars/:id/permissions
   * Get permissions for a calendar (admin only)
   */
  app.get('/api/calendars/:id/permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendarPermissions, users } = await import('@shared/schema');
      
      const permissions = await db
        .select({
          id: calendarPermissions.id,
          userId: calendarPermissions.userId,
          calendarId: calendarPermissions.calendarId,
          canEdit: calendarPermissions.canEdit,
          canAdd: calendarPermissions.canAdd,
          canDelete: calendarPermissions.canDelete,
          canAssignOthers: calendarPermissions.canAssignOthers,
          userName: users.fullName,
          userEmail: users.email,
        })
        .from(calendarPermissions)
        .innerJoin(users, eq(calendarPermissions.userId, users.id))
        .where(and(
          eq(calendarPermissions.calendarId, req.params.id),
          eq(calendarPermissions.tenantId, req.tenant!.id)
        ));

      res.json({ permissions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/calendars/:id/permissions
   * Grant calendar permission to a user (admin only)
   */
  app.post('/api/calendars/:id/permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendarPermissions } = await import('@shared/schema');
      
      const permissionSchema = z.object({
        userId: z.string().uuid(),
        canEdit: z.boolean().default(true),
        canAdd: z.boolean().default(true),
        canDelete: z.boolean().default(true),
        canAssignOthers: z.boolean().default(false),
      });

      const data = permissionSchema.parse(req.body);

      // Check if permission already exists
      const [existing] = await db
        .select()
        .from(calendarPermissions)
        .where(and(
          eq(calendarPermissions.calendarId, req.params.id),
          eq(calendarPermissions.userId, data.userId),
          eq(calendarPermissions.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (existing) {
        return res.status(400).json({ error: 'Permission already exists for this user' });
      }

      const [newPermission] = await db
        .insert(calendarPermissions)
        .values({
          calendarId: req.params.id,
          userId: data.userId,
          tenantId: req.tenant!.id,
          canEdit: data.canEdit,
          canAdd: data.canAdd,
          canDelete: data.canDelete,
          canAssignOthers: data.canAssignOthers,
        })
        .returning();

      res.json({ success: true, permission: newPermission });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/calendars/:calendarId/permissions/:permissionId
   * Revoke calendar permission (admin only)
   */
  app.delete('/api/calendars/:calendarId/permissions/:permissionId', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendarPermissions } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(calendarPermissions)
        .where(and(
          eq(calendarPermissions.id, req.params.permissionId),
          eq(calendarPermissions.calendarId, req.params.calendarId),
          eq(calendarPermissions.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Permission not found' });
      }

      res.json({ success: true, message: 'Permission revoked' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/calendars/:id/role-permissions
   * Get role-based permissions for a calendar (admin only)
   */
  app.get('/api/calendars/:id/role-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendarRolePermissions } = await import('@shared/schema');
      
      const rolePermissions = await db
        .select()
        .from(calendarRolePermissions)
        .where(and(
          eq(calendarRolePermissions.calendarId, req.params.id),
          eq(calendarRolePermissions.tenantId, req.tenant!.id)
        ));

      res.json({ rolePermissions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/calendars/:id/role-permissions
   * Grant calendar permission to a role (admin only)
   */
  app.post('/api/calendars/:id/role-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendarRolePermissions } = await import('@shared/schema');
      
      const rolePermissionSchema = z.object({
        role: z.enum(['admin', 'staff', 'board_member', 'foster', 'volunteer']),
        canEdit: z.boolean().default(true),
        canAdd: z.boolean().default(true),
        canDelete: z.boolean().default(true),
        canAssignOthers: z.boolean().default(false),
      });

      const data = rolePermissionSchema.parse(req.body);

      // Check if permission already exists
      const [existing] = await db
        .select()
        .from(calendarRolePermissions)
        .where(and(
          eq(calendarRolePermissions.calendarId, req.params.id),
          eq(calendarRolePermissions.role, data.role),
          eq(calendarRolePermissions.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (existing) {
        return res.status(400).json({ error: 'Permission already exists for this role' });
      }

      const [newPermission] = await db
        .insert(calendarRolePermissions)
        .values({
          calendarId: req.params.id,
          role: data.role,
          tenantId: req.tenant!.id,
          canEdit: data.canEdit,
          canAdd: data.canAdd,
          canDelete: data.canDelete,
          canAssignOthers: data.canAssignOthers,
        })
        .returning();

      res.json({ success: true, rolePermission: newPermission });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/calendars/:calendarId/role-permissions/:permissionId
   * Revoke role-based calendar permission (admin only)
   */
  app.delete('/api/calendars/:calendarId/role-permissions/:permissionId', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { calendarRolePermissions } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(calendarRolePermissions)
        .where(and(
          eq(calendarRolePermissions.id, req.params.permissionId),
          eq(calendarRolePermissions.calendarId, req.params.calendarId),
          eq(calendarRolePermissions.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Role permission not found' });
      }

      res.json({ success: true, message: 'Role permission revoked' });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Medical Records Routes
  // ============================================================================

  /**
   * Helper function to check medical record permissions for an animal
   * Returns { canView: boolean, canEdit: boolean }
   */
  async function checkMedicalRecordPermissions(
    userId: string,
    animalId: string,
    tenantId: string,
    userRoles: string[]
  ): Promise<{ canView: boolean; canEdit: boolean }> {
    const { medicalRecordPermissions, medicalRecordRolePermissions, globalMedicalRecordRolePermissions } = await import('@shared/schema');

    // Admins always have full access
    if (userRoles.includes('admin')) {
      return { canView: true, canEdit: true };
    }

    // Check for user-specific permission (highest priority)
    const [userPermission] = await db
      .select()
      .from(medicalRecordPermissions)
      .where(and(
        eq(medicalRecordPermissions.animalId, animalId),
        eq(medicalRecordPermissions.userId, userId),
        eq(medicalRecordPermissions.tenantId, tenantId)
      ))
      .limit(1);

    if (userPermission) {
      return {
        canView: true,
        canEdit: userPermission.canEdit,
      };
    }

    // Check for per-animal role-based permissions (second priority)
    const rolePermissions = await db
      .select()
      .from(medicalRecordRolePermissions)
      .where(and(
        eq(medicalRecordRolePermissions.animalId, animalId),
        inArray(medicalRecordRolePermissions.role, userRoles as any),
        eq(medicalRecordRolePermissions.tenantId, tenantId)
      ));

    if (rolePermissions.length > 0) {
      // If user has any role with permission, they can view
      // They can edit if ANY of their roles has canEdit
      const canEdit = rolePermissions.some(p => p.canEdit);
      return {
        canView: true,
        canEdit,
      };
    }

    // Check for global role-based permissions (fallback/default)
    const globalRolePermissions = await db
      .select()
      .from(globalMedicalRecordRolePermissions)
      .where(and(
        inArray(globalMedicalRecordRolePermissions.role, userRoles as any),
        eq(globalMedicalRecordRolePermissions.tenantId, tenantId)
      ));

    if (globalRolePermissions.length > 0) {
      // Check if ANY role has view permission
      const canView = globalRolePermissions.some(p => p.canView);
      // Check if ANY role has edit permission
      const canEdit = globalRolePermissions.some(p => p.canEdit);
      return {
        canView,
        canEdit,
      };
    }

    // No permissions found
    return { canView: false, canEdit: false };
  }

  /**
   * GET /api/animals/:animalId/medical/exams
   * Get all medical exams for an animal
   */
  app.get('/api/animals/:animalId/medical/exams', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalExams } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canView) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to view medical records for this animal'
        });
      }
      
      const exams = await db
        .select()
        .from(medicalExams)
        .where(and(
          eq(medicalExams.animalId, req.params.animalId),
          eq(medicalExams.tenantId, req.tenant!.id)
        ))
        .orderBy(desc(medicalExams.examDate));

      res.json({ exams });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:animalId/medical/exams
   * Create a medical exam
   */
  app.post('/api/animals/:animalId/medical/exams', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalExams, insertMedicalExamSchema, medicalBills } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const data = insertMedicalExamSchema.parse(req.body);

      // If billing information is provided, create a medical bill
      let billId = data.billId || null;
      if (data.billVendor && data.billAmount) {
        const [bill] = await db
          .insert(medicalBills)
          .values({
            tenantId: req.tenant!.id,
            animalId: req.params.animalId,
            billDate: data.examDate,
            vendor: data.billVendor,
            amount: data.billAmount.toString(),
            description: `Exam: ${data.examType}`,
            invoiceNumber: data.billInvoiceNumber || null,
            paymentStatus: (data.billPaymentStatus as any) || 'unpaid',
            paidAmount: (data.billPaidAmount && data.billPaidAmount.toString().trim()) || '0',
            notes: data.billNotes || null,
            createdBy: req.user!.id,
          })
          .returning();
        billId = bill.id;
      }

      // Convert empty billing fields to null for database insertion
      const examData: any = {
        ...data,
        animalId: req.params.animalId,
        tenantId: req.tenant!.id,
        createdBy: req.user!.id,
        billId,
        billVendor: data.billVendor || null,
        billAmount: data.billAmount || null,
        billInvoiceNumber: data.billInvoiceNumber || null,
        billPaymentStatus: data.billPaymentStatus || null,
        billPaidAmount: data.billPaidAmount || null,
        billNotes: data.billNotes || null,
      };

      const [exam] = await db
        .insert(medicalExams)
        .values(examData)
        .returning();

      res.json({ exam });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/medical/exams/:examId
   * Update a medical exam
   */
  app.patch('/api/medical/exams/:examId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalExams, insertMedicalExamSchema } = await import('@shared/schema');
      
      // First, fetch the exam to get animalId for permission check
      const [existingExam] = await db
        .select()
        .from(medicalExams)
        .where(and(
          eq(medicalExams.id, req.params.examId),
          eq(medicalExams.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingExam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingExam.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const parsed = insertMedicalExamSchema.partial().parse(req.body);
      
      // Exclude immutable fields (tenant, animal, audit fields)
      const { tenantId, animalId, createdBy, createdAt, ...data } = parsed;

      const [exam] = await db
        .update(medicalExams)
        .set(data)
        .where(and(
          eq(medicalExams.id, req.params.examId),
          eq(medicalExams.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ exam });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/medical/exams/:examId
   * Delete a medical exam
   */
  app.delete('/api/medical/exams/:examId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalExams } = await import('@shared/schema');

      // First, fetch the exam to get animalId for permission check
      const [existingExam] = await db
        .select()
        .from(medicalExams)
        .where(and(
          eq(medicalExams.id, req.params.examId),
          eq(medicalExams.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingExam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingExam.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }

      const [deleted] = await db
        .delete(medicalExams)
        .where(and(
          eq(medicalExams.id, req.params.examId),
          eq(medicalExams.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:animalId/medical/vaccines
   * Get all vaccine records for an animal
   */
  app.get('/api/animals/:animalId/medical/vaccines', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { vaccineRecords } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canView) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to view medical records for this animal'
        });
      }
      
      const vaccines = await db
        .select()
        .from(vaccineRecords)
        .where(and(
          eq(vaccineRecords.animalId, req.params.animalId),
          eq(vaccineRecords.tenantId, req.tenant!.id)
        ))
        .orderBy(desc(vaccineRecords.dateGiven));

      res.json({ vaccines });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:animalId/medical/vaccines
   * Create a vaccine record
   */
  app.post('/api/animals/:animalId/medical/vaccines', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { vaccineRecords, insertVaccineRecordSchema, medicalBills } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const data = insertVaccineRecordSchema.parse(req.body);

      // If billing information is provided, create a medical bill
      let billId = data.billId || null;
      if (data.billVendor && data.billAmount) {
        const [bill] = await db
          .insert(medicalBills)
          .values({
            tenantId: req.tenant!.id,
            animalId: req.params.animalId,
            billDate: data.dateGiven,
            vendor: data.billVendor,
            amount: data.billAmount.toString(),
            description: `Vaccine: ${data.itemName}`,
            invoiceNumber: data.billInvoiceNumber || null,
            paymentStatus: (data.billPaymentStatus as any) || 'unpaid',
            paidAmount: (data.billPaidAmount && data.billPaidAmount.toString().trim()) || '0',
            notes: data.billNotes || null,
            createdBy: req.user!.id,
          })
          .returning();
        billId = bill.id;
      }

      const [vaccine] = await db
        .insert(vaccineRecords)
        .values({
          ...data,
          billId,
          animalId: req.params.animalId,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
        })
        .returning();

      res.json({ vaccine });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/medical/vaccines/:vaccineId
   * Update a vaccine record
   */
  app.patch('/api/medical/vaccines/:vaccineId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { vaccineRecords, insertVaccineRecordSchema } = await import('@shared/schema');
      
      // First, fetch the vaccine to get animalId for permission check
      const [existingVaccine] = await db
        .select()
        .from(vaccineRecords)
        .where(and(
          eq(vaccineRecords.id, req.params.vaccineId),
          eq(vaccineRecords.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingVaccine) {
        return res.status(404).json({ error: 'Vaccine record not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingVaccine.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const parsed = insertVaccineRecordSchema.partial().parse(req.body);
      
      // Exclude immutable fields
      const { tenantId, animalId, createdBy, createdAt, ...data } = parsed;

      const [vaccine] = await db
        .update(vaccineRecords)
        .set(data)
        .where(and(
          eq(vaccineRecords.id, req.params.vaccineId),
          eq(vaccineRecords.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ vaccine });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/medical/vaccines/:vaccineId
   * Delete a vaccine record
   */
  app.delete('/api/medical/vaccines/:vaccineId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { vaccineRecords } = await import('@shared/schema');

      // First, fetch the vaccine to get animalId for permission check
      const [existingVaccine] = await db
        .select()
        .from(vaccineRecords)
        .where(and(
          eq(vaccineRecords.id, req.params.vaccineId),
          eq(vaccineRecords.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingVaccine) {
        return res.status(404).json({ error: 'Vaccine record not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingVaccine.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }

      const [deleted] = await db
        .delete(vaccineRecords)
        .where(and(
          eq(vaccineRecords.id, req.params.vaccineId),
          eq(vaccineRecords.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:animalId/medical/diagnostics
   * Get all diagnostic tests for an animal
   */
  app.get('/api/animals/:animalId/medical/diagnostics', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { diagnosticTests } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canView) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to view medical records for this animal'
        });
      }
      
      const diagnostics = await db
        .select()
        .from(diagnosticTests)
        .where(and(
          eq(diagnosticTests.animalId, req.params.animalId),
          eq(diagnosticTests.tenantId, req.tenant!.id)
        ))
        .orderBy(desc(diagnosticTests.testDate));

      res.json({ diagnostics });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:animalId/medical/diagnostics
   * Create a diagnostic test
   */
  app.post('/api/animals/:animalId/medical/diagnostics', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { diagnosticTests, insertDiagnosticTestSchema, medicalBills } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const data = insertDiagnosticTestSchema.parse(req.body);

      // If billing information is provided, create a medical bill
      let billId = data.billId || null;
      if (data.billVendor && data.billAmount) {
        const [bill] = await db
          .insert(medicalBills)
          .values({
            tenantId: req.tenant!.id,
            animalId: req.params.animalId,
            billDate: data.testDate,
            vendor: data.billVendor,
            amount: data.billAmount.toString(),
            description: `Diagnostic Test: ${data.testName}`,
            invoiceNumber: data.billInvoiceNumber || null,
            paymentStatus: (data.billPaymentStatus as any) || 'unpaid',
            paidAmount: (data.billPaidAmount && data.billPaidAmount.toString().trim()) || '0',
            notes: data.billNotes || null,
            createdBy: req.user!.id,
          })
          .returning();
        billId = bill.id;
      }

      const [diagnostic] = await db
        .insert(diagnosticTests)
        .values({
          ...data,
          billId,
          animalId: req.params.animalId,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
        })
        .returning();

      res.json({ diagnostic });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/medical/diagnostics/:diagnosticId
   * Update a diagnostic test
   */
  app.patch('/api/medical/diagnostics/:diagnosticId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { diagnosticTests, insertDiagnosticTestSchema } = await import('@shared/schema');
      
      // First, fetch the diagnostic to get animalId for permission check
      const [existingDiagnostic] = await db
        .select()
        .from(diagnosticTests)
        .where(and(
          eq(diagnosticTests.id, req.params.diagnosticId),
          eq(diagnosticTests.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingDiagnostic) {
        return res.status(404).json({ error: 'Diagnostic test not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingDiagnostic.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const parsed = insertDiagnosticTestSchema.partial().parse(req.body);
      
      // Exclude immutable fields
      const { tenantId, animalId, createdBy, createdAt, ...data } = parsed;

      const [diagnostic] = await db
        .update(diagnosticTests)
        .set(data)
        .where(and(
          eq(diagnosticTests.id, req.params.diagnosticId),
          eq(diagnosticTests.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ diagnostic });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/medical/diagnostics/:diagnosticId
   * Delete a diagnostic test
   */
  app.delete('/api/medical/diagnostics/:diagnosticId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { diagnosticTests } = await import('@shared/schema');

      // First, fetch the diagnostic to get animalId for permission check
      const [existingDiagnostic] = await db
        .select()
        .from(diagnosticTests)
        .where(and(
          eq(diagnosticTests.id, req.params.diagnosticId),
          eq(diagnosticTests.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingDiagnostic) {
        return res.status(404).json({ error: 'Diagnostic test not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingDiagnostic.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }

      const [deleted] = await db
        .delete(diagnosticTests)
        .where(and(
          eq(diagnosticTests.id, req.params.diagnosticId),
          eq(diagnosticTests.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:animalId/medical/procedures
   * Get all procedure logs for an animal
   */
  app.get('/api/animals/:animalId/medical/procedures', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { procedureLogs } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canView) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to view medical records for this animal'
        });
      }
      
      const procedures = await db
        .select()
        .from(procedureLogs)
        .where(and(
          eq(procedureLogs.animalId, req.params.animalId),
          eq(procedureLogs.tenantId, req.tenant!.id)
        ))
        .orderBy(desc(procedureLogs.procedureDate));

      res.json({ procedures });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:animalId/medical/procedures
   * Create a procedure log
   */
  app.post('/api/animals/:animalId/medical/procedures', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { procedureLogs, insertProcedureLogSchema, medicalBills } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const data = insertProcedureLogSchema.parse(req.body);

      // If billing information is provided, create a medical bill
      let billId = data.billId || null;
      if (data.billVendor && data.billAmount) {
        const [bill] = await db
          .insert(medicalBills)
          .values({
            tenantId: req.tenant!.id,
            animalId: req.params.animalId,
            billDate: data.procedureDate,
            vendor: data.billVendor,
            amount: data.billAmount.toString(),
            description: `Procedure: ${data.procedureName}`,
            invoiceNumber: data.billInvoiceNumber || null,
            paymentStatus: (data.billPaymentStatus as any) || 'unpaid',
            paidAmount: (data.billPaidAmount && data.billPaidAmount.toString().trim()) || '0',
            notes: data.billNotes || null,
            createdBy: req.user!.id,
          })
          .returning();
        billId = bill.id;
      }

      const [procedure] = await db
        .insert(procedureLogs)
        .values({
          ...data,
          billId,
          animalId: req.params.animalId,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
        })
        .returning();

      res.json({ procedure });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/medical/procedures/:procedureId
   * Update a procedure log
   */
  app.patch('/api/medical/procedures/:procedureId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { procedureLogs, insertProcedureLogSchema } = await import('@shared/schema');
      
      // First, fetch the procedure to get animalId for permission check
      const [existingProcedure] = await db
        .select()
        .from(procedureLogs)
        .where(and(
          eq(procedureLogs.id, req.params.procedureId),
          eq(procedureLogs.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingProcedure) {
        return res.status(404).json({ error: 'Procedure log not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingProcedure.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const parsed = insertProcedureLogSchema.partial().parse(req.body);
      
      // Exclude immutable fields
      const { tenantId, animalId, createdBy, createdAt, ...data } = parsed;

      const [procedure] = await db
        .update(procedureLogs)
        .set(data)
        .where(and(
          eq(procedureLogs.id, req.params.procedureId),
          eq(procedureLogs.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ procedure });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/medical/procedures/:procedureId
   * Delete a procedure log
   */
  app.delete('/api/medical/procedures/:procedureId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { procedureLogs } = await import('@shared/schema');

      // First, fetch the procedure to get animalId for permission check
      const [existingProcedure] = await db
        .select()
        .from(procedureLogs)
        .where(and(
          eq(procedureLogs.id, req.params.procedureId),
          eq(procedureLogs.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingProcedure) {
        return res.status(404).json({ error: 'Procedure log not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingProcedure.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }

      const [deleted] = await db
        .delete(procedureLogs)
        .where(and(
          eq(procedureLogs.id, req.params.procedureId),
          eq(procedureLogs.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:animalId/medical/prescriptions
   * Get all prescriptions for an animal
   */
  app.get('/api/animals/:animalId/medical/prescriptions', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalPrescriptions, medicalDoses } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canView) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to view medical records for this animal'
        });
      }
      
      const prescriptions = await db
        .select()
        .from(medicalPrescriptions)
        .where(and(
          eq(medicalPrescriptions.animalId, req.params.animalId),
          eq(medicalPrescriptions.tenantId, req.tenant!.id)
        ))
        .orderBy(desc(medicalPrescriptions.startDate));

      res.json({ prescriptions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:animalId/medical/prescriptions
   * Create a prescription with doses
   */
  app.post('/api/animals/:animalId/medical/prescriptions', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalPrescriptions, medicalDoses, insertMedicalPrescriptionSchema, medicalBills } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      // Convert empty strings to undefined for optional fields (dates, numerics)
      const bodyData = {
        ...req.body,
        endDate: req.body.endDate === '' ? undefined : req.body.endDate,
        billAmount: req.body.billAmount === '' ? undefined : req.body.billAmount,
        billPaidAmount: req.body.billPaidAmount === '' ? undefined : req.body.billPaidAmount,
        grantId: req.body.grantId === '' ? undefined : req.body.grantId,
      };
      
      const data = insertMedicalPrescriptionSchema.parse(bodyData);

      // Security: Validate grantId belongs to this tenant if provided
      if (data.grantId) {
        const { grants } = await import('@shared/schema');
        const [grant] = await db
          .select()
          .from(grants)
          .where(and(
            eq(grants.id, data.grantId),
            eq(grants.tenantId, req.tenant!.id)
          ))
          .limit(1);
        
        if (!grant) {
          return res.status(400).json({ 
            error: 'Invalid grant',
            message: 'Grant not found or does not belong to this organization'
          });
        }
      }

      // If billing information is provided, create a medical bill
      let billId = data.billId || null;
      if (data.billVendor && data.billAmount) {
        const [bill] = await db
          .insert(medicalBills)
          .values({
            tenantId: req.tenant!.id,
            animalId: req.params.animalId,
            billDate: data.startDate,
            vendor: data.billVendor,
            amount: data.billAmount.toString(),
            description: `Medication: ${data.medicationName}`,
            invoiceNumber: data.billInvoiceNumber || null,
            paymentStatus: (data.billPaymentStatus as any) || 'unpaid',
            paidAmount: data.billPaidAmount?.toString() || '0',
            notes: data.billNotes || null,
            grantId: data.grantId || null,
            createdBy: req.user!.id,
          })
          .returning();
        billId = bill.id;
      }

      const [prescription] = await db
        .insert(medicalPrescriptions)
        .values({
          ...data,
          billId,
          animalId: req.params.animalId,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
        })
        .returning();

      // Generate doses based on frequency and date range
      const doses = [];
      const start = new Date(prescription.startDate);
      const end = prescription.endDate ? new Date(prescription.endDate) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
      
      // Limit max duration to 90 days to prevent timeout from generating too many doses
      const maxEndDate = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
      const effectiveEnd = end > maxEndDate ? maxEndDate : end;
      
      // Parse frequency and determine dose times
      // SID (daily): 0900, or current time if after 0900 on first day
      // BID (twice daily): 0900 and 2100
      // TID (three times daily): 0600, 1400, and 2200
      // QID (four times daily): 0600, 1200, 1800, and 2200
      // HS (at bedtime): 2100
      let doseHours: number[] = [9]; // Default: once daily at 9 AM
      const freq = data.frequency.toUpperCase();
      
      if (freq.includes('HS') || freq.includes('BEDTIME')) {
        doseHours = [21]; // 9 PM (bedtime)
      } else if (freq.includes('BID') || freq.includes('TWICE') || freq.includes('2X')) {
        doseHours = [9, 21]; // 9 AM and 9 PM
      } else if (freq.includes('TID') || freq.includes('THREE') || freq.includes('3X')) {
        doseHours = [6, 14, 22]; // 6 AM, 2 PM, 10 PM
      } else if (freq.includes('QID') || freq.includes('FOUR') || freq.includes('4X')) {
        doseHours = [6, 12, 18, 22]; // 6 AM, 12 PM, 6 PM, 10 PM
      }

      // Safety limit: max 500 doses to prevent timeout
      const MAX_DOSES = 500;
      const now = new Date();
      const isFirstDay = (d: Date) => 
        d.getFullYear() === start.getFullYear() && 
        d.getMonth() === start.getMonth() && 
        d.getDate() === start.getDate();
      
      for (let d = new Date(start); d <= effectiveEnd && doses.length < MAX_DOSES; d.setDate(d.getDate() + 1)) {
        for (let i = 0; i < doseHours.length && doses.length < MAX_DOSES; i++) {
          const doseTime = new Date(d);
          let hour = doseHours[i];
          
          // For first day with daily (single dose), use current time if after 9 AM
          if (isFirstDay(d) && doseHours.length === 1 && now.getHours() >= 9) {
            hour = now.getHours();
            doseTime.setMinutes(now.getMinutes());
          }
          
          doseTime.setHours(hour, doseTime.getMinutes() || 0, 0, 0);
          doses.push({
            prescriptionId: prescription.id,
            tenantId: req.tenant!.id,
            dueDate: doseTime,
            status: 'due' as const,
          });
        }
      }

      if (doses.length > 0) {
        await db.insert(medicalDoses).values(doses);
      }

      res.json({ prescription, dosesCreated: doses.length });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/medical/prescriptions/:prescriptionId
   * Update a prescription
   */
  app.patch('/api/medical/prescriptions/:prescriptionId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalPrescriptions, insertMedicalPrescriptionSchema } = await import('@shared/schema');
      
      // First, fetch the prescription to get animalId for permission check
      const [existingPrescription] = await db
        .select()
        .from(medicalPrescriptions)
        .where(and(
          eq(medicalPrescriptions.id, req.params.prescriptionId),
          eq(medicalPrescriptions.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingPrescription) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingPrescription.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const parsed = insertMedicalPrescriptionSchema.partial().parse(req.body);
      
      // Exclude immutable fields
      const { tenantId, animalId, createdBy, createdAt, ...data } = parsed;

      // Convert empty strings to undefined for numeric fields
      if ((data as any).billAmount === '' || (data as any).billAmount === null) {
        (data as any).billAmount = undefined;
      }
      if ((data as any).billPaidAmount === '' || (data as any).billPaidAmount === null) {
        (data as any).billPaidAmount = undefined;
      }
      if ((data as any).grantId === '' || (data as any).grantId === null) {
        (data as any).grantId = undefined;
      }

      const [prescription] = await db
        .update(medicalPrescriptions)
        .set(data)
        .where(and(
          eq(medicalPrescriptions.id, req.params.prescriptionId),
          eq(medicalPrescriptions.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ prescription });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/medical/prescriptions/:prescriptionId
   * Delete a prescription (cascades to doses)
   */
  app.delete('/api/medical/prescriptions/:prescriptionId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalPrescriptions } = await import('@shared/schema');

      // First, fetch the prescription to get animalId for permission check
      const [existingPrescription] = await db
        .select()
        .from(medicalPrescriptions)
        .where(and(
          eq(medicalPrescriptions.id, req.params.prescriptionId),
          eq(medicalPrescriptions.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingPrescription) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingPrescription.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }

      const [deleted] = await db
        .delete(medicalPrescriptions)
        .where(and(
          eq(medicalPrescriptions.id, req.params.prescriptionId),
          eq(medicalPrescriptions.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/medical/doses/today
   * Get all doses due today across all animals (for daily task dashboard)
   */
  app.get('/api/medical/doses/today', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalDoses, medicalPrescriptions, animals } = await import('@shared/schema');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const doseRows = await db
        .select({
          doseId: medicalDoses.id,
          dosePrescriptionId: medicalDoses.prescriptionId,
          doseDueDate: medicalDoses.dueDate,
          doseStatus: medicalDoses.status,
          doseGivenAt: medicalDoses.givenAt,
          doseAdministeredBy: medicalDoses.administeredBy,
          doseNotes: medicalDoses.notes,
          prescriptionId: medicalPrescriptions.id,
          prescriptionMedicationName: medicalPrescriptions.medicationName,
          prescriptionDosage: medicalPrescriptions.dosage,
          prescriptionFrequency: medicalPrescriptions.frequency,
          prescriptionAnimalId: medicalPrescriptions.animalId,
          animalId: animals.id,
          animalName: animals.name,
          animalSpecies: animals.species,
          animalPhotoUrls: animals.photoUrls,
        })
        .from(medicalDoses)
        .leftJoin(medicalPrescriptions, eq(medicalDoses.prescriptionId, medicalPrescriptions.id))
        .leftJoin(animals, eq(medicalPrescriptions.animalId, animals.id))
        .where(and(
          eq(medicalDoses.tenantId, req.tenant!.id),
          eq(medicalDoses.status, 'due'),
          sql`${medicalDoses.dueDate} >= ${today}`,
          sql`${medicalDoses.dueDate} < ${tomorrow}`
        ))
        .orderBy(medicalDoses.dueDate);

      // Transform flat results into nested structure for backwards compatibility
      // Use primary key checks for null guards to handle empty strings correctly
      const doses = doseRows.map(row => ({
        dose: {
          id: row.doseId,
          prescriptionId: row.dosePrescriptionId,
          dueDate: row.doseDueDate,
          status: row.doseStatus,
          givenAt: row.doseGivenAt,
          administeredBy: row.doseAdministeredBy,
          notes: row.doseNotes,
        },
        prescription: row.prescriptionId ? {
          id: row.prescriptionId,
          medicationName: row.prescriptionMedicationName,
          dosage: row.prescriptionDosage,
          frequency: row.prescriptionFrequency,
          animalId: row.prescriptionAnimalId,
        } : null,
        animal: row.animalId ? {
          id: row.animalId,
          name: row.animalName,
          species: row.animalSpecies,
          photoUrls: row.animalPhotoUrls,
        } : null,
      }));

      res.json({ doses });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/medical/doses/overdue
   * Get all overdue doses (due date in the past, status still 'due')
   */
  app.get('/api/medical/doses/overdue', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalDoses, medicalPrescriptions, animals } = await import('@shared/schema');
      
      const now = new Date();

      const doseRows = await db
        .select({
          doseId: medicalDoses.id,
          dosePrescriptionId: medicalDoses.prescriptionId,
          doseDueDate: medicalDoses.dueDate,
          doseStatus: medicalDoses.status,
          doseGivenAt: medicalDoses.givenAt,
          doseAdministeredBy: medicalDoses.administeredBy,
          doseNotes: medicalDoses.notes,
          prescriptionId: medicalPrescriptions.id,
          prescriptionMedicationName: medicalPrescriptions.medicationName,
          prescriptionDosage: medicalPrescriptions.dosage,
          prescriptionFrequency: medicalPrescriptions.frequency,
          prescriptionAnimalId: medicalPrescriptions.animalId,
          animalId: animals.id,
          animalName: animals.name,
          animalSpecies: animals.species,
          animalPhotoUrls: animals.photoUrls,
        })
        .from(medicalDoses)
        .leftJoin(medicalPrescriptions, eq(medicalDoses.prescriptionId, medicalPrescriptions.id))
        .leftJoin(animals, eq(medicalPrescriptions.animalId, animals.id))
        .where(and(
          eq(medicalDoses.tenantId, req.tenant!.id),
          eq(medicalDoses.status, 'due'),
          lt(medicalDoses.dueDate, now)
        ))
        .orderBy(medicalDoses.dueDate);

      // Transform flat results into nested structure for backwards compatibility
      // Use primary key checks for null guards to handle empty strings correctly
      const doses = doseRows.map(row => ({
        dose: {
          id: row.doseId,
          prescriptionId: row.dosePrescriptionId,
          dueDate: row.doseDueDate,
          status: row.doseStatus,
          givenAt: row.doseGivenAt,
          administeredBy: row.doseAdministeredBy,
          notes: row.doseNotes,
        },
        prescription: row.prescriptionId ? {
          id: row.prescriptionId,
          medicationName: row.prescriptionMedicationName,
          dosage: row.prescriptionDosage,
          frequency: row.prescriptionFrequency,
          animalId: row.prescriptionAnimalId,
        } : null,
        animal: row.animalId ? {
          id: row.animalId,
          name: row.animalName,
          species: row.animalSpecies,
          photoUrls: row.animalPhotoUrls,
        } : null,
      }));

      res.json({ doses });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/medical/doses/:doseId/administer
   * Mark a dose as administered
   */
  app.patch('/api/medical/doses/:doseId/administer', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalDoses } = await import('@shared/schema');
      
      const updateSchema = z.object({
        notes: z.string().optional(),
      });

      const { notes } = updateSchema.parse(req.body);

      const [dose] = await db
        .update(medicalDoses)
        .set({
          status: 'given',
          givenAt: new Date(),
          administeredBy: req.user!.id,
          notes,
        })
        .where(and(
          eq(medicalDoses.id, req.params.doseId),
          eq(medicalDoses.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!dose) {
        return res.status(404).json({ error: 'Dose not found' });
      }

      res.json({ dose });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/medical/doses/:doseId/unable
   * Mark a dose as unable to administer with reason
   */
  app.patch('/api/medical/doses/:doseId/unable', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalDoses } = await import('@shared/schema');
      
      const updateSchema = z.object({
        reason: z.enum(["animal_sick", "unable_to_swallow", "other"]),
        notes: z.string().optional(),
      });

      const { reason, notes } = updateSchema.parse(req.body);

      const [dose] = await db
        .update(medicalDoses)
        .set({
          status: 'unable',
          unableReason: reason,
          administeredBy: req.user!.id,
          givenAt: new Date(),
          notes,
        })
        .where(and(
          eq(medicalDoses.id, req.params.doseId),
          eq(medicalDoses.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!dose) {
        return res.status(404).json({ error: 'Dose not found' });
      }

      res.json({ dose });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:animalId/medical/history
   * Get chronological medical history for an animal
   */
  app.get('/api/animals/:animalId/medical/history', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalExams, vaccineRecords, diagnosticTests, procedureLogs, medicalPrescriptions } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canView) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to view medical records for this animal'
        });
      }
      
      // Get all medical records for this animal
      const [exams, vaccines, diagnostics, procedures, prescriptions] = await Promise.all([
        db.select().from(medicalExams).where(and(
          eq(medicalExams.animalId, req.params.animalId),
          eq(medicalExams.tenantId, req.tenant!.id)
        )),
        db.select().from(vaccineRecords).where(and(
          eq(vaccineRecords.animalId, req.params.animalId),
          eq(vaccineRecords.tenantId, req.tenant!.id)
        )),
        db.select().from(diagnosticTests).where(and(
          eq(diagnosticTests.animalId, req.params.animalId),
          eq(diagnosticTests.tenantId, req.tenant!.id)
        )),
        db.select().from(procedureLogs).where(and(
          eq(procedureLogs.animalId, req.params.animalId),
          eq(procedureLogs.tenantId, req.tenant!.id)
        )),
        db.select().from(medicalPrescriptions).where(and(
          eq(medicalPrescriptions.animalId, req.params.animalId),
          eq(medicalPrescriptions.tenantId, req.tenant!.id)
        )),
      ]);

      // Combine and sort by date
      const history = [
        ...exams.map(e => ({ type: 'exam' as const, date: e.examDate, data: e })),
        ...vaccines.map(v => ({ type: 'vaccine' as const, date: v.dateGiven, data: v })),
        ...diagnostics.map(d => ({ type: 'diagnostic' as const, date: d.testDate, data: d })),
        ...procedures.map(p => ({ type: 'procedure' as const, date: p.procedureDate, data: p })),
        ...prescriptions.map(p => ({ type: 'prescription' as const, date: p.startDate, data: p })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      res.json({ history });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:animalId/medical-summary
   * Get medical summary for fosters (prescriptions and vaccines)
   * Requires foster role and animal must be assigned to the requesting foster
   */
  app.get('/api/animals/:animalId/medical-summary', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalPrescriptions, vaccineRecords, fosterAnimals } = await import('@shared/schema');
      
      // Check if user is a foster and has access to this animal
      const fosterAnimal = await db
        .select()
        .from(fosterAnimals)
        .where(and(
          eq(fosterAnimals.animalId, req.params.animalId),
          eq(fosterAnimals.fosterId, req.user!.id),
          eq(fosterAnimals.tenantId, req.tenant!.id),
          eq(fosterAnimals.status, 'active')
        ))
        .limit(1);

      if (fosterAnimal.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You can only view medical information for animals assigned to you'
        });
      }
      
      // Get prescriptions and vaccines for this animal
      const [prescriptions, vaccines] = await Promise.all([
        db.select().from(medicalPrescriptions).where(and(
          eq(medicalPrescriptions.animalId, req.params.animalId),
          eq(medicalPrescriptions.tenantId, req.tenant!.id)
        )).orderBy(desc(medicalPrescriptions.startDate)),
        db.select().from(vaccineRecords).where(and(
          eq(vaccineRecords.animalId, req.params.animalId),
          eq(vaccineRecords.tenantId, req.tenant!.id)
        )).orderBy(desc(vaccineRecords.dateGiven)),
      ]);

      res.json({ prescriptions, vaccines });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/controlled-substances
   * Get controlled substance log (read-only)
   */
  app.get('/api/controlled-substances', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { controlledSubstanceLog } = await import('@shared/schema');
      
      const logs = await db
        .select()
        .from(controlledSubstanceLog)
        .where(eq(controlledSubstanceLog.tenantId, req.tenant!.id))
        .orderBy(desc(controlledSubstanceLog.entryDate));

      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/controlled-substances
   * Add controlled substance log entry (append-only)
   */
  app.post('/api/controlled-substances', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { controlledSubstanceLog, insertControlledSubstanceLogSchema } = await import('@shared/schema');
      
      const data = insertControlledSubstanceLogSchema.parse(req.body);

      const [log] = await db
        .insert(controlledSubstanceLog)
        .values({
          ...data,
          tenantId: req.tenant!.id,
          administeredBy: req.user!.id,
        })
        .returning();

      res.json({ log });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Medical Bills Routes
  // ============================================================================

  /**
   * GET /api/animals/:animalId/medical/bills
   * Get all medical bills for an animal
   */
  app.get('/api/animals/:animalId/medical/bills', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalBills } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canView) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to view medical records for this animal'
        });
      }
      
      const bills = await db
        .select()
        .from(medicalBills)
        .where(and(
          eq(medicalBills.animalId, req.params.animalId),
          eq(medicalBills.tenantId, req.tenant!.id)
        ))
        .orderBy(desc(medicalBills.billDate));

      res.json({ bills });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:animalId/medical/bills
   * Create a medical bill
   */
  app.post('/api/animals/:animalId/medical/bills', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalBills, insertMedicalBillSchema } = await import('@shared/schema');
      
      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        req.params.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }
      
      const data = insertMedicalBillSchema.parse(req.body);

      // Security: Validate grantId belongs to this tenant if provided
      if (data.grantId) {
        const { grants } = await import('@shared/schema');
        const [grant] = await db
          .select()
          .from(grants)
          .where(and(
            eq(grants.id, data.grantId),
            eq(grants.tenantId, req.tenant!.id)
          ))
          .limit(1);
        
        if (!grant) {
          return res.status(400).json({ 
            error: 'Invalid grant',
            message: 'Grant not found or does not belong to this organization'
          });
        }
      }

      const [bill] = await db
        .insert(medicalBills)
        .values({
          ...data,
          animalId: req.params.animalId,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
        })
        .returning();

      res.json({ bill });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/medical/bills/:billId
   * Update a medical bill
   */
  app.patch('/api/medical/bills/:billId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalBills } = await import('@shared/schema');
      
      // Get the bill first to check animal ID for permissions
      const [existingBill] = await db
        .select()
        .from(medicalBills)
        .where(and(
          eq(medicalBills.id, req.params.billId),
          eq(medicalBills.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingBill) {
        return res.status(404).json({ error: 'Bill not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingBill.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }

      const updateData = {
        ...req.body,
        updatedAt: new Date(),
      };

      const [bill] = await db
        .update(medicalBills)
        .set(updateData)
        .where(and(
          eq(medicalBills.id, req.params.billId),
          eq(medicalBills.tenantId, req.tenant!.id)
        ))
        .returning();

      res.json({ bill });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/medical/bills/:billId
   * Delete a medical bill
   */
  app.delete('/api/medical/bills/:billId', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { medicalBills } = await import('@shared/schema');
      
      // Get the bill first to check animal ID for permissions
      const [existingBill] = await db
        .select()
        .from(medicalBills)
        .where(and(
          eq(medicalBills.id, req.params.billId),
          eq(medicalBills.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!existingBill) {
        return res.status(404).json({ error: 'Bill not found' });
      }

      // Check permissions
      const permissions = await checkMedicalRecordPermissions(
        req.user!.id,
        existingBill.animalId,
        req.tenant!.id,
        req.user!.roles
      );

      if (!permissions.canEdit) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to edit medical records for this animal'
        });
      }

      await db
        .delete(medicalBills)
        .where(and(
          eq(medicalBills.id, req.params.billId),
          eq(medicalBills.tenantId, req.tenant!.id)
        ));

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Medical Record Permissions Routes
  // ============================================================================

  /**
   * GET /api/animals/:id/medical-permissions
   * Get user-specific medical record permissions for an animal (admin only)
   */
  app.get('/api/animals/:id/medical-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { medicalRecordPermissions, users } = await import('@shared/schema');
      
      const permissions = await db
        .select({
          id: medicalRecordPermissions.id,
          userId: medicalRecordPermissions.userId,
          animalId: medicalRecordPermissions.animalId,
          canEdit: medicalRecordPermissions.canEdit,
          userName: users.fullName,
          userEmail: users.email,
        })
        .from(medicalRecordPermissions)
        .innerJoin(users, eq(medicalRecordPermissions.userId, users.id))
        .where(and(
          eq(medicalRecordPermissions.animalId, req.params.id),
          eq(medicalRecordPermissions.tenantId, req.tenant!.id)
        ));

      res.json({ permissions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:id/medical-permissions
   * Grant medical record edit permission to a user (admin only)
   */
  app.post('/api/animals/:id/medical-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { medicalRecordPermissions } = await import('@shared/schema');
      
      const permissionSchema = z.object({
        userId: z.string().uuid(),
        canEdit: z.boolean().default(true),
      });

      const data = permissionSchema.parse(req.body);

      // Check if permission already exists
      const [existing] = await db
        .select()
        .from(medicalRecordPermissions)
        .where(and(
          eq(medicalRecordPermissions.animalId, req.params.id),
          eq(medicalRecordPermissions.userId, data.userId),
          eq(medicalRecordPermissions.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (existing) {
        return res.status(400).json({ error: 'Permission already exists for this user' });
      }

      const [newPermission] = await db
        .insert(medicalRecordPermissions)
        .values({
          animalId: req.params.id,
          userId: data.userId,
          tenantId: req.tenant!.id,
          canEdit: data.canEdit,
        })
        .returning();

      res.json({ success: true, permission: newPermission });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/animals/:animalId/medical-permissions/:permissionId
   * Revoke medical record permission (admin only)
   */
  app.delete('/api/animals/:animalId/medical-permissions/:permissionId', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { medicalRecordPermissions } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(medicalRecordPermissions)
        .where(and(
          eq(medicalRecordPermissions.id, req.params.permissionId),
          eq(medicalRecordPermissions.animalId, req.params.animalId),
          eq(medicalRecordPermissions.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Permission not found' });
      }

      res.json({ success: true, message: 'Permission revoked' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/animals/:id/medical-role-permissions
   * Get role-based medical record permissions for an animal (admin only)
   */
  app.get('/api/animals/:id/medical-role-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { medicalRecordRolePermissions } = await import('@shared/schema');
      
      const rolePermissions = await db
        .select()
        .from(medicalRecordRolePermissions)
        .where(and(
          eq(medicalRecordRolePermissions.animalId, req.params.id),
          eq(medicalRecordRolePermissions.tenantId, req.tenant!.id)
        ));

      res.json({ rolePermissions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/animals/:id/medical-role-permissions
   * Grant medical record edit permission to a role (admin only)
   */
  app.post('/api/animals/:id/medical-role-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { medicalRecordRolePermissions } = await import('@shared/schema');
      
      const rolePermissionSchema = z.object({
        role: z.enum(['admin', 'staff', 'board_member', 'foster', 'volunteer']),
        canEdit: z.boolean().default(true),
      });

      const data = rolePermissionSchema.parse(req.body);

      // Check if permission already exists
      const [existing] = await db
        .select()
        .from(medicalRecordRolePermissions)
        .where(and(
          eq(medicalRecordRolePermissions.animalId, req.params.id),
          eq(medicalRecordRolePermissions.role, data.role),
          eq(medicalRecordRolePermissions.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (existing) {
        return res.status(400).json({ error: 'Permission already exists for this role' });
      }

      const [newPermission] = await db
        .insert(medicalRecordRolePermissions)
        .values({
          animalId: req.params.id,
          role: data.role,
          tenantId: req.tenant!.id,
          canEdit: data.canEdit,
        })
        .returning();

      res.json({ success: true, rolePermission: newPermission });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/animals/:animalId/medical-role-permissions/:permissionId
   * Revoke role-based medical record permission (admin only)
   */
  app.delete('/api/animals/:animalId/medical-role-permissions/:permissionId', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { medicalRecordRolePermissions } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(medicalRecordRolePermissions)
        .where(and(
          eq(medicalRecordRolePermissions.id, req.params.permissionId),
          eq(medicalRecordRolePermissions.animalId, req.params.animalId),
          eq(medicalRecordRolePermissions.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Role permission not found' });
      }

      res.json({ success: true, message: 'Role permission revoked' });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Global Medical Record Role Permissions Routes
  // ============================================================================

  /**
   * GET /api/global-medical-role-permissions
   * Get all global role-based medical record permissions for tenant (admin only)
   */
  app.get('/api/global-medical-role-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { globalMedicalRecordRolePermissions } = await import('@shared/schema');
      
      const permissions = await db
        .select()
        .from(globalMedicalRecordRolePermissions)
        .where(eq(globalMedicalRecordRolePermissions.tenantId, req.tenant!.id));

      res.json({ globalPermissions: permissions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/global-medical-role-permissions
   * Create or update global role-based medical record permission (admin only)
   */
  app.post('/api/global-medical-role-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { globalMedicalRecordRolePermissions } = await import('@shared/schema');
      
      const permissionSchema = z.object({
        role: z.enum(['admin', 'staff', 'board_member', 'foster', 'volunteer']),
        canView: z.boolean().default(true),
        canEdit: z.boolean().default(false),
      });

      const data = permissionSchema.parse(req.body);

      // Check if permission already exists for this role
      const [existing] = await db
        .select()
        .from(globalMedicalRecordRolePermissions)
        .where(and(
          eq(globalMedicalRecordRolePermissions.tenantId, req.tenant!.id),
          eq(globalMedicalRecordRolePermissions.role, data.role)
        ))
        .limit(1);

      let permission;
      if (existing) {
        // Update existing permission
        [permission] = await db
          .update(globalMedicalRecordRolePermissions)
          .set({
            canView: data.canView,
            canEdit: data.canEdit,
            updatedAt: new Date(),
          })
          .where(eq(globalMedicalRecordRolePermissions.id, existing.id))
          .returning();
      } else {
        // Create new permission
        [permission] = await db
          .insert(globalMedicalRecordRolePermissions)
          .values({
            tenantId: req.tenant!.id,
            role: data.role,
            canView: data.canView,
            canEdit: data.canEdit,
          })
          .returning();
      }

      res.json({ 
        permission,
        message: existing ? 'Global permission updated' : 'Global permission created'
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/global-medical-role-permissions/:id
   * Delete global role-based medical record permission (admin only)
   */
  app.delete('/api/global-medical-role-permissions/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { globalMedicalRecordRolePermissions } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(globalMedicalRecordRolePermissions)
        .where(and(
          eq(globalMedicalRecordRolePermissions.id, req.params.id),
          eq(globalMedicalRecordRolePermissions.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Global permission not found' });
      }

      res.json({ success: true, message: 'Global permission removed' });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Document Management Routes
  // ============================================================================

  /**
   * GET /api/documents
   * Get all documents (authenticated users can access)
   */
  app.get('/api/documents', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { documents, users } = await import('@shared/schema');
      
      const docs = await db
        .select({
          id: documents.id,
          title: documents.title,
          description: documents.description,
          category: documents.category,
          fileUrl: documents.fileUrl,
          fileSize: documents.fileSize,
          fileName: documents.fileName,
          uploadedBy: documents.uploadedBy,
          uploadedAt: documents.uploadedAt,
          updatedAt: documents.updatedAt,
          uploaderName: users.fullName,
        })
        .from(documents)
        .leftJoin(users, eq(documents.uploadedBy, users.id))
        .where(eq(documents.tenantId, req.tenant!.id))
        .orderBy(desc(documents.uploadedAt));

      res.json({ documents: docs });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/documents/upload
   * Upload a document using TenantFileStorage (supports Google Drive when connected)
   */
  app.post('/api/documents/upload', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { documents } = await import('@shared/schema');
      const { TenantFileStorage } = await import('./lib/tenantFileStorage');
      const multer = (await import('multer')).default;
      
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
      });

      upload.single('file')(req, res, async (err) => {
        if (err) {
          console.error('[DOCUMENTS UPLOAD] Multer error:', err);
          return res.status(400).json({ error: err.message || 'File upload error' });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No file provided' });
        }

        const { title, description, category } = req.body;
        
        if (!title || !category) {
          return res.status(400).json({ error: 'Title and category are required' });
        }

        const validCategories = ['insurance', 'bylaws', 'policies', 'procedures', 'forms', 'other'];
        if (!validCategories.includes(category)) {
          return res.status(400).json({ error: 'Invalid category' });
        }

        try {
          const fileStorage = new TenantFileStorage(req.tenant!.id);
          
          const uploadResult = await fileStorage.uploadFile({
            tenantId: req.tenant!.id,
            userId: req.user!.id,
            category: 'general-docs',
            visibility: 'private',
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            content: req.file.buffer,
          });

          if (!uploadResult.success) {
            console.error('[DOCUMENTS UPLOAD] Upload failed:', uploadResult.error);
            return res.status(500).json({ error: uploadResult.error || 'Failed to upload file' });
          }

          const [document] = await db
            .insert(documents)
            .values({
              title,
              description: description || null,
              category,
              fileUrl: uploadResult.fileUrl,
              fileSize: req.file.size,
              fileName: req.file.originalname,
              tenantId: req.tenant!.id,
              uploadedBy: req.user!.id,
              storageType: uploadResult.storageType,
              driveFileId: uploadResult.driveFileId || null,
            })
            .returning();

          console.log(`[DOCUMENTS UPLOAD] Document uploaded successfully: ${document.id} via ${uploadResult.storageType}`);
          res.json({ document });
        } catch (innerError) {
          next(innerError);
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/documents/upload-url
   * Get presigned URL for uploading a document (admin only) - LEGACY
   */
  app.post('/api/documents/upload-url', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      
      const { uploadUrl, objectPath } = await objectStorageService.getDocumentUploadURL();
      
      res.json({ uploadUrl, objectPath });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/documents
   * Create document metadata after upload (admin only) - LEGACY
   */
  app.post('/api/documents', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { documents, insertDocumentSchema } = await import('@shared/schema');
      
      const data = insertDocumentSchema.parse(req.body);

      const [document] = await db
        .insert(documents)
        .values({
          ...data,
          tenantId: req.tenant!.id,
          uploadedBy: req.user!.id,
        })
        .returning();

      res.json({ document });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/documents/:id
   * Update document metadata (admin only)
   */
  app.patch('/api/documents/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { documents } = await import('@shared/schema');
      const { id } = req.params;
      
      const updateData: Partial<{
        title: string;
        description: string | null;
        category: "insurance" | "bylaws" | "policies" | "procedures" | "forms" | "other";
        updatedAt: Date;
      }> = { updatedAt: new Date() };
      
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.category !== undefined) updateData.category = req.body.category;

      const [document] = await db
        .update(documents)
        .set(updateData)
        .where(and(
          eq(documents.id, id),
          eq(documents.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.json({ document });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/documents/:id
   * Delete document and file (admin only)
   */
  app.delete('/api/documents/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { documents } = await import('@shared/schema');
      const { TenantFileStorage } = await import('./lib/tenantFileStorage');
      const { id } = req.params;

      // Get the document first to get the file path
      const [document] = await db
        .select()
        .from(documents)
        .where(and(
          eq(documents.id, id),
          eq(documents.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Delete from database
      await db
        .delete(documents)
        .where(eq(documents.id, id));

      // Try to delete from storage (Google Drive or Replit Object Storage)
      try {
        const fileStorage = new TenantFileStorage(req.tenant!.id);
        const deleteResult = await fileStorage.deleteFile(document.fileUrl);
        if (!deleteResult.success) {
          console.warn(`Document deletion from storage failed: ${deleteResult.error}`);
        }
      } catch (error) {
        console.error('Error deleting file from storage:', error);
        // Continue even if file deletion fails
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/documents/:id/download
   * Download a document file (authenticated users can access)
   */
  app.get('/api/documents/:id/download', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { documents } = await import('@shared/schema');
      const { ObjectStorageService } = await import('./objectStorage');
      const { id } = req.params;

      const [document] = await db
        .select()
        .from(documents)
        .where(and(
          eq(documents.id, id),
          eq(documents.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(document.fileUrl);
      
      // Set filename header for download
      res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
      
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/documents/:id/view
   * View a document file inline (for PDF viewing in browser)
   */
  app.get('/api/documents/:id/view', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { documents } = await import('@shared/schema');
      const { ObjectStorageService } = await import('./objectStorage');
      const { id } = req.params;

      const [document] = await db
        .select()
        .from(documents)
        .where(and(
          eq(documents.id, id),
          eq(documents.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(document.fileUrl);
      
      // Set inline disposition so PDF displays in browser
      res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
      
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // CUSTOM PAGES (CMS) - Public informational pages
  // ============================================================================

  /**
   * GET /api/custom-pages
   * List all custom pages (authenticated users see all, public sees published only)
   */
  app.get('/api/custom-pages', requireTenant, async (req, res, next) => {
    try {
      const { customPages } = await import('@shared/schema');
      
      // If authenticated, show all pages; otherwise show only published
      const pages = await db
        .select({
          id: customPages.id,
          title: customPages.title,
          slug: customPages.slug,
          excerpt: customPages.excerpt,
          isPublished: customPages.isPublished,
          showInNavigation: customPages.showInNavigation,
          publishedAt: customPages.publishedAt,
          createdAt: customPages.createdAt,
          updatedAt: customPages.updatedAt,
        })
        .from(customPages)
        .where(
          req.user
            ? eq(customPages.tenantId, req.tenant!.id)
            : and(
                eq(customPages.tenantId, req.tenant!.id),
                eq(customPages.isPublished, true)
              )
        )
        .orderBy(desc(customPages.updatedAt));

      res.json({ pages });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/custom-pages/navigation
   * Get published pages that should appear in the navigation header (public endpoint)
   */
  app.get('/api/custom-pages/navigation', requireTenant, async (req, res, next) => {
    try {
      const { customPages } = await import('@shared/schema');
      
      const pages = await db
        .select({
          id: customPages.id,
          title: customPages.title,
          slug: customPages.slug,
        })
        .from(customPages)
        .where(
          and(
            eq(customPages.tenantId, req.tenant!.id),
            eq(customPages.isPublished, true),
            eq(customPages.showInNavigation, true)
          )
        )
        .orderBy(customPages.title);

      res.json({ pages });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/custom-pages/slug/:slug
   * Get a specific page by slug (public endpoint, only returns published pages unless authenticated)
   */
  app.get('/api/custom-pages/slug/:slug', requireTenant, async (req, res, next) => {
    try {
      const { customPages } = await import('@shared/schema');
      const { slug } = req.params;

      const [page] = await db
        .select()
        .from(customPages)
        .where(
          req.user
            ? and(
                eq(customPages.tenantId, req.tenant!.id),
                eq(customPages.slug, slug)
              )
            : and(
                eq(customPages.tenantId, req.tenant!.id),
                eq(customPages.slug, slug),
                eq(customPages.isPublished, true)
              )
        )
        .limit(1);

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      res.json({ page });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/custom-pages
   * Create a new custom page (admin only)
   */
  app.post('/api/custom-pages', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { customPages, insertCustomPageSchema } = await import('@shared/schema');
      
      // Only validate fields sent by client (exclude server-populated fields)
      const clientSchema = insertCustomPageSchema.omit({ 
        tenantId: true, 
        createdBy: true, 
        updatedBy: true 
      });
      const validatedData = clientSchema.parse(req.body);

      const [newPage] = await db
        .insert(customPages)
        .values({
          ...validatedData,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        })
        .returning();

      res.status(201).json({ page: newPage });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/custom-pages/:id
   * Update a custom page (admin only)
   */
  app.patch('/api/custom-pages/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { customPages, insertCustomPageSchema } = await import('@shared/schema');
      const { id } = req.params;

      // Validate the update data (make fields optional for partial updates, exclude server-populated fields)
      const updateSchema = insertCustomPageSchema.omit({ 
        tenantId: true, 
        createdBy: true, 
        updatedBy: true 
      }).partial();
      const validatedData = updateSchema.parse(req.body);

      const [updatedPage] = await db
        .update(customPages)
        .set({
          ...validatedData,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(and(
          eq(customPages.id, id),
          eq(customPages.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!updatedPage) {
        return res.status(404).json({ error: 'Page not found' });
      }

      res.json({ page: updatedPage });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/custom-pages/:id/publish
   * Toggle publish status of a custom page (admin only)
   */
  app.patch('/api/custom-pages/:id/publish', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { customPages } = await import('@shared/schema');
      const { id } = req.params;
      const { isPublished } = req.body;

      if (typeof isPublished !== 'boolean') {
        return res.status(400).json({ error: 'isPublished must be a boolean' });
      }

      const [updatedPage] = await db
        .update(customPages)
        .set({
          isPublished,
          publishedAt: isPublished ? new Date() : null,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(and(
          eq(customPages.id, id),
          eq(customPages.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!updatedPage) {
        return res.status(404).json({ error: 'Page not found' });
      }

      res.json({ page: updatedPage });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/custom-pages/:id
   * Delete a custom page (admin only)
   */
  app.delete('/api/custom-pages/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { customPages } = await import('@shared/schema');
      const { id } = req.params;

      const [deletedPage] = await db
        .delete(customPages)
        .where(and(
          eq(customPages.id, id),
          eq(customPages.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deletedPage) {
        return res.status(404).json({ error: 'Page not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Content Modules Routes - Customizable home page cards
  // ============================================================================

  /**
   * GET /api/content-modules
   * Get all content modules for tenant (public)
   * Only returns active modules when accessed by unauthenticated users
   */
  app.get('/api/content-modules', requireTenant, async (req, res, next) => {
    try {
      const { contentModules } = await import('@shared/schema');
      
      // If authenticated, show all modules; otherwise show only active
      const modules = await db
        .select()
        .from(contentModules)
        .where(
          req.user
            ? eq(contentModules.tenantId, req.tenant!.id)
            : and(
                eq(contentModules.tenantId, req.tenant!.id),
                eq(contentModules.isActive, true)
              )
        )
        .orderBy(contentModules.displayOrder, contentModules.createdAt);

      res.json({ modules });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/content-modules/:id
   * Get a single content module (admin only)
   */
  app.get('/api/content-modules/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { contentModules } = await import('@shared/schema');
      const { id } = req.params;

      const [module] = await db
        .select()
        .from(contentModules)
        .where(and(
          eq(contentModules.id, id),
          eq(contentModules.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!module) {
        return res.status(404).json({ error: 'Content module not found' });
      }

      res.json(module);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/content-modules
   * Create a new content module (admin only)
   */
  app.post('/api/content-modules', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { contentModules, insertContentModuleSchema } = await import('@shared/schema');
      
      // Validate request body
      const clientSchema = insertContentModuleSchema.omit({ 
        createdBy: true,
        updatedBy: true,
      });
      const validatedData = clientSchema.parse(req.body);

      // Apply server-side sanitization to styling values (defense in depth)
      const sanitizedData = {
        ...validatedData,
        styling: validatedData.styling 
          ? sanitizeContentModuleStyling(validatedData.styling)
          : undefined,
      };

      const [newModule] = await db
        .insert(contentModules)
        .values({
          ...sanitizedData,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        })
        .returning();

      res.status(201).json(newModule);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/content-modules/:id
   * Update a content module (admin only)
   */
  app.patch('/api/content-modules/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { contentModules, insertContentModuleSchema } = await import('@shared/schema');
      const { id } = req.params;

      // Validate the update data (make fields optional for partial updates)
      const updateSchema = insertContentModuleSchema.omit({
        createdBy: true,
        updatedBy: true,
      }).partial();
      const validatedData = updateSchema.parse(req.body);

      // Apply server-side sanitization to styling values (defense in depth)
      const sanitizedData = {
        ...validatedData,
        styling: validatedData.styling 
          ? sanitizeContentModuleStyling(validatedData.styling)
          : undefined,
      };

      const [updatedModule] = await db
        .update(contentModules)
        .set({
          ...sanitizedData,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(and(
          eq(contentModules.id, id),
          eq(contentModules.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!updatedModule) {
        return res.status(404).json({ error: 'Content module not found' });
      }

      res.json(updatedModule);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/content-modules/:id
   * Delete a content module (admin only)
   */
  app.delete('/api/content-modules/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { contentModules } = await import('@shared/schema');
      const { id } = req.params;

      const [deletedModule] = await db
        .delete(contentModules)
        .where(and(
          eq(contentModules.id, id),
          eq(contentModules.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deletedModule) {
        return res.status(404).json({ error: 'Content module not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/calendars/export/ical
   * Export calendars as iCal (.ics) file
   */
  app.get('/api/calendars/export/ical', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { calendars: calendarsSchema, calendarEvents } = await import('@shared/schema');
      
      // Get all events for the tenant
      const events = await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.tenantId, req.tenant!.id))
        .orderBy(calendarEvents.startTime);

      // Generate iCal format
      const ical = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Animal Rescue Calendar//EN',
        `CALSCALE:GREGORIAN`,
        `X-WR-CALNAME:${req.tenant!.name}`,
        `X-WR-TIMEZONE:UTC`,
        ...events.flatMap(event => [
          'BEGIN:VEVENT',
          `UID:${event.id}@rescueportal.com`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
          `DTSTART:${new Date(event.startTime).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
          `DTEND:${new Date(event.endTime).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
          `SUMMARY:${event.title}`,
          ...(event.description ? [`DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`] : []),
          ...(event.location ? [`LOCATION:${event.location}`] : []),
          'END:VEVENT'
        ]),
        'END:VCALENDAR'
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${req.tenant!.subdomain}-calendar.ics"`);
      res.send(ical);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Analytics Routes
   */
  
  /**
   * GET /api/analytics/overview
   * Get comprehensive analytics overview for a tenant
   * Query params: startDate (ISO string), endDate (ISO string)
   */
  app.get('/api/analytics/overview', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { getAnalyticsOverview } = await import('./services/analytics');
      
      // Parse date range from query params (default to last 30 days)
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      const analytics = await getAnalyticsOverview(req.tenant!.id, { startDate, endDate });
      
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/analytics/trends
   * Get trend data over time for charts
   * Query params: startDate, endDate, granularity (day|week|month)
   */
  app.get('/api/analytics/trends', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { getTrendData } = await import('./services/analytics');
      
      // Parse date range and granularity
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      const granularity = (req.query.granularity as 'day' | 'week' | 'month') || 'month';
      
      const trends = await getTrendData(req.tenant!.id, { startDate, endDate }, granularity);
      
      res.json(trends);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/analytics/species-breakdown
   * Get detailed metrics breakdown by species
   */
  app.get('/api/analytics/species-breakdown', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { getSpeciesBreakdown } = await import('./services/analytics');
      
      const breakdown = await getSpeciesBreakdown(req.tenant!.id);
      
      res.json(breakdown);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Page Visit Tracking Routes
   */

  /**
   * POST /api/page-visits
   * Record a page visit (public endpoint - no auth required)
   */
  const pageVisitSchema = z.object({
    pagePath: z.string().min(1).max(500),
    pageType: z.enum(['home', 'animals', 'animal_profile', 'donate', 'wishlist', 'foster', 'volunteer', 'surrender', 'contact', 'shop', 'campaign', 'custom', 'other']),
    visitorId: z.string().max(100).optional().nullable(),
    sessionId: z.string().max(100).optional().nullable(),
    referrer: z.string().max(2000).optional().nullable(),
  });

  app.post('/api/page-visits', requireTenant, async (req, res, next) => {
    try {
      const parsed = pageVisitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
      }

      const { pagePath, pageType, visitorId, sessionId, referrer } = parsed.data;

      // Hash IP for privacy
      const ip = req.ip || req.socket.remoteAddress || '';
      const crypto = await import('crypto');
      const ipHash = crypto.createHash('sha256').update(ip + req.tenant!.id).digest('hex').substring(0, 16);

      await db.insert(pageVisits).values({
        tenantId: req.tenant!.id,
        pagePath,
        pageType,
        visitorId: visitorId || null,
        sessionId: sessionId || null,
        referrer: referrer || req.get('Referer') || null,
        userAgent: req.get('User-Agent') || null,
        ipHash,
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/analytics/page-visits
   * Get page visit stats for dashboard widget (admin only)
   */
  app.get('/api/analytics/page-visits', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const tenantId = req.tenant!.id;
      
      // Get dates for today, this week, and last week
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of this week (Sunday)
      const lastWeekStart = new Date(weekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(weekStart);
      
      // Today's visits
      const [todayResult] = await db
        .select({ count: count() })
        .from(pageVisits)
        .where(and(
          eq(pageVisits.tenantId, tenantId),
          gte(pageVisits.visitedAt, todayStart)
        ));
      
      // This week's visits
      const [thisWeekResult] = await db
        .select({ count: count() })
        .from(pageVisits)
        .where(and(
          eq(pageVisits.tenantId, tenantId),
          gte(pageVisits.visitedAt, weekStart)
        ));
      
      // Last week's visits (for comparison)
      const [lastWeekResult] = await db
        .select({ count: count() })
        .from(pageVisits)
        .where(and(
          eq(pageVisits.tenantId, tenantId),
          gte(pageVisits.visitedAt, lastWeekStart),
          lt(pageVisits.visitedAt, lastWeekEnd)
        ));
      
      // Unique visitors today (by ipHash)
      const [uniqueTodayResult] = await db
        .select({ count: sql<number>`count(distinct ${pageVisits.ipHash})` })
        .from(pageVisits)
        .where(and(
          eq(pageVisits.tenantId, tenantId),
          gte(pageVisits.visitedAt, todayStart)
        ));
      
      // Unique visitors this week
      const [uniqueWeekResult] = await db
        .select({ count: sql<number>`count(distinct ${pageVisits.ipHash})` })
        .from(pageVisits)
        .where(and(
          eq(pageVisits.tenantId, tenantId),
          gte(pageVisits.visitedAt, weekStart)
        ));
      
      // Top pages this week
      const topPages = await db
        .select({
          pageType: pageVisits.pageType,
          count: count(),
        })
        .from(pageVisits)
        .where(and(
          eq(pageVisits.tenantId, tenantId),
          gte(pageVisits.visitedAt, weekStart)
        ))
        .groupBy(pageVisits.pageType)
        .orderBy(desc(count()))
        .limit(5);
      
      // Calculate trend
      const thisWeekCount = thisWeekResult?.count || 0;
      const lastWeekCount = lastWeekResult?.count || 0;
      let trendPercentage = 0;
      if (lastWeekCount > 0) {
        trendPercentage = Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100);
      } else if (thisWeekCount > 0) {
        trendPercentage = 100; // All new visits
      }

      res.json({
        today: {
          views: todayResult?.count || 0,
          uniqueVisitors: uniqueTodayResult?.count || 0,
        },
        thisWeek: {
          views: thisWeekCount,
          uniqueVisitors: uniqueWeekResult?.count || 0,
        },
        lastWeek: {
          views: lastWeekCount,
        },
        trendPercentage,
        topPages: topPages.map(p => ({
          pageType: p.pageType,
          views: p.count,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Push Notification Routes
   */
  
  /**
   * GET /api/push/vapid-key
   * Get VAPID public key for push subscription
   */
  app.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: PushNotificationService.getVapidPublicKey() });
  });

  /**
   * POST /api/push/subscribe
   * Subscribe to push notifications
   */
  app.post('/api/push/subscribe', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { subscription } = req.body;
      
      if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ error: 'Invalid subscription data' });
      }

      const userAgent = req.get('user-agent') || undefined;
      
      const saved = await PushNotificationService.subscribe(
        req.tenant!.id,
        req.user!.id,
        subscription,
        userAgent
      );

      res.json(saved);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/push/unsubscribe
   * Unsubscribe from push notifications
   */
  app.delete('/api/push/unsubscribe', requireAuth, async (req, res, next) => {
    try {
      const { endpoint } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint required' });
      }

      await PushNotificationService.unsubscribe(endpoint);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/push/subscriptions
   * Get user's push subscriptions
   */
  app.get('/api/push/subscriptions', requireAuth, async (req, res, next) => {
    try {
      const subscriptions = await PushNotificationService.getUserSubscriptions(req.user!.id);
      res.json(subscriptions);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/push/test
   * Send a test notification (admin only)
   */
  app.post('/api/push/test', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const result = await PushNotificationService.sendToUser(req.user!.id, {
        title: 'Test Notification',
        body: 'This is a test notification from iRescue',
        icon: '/icon-192.png',
        tag: 'test',
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // SUPPLY REGISTRY - Public wishlist/supply needs tracking
  // ============================================================================

  /**
   * GET /api/supply-categories
   * List all active supply categories
   */
  app.get('/api/supply-categories', requireTenant, async (req, res, next) => {
    try {
      const { supplyCategories } = await import('@shared/schema');
      
      const categories = await db
        .select()
        .from(supplyCategories)
        .where(and(
          eq(supplyCategories.tenantId, req.tenant!.id),
          eq(supplyCategories.isActive, true)
        ))
        .orderBy(supplyCategories.displayOrder, supplyCategories.name);

      res.json({ categories });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/supply-categories
   * Create a new supply category (admin/staff only)
   */
  app.post('/api/supply-categories', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { supplyCategories, insertSupplyCategorySchema } = await import('@shared/schema');
      
      const data = insertSupplyCategorySchema.parse(req.body);

      const [category] = await db
        .insert(supplyCategories)
        .values([{ ...data, tenantId: req.tenant!.id } as any])
        .returning();

      res.json({ success: true, category });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/supply-categories/:id
   * Update a supply category (admin/staff only)
   */
  app.patch('/api/supply-categories/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { supplyCategories } = await import('@shared/schema');
      
      const updateSchema = z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        displayOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      });

      const data = updateSchema.parse(req.body);

      const [category] = await db
        .update(supplyCategories)
        .set(data)
        .where(and(
          eq(supplyCategories.id, req.params.id),
          eq(supplyCategories.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({ success: true, category });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/supply-categories/:id
   * Delete a supply category (admin only)
   */
  app.delete('/api/supply-categories/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { supplyCategories } = await import('@shared/schema');
      
      await db
        .delete(supplyCategories)
        .where(and(
          eq(supplyCategories.id, req.params.id),
          eq(supplyCategories.tenantId, req.tenant!.id)
        ));

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/supply-items
   * List supply items (public can view active, staff can view all)
   */
  app.get('/api/supply-items', requireTenant, async (req, res, next) => {
    try {
      const { supplyItems, supplyCategories, users } = await import('@shared/schema');
      
      const { status, categoryId, priority } = req.query;

      const conditions = [eq(supplyItems.tenantId, req.tenant!.id)];

      // Public users only see active items
      if (!req.user) {
        conditions.push(eq(supplyItems.status, 'active'));
      } else if (status) {
        conditions.push(eq(supplyItems.status, status as any));
      }

      if (categoryId) {
        conditions.push(eq(supplyItems.categoryId, categoryId as string));
      }

      if (priority) {
        conditions.push(eq(supplyItems.priority, priority as any));
      }

      const itemRows = await db
        .select({
          id: supplyItems.id,
          categoryId: supplyItems.categoryId,
          title: supplyItems.title,
          description: supplyItems.description,
          imageUrl: supplyItems.imageUrl,
          quantityNeeded: supplyItems.quantityNeeded,
          quantityFulfilled: supplyItems.quantityFulfilled,
          unitPrice: supplyItems.unitPrice,
          currency: supplyItems.currency,
          priority: supplyItems.priority,
          status: supplyItems.status,
          amazonUrl: supplyItems.amazonUrl,
          chewyUrl: supplyItems.chewyUrl,
          petsmartUrl: supplyItems.petsmartUrl,
          otherRetailerUrl: supplyItems.otherRetailerUrl,
          otherRetailerName: supplyItems.otherRetailerName,
          publicNote: supplyItems.publicNote,
          notes: req.user ? supplyItems.notes : sql`NULL`,
          createdBy: supplyItems.createdBy,
          createdAt: supplyItems.createdAt,
          updatedAt: supplyItems.updatedAt,
          categoryName: supplyCategories.name,
          categoryDescription: supplyCategories.description,
          creatorName: users.fullName,
          creatorEmail: users.email,
        })
        .from(supplyItems)
        .leftJoin(supplyCategories, eq(supplyItems.categoryId, supplyCategories.id))
        .leftJoin(users, eq(supplyItems.createdBy, users.id))
        .where(and(...conditions))
        .orderBy(
          desc(supplyItems.priority),
          supplyItems.createdAt
        );

      // Transform flat results into nested structure for backwards compatibility
      // Use primary key checks for null guards to handle empty strings correctly
      const items = itemRows.map(row => ({
        id: row.id,
        categoryId: row.categoryId,
        title: row.title,
        description: row.description,
        imageUrl: row.imageUrl,
        quantityNeeded: row.quantityNeeded,
        quantityFulfilled: row.quantityFulfilled,
        unitPrice: row.unitPrice,
        currency: row.currency,
        priority: row.priority,
        status: row.status,
        amazonUrl: row.amazonUrl,
        chewyUrl: row.chewyUrl,
        petsmartUrl: row.petsmartUrl,
        otherRetailerUrl: row.otherRetailerUrl,
        otherRetailerName: row.otherRetailerName,
        publicNote: row.publicNote,
        notes: row.notes,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        category: row.categoryId ? {
          id: row.categoryId,
          name: row.categoryName,
          description: row.categoryDescription,
        } : null,
        creator: row.createdBy ? {
          id: row.createdBy,
          fullName: row.creatorName,
          email: row.creatorEmail,
        } : null,
      }));

      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/supply-items/:id
   * Get a specific supply item by ID
   */
  app.get('/api/supply-items/:id', requireTenant, async (req, res, next) => {
    try {
      const { supplyItems, supplyCategories } = await import('@shared/schema');
      
      const [itemRow] = await db
        .select({
          id: supplyItems.id,
          categoryId: supplyItems.categoryId,
          title: supplyItems.title,
          description: supplyItems.description,
          imageUrl: supplyItems.imageUrl,
          quantityNeeded: supplyItems.quantityNeeded,
          quantityFulfilled: supplyItems.quantityFulfilled,
          unitPrice: supplyItems.unitPrice,
          currency: supplyItems.currency,
          priority: supplyItems.priority,
          status: supplyItems.status,
          amazonUrl: supplyItems.amazonUrl,
          chewyUrl: supplyItems.chewyUrl,
          petsmartUrl: supplyItems.petsmartUrl,
          otherRetailerUrl: supplyItems.otherRetailerUrl,
          otherRetailerName: supplyItems.otherRetailerName,
          publicNote: supplyItems.publicNote,
          notes: req.user ? supplyItems.notes : sql`NULL`,
          createdAt: supplyItems.createdAt,
          updatedAt: supplyItems.updatedAt,
          categoryName: supplyCategories.name,
          categoryDescription: supplyCategories.description,
        })
        .from(supplyItems)
        .leftJoin(supplyCategories, eq(supplyItems.categoryId, supplyCategories.id))
        .where(and(
          eq(supplyItems.id, req.params.id),
          eq(supplyItems.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!itemRow) {
        return res.status(404).json({ error: 'Supply item not found' });
      }

      // Hide internal notes from public
      if (!req.user && itemRow.status !== 'active') {
        return res.status(404).json({ error: 'Supply item not found' });
      }

      // Transform flat result into nested structure for backwards compatibility
      // Use primary key check for null guard to handle empty strings correctly
      const item = {
        id: itemRow.id,
        categoryId: itemRow.categoryId,
        title: itemRow.title,
        description: itemRow.description,
        imageUrl: itemRow.imageUrl,
        quantityNeeded: itemRow.quantityNeeded,
        quantityFulfilled: itemRow.quantityFulfilled,
        unitPrice: itemRow.unitPrice,
        currency: itemRow.currency,
        priority: itemRow.priority,
        status: itemRow.status,
        amazonUrl: itemRow.amazonUrl,
        chewyUrl: itemRow.chewyUrl,
        petsmartUrl: itemRow.petsmartUrl,
        otherRetailerUrl: itemRow.otherRetailerUrl,
        otherRetailerName: itemRow.otherRetailerName,
        publicNote: itemRow.publicNote,
        notes: itemRow.notes,
        createdAt: itemRow.createdAt,
        updatedAt: itemRow.updatedAt,
        category: itemRow.categoryId ? {
          id: itemRow.categoryId,
          name: itemRow.categoryName,
          description: itemRow.categoryDescription,
        } : null,
      };

      res.json({ item });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/supply-items
   * Create a new supply item (staff only)
   */
  app.post('/api/supply-items', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { supplyItems, insertSupplyItemSchema } = await import('@shared/schema');
      
      const data = insertSupplyItemSchema.parse(req.body);

      const [item] = await db
        .insert(supplyItems)
        .values([{
          ...data,
          tenantId: req.tenant!.id,
          createdBy: req.user!.id,
        } as any])
        .returning();

      res.json({ success: true, item });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/supply-items/:id
   * Update a supply item (staff only)
   */
  app.patch('/api/supply-items/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { supplyItems } = await import('@shared/schema');
      
      const updateSchema = z.object({
        categoryId: z.string().uuid().optional(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        imageUrl: z.string().optional(),
        quantityNeeded: z.number().int().min(1).optional(),
        quantityFulfilled: z.number().int().min(0).optional(),
        unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        status: z.enum(['active', 'fulfilled', 'paused']).optional(),
        amazonUrl: z.string().url().optional().or(z.literal("")),
        chewyUrl: z.string().url().optional().or(z.literal("")),
        petsmartUrl: z.string().url().optional().or(z.literal("")),
        otherRetailerUrl: z.string().url().optional().or(z.literal("")),
        otherRetailerName: z.string().optional(),
        notes: z.string().optional(),
        publicNote: z.string().optional(),
      });

      const data = updateSchema.parse(req.body);

      const [item] = await db
        .update(supplyItems)
        .set({
          ...data,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(and(
          eq(supplyItems.id, req.params.id),
          eq(supplyItems.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!item) {
        return res.status(404).json({ error: 'Supply item not found' });
      }

      res.json({ success: true, item });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/supply-items/:id
   * Delete a supply item (admin only)
   */
  app.delete('/api/supply-items/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { supplyItems } = await import('@shared/schema');
      
      await db
        .delete(supplyItems)
        .where(and(
          eq(supplyItems.id, req.params.id),
          eq(supplyItems.tenantId, req.tenant!.id)
        ));

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/supply-items/:id/checkout
   * Create a Stripe checkout session for a supply item donation (public endpoint)
   */
  app.post('/api/supply-items/:id/checkout', requireTenant, async (req, res, next) => {
    try {
      const { supplyItems } = await import('@shared/schema');
      const { stripeService } = await import('./lib/stripe-service');

      // Get the supply item
      const [item] = await db
        .select()
        .from(supplyItems)
        .where(and(
          eq(supplyItems.id, req.params.id),
          eq(supplyItems.tenantId, req.tenant!.id),
          eq(supplyItems.status, 'active')
        ))
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: 'Supply item not found or not available' });
      }

      // Get tenant for Stripe config
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.tenant!.id))
        .limit(1);

      if (!tenant || !tenant.stripeEnabled) {
        return res.status(400).json({ 
          error: "Stripe is not configured for this rescue" 
        });
      }

      // Validate item has a price
      if (!item.unitPrice || parseFloat(item.unitPrice) <= 0) {
        return res.status(400).json({ 
          error: "This item does not have a price set for donations" 
        });
      }

      const checkoutSchema = z.object({
        quantity: z.number().int().min(1).max(100).default(1),
        customerEmail: z.string().email().optional(),
        donorCoversFees: z.boolean().default(false),
      });

      const data = checkoutSchema.parse(req.body);
      
      // Calculate total amount in cents
      const itemPriceCents = Math.round(parseFloat(item.unitPrice) * 100);
      const baseAmount = itemPriceCents * data.quantity;

      const { calculateDonorCoversFees, calculatePlatformFee, getPlatformFeePercent } = await import('./config/platform');

      // If donor covers fees, calculate the grossed-up amount
      let chargeAmount = baseAmount;
      let feesCovered = 0;
      if (data.donorCoversFees) {
        const feeCalc = calculateDonorCoversFees(baseAmount, tenant.subscriptionTier || 'free', tenant.platformFeePercent);
        chargeAmount = feeCalc.totalAmount;
        feesCovered = feeCalc.feesCovered;
      }

      // Calculate platform fee (pass tenant override if set)
      const platformFeeAmount = calculatePlatformFee(chargeAmount, tenant.subscriptionTier || 'free', tenant.platformFeePercent);
      const platformFeePercent = getPlatformFeePercent(tenant.subscriptionTier || 'free', tenant.platformFeePercent);

      // Build URLs
      const isCustomDomain = tenant.customDomain && tenant.customDomainVerified;
      const baseUrl = isCustomDomain 
        ? `https://${tenant.customDomain}`
        : `${req.protocol}://${req.get('host')}`;
      const tenantPath = isCustomDomain ? '' : (tenant.subdomain ? `/${tenant.subdomain}` : '');
      
      const session = await stripeService.createCheckoutSession(tenant, {
        amount: chargeAmount,
        currency: item.currency.toLowerCase(),
        customerEmail: data.customerEmail,
        isRecurring: false,
        successUrl: `${baseUrl}${tenantPath}/wishlist?donation=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}${tenantPath}/wishlist?donation=cancelled`,
        platformFeeAmount: platformFeeAmount,
        connectedAccountId: tenant.stripeConnectedAccountId || undefined,
        metadata: {
          supplyItemId: item.id,
          supplyItemTitle: item.title.substring(0, 100), // Stripe metadata has length limits
          quantity: data.quantity.toString(),
          baseAmount: baseAmount.toString(),
          chargeAmount: chargeAmount.toString(),
          donorCoveredFees: data.donorCoversFees.toString(),
          feesCovered: feesCovered.toString(),
          platformFeeAmount: platformFeeAmount.toString(),
          platformFeePercent: platformFeePercent.toString(),
          platformFeeCollected: (tenant.stripeConnectedAccountId && platformFeeAmount > 0 ? 'true' : 'false'),
        },
      });

      if (!session) {
        return res.status(500).json({ 
          error: "Failed to create checkout session" 
        });
      }

      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error('[Supply Item Checkout Error]', {
        message: error?.message,
        itemId: req.params.id,
        tenantId: req.tenant?.id,
      });
      next(error);
    }
  });

  /**
   * GET /api/supply-donations
   * List supply donations (staff only)
   */
  app.get('/api/supply-donations', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { supplyDonations, supplyItems } = await import('@shared/schema');
      
      const { supplyItemId, fulfillmentStatus } = req.query;

      const conditions = [eq(supplyDonations.tenantId, req.tenant!.id)];

      if (supplyItemId) {
        conditions.push(eq(supplyDonations.supplyItemId, supplyItemId as string));
      }

      if (fulfillmentStatus) {
        conditions.push(eq(supplyDonations.fulfillmentStatus, fulfillmentStatus as any));
      }

      const donations = await db
        .select({
          id: supplyDonations.id,
          supplyItemId: supplyDonations.supplyItemId,
          donorName: supplyDonations.donorName,
          donorEmail: supplyDonations.donorEmail,
          quantity: supplyDonations.quantity,
          amount: supplyDonations.amount,
          currency: supplyDonations.currency,
          donationType: supplyDonations.donationType,
          paymentMethod: supplyDonations.paymentMethod,
          fulfillmentStatus: supplyDonations.fulfillmentStatus,
          trackingNumber: supplyDonations.trackingNumber,
          donorMessage: supplyDonations.donorMessage,
          thankYouSent: supplyDonations.thankYouSent,
          createdAt: supplyDonations.createdAt,
          supplyItem: supplyItems,
        })
        .from(supplyDonations)
        .leftJoin(supplyItems, eq(supplyDonations.supplyItemId, supplyItems.id))
        .where(and(...conditions))
        .orderBy(desc(supplyDonations.createdAt));

      res.json({ donations });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/supply-donations
   * Record a supply donation (public endpoint)
   */
  app.post('/api/supply-donations', requireTenant, async (req, res, next) => {
    try {
      const { supplyDonations, supplyItems, insertSupplyDonationSchema } = await import('@shared/schema');
      
      const data = insertSupplyDonationSchema.parse(req.body);

      // Validate the supply item exists and is active
      const [item] = await db
        .select()
        .from(supplyItems)
        .where(and(
          eq(supplyItems.id, data.supplyItemId),
          eq(supplyItems.tenantId, req.tenant!.id),
          eq(supplyItems.status, 'active')
        ))
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: 'Supply item not found or not available' });
      }

      const [donation] = await db
        .insert(supplyDonations)
        .values([{
          ...data,
          tenantId: req.tenant!.id,
        } as any])
        .returning();

      // Update quantity fulfilled if it's a physical or both donation
      if (data.donationType === 'physical' || data.donationType === 'both') {
        await db
          .update(supplyItems)
          .set({
            quantityFulfilled: sql`${supplyItems.quantityFulfilled} + ${data.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(supplyItems.id, data.supplyItemId));

        // Check if item is now fully fulfilled
        const [updatedItem] = await db
          .select()
          .from(supplyItems)
          .where(eq(supplyItems.id, data.supplyItemId))
          .limit(1);

        if (updatedItem && updatedItem.quantityFulfilled >= updatedItem.quantityNeeded) {
          await db
            .update(supplyItems)
            .set({ status: 'fulfilled' })
            .where(eq(supplyItems.id, data.supplyItemId));
        }
      }

      res.json({ success: true, donation });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/supply-donations/:id
   * Update donation fulfillment status (staff only)
   */
  app.patch('/api/supply-donations/:id', requireTenant, requireAuth, requireRole('staff'), async (req, res, next) => {
    try {
      const { supplyDonations } = await import('@shared/schema');
      
      const updateSchema = z.object({
        fulfillmentStatus: z.enum(['pending', 'processing', 'shipped', 'delivered', 'received']).optional(),
        trackingNumber: z.string().optional(),
        notes: z.string().optional(),
        thankYouSent: z.boolean().optional(),
      });

      const data = updateSchema.parse(req.body);

      const [donation] = await db
        .update(supplyDonations)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(
          eq(supplyDonations.id, req.params.id),
          eq(supplyDonations.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!donation) {
        return res.status(404).json({ error: 'Donation not found' });
      }

      res.json({ success: true, donation });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Page Permissions Routes - Control role-based access to pages
  // ============================================================================

  /**
   * GET /api/page-permissions
   * Get all page permissions for current tenant
   */
  app.get('/api/page-permissions', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { pagePermissions } = await import('@shared/schema');
      
      const permissions = await db
        .select()
        .from(pagePermissions)
        .where(eq(pagePermissions.tenantId, req.tenant!.id))
        .orderBy(pagePermissions.displayName);

      res.json({ pagePermissions: permissions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/page-permissions
   * Create or update page permission (admin only)
   */
  app.post('/api/page-permissions', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { pagePermissions, insertPagePermissionSchema } = await import('@shared/schema');
      
      const data = insertPagePermissionSchema.parse(req.body);

      // Check if permission for this page already exists
      const [existing] = await db
        .select()
        .from(pagePermissions)
        .where(and(
          eq(pagePermissions.tenantId, req.tenant!.id),
          eq(pagePermissions.pageId, data.pageId)
        ))
        .limit(1);

      let permission;
      if (existing) {
        // Update existing permission
        [permission] = await db
          .update(pagePermissions)
          .set({
            ...data,
            tenantId: req.tenant!.id,
            updatedAt: new Date(),
          })
          .where(eq(pagePermissions.id, existing.id))
          .returning();
      } else {
        // Create new permission
        [permission] = await db
          .insert(pagePermissions)
          .values({
            ...data,
            tenantId: req.tenant!.id,
          })
          .returning();
      }

      res.json({ pagePermission: permission });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/page-permissions/:id
   * Update page permission (admin only)
   */
  app.patch('/api/page-permissions/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { pagePermissions } = await import('@shared/schema');
      
      const updateSchema = z.object({
        allowedRoles: z.array(z.enum(['admin', 'board_member', 'staff', 'foster', 'volunteer'])).optional(),
        isActive: z.boolean().optional(),
        displayName: z.string().optional(),
        description: z.string().optional(),
      });

      const data = updateSchema.parse(req.body);

      const [permission] = await db
        .update(pagePermissions)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(
          eq(pagePermissions.id, req.params.id),
          eq(pagePermissions.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!permission) {
        return res.status(404).json({ error: 'Page permission not found' });
      }

      res.json({ pagePermission: permission });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/page-permissions/:id
   * Delete page permission (admin only) - resets to default permissions
   */
  app.delete('/api/page-permissions/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { pagePermissions } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(pagePermissions)
        .where(and(
          eq(pagePermissions.id, req.params.id),
          eq(pagePermissions.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Page permission not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // VOLUNTEER OPPORTUNITIES - Opportunity posting and signup management
  // ============================================================================

  /**
   * GET /api/volunteer-opportunities
   * List all volunteer opportunities for tenant
   */
  app.get('/api/volunteer-opportunities', requireTenant, async (req, res, next) => {
    try {
      const { volunteerOpportunities, volunteerSignups } = await import('@shared/schema');
      
      const opportunities = await db
        .select()
        .from(volunteerOpportunities)
        .where(eq(volunteerOpportunities.tenantId, req.tenant!.id))
        .orderBy(volunteerOpportunities.date);

      // If user is logged in, check which opportunities they've signed up for
      if (req.user) {
        const userSignups = await db
          .select({ opportunityId: volunteerSignups.opportunityId })
          .from(volunteerSignups)
          .where(eq(volunteerSignups.userId, req.user.id));

        const signupIds = new Set(userSignups.map(s => s.opportunityId));
        
        const opportunitiesWithSignup = opportunities.map(opp => ({
          ...opp,
          signedUp: signupIds.has(opp.id),
        }));

        return res.json({ opportunities: opportunitiesWithSignup });
      }

      res.json({ opportunities });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/volunteer-opportunities
   * Create new volunteer opportunity (admin/staff only)
   */
  app.post('/api/volunteer-opportunities', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { volunteerOpportunities, insertVolunteerOpportunitySchema } = await import('@shared/schema');
      
      const data = insertVolunteerOpportunitySchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
      });

      const [opportunity] = await db
        .insert(volunteerOpportunities)
        .values(data)
        .returning();

      res.json({ opportunity });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/volunteer-opportunities/:id
   * Update volunteer opportunity (admin/staff only)
   */
  app.patch('/api/volunteer-opportunities/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { volunteerOpportunities, insertVolunteerOpportunitySchema } = await import('@shared/schema');
      
      const data = insertVolunteerOpportunitySchema.partial().parse(req.body);

      const [opportunity] = await db
        .update(volunteerOpportunities)
        .set(data)
        .where(and(
          eq(volunteerOpportunities.id, req.params.id),
          eq(volunteerOpportunities.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!opportunity) {
        return res.status(404).json({ error: 'Volunteer opportunity not found' });
      }

      res.json({ opportunity });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/volunteer-opportunities/:id
   * Delete volunteer opportunity (admin/staff only)
   */
  app.delete('/api/volunteer-opportunities/:id', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { volunteerOpportunities } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(volunteerOpportunities)
        .where(and(
          eq(volunteerOpportunities.id, req.params.id),
          eq(volunteerOpportunities.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Volunteer opportunity not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/volunteer-opportunities/:id/signup
   * Sign up for volunteer opportunity (public - no auth required)
   */
  app.post('/api/volunteer-opportunities/:id/signup', requireTenant, async (req, res, next) => {
    try {
      const { volunteerOpportunities, volunteerSignups } = await import('@shared/schema');
      
      // Validation schema for signup request body
      const signupSchema = z.object({
        applicantName: z.string().min(1),
        applicantEmail: z.string().email(),
        applicantPhone: z.string().min(1),
        customResponses: z.record(z.any()).optional(),
      });

      const validatedData = signupSchema.parse(req.body);
      
      // Check if opportunity exists and has available slots
      const [opportunity] = await db
        .select()
        .from(volunteerOpportunities)
        .where(and(
          eq(volunteerOpportunities.id, req.params.id),
          eq(volunteerOpportunities.tenantId, req.tenant!.id)
        ))
        .limit(1);

      if (!opportunity) {
        return res.status(404).json({ error: 'Volunteer opportunity not found' });
      }

      if (opportunity.slotsFilled >= opportunity.slotsTotal) {
        return res.status(400).json({ error: 'No available slots for this opportunity' });
      }

      // Check if already signed up by email
      const existing = await db.query.volunteerSignups.findFirst({
        where: and(
          eq(volunteerSignups.opportunityId, req.params.id),
          eq(volunteerSignups.applicantEmail, validatedData.applicantEmail)
        ),
      });

      if (existing) {
        return res.status(400).json({ error: 'Already signed up for this opportunity' });
      }

      // Create signup and increment slotsFilled
      const [signup] = await db
        .insert(volunteerSignups)
        .values({
          tenantId: req.tenant!.id,
          opportunityId: req.params.id,
          userId: req.user?.id || null, // Optional - only if logged in
          applicantName: validatedData.applicantName,
          applicantEmail: validatedData.applicantEmail,
          applicantPhone: validatedData.applicantPhone,
          customResponses: validatedData.customResponses,
        })
        .returning();

      await db
        .update(volunteerOpportunities)
        .set({ slotsFilled: opportunity.slotsFilled + 1 })
        .where(eq(volunteerOpportunities.id, req.params.id));

      res.json({ signup, success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/volunteer-opportunities/:id/signup
   * Cancel signup for volunteer opportunity
   */
  app.delete('/api/volunteer-opportunities/:id/signup', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { volunteerOpportunities, volunteerSignups } = await import('@shared/schema');
      
      const [deleted] = await db
        .delete(volunteerSignups)
        .where(and(
          eq(volunteerSignups.opportunityId, req.params.id),
          eq(volunteerSignups.userId, req.user!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Signup not found' });
      }

      // Decrement slotsFilled
      await db
        .update(volunteerOpportunities)
        .set({ 
          slotsFilled: sql`GREATEST(0, ${volunteerOpportunities.slotsFilled} - 1)` 
        })
        .where(eq(volunteerOpportunities.id, req.params.id));

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/volunteer-opportunities/:id/signups
   * Get list of volunteers signed up for opportunity (admin/staff only)
   */
  app.get('/api/volunteer-opportunities/:id/signups', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { volunteerSignups, users } = await import('@shared/schema');
      
      const signups = await db
        .select({
          id: volunteerSignups.id,
          createdAt: volunteerSignups.createdAt,
          userId: volunteerSignups.userId,
          applicantName: volunteerSignups.applicantName,
          applicantEmail: volunteerSignups.applicantEmail,
          applicantPhone: volunteerSignups.applicantPhone,
          customResponses: volunteerSignups.customResponses,
          userName: users.fullName,
          userEmail: users.email,
        })
        .from(volunteerSignups)
        .leftJoin(users, eq(volunteerSignups.userId, users.id))
        .where(eq(volunteerSignups.opportunityId, req.params.id));

      res.json({ signups });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/volunteer-signups
   * Get all volunteer signups (admin/staff only)
   */
  app.get('/api/volunteer-signups', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { volunteerSignups, volunteerOpportunities, users } = await import('@shared/schema');
      
      const signups = await db
        .select({
          id: volunteerSignups.id,
          createdAt: volunteerSignups.createdAt,
          userId: volunteerSignups.userId,
          applicantName: volunteerSignups.applicantName,
          applicantEmail: volunteerSignups.applicantEmail,
          applicantPhone: volunteerSignups.applicantPhone,
          customResponses: volunteerSignups.customResponses,
          opportunityId: volunteerSignups.opportunityId,
          opportunityTitle: volunteerOpportunities.title,
          userName: users.fullName,
          userEmail: users.email,
        })
        .from(volunteerSignups)
        .leftJoin(volunteerOpportunities, eq(volunteerSignups.opportunityId, volunteerOpportunities.id))
        .leftJoin(users, eq(volunteerSignups.userId, users.id))
        .where(eq(volunteerSignups.tenantId, req.tenant!.id))
        .orderBy(desc(volunteerSignups.createdAt));

      res.json({ signups });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/help-assistant
   * AI-powered help assistant for tenant admins
   */
  app.post('/api/help-assistant', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const OpenAI = (await import('openai')).default;
      
      const querySchema = z.object({
        question: z.string().min(1).max(1000),
        conversationHistory: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        })).optional().default([]),
      });

      const { question, conversationHistory } = querySchema.parse(req.body);

      // Create OpenAI client using Replit AI Integrations
      // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
      });

      // System prompt with platform context
      const systemPrompt = `You are a helpful assistant for iRescue.life, a comprehensive multi-tenant SaaS platform for animal rescue organizations. 

The platform includes these features:
- Animal Management: Track animals from intake to adoption with photos, medical records, and status updates
- Medical Records & Billing: Comprehensive medical tracking (exams, vaccines, diagnostics, procedures, medications) with integrated billing
- Application Workflow: Kanban-style adoption application processing
- Donation Processing: Stripe integration with recurring donations
- Event & Volunteer Management: Calendar system with volunteer signups
- Supply Wishlist: Public wishlist with multi-retailer support
- Contact Management: Centralized directory of adopters, donors, volunteers, and fosters
- Email Communication: Newsletter campaigns, inbound email processing, and professional email templates
- Professional Email Templates: Pre-designed, customizable templates for announcements, success stories, events, newsletters, and donation appeals
- Analytics & Reports: Dashboard insights and exportable reports
- Document Storage: Secure document management with role-based access
- Platform Integrations: Sync with PetFinder, RescueGroups.org, and Adopt-a-Pet
- Role-Based Access: Custom permissions for fosters, volunteers, staff, board members, and admins
- Custom Branding: Each rescue gets their own subdomain and branding
- Custom Domains: Use your own domain instead of [subdomain].irescue.life
- Progressive Web App: Mobile-friendly with offline capabilities

EMAIL TEMPLATES:
The platform includes professional email templates for common rescue communications:
1. **New Animal Available**: Showcase newly adoptable animals with photos and details
2. **Adoption Success Story**: Celebrate successful adoptions with photos and testimonials
3. **Upcoming Event**: Promote rescue events, adoption days, and fundraisers
4. **Monthly Newsletter**: Share updates, news, and feature multiple animals
5. **Donation Appeal**: Request donations with emotional messaging and impact statistics

To use email templates:
- Go to Emails → Campaigns
- Click "Create Campaign"
- Select a template or start from scratch
- Customize content with dynamic variables (animal names, photos, rescue info)
- Preview before sending
- Send to your subscriber list or specific segments

Templates are professionally designed with inline styles for compatibility across email clients.

CUSTOM DOMAIN SETUP:
To set up a custom domain (e.g., yourrescue.org):
1. Navigate to Settings → Custom Domain section
2. Enter your domain without "http://" or "www" (e.g., yourrescue.org)
3. Click "Save Domain"
4. Log into your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
5. Add a CNAME DNS record:
   - Type: CNAME
   - Host/Name: @ (or leave blank, or enter your domain)
   - Points to: [yoursubdomain].irescue.life (your original iRescue subdomain)
   - TTL: 3600 (or Automatic)
6. Save the DNS record at your registrar
7. Wait 5-60 minutes for DNS propagation (can take up to 48 hours in rare cases)
8. Return to Settings → Custom Domain and click "Verify DNS"
9. If verified successfully, your custom domain is now active!

DNS TROUBLESHOOTING:
- CNAME must point to your original subdomain.irescue.life (not your custom domain)
- Remove any A records or other CNAMEs for the same hostname
- Some registrars don't allow CNAME at root (@) - use www subdomain or check if they support CNAME flattening
- Use online DNS lookup tools (like whatsmydns.net or dnschecker.org) to verify your CNAME
- Clear your browser cache if the domain doesn't work after verification

When answering questions:
1. Be concise and specific
2. Reference the exact feature or page location when possible
3. Provide step-by-step instructions when helpful
4. If a feature doesn't exist, suggest workarounds if available
5. Keep responses under 300 words (can be longer for DNS/technical instructions)

The user asking is a tenant administrator or staff member.`;

      // Build messages array with conversation history
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: "user", content: question }
      ];

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-5",
        messages,
        max_completion_tokens: 1024,
      });

      const answer = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate an answer. Please try rephrasing your question.";

      res.json({ 
        answer,
        success: true 
      });
    } catch (error: any) {
      console.error('Help assistant error:', error);
      next(error);
    }
  });

  /**
   * POST /api/feedback
   * Submit feedback/issues/suggestions to platform admin
   * Available to admin and staff roles
   */
  app.post('/api/feedback', requireTenant, requireAuth, requireRole('admin', 'staff'), async (req, res, next) => {
    try {
      const { platformFeedback, insertPlatformFeedbackSchema } = await import('@shared/schema');
      
      const feedbackSchema = insertPlatformFeedbackSchema.omit({
        tenantId: true,
        userId: true,
        respondedBy: true,
        respondedAt: true,
      });
      
      const data = feedbackSchema.parse(req.body);
      
      // Create feedback record
      const [feedback] = await db.insert(platformFeedback).values({
        ...data,
        tenantId: req.tenant!.id,
        userId: req.user!.id,
      }).returning();
      
      // Send email notification to platform admins
      try {
        const { EmailService } = await import('./lib/email-service');
        
        // HTML escape function to prevent injection
        const escapeHtml = (text: string) => {
          return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        };
        
        // Get platform email address from environment or use default
        const platformEmail = process.env.PLATFORM_ADMIN_EMAIL || 'platform@irescue.life';
        
        const typeLabel = data.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const isUrgent = data.priority === 'urgent' || data.priority === 'high';
        const subject = isUrgent 
          ? `🚨 ${data.priority.toUpperCase()}: ${escapeHtml(data.subject)}`
          : `Platform Feedback: ${escapeHtml(data.subject)}`;
        
        const html = `
          ${isUrgent ? '<div style="background-color: #fee; border-left: 4px solid #f00; padding: 15px; margin-bottom: 20px;"><strong>⚠️ HIGH PRIORITY FEEDBACK</strong></div>' : ''}
          
          <h2>New Platform Feedback: ${typeLabel}</h2>
          <p>A tenant admin has submitted feedback about the platform.</p>
          
          <h3>Feedback Details:</h3>
          <ul>
            <li><strong>Tenant:</strong> ${escapeHtml(req.tenant!.name)} (${escapeHtml(req.tenant!.subdomain)})</li>
            <li><strong>Submitted by:</strong> ${escapeHtml(req.user!.fullName)} (${escapeHtml(req.user!.email)})</li>
            <li><strong>Type:</strong> ${typeLabel}</li>
            <li><strong>Priority:</strong> ${data.priority.toUpperCase()}</li>
            <li><strong>Subject:</strong> ${escapeHtml(data.subject)}</li>
          </ul>
          
          <h3>Message:</h3>
          <p>${escapeHtml(data.message)}</p>
          
          ${isUrgent ? '<p style="color: #c00; font-weight: bold;">⚠️ This feedback has been marked as high priority and may require immediate attention.</p>' : ''}
          
          <p>Please review this feedback in the platform admin panel or respond directly to the submitter.</p>
        `;
        
        // Use platform email service directly (not tenant-specific)
        const emailService = new EmailService(process.env.PLATFORM_RESEND_API_KEY || '');
        await emailService.send({
          to: platformEmail,
          subject,
          html,
          replyTo: req.user!.email, // Allow platform admin to reply directly
        });
      } catch (emailError) {
        // Don't fail the request if email fails - feedback is still saved
        console.error('Failed to send platform feedback email notification:', emailError);
      }
      
      res.json({ 
        success: true, 
        feedback: {
          id: feedback.id,
          type: feedback.type,
          subject: feedback.subject,
          priority: feedback.priority,
          status: feedback.status,
          createdAt: feedback.createdAt,
        } 
      });
    } catch (error) {
      next(error);
    }
  });

  // ========================================
  // MEDICAL REMINDER ROUTES
  // ========================================

  /**
   * GET /api/settings/medical-reminders
   * Get medical reminder settings for the tenant
   */
  app.get('/api/settings/medical-reminders', requireTenant, requireAuth, async (req, res, next) => {
    try {
      // Admin only
      if (req.user!.activeRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }
      
      const { getMedicalReminderSettings } = await import('./lib/medical-reminders');
      const settings = await getMedicalReminderSettings(req.tenant!.id);
      
      // Return default settings if none exist
      if (!settings) {
        res.json({
          isEnabled: true,
          vaccineLeadDays: 7,
          prescriptionLeadDays: 3,
          examLeadDays: 7,
          procedureLeadDays: 3,
          sendDailyDigest: true,
          sendIndividualAlerts: false,
          sendOverdueAlerts: true,
          notifyAdmins: true,
          notifyStaff: true,
          notifyFosters: true,
          requireFosterConfirmation: false,
          escalationHours: 24,
        });
        return;
      }
      
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/settings/medical-reminders
   * Update medical reminder settings for the tenant
   */
  app.put('/api/settings/medical-reminders', requireTenant, requireAuth, async (req, res, next) => {
    try {
      // Admin only
      if (req.user!.activeRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }
      
      const { createOrUpdateMedicalReminderSettings } = await import('./lib/medical-reminders');
      const { insertMedicalReminderSettingsSchema } = await import('@shared/schema');
      
      // Parse and validate the request body
      const data = insertMedicalReminderSettingsSchema.omit({ tenantId: true }).partial().parse(req.body);
      
      const settings = await createOrUpdateMedicalReminderSettings(req.tenant!.id, data);
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/dashboard/medical-reminders
   * Get medical reminder digest for dashboard widget
   */
  app.get('/api/dashboard/medical-reminders', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { getMedicalDigest, getMedicalReminderSettings } = await import('./lib/medical-reminders');
      
      // Check if reminders are enabled
      const settings = await getMedicalReminderSettings(req.tenant!.id);
      if (!settings || !settings.isEnabled) {
        res.json({ 
          enabled: false,
          overdue: [],
          dueSoon: [],
          upcoming: [],
        });
        return;
      }
      
      const digest = await getMedicalDigest(req.tenant!.id);
      res.json({
        enabled: true,
        ...digest,
        settings: {
          vaccineLeadDays: settings.vaccineLeadDays,
          prescriptionLeadDays: settings.prescriptionLeadDays,
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/medical-reminders/send
   * Manually trigger sending medical reminders (admin only)
   */
  app.post('/api/medical-reminders/send', requireTenant, requireAuth, async (req, res, next) => {
    try {
      // Admin only
      if (req.user!.activeRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }
      
      const { sendMedicalReminders } = await import('./lib/medical-reminders');
      const result = await sendMedicalReminders(req.tenant!.id);
      
      res.json({
        success: result.success,
        emailsSent: result.emailsSent,
        errors: result.errors,
        message: result.success 
          ? `Successfully sent ${result.emailsSent} reminder email${result.emailsSent !== 1 ? 's' : ''}`
          : 'Failed to send some reminders',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/medical-reminders/logs
   * Get medical reminder email logs (admin only)
   */
  app.get('/api/medical-reminders/logs', requireTenant, requireAuth, async (req, res, next) => {
    try {
      // Admin only
      if (req.user!.activeRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }
      
      const { medicalReminderLogs } = await import('@shared/schema');
      
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      
      const logs = await db
        .select()
        .from(medicalReminderLogs)
        .where(eq(medicalReminderLogs.tenantId, req.tenant!.id))
        .orderBy(desc(medicalReminderLogs.sentAt))
        .limit(limit);
      
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  // Register platform integration routes
  const { registerPlatformIntegrationRoutes } = await import('./routes/platformIntegrations');
  registerPlatformIntegrationRoutes(app);

  // Register Google Workspace integration routes
  const { registerGoogleWorkspaceRoutes } = await import('./routes/googleWorkspace');
  registerGoogleWorkspaceRoutes(app);

  // Register shop/fundraising routes
  const shopRoutes = await import('./routes/shop');
  app.use('/api/shop', shopRoutes.default);

  // Register transport/collaboration hub routes
  const transportRoutes = await import('./routes/transport');
  app.use('/api/transport', transportRoutes.default);

  // Register medical import (AI document parser) routes
  const medicalImportRoutes = await import('./routes/medicalImport');
  app.use('/api/medical-import', medicalImportRoutes.default);

  // Register RescueGroups.org data import routes
  const rescuegroupsImportRoutes = await import('./routes/rescuegroupsImport');
  app.use('/api/import', rescuegroupsImportRoutes.default);

  // Register medical file upload routes (for transport CVI documents)
  const medicalFileUploadRoutes = await import('./routes/medicalFileUpload');
  app.use('/api/animals', medicalFileUploadRoutes.default);

  // Register animal Drive file attachment routes (Google Picker API integration)
  const animalDriveFilesRoutes = await import('./routes/animalDriveFiles');
  app.use('/api/animals', animalDriveFilesRoutes.default);

  // Register compliance (SAC, Transparency Vault, Impact Dashboard, GreatNonprofits) routes
  const complianceRoutes = await import('./routes/compliance');
  app.use('/api/compliance', complianceRoutes.default);

  // Register Govee temperature monitoring routes
  const goveeRoutes = await import('./routes/govee');
  app.use('/api/govee', requireTenant, requireAuth, goveeRoutes.default);

  // Register platform admin routes
  const platformRoutes = await import('./routes/platform');
  app.use('/api/platform', platformRoutes.default);

  // Secure cron endpoint for manual triggering of retention emails
  // Protected by CRON_SECRET environment variable
  app.post('/api/cron/process-retention-emails', async (req, res, next) => {
    try {
      // Verify secret key
      const providedKey = req.query.key || req.headers['x-cron-secret'];
      const expectedKey = process.env.CRON_SECRET;

      if (!expectedKey) {
        return res.status(503).json({ 
          error: 'CRON_SECRET not configured',
          message: 'Set CRON_SECRET environment variable to enable this endpoint'
        });
      }

      if (providedKey !== expectedKey) {
        return res.status(403).json({ error: 'Invalid or missing cron secret' });
      }

      // Run the retention emails job
      const { runRetentionEmailsJob } = await import('./lib/retention-emails');
      const result = await runRetentionEmailsJob();

      res.json({
        success: true,
        message: 'Retention emails processed',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  // Register broadcast notification routes
  const broadcastRoutes = await import('./routes/broadcasts');
  app.use('/api/broadcasts', broadcastRoutes.default);

  // Register volunteer threshold alert routes
  const volunteerAlertRoutes = await import('./routes/volunteerAlerts');
  app.use('/api/volunteer-alerts', requireTenant, volunteerAlertRoutes.default);

  // Volunteer schedule digest settings
  app.get('/api/tenant/settings/volunteer-digest', requireTenant, requireOwner, async (req, res, next) => {
    try {
      const tenantId = req.session.tenantId!;
      const [tenant] = await db
        .select({ volunteerDigestSettings: tenants.volunteerDigestSettings })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      res.json({ settings: tenant?.volunteerDigestSettings || {} });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/tenant/settings/volunteer-digest', requireTenant, requireOwner, async (req, res, next) => {
    try {
      const tenantId = req.session.tenantId!;
      const { enabled, dayOfWeek, sendTime, includeUpcomingDays } = req.body;

      // Get existing settings
      const [currentTenant] = await db
        .select({ volunteerDigestSettings: tenants.volunteerDigestSettings })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      const currentSettings = currentTenant?.volunteerDigestSettings || {};
      
      const updatedSettings = {
        ...currentSettings,
        ...(enabled !== undefined && { enabled }),
        ...(dayOfWeek !== undefined && { dayOfWeek }),
        ...(sendTime !== undefined && { sendTime }),
        ...(includeUpcomingDays !== undefined && { includeUpcomingDays }),
      };

      await db.update(tenants)
        .set({ volunteerDigestSettings: updatedSettings })
        .where(eq(tenants.id, tenantId));

      res.json({ success: true, settings: updatedSettings });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tenant/settings/volunteer-digest/test', requireTenant, requireOwner, async (req, res, next) => {
    try {
      const tenantId = req.session.tenantId!;
      const { VolunteerScheduleDigestService } = await import('./services/volunteer-schedule-digest');
      
      const result = await VolunteerScheduleDigestService.triggerManualDigest(tenantId);
      
      res.json({ 
        success: true, 
        result: {
          emailsSent: result.emailsSent,
          volunteersWithCommitments: result.volunteersWithCommitments,
          totalCommitments: result.totalCommitments,
          errors: result.errors,
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * QUICK ACTIONS SETTINGS API
   * Manage dashboard quick actions configuration
   */

  // GET /api/tenant/settings/quick-actions - Get quick actions configuration
  app.get('/api/tenant/settings/quick-actions', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const tenantId = req.session.tenantId!;
      const [tenant] = await db
        .select({ quickActionsConfig: tenants.quickActionsConfig })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      const defaultActions = ["add-animal", "record-donation", "new-application", "add-event", "send-email"];
      
      res.json({ 
        quickActions: tenant?.quickActionsConfig || defaultActions 
      });
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/tenant/settings/quick-actions - Update quick actions configuration (owner only)
  app.patch('/api/tenant/settings/quick-actions', requireTenant, requireAuth, requireOwner, async (req, res, next) => {
    try {
      const tenantId = req.session.tenantId!;
      
      const quickActionsSchema = z.object({
        quickActions: z.array(z.string()).min(1).max(10),
      });

      const { quickActions } = quickActionsSchema.parse(req.body);

      await db
        .update(tenants)
        .set({ quickActionsConfig: quickActions })
        .where(eq(tenants.id, tenantId));

      res.json({ 
        success: true, 
        quickActions 
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * TUTORIALS API
   * CRUD operations for help/tutorial videos
   */

  // GET /api/tutorials - Get all tutorials for the tenant
  app.get('/api/tutorials', requireTenant, requireAuth, async (req, res, next) => {
    try {
      const { tutorials } = await import('@shared/schema');
      
      const results = await db
        .select()
        .from(tutorials)
        .where(
          or(
            eq(tutorials.tenantId, req.tenant!.id),
            eq(tutorials.isGlobal, true)
          )
        )
        .orderBy(tutorials.sortOrder, tutorials.createdAt);

      res.json({ tutorials: results });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/tutorials - Create a new tutorial (admin only)
  app.post('/api/tutorials', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { tutorials, insertTutorialSchema } = await import('@shared/schema');
      
      const data = insertTutorialSchema.parse({
        ...req.body,
        tenantId: req.tenant!.id,
        isGlobal: false,
      });

      const [tutorial] = await db
        .insert(tutorials)
        .values(data)
        .returning();

      res.json({ tutorial });
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/tutorials/:id - Update a tutorial (admin only)
  app.patch('/api/tutorials/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { tutorials } = await import('@shared/schema');
      const tutorialId = req.params.id;

      // Strict validation schema - only allow specific updatable fields
      // tenantId and isGlobal are explicitly forbidden to prevent tenant hopping
      const updateSchema = z.object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        youtubeUrl: z.string().url().optional(),
        category: z.string().max(100).optional(),
        sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
      }).strict(); // Reject any extra fields

      const validatedData = updateSchema.parse(req.body);

      // Build update object only with provided fields
      const updateFields: Record<string, any> = { updatedAt: new Date() };
      if (validatedData.title !== undefined) updateFields.title = validatedData.title;
      if (validatedData.description !== undefined) updateFields.description = validatedData.description;
      if (validatedData.youtubeUrl !== undefined) updateFields.youtubeUrl = validatedData.youtubeUrl;
      if (validatedData.category !== undefined) updateFields.category = validatedData.category;
      if (validatedData.sortOrder !== undefined) updateFields.sortOrder = validatedData.sortOrder;

      const [updated] = await db
        .update(tutorials)
        .set(updateFields)
        .where(and(
          eq(tutorials.id, tutorialId),
          eq(tutorials.tenantId, req.tenant!.id) // Only allows updates to tenant's own tutorials, not globals
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Tutorial not found or not accessible" });
      }

      res.json({ tutorial: updated });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/tutorials/:id - Delete a tutorial (admin only)
  app.delete('/api/tutorials/:id', requireTenant, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const { tutorials } = await import('@shared/schema');
      const tutorialId = req.params.id;

      const [deleted] = await db
        .delete(tutorials)
        .where(and(
          eq(tutorials.id, tutorialId),
          eq(tutorials.tenantId, req.tenant!.id)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "Tutorial not found" });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // Adopter Portal Routes
  // ============================================================================
  app.use('/api/adopter', requireTenant, adopterPortalRouter);
  app.use('/api/foster', requireTenant, fosterPortalRouter);

  const httpServer = createServer(app);

  return httpServer;
}
