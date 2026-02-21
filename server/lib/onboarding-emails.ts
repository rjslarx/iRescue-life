import { db } from '../db';
import { tenants, users } from '@shared/schema';
import { and, eq, sql, lt } from 'drizzle-orm';
import { EmailService } from './email-service';

/**
 * Onboarding Email Scheduler
 * Sends follow-up emails to encourage engagement during free trial
 * - Day 2: Add your first animal
 * - Day 5: Invite your team (role-based permissions)
 */

/**
 * Run onboarding emails job - sends Day 2 and Day 5 emails to eligible tenants
 */
export async function runOnboardingEmailsJob(): Promise<{
  emailsSent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let emailsSent = 0;
  
  // Track emails already sent in this run to prevent duplicates
  // (when same admin has multiple tenants)
  const emailsSentToday = new Set<string>();

  try {
    // === DAY 2 EMAILS ===
    // Get date 2 days ago (48-72 hours ago to catch timezone variations)
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0);
    
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(0, 0, 0, 0);

    // Find tenants created between 2-3 days ago who haven't received Day 2 email
    const day2EligibleTenants = await db
      .select({
        tenantId: tenants.id,
        subdomain: tenants.subdomain,
        rescueName: tenants.name,
        onboardingEmailsSent: tenants.onboardingEmailsSent,
      })
      .from(tenants)
      .where(
        and(
          eq(tenants.isActive, true),
          lt(tenants.createdAt, twoDaysAgo),
          sql`${tenants.createdAt} >= ${threeDaysAgo}`,
          sql`(${tenants.onboardingEmailsSent} IS NULL OR ${tenants.onboardingEmailsSent}->>'day2' IS NULL)`
        )
      );

    console.log(`📧 [ONBOARDING] Found ${day2EligibleTenants.length} tenants eligible for Day 2 email`);

    for (const tenant of day2EligibleTenants) {
      try {
        const admin = await getAdminForTenant(tenant.tenantId, tenant.subdomain);
        if (!admin) continue;

        // Skip if we already sent a Day 2 email to this address in this run
        const day2Key = `day2:${admin.email.toLowerCase()}`;
        if (emailsSentToday.has(day2Key)) {
          console.log(`⏭️ [ONBOARDING] Skipping Day 2 for ${tenant.subdomain} - already sent to ${admin.email}`);
          // Still mark tenant as sent to prevent future attempts
          const existingEmails = tenant.onboardingEmailsSent || {};
          await db
            .update(tenants)
            .set({
              onboardingEmailsSent: {
                ...existingEmails,
                day2: new Date().toISOString(),
              },
            })
            .where(eq(tenants.id, tenant.tenantId));
          continue;
        }

        const sent = await EmailService.sendDay2OnboardingEmail({
          rescueName: tenant.rescueName,
          adminEmail: admin.email,
          adminName: admin.fullName,
          subdomain: tenant.subdomain,
        });

        if (sent) {
          emailsSentToday.add(day2Key);
          const existingEmails = tenant.onboardingEmailsSent || {};
          await db
            .update(tenants)
            .set({
              onboardingEmailsSent: {
                ...existingEmails,
                day2: new Date().toISOString(),
              },
            })
            .where(eq(tenants.id, tenant.tenantId));
          
          emailsSent++;
          console.log(`✅ [ONBOARDING] Day 2 email sent to ${admin.email} (${tenant.subdomain})`);
        } else {
          errors.push(`Failed to send Day 2 to ${admin.email}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Day 2 - ${tenant.subdomain}: ${errorMsg}`);
        console.error(`❌ [ONBOARDING] Error processing Day 2 for tenant ${tenant.subdomain}:`, error);
      }
    }

    // === DAY 5 EMAILS ===
    // Get date 5 days ago (120-144 hours ago to catch timezone variations)
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    fiveDaysAgo.setHours(0, 0, 0, 0);
    
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    sixDaysAgo.setHours(0, 0, 0, 0);

    // Find tenants created between 5-6 days ago who haven't received Day 5 email
    const day5EligibleTenants = await db
      .select({
        tenantId: tenants.id,
        subdomain: tenants.subdomain,
        rescueName: tenants.name,
        onboardingEmailsSent: tenants.onboardingEmailsSent,
      })
      .from(tenants)
      .where(
        and(
          eq(tenants.isActive, true),
          lt(tenants.createdAt, fiveDaysAgo),
          sql`${tenants.createdAt} >= ${sixDaysAgo}`,
          sql`(${tenants.onboardingEmailsSent} IS NULL OR ${tenants.onboardingEmailsSent}->>'day5' IS NULL)`
        )
      );

    console.log(`📧 [ONBOARDING] Found ${day5EligibleTenants.length} tenants eligible for Day 5 email`);

    for (const tenant of day5EligibleTenants) {
      try {
        const admin = await getAdminForTenant(tenant.tenantId, tenant.subdomain);
        if (!admin) continue;

        // Skip if we already sent a Day 5 email to this address in this run
        const day5Key = `day5:${admin.email.toLowerCase()}`;
        if (emailsSentToday.has(day5Key)) {
          console.log(`⏭️ [ONBOARDING] Skipping Day 5 for ${tenant.subdomain} - already sent to ${admin.email}`);
          // Still mark tenant as sent to prevent future attempts
          const existingEmails = tenant.onboardingEmailsSent || {};
          await db
            .update(tenants)
            .set({
              onboardingEmailsSent: {
                ...existingEmails,
                day5: new Date().toISOString(),
              },
            })
            .where(eq(tenants.id, tenant.tenantId));
          continue;
        }

        const sent = await EmailService.sendDay5OnboardingEmail({
          rescueName: tenant.rescueName,
          adminEmail: admin.email,
          adminName: admin.fullName,
          subdomain: tenant.subdomain,
        });

        if (sent) {
          emailsSentToday.add(day5Key);
          const existingEmails = tenant.onboardingEmailsSent || {};
          await db
            .update(tenants)
            .set({
              onboardingEmailsSent: {
                ...existingEmails,
                day5: new Date().toISOString(),
              },
            })
            .where(eq(tenants.id, tenant.tenantId));
          
          emailsSent++;
          console.log(`✅ [ONBOARDING] Day 5 email sent to ${admin.email} (${tenant.subdomain})`);
        } else {
          errors.push(`Failed to send Day 5 to ${admin.email}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Day 5 - ${tenant.subdomain}: ${errorMsg}`);
        console.error(`❌ [ONBOARDING] Error processing Day 5 for tenant ${tenant.subdomain}:`, error);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Job error: ${errorMsg}`);
    console.error('❌ [ONBOARDING] Onboarding emails job failed:', error);
  }

  return { emailsSent, errors };
}

/**
 * Helper function to get the admin user for a tenant
 */
async function getAdminForTenant(tenantId: string, subdomain: string): Promise<{ email: string; fullName: string } | null> {
  const adminUsers = await db
    .select({
      email: users.email,
      fullName: users.fullName,
    })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        sql`'admin' = ANY(${users.roles})`
      )
    )
    .limit(1);

  if (adminUsers.length === 0) {
    console.log(`⚠️ [ONBOARDING] No admin found for tenant ${subdomain}, skipping`);
    return null;
  }

  return adminUsers[0];
}
