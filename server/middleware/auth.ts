import { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import createMemoryStore from 'memorystore';
import connectPgSimple from 'connect-pg-simple';
import { users } from '@shared/schema';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import pg from 'pg';

const MemoryStore = createMemoryStore(session);
const PgSession = connectPgSimple(session);

// Extend session data to include user and tenant
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    tenantId?: string;
    activeRole?: string; // The role the user is currently acting as
    // Platform admin impersonation fields (for accessing other tenants)
    impersonating?: boolean;
    impersonatedTenantId?: string;
    originalUserId?: string;
    originalTenantId?: string;
    // Tenant-level user impersonation fields (owner impersonating team members)
    impersonatingUserId?: string; // The user being impersonated
    impersonatingUserName?: string; // Name of impersonated user (for display)
    realUserId?: string; // The owner's actual userId
    realUserName?: string; // The owner's name (for display)
    impersonationStartedAt?: number; // Timestamp when impersonation started
  }
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        fullName: string;
        roles: string[]; // All roles the user has
        activeRole: string; // The role they're currently using
        tenantId: string;
      };
      // Impersonation context for UI
      impersonation?: {
        active: boolean;
        impersonatedUserId: string;
        impersonatedUserName: string;
        realUserId: string;
        realUserName: string;
        startedAt: number;
      };
    }
  }
}

// Create session store based on environment
function createSessionStore() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction && process.env.DATABASE_URL) {
    // Use PostgreSQL session store in production for persistence across restarts
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    return new PgSession({
      pool,
      tableName: 'session', // Table will be auto-created
      createTableIfMissing: true,
    });
  }
  
  // Use MemoryStore for development
  return new MemoryStore({
    checkPeriod: 86400000, // prune expired entries every 24h
  });
}

// Session middleware configuration
// Note: Cookie domain is NOT set - this allows cookies to work on any domain
// (irescue.life, custom domains like magapie.com, and localhost)
// Each domain will have its own cookie, which is fine for our multi-tenant setup
export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'rescue-portal-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: createSessionStore(),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Require HTTPS in production
    httpOnly: true, // Prevent XSS attacks by blocking JavaScript access
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    sameSite: 'lax', // CSRF protection - allow same-site navigation
    // Don't set domain - allow cookies to work on any hostname
    // (irescue.life, custom domains, localhost, etc.)
  },
  name: 'irescue.sid', // Custom session cookie name (don't reveal tech stack)
  proxy: true, // Trust the reverse proxy for secure cookie handling
});

/**
 * Middleware to authenticate user from session
 * Loads user data if session exists
 */
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId && req.session.tenantId) {
    try {
      // Handle impersonation: load platform admin user without tenant filter
      let user;
      if (req.session.impersonating) {
        // Load the platform admin by ID only (they belong to platform tenant)
        const [platformAdmin] = await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            roles: users.roles,
            tenantId: users.tenantId,
          })
          .from(users)
          .where(and(
            eq(users.id, req.session.userId),
            eq(users.isActive, true)
          ))
          .limit(1);
        
        if (platformAdmin && platformAdmin.roles.includes('platform_admin')) {
          // Set up the user object for impersonated access
          // Keep platform_admin role so platform routes still work
          // Add admin role so they can access tenant routes as admin
          user = {
            ...platformAdmin,
            tenantId: req.session.tenantId, // Use impersonated tenant
            roles: [...platformAdmin.roles, 'admin'], // Keep platform_admin, add admin
          };
          // Mark request as platform admin to bypass tenant checks
          req.isPlatformAdmin = true;
          // Force activeRole to 'admin' for tenant operations
          req.session.activeRole = 'admin';
        }
      } else {
        // Normal authentication: load user by userId AND tenantId
        const [normalUser] = await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            roles: users.roles,
            tenantId: users.tenantId,
          })
          .from(users)
          .where(and(
            eq(users.id, req.session.userId),
            eq(users.tenantId, req.session.tenantId),
            eq(users.isActive, true)
          ))
          .limit(1);
        user = normalUser;
      }

      if (user) {
        // Validate that session tenant matches request tenant (if tenant context exists)
        // Skip validation for platform admins (they don't have a tenant context)
        if (req.tenant && !req.isPlatformAdmin && user.tenantId !== req.tenant.id) {
          // User trying to access different tenant - clear session
          req.session.destroy(() => {});
          return res.status(401).json({ error: 'Invalid tenant access' });
        }

        // Handle tenant-level user impersonation (owner impersonating team member)
        if (req.session.impersonatingUserId && req.session.realUserId) {
          // Load the impersonated user
          const [impersonatedUser] = await db
            .select({
              id: users.id,
              email: users.email,
              fullName: users.fullName,
              roles: users.roles,
              tenantId: users.tenantId,
            })
            .from(users)
            .where(and(
              eq(users.id, req.session.impersonatingUserId),
              eq(users.tenantId, req.session.tenantId!),
              eq(users.isActive, true)
            ))
            .limit(1);
          
          if (impersonatedUser) {
            // Use the impersonated user's data
            const activeRole = impersonatedUser.roles[0] || 'volunteer';
            req.user = {
              id: impersonatedUser.id,
              email: impersonatedUser.email,
              fullName: impersonatedUser.fullName,
              roles: impersonatedUser.roles,
              activeRole,
              tenantId: impersonatedUser.tenantId,
            };
            
            // Set impersonation context for UI
            req.impersonation = {
              active: true,
              impersonatedUserId: req.session.impersonatingUserId,
              impersonatedUserName: req.session.impersonatingUserName || impersonatedUser.fullName,
              realUserId: req.session.realUserId,
              realUserName: req.session.realUserName || '',
              startedAt: req.session.impersonationStartedAt || Date.now(),
            };
            return next();
          } else {
            // Impersonated user not found, end impersonation
            delete req.session.impersonatingUserId;
            delete req.session.impersonatingUserName;
            delete req.session.realUserId;
            delete req.session.realUserName;
            delete req.session.impersonationStartedAt;
          }
        }

        // Determine active role: use session's activeRole if valid, otherwise default to first role
        let activeRole = req.session.activeRole;
        if (!activeRole || !user.roles.includes(activeRole)) {
          activeRole = user.roles[0]; // Default to first role
          req.session.activeRole = activeRole;
        }

        req.user = {
          ...user,
          activeRole,
        };
      } else {
        // User not found or inactive, clear session
        req.session.destroy(() => {});
      }
    } catch (error) {
      console.error('Error authenticating user:', error);
    }
  }
  next();
}

/**
 * Middleware to require authentication
 * Use this on routes that need a logged-in user
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access this resource'
    });
  }
  next();
}

/**
 * Middleware to require specific roles
 * Checks if the user's active role is one of the specified roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check activeRole first (standard check)
    if (roles.includes(req.user.activeRole)) {
      return next();
    }
    
    // Special case: 'owner' role has elevated access - check roles array regardless of activeRole
    // This allows owners to access owner-protected routes even when their activeRole is set to admin/staff
    if (roles.includes('owner') && req.user.roles.includes('owner')) {
      return next();
    }
    
    return res.status(403).json({ 
      error: 'Forbidden',
      message: `This action requires one of the following roles: ${roles.join(', ')}. Your active role is: ${req.user.activeRole}`
    });
  };
}
