import { db } from "../db";
import { tenants } from "@shared/schema";
import { lt, or, isNull } from "drizzle-orm";

/**
 * Reset monthly platform-email quotas.
 *
 * Tenants that rely on the platform Resend key have a monthly cap
 * (`emailQuotaLimit`, default 500). The `emailsSentThisMonth` counter must be
 * reset at the start of each calendar month, otherwise it accumulates forever
 * and the tenant gets permanently locked out of platform email once it hits the
 * cap (surfacing downstream as misleading "Email service is not configured"
 * errors).
 *
 * This is self-healing: it resets any tenant whose `lastEmailQuotaReset` is
 * older than the start of the current (UTC) month. Running it daily means a
 * missed run (deploy/restart at the month boundary) is caught the next day, and
 * tenants already overdue are unblocked on the next run.
 */
export async function resetMonthlyEmailQuotas(): Promise<{ resetCount: number }> {
  const now = new Date();
  const startOfCurrentMonthUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  const result = await db
    .update(tenants)
    .set({
      emailsSentThisMonth: 0,
      lastEmailQuotaReset: now,
    })
    .where(
      or(
        isNull(tenants.lastEmailQuotaReset),
        lt(tenants.lastEmailQuotaReset, startOfCurrentMonthUtc)
      )
    )
    .returning({ id: tenants.id });

  return { resetCount: result.length };
}
