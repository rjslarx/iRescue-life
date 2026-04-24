import { db } from '../db';
import { tenants, surgeryDayRequests } from '@shared/schema';
import { eq, and, isNull, isNotNull, notInArray } from 'drizzle-orm';
import { sendSms, isTwilioEnabled } from '../lib/twilio-service';

export interface SurgeryDayReminderResult {
  sent: boolean;
  recipientPhone?: string;
  reason?: string;
}

// Hour-of-day (0–23, local) at which we want to fire the day-before reminder.
// 18 == 6 PM, ~14 hours before the 8 AM drop-off window.
const REMINDER_LOCAL_HOUR = 18;

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
 * Compute the calendar parts (year/month/day/hour) for `now` in the given
 * IANA timezone. Returns null if the timezone string is invalid so callers
 * can fall back to the legacy "no timezone configured" code path instead of
 * silently sending at the wrong hour.
 */
function getLocalParts(timezone: string, now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
} | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    return null;
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const hour = Number(get('hour')) % 24; // some locales report "24" at midnight
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
  };
}

/**
 * Given local Y/M/D, return the "next day" as a YYYY-MM-DD string.
 */
function nextDayString(year: number, month: number, day: number): string {
  // Use UTC math purely for date arithmetic; the resulting date string is a
  // pure calendar date, no timezone semantics attached.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
      bypassQuietHours: true, // 6 PM local evening reminder is the whole point
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
 * "tomorrow" in the tenant's local timezone and hasn't yet been reminded, and
 * text the contact.
 *
 * Designed to run hourly. For each tenant, we only do real work when the
 * current hour in that tenant's local timezone is the configured reminder hour
 * (6 PM by default). Tenants without a configured timezone fall back to the
 * legacy behavior: send only when it is midnight UTC, using "tomorrow in UTC".
 *
 * The `reminder_sms_sent_at` dedupe column still prevents double-sends across
 * runs (the cron now ticks every hour, so this is doing real work).
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
    const now = new Date();

    const activeTenants = await db
      .select({ id: tenants.id, timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    for (const tenant of activeTenants) {
      try {
        let tomorrowDateStr: string;
        const local = tenant.timezone ? getLocalParts(tenant.timezone, now) : null;

        if (local) {
          if (local.hour !== REMINDER_LOCAL_HOUR) {
            // Not 6 PM in this tenant's timezone; skip silently.
            continue;
          }
          tomorrowDateStr = nextDayString(local.year, local.month, local.day);
        } else {
          // Legacy fallback: tenant has no timezone configured (or has an
          // invalid one). Preserve the original behavior — fire only at
          // midnight UTC so we don't silently send at the wrong hour.
          if (tenant.timezone) {
            errors.push(`[${tenant.id}] invalid timezone "${tenant.timezone}"; falling back to UTC schedule`);
          }
          if (now.getUTCHours() !== 0) {
            continue;
          }
          const tomorrow = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
          ));
          tomorrowDateStr = tomorrow.toISOString().slice(0, 10);
        }

        tenantsProcessed++;

        // Eligibility: any non-terminal surgery day request that is dated for
        // tomorrow (in tenant local time), has a contact phone on file, and
        // hasn't already been reminded for the *current* scheduled date.
        // We intentionally don't restrict to status='scheduled' — 'approved'
        // requests with a date are also schedule-bearing in this app
        // (matching the auto-confirmation email logic in
        // PATCH /api/surgery-day-requests/:id), and we still remind 'pending'
        // requests if staff happen to set a date without changing the status.
        // Terminal states (declined/cancelled/completed) are excluded.
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
