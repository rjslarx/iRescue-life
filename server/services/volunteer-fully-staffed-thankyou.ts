import { db } from '../db';
import {
  volunteerOpportunities,
  volunteerSignups,
  volunteerFullyStaffedNotifications,
  calendars,
} from '@shared/schema';
import { eq, and, like, inArray } from 'drizzle-orm';
import { sendSms } from '../lib/twilio-service';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// In-process lock keyed by `${tenantId}:${month}` so two concurrent signups
// (in different calendars) that both push the tenant over the "all full" line
// can't both pass the dedup check before either has inserted the dedup row.
// The first caller does the work; the second awaits the same promise and then
// re-runs its check, which short-circuits on the now-existing dedup row.
const inFlightLocks = new Map<string, Promise<void>>();

function isQuietHours(): boolean {
  const nowUtc = new Date();
  const cstHour = (nowUtc.getUTCHours() - 6 + 24) % 24;
  return cstHour >= 20 || cstHour < 6;
}

function getMonthName(monthStr: string): string {
  const parts = monthStr.split('-');
  const monthIndex = parseInt(parts[1], 10) - 1;
  return MONTH_NAMES[monthIndex] || monthStr;
}

export async function checkAndSendFullyStaffedThankYou(
  tenantId: string,
  calendarId: string,
  month: string
): Promise<void> {
  try {
    if (isQuietHours()) {
      console.log(`[VOLUNTEER THANKYOU] Quiet hours — deferring check`);
      scheduleRetryAfterQuietHours(tenantId, calendarId, month);
      return;
    }

    const lockKey = `${tenantId}:${month}`;
    const inFlight = inFlightLocks.get(lockKey);
    if (inFlight) {
      // Wait for the in-flight check to finish (which may insert the dedup row)
      // and then run our own check, which will short-circuit on the dedup row.
      await inFlight.catch(() => {});
      await executeFullyStaffedCheck(tenantId, calendarId, month);
      return;
    }

    const work = executeFullyStaffedCheck(tenantId, calendarId, month).finally(() => {
      inFlightLocks.delete(lockKey);
    });
    inFlightLocks.set(lockKey, work);
    await work;
  } catch (error: any) {
    console.error(`[VOLUNTEER THANKYOU] Error: ${error.message}`);
  }
}

function scheduleRetryAfterQuietHours(tenantId: string, calendarId: string, month: string): void {
  const nowUtc = new Date();
  const cstHour = (nowUtc.getUTCHours() - 6 + 24) % 24;

  let delayMs: number;
  if (cstHour >= 20) {
    delayMs = (24 - cstHour + 6) * 60 * 60 * 1000;
  } else {
    delayMs = (6 - cstHour) * 60 * 60 * 1000;
  }

  delayMs += 5 * 60 * 1000;

  console.log(`[VOLUNTEER THANKYOU] Scheduling retry in ${Math.round(delayMs / 60000)} minutes (after quiet hours)`);

  setTimeout(() => {
    executeFullyStaffedCheck(tenantId, calendarId, month).catch(err => {
      console.error(`[VOLUNTEER THANKYOU] Deferred check failed: ${err.message}`);
    });
  }, delayMs);
}

async function executeFullyStaffedCheck(
  tenantId: string,
  calendarId: string,
  month: string
): Promise<void> {
  // Tenant-wide dedup: only one celebration per tenant per month, regardless of
  // which calendar signup triggered the check.
  const existing = await db.query.volunteerFullyStaffedNotifications.findFirst({
    where: and(
      eq(volunteerFullyStaffedNotifications.tenantId, tenantId),
      eq(volunteerFullyStaffedNotifications.month, month),
    ),
  });

  if (existing) {
    return;
  }

  // Find every active volunteer calendar in this tenant. The celebration only
  // fires when every shift in every active volunteer calendar is fully staffed
  // for the month.
  const tenantVolunteerCalendars = await db
    .select({ id: calendars.id })
    .from(calendars)
    .where(
      and(
        eq(calendars.tenantId, tenantId),
        eq(calendars.type, 'volunteer'),
        eq(calendars.isActive, true),
      )
    );

  if (tenantVolunteerCalendars.length === 0) {
    return;
  }

  const tenantCalendarIds = tenantVolunteerCalendars.map(c => c.id);

  const monthOpportunities = await db
    .select({
      id: volunteerOpportunities.id,
      calendarId: volunteerOpportunities.calendarId,
      slotsTotal: volunteerOpportunities.slotsTotal,
      slotsFilled: volunteerOpportunities.slotsFilled,
    })
    .from(volunteerOpportunities)
    .where(
      and(
        eq(volunteerOpportunities.tenantId, tenantId),
        inArray(volunteerOpportunities.calendarId, tenantCalendarIds),
        like(volunteerOpportunities.date, `${month}-%`),
      )
    );

  if (monthOpportunities.length === 0) {
    return;
  }

  // Require every active volunteer calendar that has shifts for the month to
  // be fully booked. Calendars with zero shifts for the month are skipped (they
  // shouldn't block the celebration), but if a calendar has shifts and any are
  // unfilled, we wait.
  const allFull = monthOpportunities.every(opp => opp.slotsFilled >= opp.slotsTotal);
  if (!allFull) {
    return;
  }

  const monthName = getMonthName(month);

  const opportunityIds = monthOpportunities.map(o => o.id);

  const signupRows = await db
    .select({
      phone: volunteerSignups.applicantPhone,
    })
    .from(volunteerSignups)
    .where(
      and(
        eq(volunteerSignups.tenantId, tenantId),
        inArray(volunteerSignups.opportunityId, opportunityIds),
      )
    );

  const uniquePhones = new Set<string>();
  for (const row of signupRows) {
    if (row.phone && row.phone.trim()) {
      uniquePhones.add(row.phone.trim());
    }
  }

  if (uniquePhones.size === 0) {
    console.log(`[VOLUNTEER THANKYOU] No volunteer phone numbers found for tenant ${tenantId} ${monthName}`);
    return;
  }

  try {
    await db.insert(volunteerFullyStaffedNotifications).values({
      tenantId,
      calendarId,
      month,
    });
  } catch (insertErr: any) {
    if (insertErr.code === '23505') {
      return;
    }
    throw insertErr;
  }

  const message = `Thank you so much for fully staffing every volunteer calendar for ${monthName}! Your dedication makes all the difference for our animals. ❤️🐶`;

  console.log(`[VOLUNTEER THANKYOU] Sending thank-you to ${uniquePhones.size} volunteers — all volunteer calendars fully staffed for ${monthName}`);

  for (const phone of uniquePhones) {
    try {
      await sendSms(tenantId, phone, message, { skipOrgPrefix: false });
    } catch (smsErr: any) {
      console.error(`[VOLUNTEER THANKYOU] Failed to send to ${phone}: ${smsErr.message}`);
    }
  }

  console.log(`[VOLUNTEER THANKYOU] Completed — all volunteer calendars fully staffed for ${monthName}`);
}
