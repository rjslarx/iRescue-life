import bcrypt from 'bcrypt';
import { db } from '../db';
import { users, tenants, type InsertUser } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const SALT_ROUNDS = 10;

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  rescueName: string;
  subdomain: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Login a user within a tenant
 */
export async function loginUser(tenantId: string, credentials: LoginCredentials) {
  const { email, password } = credentials;

  console.log(`[AUTH] loginUser called - tenant: ${tenantId}, email: ${email}`);

  // Find user by email within tenant
  const [user] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.tenantId, tenantId),
      eq(users.email, email),
      eq(users.isActive, true)
    ))
    .limit(1);

  if (!user) {
    console.log(`[AUTH] ERROR: No user found for email ${email} in tenant ${tenantId}`);
    throw new Error('Invalid email or password');
  }

  console.log(`[AUTH] User found: ${user.email}, ID: ${user.id}, roles: ${JSON.stringify(user.roles)}`);

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    console.log(`[AUTH] ERROR: Password verification failed for ${email}`);
    throw new Error('Invalid email or password');
  }

  console.log(`[AUTH] Password verified successfully for ${email}`);

  // Guard against empty roles (data integrity check)
  if (!user.roles || user.roles.length === 0) {
    throw new Error('User account has no roles assigned. Please contact your administrator.');
  }

  // Return user without password hash
  const { passwordHash, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Create a new tenant with admin user (signup flow)
 * CRITICAL: This must be atomic - both tenant AND user must be created, or NEITHER
 */
export async function createTenantWithAdmin(data: SignupData) {
  const { rescueName, subdomain, adminName, adminEmail, adminPassword } = data;

  console.log(`[SIGNUP] Starting signup for subdomain: ${subdomain}, email: ${adminEmail}`);

  // Check if subdomain already exists
  const [existingTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.subdomain, subdomain))
    .limit(1);

  if (existingTenant) {
    console.log(`[SIGNUP] ERROR: Subdomain ${subdomain} already exists`);
    throw new Error('This subdomain is already taken');
  }

  // Hash password BEFORE transaction to avoid issues inside transaction
  console.log(`[SIGNUP] Hashing password for ${adminEmail}`);
  const passwordHash = await hashPassword(adminPassword);

  // Create tenant and admin user in a transaction with explicit error handling
  let result;
  try {
    result = await db.transaction(async (tx) => {
      console.log(`[SIGNUP] Transaction started for ${subdomain}`);
      
      // Insert tenant
      console.log(`[SIGNUP] Inserting tenant: ${rescueName}`);
      const [newTenant] = await tx
        .insert(tenants)
        .values({
          subdomain,
          name: rescueName,
          tagline: `Saving lives, one paw at a time.`,
          isActive: true,
        })
        .returning();

      if (!newTenant || !newTenant.id) {
        console.error(`[SIGNUP] CRITICAL: Tenant insert failed - no tenant returned`);
        throw new Error('Failed to create tenant');
      }
      console.log(`[SIGNUP] Tenant created: ${newTenant.id}`);

      // Insert admin user
      console.log(`[SIGNUP] Inserting admin user: ${adminEmail} for tenant ${newTenant.id}`);
      const [newUser] = await tx
        .insert(users)
        .values({
          tenantId: newTenant.id,
          email: adminEmail,
          passwordHash,
          fullName: adminName,
          roles: ['admin'], // Admin gets only admin role
          isActive: true,
        })
        .returning();

      if (!newUser || !newUser.id) {
        console.error(`[SIGNUP] CRITICAL: User insert failed - no user returned`);
        throw new Error('Failed to create admin user');
      }
      console.log(`[SIGNUP] Admin user created: ${newUser.id}`);

      console.log(`[SIGNUP] Transaction complete for ${subdomain}`);
      return { tenant: newTenant, user: newUser };
    });
  } catch (transactionError: any) {
    console.error(`[SIGNUP] TRANSACTION FAILED for ${subdomain}:`, transactionError);
    throw new Error(`Signup failed: ${transactionError.message}`);
  }

  // CRITICAL: Post-transaction verification to ensure both records exist
  // AND that the user has the admin role
  console.log(`[SIGNUP] Verifying tenant and admin user were created for ${subdomain}`);
  const [verifyTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, result.tenant.id))
    .limit(1);

  const [verifyUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, result.user.id))
    .limit(1);

  if (!verifyTenant) {
    console.error(`[SIGNUP] CRITICAL: Tenant verification failed - tenant ${result.tenant.id} not found after transaction`);
    throw new Error('Tenant creation verification failed');
  }

  if (!verifyUser) {
    console.error(`[SIGNUP] CRITICAL: User verification failed - user ${result.user.id} not found after transaction`);
    // Cleanup: Delete orphaned tenant
    console.log(`[SIGNUP] Cleaning up orphaned tenant ${result.tenant.id}`);
    await db.delete(tenants).where(eq(tenants.id, result.tenant.id));
    throw new Error('Admin user creation verification failed');
  }

  // CRITICAL: Verify the user has the admin role
  if (!verifyUser.roles || !verifyUser.roles.includes('admin')) {
    console.error(`[SIGNUP] CRITICAL: User ${verifyUser.id} exists but lacks admin role. Roles: ${JSON.stringify(verifyUser.roles)}`);
    // Cleanup: Delete both user and tenant
    console.log(`[SIGNUP] Cleaning up user ${verifyUser.id} and tenant ${result.tenant.id}`);
    await db.delete(users).where(eq(users.id, verifyUser.id));
    await db.delete(tenants).where(eq(tenants.id, result.tenant.id));
    throw new Error('Admin role verification failed - signup must be retried');
  }

  console.log(`[SIGNUP] Verification passed - tenant exists with admin user for ${subdomain}`);

  // Seed template content for new tenant (async, non-blocking)
  // This provides sample custom pages and an example animal profile
  const { seedTenantTemplateContent } = await import('./template-seeding');
  seedTenantTemplateContent(result.tenant.id, result.user.id).catch(err => {
    console.error('Template seeding failed, but signup succeeded:', err);
  });

  // Seed default page permissions for new tenant (async, non-blocking)
  const { seedDefaultPagePermissions } = await import('./page-permissions-seeding');
  seedDefaultPagePermissions(result.tenant.id).catch(err => {
    console.error('Page permissions seeding failed, but signup succeeded:', err);
  });

  // Send welcome email immediately on signup (async, non-blocking)
  const { EmailService } = await import('../lib/email-service');
  EmailService.sendSignupWelcomeEmail({
    rescueName: result.tenant.name,
    adminEmail: result.user.email,
    subdomain: result.tenant.subdomain,
  }).catch(err => {
    console.error('Welcome email failed to send, but signup succeeded:', err);
  });

  // Return without password hash
  const { passwordHash: _, ...userWithoutPassword } = result.user;
  return {
    tenant: result.tenant,
    user: userWithoutPassword,
  };
}

/**
 * Create a new user within an existing tenant
 */
export async function createUser(tenantId: string, data: {
  email: string;
  password: string;
  fullName: string;
  roles: ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[];
}) {
  // Validate roles array is not empty
  if (!data.roles || data.roles.length === 0) {
    throw new Error('At least one role must be assigned to the user');
  }

  // Check if email already exists in this tenant
  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.tenantId, tenantId),
      eq(users.email, data.email)
    ))
    .limit(1);

  if (existingUser) {
    throw new Error('A user with this email already exists in your organization');
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Insert user
  const [newUser] = await db
    .insert(users)
    .values({
      tenantId,
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      roles: data.roles,
      isActive: true,
    })
    .returning();

  // Automatically sync user to contacts directory
  try {
    const { syncContactFromUser } = await import('./contacts');
    await syncContactFromUser(
      newUser.id,
      tenantId,
      newUser.email,
      newUser.fullName,
      data.roles.filter(r => r !== 'platform_admin') as any[]
    );
  } catch (error) {
    console.error('Failed to sync user to contacts:', error);
    // Don't fail user creation if contact sync fails
  }

  // Return without password hash
  const { passwordHash: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
}
