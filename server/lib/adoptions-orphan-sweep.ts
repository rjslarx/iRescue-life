import { db } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { tenants, users } from "@shared/schema";
import { EmailService } from "./email-service";

interface OrphanRow {
  tenantId: string;
  animalId: string;
  animalName: string | null;
}

export interface AdoptionsOrphanSweepResult {
  totalInserted: number;
  totalOrphans: number;
  perTenantInserted: Record<string, number>;
  perTenantOrphans: Record<string, number>;
  perTenantOrphanSamples: Record<string, OrphanRow[]>;
  errors: string[];
}

const PER_TENANT_SAMPLE_CAP = 25;

/**
 * Task #167: Daily sweep that re-applies the Task #164 backfill logic
 * defensively. For any animal with status='adopted' and no adoptions row,
 * insert one from the latest matching application (stage='adopted'). Then
 * surface any animals still missing an adoptions row so staff can resolve
 * them via the Record Adoption form.
 *
 * Idempotent — the INSERT is gated by NOT EXISTS, so it does nothing on
 * quiet days. Counts are logged per tenant for observability and a daily
 * admin email is sent per tenant with remaining orphans.
 */
export async function runAdoptionsOrphanSweep(): Promise<AdoptionsOrphanSweepResult> {
  const result: AdoptionsOrphanSweepResult = {
    totalInserted: 0,
    totalOrphans: 0,
    perTenantInserted: {},
    perTenantOrphans: {},
    perTenantOrphanSamples: {},
    errors: [],
  };

  try {
    const insertRes = await db.execute(sql`
      WITH candidates AS (
        SELECT DISTINCT ON (a.id)
          a.tenant_id,
          a.id           AS animal_id,
          app.id         AS application_id,
          app.applicant_name,
          app.applicant_email,
          app.applicant_phone,
          COALESCE(a.adoption_date, NOW()) AS adoption_date
        FROM animals a
        JOIN applications app
          ON app.animal_id = a.id
         AND app.tenant_id = a.tenant_id
         AND app.stage = 'adopted'
        WHERE a.status = 'adopted'
          AND NOT EXISTS (
            SELECT 1 FROM adoptions ad
            WHERE ad.animal_id = a.id
              AND ad.tenant_id = a.tenant_id
          )
        ORDER BY a.id, app.updated_at DESC
      )
      INSERT INTO adoptions (
        tenant_id, animal_id, application_id,
        adopter_name, adopter_email, adopter_phone, adoption_date
      )
      SELECT
        tenant_id, animal_id, application_id,
        applicant_name, applicant_email, applicant_phone, adoption_date
      FROM candidates
      RETURNING tenant_id::text AS tenant_id
    `);
    const insertedRows =
      ((insertRes as { rows?: Array<{ tenant_id: string }> }).rows) ?? [];
    result.totalInserted = insertedRows.length;
    for (const r of insertedRows) {
      result.perTenantInserted[r.tenant_id] =
        (result.perTenantInserted[r.tenant_id] ?? 0) + 1;
    }
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    result.errors.push(`insert: ${msg}`);
    console.error("[AdoptionsSweep] Insert step failed:", err);
  }

  try {
    const orphanRes = await db.execute(sql`
      SELECT a.tenant_id::text AS tenant_id,
             a.id::text         AS animal_id,
             a.name             AS animal_name
      FROM animals a
      WHERE a.status = 'adopted'
        AND NOT EXISTS (
          SELECT 1 FROM adoptions ad
          WHERE ad.animal_id = a.id
            AND ad.tenant_id = a.tenant_id
        )
      ORDER BY a.tenant_id, a.id
    `);
    const orphanRows =
      ((orphanRes as {
        rows?: Array<{ tenant_id: string; animal_id: string; animal_name: string | null }>;
      }).rows) ?? [];
    result.totalOrphans = orphanRows.length;
    for (const r of orphanRows) {
      result.perTenantOrphans[r.tenant_id] =
        (result.perTenantOrphans[r.tenant_id] ?? 0) + 1;
      const bucket = (result.perTenantOrphanSamples[r.tenant_id] ??= []);
      if (bucket.length < PER_TENANT_SAMPLE_CAP) {
        bucket.push({
          tenantId: r.tenant_id,
          animalId: r.animal_id,
          animalName: r.animal_name,
        });
      }
    }
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    result.errors.push(`orphan-scan: ${msg}`);
    console.error("[AdoptionsSweep] Orphan scan failed:", err);
  }

  for (const [tenantId, count] of Object.entries(result.perTenantInserted)) {
    console.log(
      `[AdoptionsSweep] tenant=${tenantId} inserted ${count} adoption row(s) from stage='adopted' applications`,
    );
  }
  for (const [tenantId, count] of Object.entries(result.perTenantOrphans)) {
    const tenantSamples = result.perTenantOrphanSamples[tenantId] ?? [];
    const sample = tenantSamples
      .slice(0, 10)
      .map((o) => `${o.animalName ?? "?"} (${o.animalId})`)
      .join("; ");
    console.warn(
      `[AdoptionsSweep] tenant=${tenantId} has ${count} adopted animal(s) missing an adoptions row — staff must add adopter info via Record Adoption. Sample: ${sample}${count > 10 ? " (…)" : ""}`,
    );

    try {
      await sendOrphanAdminNotification(tenantId, count, tenantSamples);
    } catch (notifyErr) {
      const msg = (notifyErr as { message?: string })?.message ?? String(notifyErr);
      result.errors.push(`notify[${tenantId}]: ${msg}`);
      console.error(`[AdoptionsSweep] Failed to email admins for tenant ${tenantId}:`, notifyErr);
    }
  }

  if (result.totalInserted === 0 && result.totalOrphans === 0) {
    console.log("[AdoptionsSweep] Quiet day — no inserts, no orphans");
  } else {
    console.log(
      `[AdoptionsSweep] TOTAL inserted=${result.totalInserted}, orphansRemaining=${result.totalOrphans}`,
    );
  }

  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendOrphanAdminNotification(
  tenantId: string,
  orphanCount: number,
  samples: OrphanRow[],
): Promise<void> {
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, subdomain: tenants.subdomain })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return;

  const adminUsers = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        eq(users.emailBounced, false),
        sql`(${users.roles} && ARRAY['admin','owner']::text[])`,
      ),
    );

  const recipientSet = new Set<string>();
  for (const u of adminUsers) {
    if (typeof u.email === "string" && u.email.length > 0) {
      recipientSet.add(u.email.trim().toLowerCase());
    }
  }
  const recipients = Array.from(recipientSet);

  if (recipients.length === 0) {
    console.warn(
      `[AdoptionsSweep] tenant=${tenantId} has ${orphanCount} orphan(s) but no active admin/owner email recipients found — skipping notification`,
    );
    return;
  }

  const emailService = await EmailService.forTenant(tenantId);
  if (!emailService) {
    console.warn(
      `[AdoptionsSweep] tenant=${tenantId} has ${orphanCount} orphan(s) but no email service is configured — skipping notification`,
    );
    return;
  }

  const visibleSamples = samples.slice(0, 10);
  const sampleList = visibleSamples
    .map(
      (o) =>
        `<li>${escapeHtml(o.animalName ?? "(unnamed)")} <span style="color:#666;font-size:12px;">(${escapeHtml(o.animalId)})</span></li>`,
    )
    .join("");
  const more =
    orphanCount > visibleSamples.length
      ? `<p style="color:#666;font-size:13px;">…and ${orphanCount - visibleSamples.length} more.</p>`
      : "";

  const subject = `Action needed: ${orphanCount} adopted animal${orphanCount === 1 ? "" : "s"} missing adopter contact info`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #b45309;">Adopter contact info missing</h2>
      <p>Hello,</p>
      <p>Our daily data-integrity sweep found <strong>${orphanCount}</strong> animal${orphanCount === 1 ? "" : "s"}
      at <strong>${escapeHtml(tenant.name ?? "your organization")}</strong> marked as <em>Adopted</em>
      with no matching adoption record on file. These animals will be silently skipped by heartworm and
      parasite-prevention compliance reminders until adopter contact info is added.</p>
      <p>Please open each animal in the Animals page and use <strong>Record Adoption</strong> to enter the
      adopter's name, email, and phone number.</p>
      <h3 style="margin-top:24px;">Animals needing attention${orphanCount > visibleSamples.length ? ` (first ${visibleSamples.length} shown)` : ""}:</h3>
      <ul>${sampleList}</ul>
      ${more}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
      <p style="color:#999;font-size:12px;">This is an automated daily data-integrity report from iRescue.life.</p>
    </div>
  `;

  let sentCount = 0;
  for (const to of recipients) {
    try {
      const sendRes = await emailService.send({ to, subject, html });
      if (sendRes.success) {
        sentCount += 1;
      } else {
        console.warn(
          `[AdoptionsSweep] Failed to send orphan notification to ${to} for tenant ${tenantId}: ${sendRes.error ?? "unknown"}`,
        );
      }
    } catch (err) {
      console.error(`[AdoptionsSweep] Error sending orphan notification to ${to}:`, err);
    }
  }
  console.log(
    `[AdoptionsSweep] tenant=${tenantId} orphan email delivered to ${sentCount}/${recipients.length} active admin/owner(s)`,
  );
}
