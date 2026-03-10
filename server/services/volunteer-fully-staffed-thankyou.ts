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

    await executeFullyStaffedCheck(tenantId, calendarId, month);
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
  const existing = await db.query.volunteerFullyStaffedNotifications.findFirst({
    where: and(
      eq(volunteerFullyStaffedNotifications.tenantId, tenantId),
      eq(volunteerFullyStaffedNotifications.calendarId, calendarId),
      eq(volunteerFullyStaffedNotifications.month, month),
    ),
  });

  if (existing) {
    return;
  }

  const monthOpportunities = await db
    .select({
      id: volunteerOpportunities.id,
      slotsTotal: volunteerOpportunities.slotsTotal,
      slotsFilled: volunteerOpportunities.slotsFilled,
    })
    .from(volunteerOpportunities)
    .where(
      and(
        eq(volunteerOpportunities.tenantId, tenantId),
        eq(volunteerOpportunities.calendarId, calendarId),
        like(volunteerOpportunities.date, `${month}-%`),
      )
    );

  if (monthOpportunities.length === 0) {
    return;
  }

  const allFull = monthOpportunities.every(opp => opp.slotsFilled >= opp.slotsTotal);
  if (!allFull) {
    return;
  }

  const [calendar] = await db
    .select({ name: calendars.name })
    .from(calendars)
    .where(eq(calendars.id, calendarId))
    .limit(1);

  const calendarName = calendar?.name || 'the volunteer calendar';
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
    console.log(`[VOLUNTEER THANKYOU] No volunteer phone numbers found for ${calendarName} ${monthName}`);
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

  const message = `Thank you so much for fully staffing ${calendarName} for ${monthName}! Your dedication makes all the difference for our animals. ❤️🐶`;

  console.log(`[VOLUNTEER THANKYOU] Sending thank-you to ${uniquePhones.size} volunteers for ${calendarName} (${monthName})`);

  for (const phone of uniquePhones) {
    try {
      await sendSms(tenantId, phone, message, { skipOrgPrefix: false });
    } catch (smsErr: any) {
      console.error(`[VOLUNTEER THANKYOU] Failed to send to ${phone}: ${smsErr.message}`);
    }
  }

  console.log(`[VOLUNTEER THANKYOU] Completed — ${calendarName} is fully staffed for ${monthName}`);
}
