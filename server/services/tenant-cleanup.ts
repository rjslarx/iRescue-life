import { db } from '../db';
import { tenants, users } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Find orphaned tenants (tenants with no admin users)
 * These are created when signup transaction partially fails
 * CRITICAL: We specifically query for users with the admin role using SQL array containment
 */
export async function findOrphanedTenants() {
  console.log('[CLEANUP] Searching for orphaned tenants (tenants without admin users)...');
  
  // Find all tenants
  const allTenants = await db.select().from(tenants);
  
  const orphanedTenants = [];
  
  // For each tenant, explicitly query for users with admin role
  for (const tenant of allTenants) {
    // Query specifically for users with 'admin' in their roles array
    const [adminUser] = await db
      .select()
      .from(users)
      .where(
        sql`${users.tenantId} = ${tenant.id} AND 'admin' = ANY(${users.roles})`
      )
      .limit(1);
    
    if (!adminUser) {
      console.log(`[CLEANUP] Found orphaned tenant: ${tenant.subdomain} (${tenant.id}) - No admin user`);
      orphanedTenants.push({
        id: tenant.id,
        subdomain: tenant.subdomain,
        name: tenant.name,
        subscriptionStatus: tenant.subscriptionStatus,
        createdAt: tenant.createdAt,
      });
    }
  }

  console.log(`[CLEANUP] Found ${orphanedTenants.length} orphaned tenants without admin users`);
  
  return orphanedTenants;
}

/**
 * Delete orphaned tenants (tenants with no users)
 * CAUTION: This permanently deletes data
 */
export async function deleteOrphanedTenants() {
  const orphaned = await findOrphanedTenants();
  
  if (orphaned.length === 0) {
    console.log('[CLEANUP] No orphaned tenants to delete');
    return { deletedCount: 0, deletedTenants: [] };
  }

  console.log(`[CLEANUP] Deleting ${orphaned.length} orphaned tenants...`);
  
  const deletedTenants = [];
  for (const tenant of orphaned) {
    console.log(`[CLEANUP] Deleting orphaned tenant: ${tenant.subdomain} (${tenant.id})`);
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    deletedTenants.push(tenant);
  }

  console.log(`[CLEANUP] Successfully deleted ${deletedTenants.length} orphaned tenants`);
  
  return { 
    deletedCount: deletedTenants.length, 
    deletedTenants 
  };
}

/**
 * Verify tenant integrity (check if tenant has at least one admin user)
 * CRITICAL: Uses SQL array containment to explicitly query for admin role
 */
export async function verifyTenantIntegrity(tenantId: string): Promise<boolean> {
  // Query specifically for users with 'admin' in their roles array
  const [adminUser] = await db
    .select()
    .from(users)
    .where(
      sql`${users.tenantId} = ${tenantId} AND 'admin' = ANY(${users.roles})`
    )
    .limit(1);

  return !!adminUser;
}
