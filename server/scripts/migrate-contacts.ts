/**
 * Migration script to backfill contacts from existing data
 * This syncs:
 * - All users (staff, volunteers, board members, fosters, admins)
 * - All adoption applications
 * - All foster applications
 * - All donations
 */

import { db } from '../db';
import { tenants, users, applications, fosterApplications, donations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  syncContactFromUser,
  createContactFromAdoptionApplication,
  createContactFromFosterApplication,
  createContactFromDonation,
  type ContactRole,
} from '../services/contacts';

async function migrateContactsForTenant(tenantId: string, tenantName: string) {
  console.log(`\n=== Migrating contacts for tenant: ${tenantName} (${tenantId}) ===`);
  
  let stats = {
    users: 0,
    adoptionApps: 0,
    fosterApps: 0,
    donations: 0,
    errors: 0,
  };

  // 1. Sync all users to contacts
  console.log('1. Syncing users...');
  const userList = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, tenantId));

  for (const user of userList) {
    try {
      await syncContactFromUser(
        user.id,
        tenantId,
        user.email,
        user.fullName,
        user.roles.filter(r => r !== 'platform_admin') as ContactRole[]
      );
      stats.users++;
    } catch (error: any) {
      console.error(`  Error syncing user ${user.email}:`, error.message);
      stats.errors++;
    }
  }
  console.log(`  ✓ Synced ${stats.users} users`);

  // 2. Create contacts from adoption applications
  console.log('2. Creating contacts from adoption applications...');
  const adoptionApps = await db
    .select()
    .from(applications)
    .where(eq(applications.tenantId, tenantId));

  for (const app of adoptionApps) {
    try {
      await createContactFromAdoptionApplication(
        tenantId,
        app.applicantName,
        app.applicantEmail,
        app.applicantPhone
      );
      stats.adoptionApps++;
    } catch (error: any) {
      console.error(`  Error creating contact from adoption app ${app.applicantEmail}:`, error.message);
      stats.errors++;
    }
  }
  console.log(`  ✓ Created ${stats.adoptionApps} contacts from adoption applications`);

  // 3. Create contacts from foster applications
  console.log('3. Creating contacts from foster applications...');
  const fosterApps = await db
    .select()
    .from(fosterApplications)
    .where(eq(fosterApplications.tenantId, tenantId));

  for (const app of fosterApps) {
    try {
      await createContactFromFosterApplication(
        tenantId,
        app.applicantName,
        app.applicantEmail,
        app.applicantPhone,
        app.address
      );
      stats.fosterApps++;
    } catch (error: any) {
      console.error(`  Error creating contact from foster app ${app.applicantEmail}:`, error.message);
      stats.errors++;
    }
  }
  console.log(`  ✓ Created ${stats.fosterApps} contacts from foster applications`);

  // 4. Create/update contacts from donations
  console.log('4. Processing donations...');
  const donationList = await db
    .select()
    .from(donations)
    .where(eq(donations.tenantId, tenantId));

  for (const donation of donationList) {
    try {
      await createContactFromDonation(
        tenantId,
        donation.donorName,
        donation.donorEmail,
        Number(donation.amount) || 0
      );
      stats.donations++;
    } catch (error: any) {
      console.error(`  Error creating contact from donation ${donation.donorEmail}:`, error.message);
      stats.errors++;
    }
  }
  console.log(`  ✓ Processed ${stats.donations} donations`);

  console.log(`\nMigration complete for ${tenantName}:`);
  console.log(`  - Users synced: ${stats.users}`);
  console.log(`  - Adoption applicants: ${stats.adoptionApps}`);
  console.log(`  - Foster applicants: ${stats.fosterApps}`);
  console.log(`  - Donations processed: ${stats.donations}`);
  console.log(`  - Errors: ${stats.errors}`);

  return stats;
}

async function main() {
  console.log('Starting contact migration for all tenants...\n');

  // Get all tenants
  const allTenants = await db.select().from(tenants);
  console.log(`Found ${allTenants.length} tenants to migrate\n`);

  const totalStats = {
    users: 0,
    adoptionApps: 0,
    fosterApps: 0,
    donations: 0,
    errors: 0,
  };

  for (const tenant of allTenants) {
    const stats = await migrateContactsForTenant(tenant.id, tenant.name);
    totalStats.users += stats.users;
    totalStats.adoptionApps += stats.adoptionApps;
    totalStats.fosterApps += stats.fosterApps;
    totalStats.donations += stats.donations;
    totalStats.errors += stats.errors;
  }

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION COMPLETE - ALL TENANTS');
  console.log('='.repeat(60));
  console.log(`Total users synced: ${totalStats.users}`);
  console.log(`Total adoption applicants: ${totalStats.adoptionApps}`);
  console.log(`Total foster applicants: ${totalStats.fosterApps}`);
  console.log(`Total donations processed: ${totalStats.donations}`);
  console.log(`Total errors: ${totalStats.errors}`);
  console.log('='.repeat(60));

  process.exit(0);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
