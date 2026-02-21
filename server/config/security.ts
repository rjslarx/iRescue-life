/**
 * Security Configuration
 * 
 * Centralized security middleware configuration including:
 * - Rate limiting
 * - Helmet security headers (with Google Fonts support)
 * - CORS (with dynamic custom domain support)
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import type { Request } from 'express';
import { db } from '../db';
import { tenants } from '@shared/schema';
import { eq, isNotNull } from 'drizzle-orm';

// Cache for verified custom domains (refreshed periodically)
let verifiedDomainsCache: Set<string> = new Set();
let lastCacheUpdate = 0;
const CACHE_TTL = 60 * 1000; // 1 minute cache

async function getVerifiedCustomDomains(): Promise<Set<string>> {
  const now = Date.now();
  
  // Return cached domains if still valid
  if (now - lastCacheUpdate < CACHE_TTL && verifiedDomainsCache.size > 0) {
    return verifiedDomainsCache;
  }
  
  try {
    // Query all verified custom domains from the database
    const tenantsWithDomains = await db
      .select({ customDomain: tenants.customDomain })
      .from(tenants)
      .where(eq(tenants.customDomainVerified, true));
    
    const domains = new Set<string>();
    for (const tenant of tenantsWithDomains) {
      if (tenant.customDomain) {
        // Add both with and without www
        domains.add(tenant.customDomain.toLowerCase());
        if (tenant.customDomain.startsWith('www.')) {
          domains.add(tenant.customDomain.substring(4).toLowerCase());
        } else {
          domains.add(`www.${tenant.customDomain.toLowerCase()}`);
        }
      }
    }
    
    verifiedDomainsCache = domains;
    lastCacheUpdate = now;
    return domains;
  } catch (error) {
    console.error('[CORS] Failed to fetch verified domains:', error);
    // Return cached domains on error (may be stale but better than failing)
    return verifiedDomainsCache;
  }
}

/**
 * Rate Limiting Configuration
 */

// General API rate limiter - applies to all API routes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting in development
  skip: () => process.env.NODE_ENV === 'development',
});

// Stricter rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many login attempts',
    message: 'Too many login attempts from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
  skip: () => process.env.NODE_ENV === 'development',
});

// Account creation rate limiter
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 signups per hour
  message: {
    error: 'Too many accounts created',
    message: 'Too many accounts created from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

// Password reset rate limiter
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: {
    error: 'Too many password reset attempts',
    message: 'Too many password reset requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

// Email sending rate limiter (for contact forms, etc.)
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 emails per hour
  message: {
    error: 'Too many emails sent',
    message: 'Too many emails sent from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * Helmet Configuration
 * Sets secure HTTP headers
 */
export const helmetConfig = helmet({
  // Content Security Policy - disabled in development due to Vite/Replit tooling conflicts
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com", "https://www.googletagmanager.com", "https://apis.google.com", "https://googleads.g.doubleclick.net", "https://www.google.com", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:", "https://www.google.com", "https://googleads.g.doubleclick.net"],
      connectSrc: ["'self'", "https://api.resend.com", "https://*.stripe.com", "https://www.google-analytics.com", "https://analytics.google.com", "https://storage.googleapis.com", "https://www.googleapis.com", "https://accounts.google.com", "https://www.google.com", "https://googleads.g.doubleclick.net"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://*.stripe.com", "https://docs.google.com", "https://drive.google.com", "https://www.googletagmanager.com"],
      workerSrc: ["'self'", "blob:"],
      upgradeInsecureRequests: [],
    },
  } : false,
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  
  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  
  // Prevent MIME type sniffing
  noSniff: true,
  
  // XSS Protection
  xssFilter: true,
  
  // Hide X-Powered-By header
  hidePoweredBy: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
});

/**
 * CORS Configuration
 * Dynamically allows verified custom domains from the database
 */
export function getCorsConfig() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : [];

  const isProduction = process.env.NODE_ENV === 'production';

  return cors({
    origin: async (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // In development, allow all origins
      if (!isProduction) {
        return callback(null, true);
      }

      // Check if origin is in static whitelist
      const originHost = new URL(origin).hostname.toLowerCase();
      
      const isStaticAllowed = allowedOrigins.some(allowed => {
        // Support wildcard subdomains (e.g., https://*.irescue.life or *.irescue.life)
        if (allowed.includes('*')) {
          // Extract domain from allowed pattern (handle both https://*.domain and *.domain)
          const domain = allowed.replace(/^https?:\/\/\*\./, '').replace(/^\*\./, '');
          return originHost.endsWith(domain);
        }
        
        // Try exact match with full origin (https://example.com)
        if (allowed === origin) {
          return true;
        }
        
        // Try hostname-only match (example.com)
        if (allowed.toLowerCase() === originHost) {
          return true;
        }
        
        // Try hostname match with allowed having protocol
        try {
          const allowedHost = new URL(allowed).hostname.toLowerCase();
          return allowedHost === originHost;
        } catch {
          // allowed is not a valid URL, skip
          return false;
        }
      });

      if (isStaticAllowed) {
        return callback(null, true);
      }

      // Check if origin is a verified custom domain from the database
      try {
        const verifiedDomains = await getVerifiedCustomDomains();
        if (verifiedDomains.has(originHost)) {
          return callback(null, true);
        }
      } catch (error) {
        console.error('[CORS] Error checking verified domains:', error);
      }

      // If no static origins configured and domain not in database, provide helpful error
      if (allowedOrigins.length === 0) {
        return callback(new Error(`Origin ${origin} not allowed. Set ALLOWED_ORIGINS or verify the custom domain in platform admin.`));
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true, // Allow cookies and auth headers
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Tenant-Id',
      'Accept',
    ],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400, // 24 hours - how long browser can cache preflight response
  });
}

/**
 * Trust proxy configuration
 * Required for rate limiting and getting correct client IPs behind reverse proxy
 */
export function configureTrustProxy(app: any) {
  // Trust first proxy (Replit's infrastructure)
  app.set('trust proxy', 1);
}
