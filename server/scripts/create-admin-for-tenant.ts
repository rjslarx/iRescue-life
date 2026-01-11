/**
 * Script to create an admin user for an existing tenant
 * USE CASE: When signup partially fails and creates tenant without admin user
 */

import { db } from '../db';
import { tenants, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { hashPassword } from '../services/auth';

async function createAdminForTenant(
  subdomain: string,
  adminEmail: string,
  adminPassword: string,
  adminName?: string
) {
  console.log(`\n[ADMIN FIX] Creating admin user for tenant: ${subdomain}`);
  
  // 1. Find the tenant
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.subdomain, subdomain))
    .limit(1);

  if (!tenant) {
    console.error(`[ADMIN FIX] ERROR: Tenant '${subdomain}' not found`);
    process.exit(1);
  }

  console.log(`[ADMIN FIX] Found tenant: ${tenant.name} (${tenant.id})`);

  // 2. Check if admin user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.tenantId, tenant.id),
      eq(users.email, adminEmail)
    ))
    .limit(1);

  if (existingUser) {
    console.log(`[ADMIN FIX] User ${adminEmail} already exists for this tenant`);
    console.log(`User ID: ${existingUser.id}`);
    console.log(`Roles: ${JSON.stringify(existingUser.roles)}`);
    process.exit(0);
  }

  // 3. Hash password
  console.log(`[ADMIN FIX] Hashing password...`);
  const passwordHash = await hashPassword(adminPassword);

  // 4. Create admin user
  console.log(`[ADMIN FIX] Creating admin user: ${adminEmail}`);
  const [newUser] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash,
      fullName: adminName || adminEmail.split('@')[0],
      roles: ['admin'],
      isActive: true,
    })
    .returning();

  console.log(`[ADMIN FIX] ✅ SUCCESS! Admin user created:`);
  console.log(`  - User ID: ${newUser.id}`);
  console.log(`  - Email: ${newUser.email}`);
  console.log(`  - Name: ${newUser.fullName}`);
  console.log(`  - Roles: ${JSON.stringify(newUser.roles)}`);
  console.log(`\nYou can now login at: https://irescue.life/${subdomain}/login`);
  
  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('Usage: tsx server/scripts/create-admin-for-tenant.ts <subdomain> <email> <password> [name]');
  console.log('Example: tsx server/scripts/create-admin-for-tenant.ts munchkin3 admin@example.com MyPassword123');
  process.exit(1);
}

const [subdomain, adminEmail, adminPassword, adminName] = args;

createAdminForTenant(subdomain, adminEmail, adminPassword, adminName).catch((error) => {
  console.error('[ADMIN FIX] ERROR:', error);
  process.exit(1);
});
