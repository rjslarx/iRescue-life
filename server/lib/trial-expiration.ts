import { db } from "../db";
import { tenants, users } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";

interface TrialExpirationResult {
  expiredCount: number;
  emailsSent: number;
  errors: string[];
}

export async function runTrialExpirationCheck(): Promise<TrialExpirationResult> {
  const result: TrialExpirationResult = {
    expiredCount: 0,
    emailsSent: 0,
    errors: [],
  };

  try {
    const now = new Date();

    const expiredTrialTenants = await db
      .select({
        id: tenants.id,
        subdomain: tenants.subdomain,
        name: tenants.name,
        trialEndsAt: tenants.trialEndsAt,
      })
      .from(tenants)
      .where(
        and(
          eq(tenants.subscriptionStatus, "trial"),
          lt(tenants.trialEndsAt, now)
        )
      );

    if (expiredTrialTenants.length === 0) {
      console.log("[TRIAL EXPIRATION] No expired trials found");
      return result;
    }

    console.log(`[TRIAL EXPIRATION] Found ${expiredTrialTenants.length} expired Pro trials`);

    for (const tenant of expiredTrialTenants) {
      try {
        await db
          .update(tenants)
          .set({
            subscriptionTier: "free",
            subscriptionStatus: "active",
            emailQuotaLimit: 500,
          })
          .where(eq(tenants.id, tenant.id));

        result.expiredCount++;
        console.log(`[TRIAL EXPIRATION] Reverted ${tenant.subdomain} to Free tier`);

        const [adminUser] = await db
          .select({ email: users.email, fullName: users.fullName })
          .from(users)
          .where(
            and(
              eq(users.tenantId, tenant.id),
              sql`'admin' = ANY(${users.roles})`
            )
          )
          .limit(1);

        if (adminUser) {
          try {
            const { EmailService } = await import("./email-service");
            await EmailService.sendProTrialExpiredEmail({
              rescueName: tenant.name,
              adminEmail: adminUser.email,
              subdomain: tenant.subdomain,
            });
            result.emailsSent++;
            console.log(`[TRIAL EXPIRATION] Sent expiration email to ${adminUser.email}`);
          } catch (emailError) {
            console.error(`[TRIAL EXPIRATION] Failed to send email to ${adminUser.email}:`, emailError);
            result.errors.push(`Email failed for ${tenant.subdomain}: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`);
          }
        }
      } catch (tenantError) {
        console.error(`[TRIAL EXPIRATION] Failed to process ${tenant.subdomain}:`, tenantError);
        result.errors.push(`Failed to process ${tenant.subdomain}: ${tenantError instanceof Error ? tenantError.message : 'Unknown error'}`);
      }
    }

    return result;
  } catch (error) {
    console.error("[TRIAL EXPIRATION] Job failed:", error);
    result.errors.push(`Job failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
}
