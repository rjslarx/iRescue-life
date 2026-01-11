/**
 * Migration script to add the new "contacts" page permission to all existing tenants
 */

import { db } from '../db';
import { tenants, pagePermissions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

async function addContactsPagePermission() {
  console.log('Adding "contacts" page permission to all existing tenants...\n');

  // Get all tenants
  const allTenants = await db.select().from(tenants);
  console.log(`Found ${allTenants.length} tenants\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const tenant of allTenants) {
    try {
      // Check if this tenant already has the contacts page permission
      const existing = await db
        .select()
        .from(pagePermissions)
        .where(
          and(
            eq(pagePermissions.tenantId, tenant.id),
            eq(pagePermissions.pageId, 'contacts')
          )
        );

      if (existing.length > 0) {
        console.log(`✓ Tenant "${tenant.name}" already has contacts permission, skipping`);
        skipCount++;
        continue;
      }

      // Insert the new contacts page permission
      await db.insert(pagePermissions).values({
        tenantId: tenant.id,
        pageId: 'contacts',
        displayName: 'Contacts Directory',
        description: 'Comprehensive directory of all contacts (applicants, donors, team members)',
        allowedRoles: ['admin', 'board_member', 'staff'],
      });

      console.log(`✓ Added contacts permission for tenant "${tenant.name}"`);
      successCount++;
    } catch (error: any) {
      console.error(`✗ Error adding contacts permission for tenant "${tenant.name}":`, error.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Successfully added: ${successCount}`);
  console.log(`Skipped (already exists): ${skipCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log('='.repeat(60));

  process.exit(0);
}

addContactsPagePermission().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
