import { db } from '../db';
import { tenants, surgeryDayRequests } from '@shared/schema';
import { eq, and, isNull, isNotNull, notInArray } from 'drizzle-orm';
import { sendSms, isTwilioEnabled } from '../lib/twilio-service';

export interface SurgeryDayReminderResult {
  sent: boolean;
  recipientPhone?: string;
  reason?: string;
}

function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const startsWithPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (startsWithPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function formatScheduledDateShort(scheduledDate: string): string {
  const [y, m, d] = scheduledDate.split('-').map(Number);
  if (!y || !m || !d) return scheduledDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function buildReminderMessage(scheduledDate: string, contactName: string): string {
  const friendly = formatScheduledDateShort(scheduledDate);
  const greeting = contactName ? `Hi ${contactName.split(/\s+/)[0]}, ` : '';
  return (
    `${greeting}reminder: surgery day is tomorrow (${friendly}). ` +
    `Drop-off 8:00–9:00 AM, pick-up 2:00–3:00 PM. ` +
    `No food after 10 PM tonight (water OK until 10 PM). ` +
    `Reply or call us if anything changes.`
  ).substring(0, 320);
}

/**
 * Send a day-before SMS reminder to the partner rescue's contact phone.
 * Returns metadata so the caller can persist it (or surface why it didn't send).
 *
 * Used by both the cron job and the manual "Send reminder" button.
 */
export async function sendSurgeryDayReminderSms(params: {
  tenantId: string;
  requestId: string;
}): Promise<SurgeryDayReminderResult> {
  const { tenantId, requestId } = params;

  try {
    const [request] = await db
      .select()
      .from(surgeryDayRequests)
      .where(and(eq(surgeryDayRequests.id, requestId), eq(surgeryDayRequests.tenantId, tenantId)))
      .limit(1);

    if (!request) return { sent: false, reason: 'Request not found' };
    if (!request.scheduledDate) return { sent: false, reason: 'No scheduled date set' };

    const toNumber = normalizePhoneE164(request.contactPhone);
    if (!toNumber) {
      return { sent: false, reason: 'No valid contact phone on file' };
    }

    const enabled = await isTwilioEnabled(tenantId);
    if (!enabled) return { sent: false, reason: 'SMS not configured for this organization' };

    const message = buildReminderMessage(request.scheduledDate, request.contactName);

    const result = await sendSms(tenantId, toNumber, message, 'reminder', {
      bypassQuietHours: true, // 6 PM CST evening reminder is the whole point
    });

    if (result.status !== 'sent') {
      return { sent: false, reason: result.error || 'SMS send failed' };
    }

    console.log(`[SurgeryDayReminder] Sent SMS to ${toNumber} for request ${requestId}`);
    return { sent: true, recipientPhone: toNumber };
  } catch (error: any) {
    console.error('[SurgeryDayReminder] Failed to send reminder SMS:', error);
    return { sent: false, reason: error?.message || 'Unknown error' };
  }
}

/**
 * Cron entrypoint: find every scheduled surgery day request that is happening
 * "tomorrow" (UTC) and hasn't yet been reminded, and text the contact.
 *
 * Designed to run once a day around midnight UTC (~6 PM the night before in
 * Central Time) — about 14h before the 8 AM drop-off window.
 */
export async function runSurgeryDayRemindersForAllTenants(): Promise<{
  tenantsProcessed: number;
  remindersSent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let tenantsProcessed = 0;
  let remindersSent = 0;

  try {
    // "Tomorrow" in UTC, formatted as YYYY-MM-DD to match the date column.
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ));
    const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);

    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    for (const tenant of activeTenants) {
      tenantsProcessed++;
      try {
        // Eligibility: any non-terminal surgery day request that is dated for
        // tomorrow (UTC), has a contact phone on file, and hasn't already been
        // reminded for the *current* scheduled date. We intentionally don't
        // restrict to status='scheduled' — 'approved' requests with a date are
        // also schedule-bearing in this app (matching the auto-confirmation
        // email logic in PATCH /api/surgery-day-requests/:id), and we still
        // remind 'pending' requests if staff happen to set a date without
        // changing the status. Terminal states (declined/cancelled/completed)
        // are excluded.
        const due = await db
          .select({ id: surgeryDayRequests.id })
          .from(surgeryDayRequests)
          .where(and(
            eq(surgeryDayRequests.tenantId, tenant.id),
            eq(surgeryDayRequests.scheduledDate, tomorrowDateStr),
            notInArray(surgeryDayRequests.status, ['declined', 'cancelled', 'completed']),
            isNotNull(surgeryDayRequests.contactPhone),
            isNull(surgeryDayRequests.reminderSmsSentAt),
          ));

        for (const row of due) {
          const result = await sendSurgeryDayReminderSms({
            tenantId: tenant.id,
            requestId: row.id,
          });
          if (result.sent && result.recipientPhone) {
            await db.update(surgeryDayRequests)
              .set({
                reminderSmsSentAt: new Date(),
                reminderSmsSentTo: result.recipientPhone,
                updatedAt: new Date(),
              })
              .where(and(
                eq(surgeryDayRequests.id, row.id),
                eq(surgeryDayRequests.tenantId, tenant.id),
              ));
            remindersSent++;
          } else {
            errors.push(`[${tenant.id}] request ${row.id}: ${result.reason || 'unknown'}`);
          }
        }
      } catch (tenantErr: any) {
        errors.push(`[${tenant.id}] ${tenantErr?.message || 'tenant error'}`);
      }
    }
  } catch (error: any) {
    errors.push(error?.message || 'Unknown error');
  }

  return { tenantsProcessed, remindersSent, errors };
}
