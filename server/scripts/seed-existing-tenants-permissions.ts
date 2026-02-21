import { db } from '../db';
import { tenants, pagePermissions } from '@shared/schema';
import { eq, notInArray } from 'drizzle-orm';
import { seedDefaultPagePermissions } from '../services/page-permissions-seeding';

/**
 * Seed page permissions for existing tenants that don't have any
 * This is a one-time migration script
 */
async function seedExistingTenantsPermissions() {
  try {
    console.log('Finding tenants without page permissions...');

    // Get all tenant IDs that already have permissions
    const tenantsWithPermissions = await db
      .selectDistinct({ tenantId: pagePermissions.tenantId })
      .from(pagePermissions);

    const tenantIdsWithPermissions = tenantsWithPermissions.map(t => t.tenantId);

    // Get all tenants without permissions
    let tenantsToSeed;
    if (tenantIdsWithPermissions.length > 0) {
      tenantsToSeed = await db
        .select()
        .from(tenants)
        .where(notInArray(tenants.id, tenantIdsWithPermissions));
    } else {
      tenantsToSeed = await db.select().from(tenants);
    }

    console.log(`Found ${tenantsToSeed.length} tenants to seed with page permissions`);

    // Seed permissions for each tenant
    for (const tenant of tenantsToSeed) {
      console.log(`Seeding permissions for tenant: ${tenant.name} (${tenant.subdomain})`);
      await seedDefaultPagePermissions(tenant.id);
    }

    console.log('Successfully seeded all tenants with page permissions!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding tenant permissions:', error);
    process.exit(1);
  }
}

seedExistingTenantsPermissions();
