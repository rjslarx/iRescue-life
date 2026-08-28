import { db } from "../db";
import {
  tenants,
  calendars,
  calendarEvents,
  volunteerThresholdAlertHistory,
  smsMessageLogs,
  users,
  type Tenant,
} from "@shared/schema";
import { eq, and, gte, lte, inArray, sql, or } from "drizzle-orm";
import { sendSms, isTwilioEnabled } from "../lib/twilio-service";
import { format, addDays, startOfDay, endOfDay, parseISO, eachDayOfInterval, subHours } from "date-fns";

interface DayShortageInfo {
  calendarId: string;
  calendarName: string;
  date: string;
  minVolunteersRequired: number;
  signedUpCount: number;
  shortage: number;
  signedUpNames: string[];
}

interface WeeklyDigestResult {
  tenantId: string;
  smsSent: number;
  shortageCount: number;
  calendarsIncluded: string[];
  errors: string[];
}

interface UrgentAlertResult {
  tenantId: string;
  smsSent: number;
  urgentDaysAlerted: number;
  errors: string[];
}

export function formatVolunteerShortageStatus(
  signedUpCount: number,
  minVolunteersRequired: number,
): string {
  const shortage = Math.max(0, minVolunteersRequired - signedUpCount);
  return `${signedUpCount}/${minVolunteersRequired} signed up; need ${shortage} more`;
}

export class VolunteerRecruitmentSmsService {
  private static async hasRecruitmentSmsSentInLast24Hours(tenantId: string): Promise<boolean> {
    const cutoff = subHours(new Date(), 24);
    const recent = await db
      .select({ id: smsMessageLogs.id })
      .from(smsMessageLogs)
      .where(
        and(
          eq(smsMessageLogs.tenantId, tenantId),
          eq(smsMessageLogs.direction, 'outbound'),
          eq(smsMessageLogs.status, 'sent'),
          gte(smsMessageLogs.createdAt, cutoff),
          // Suppress if ANY volunteer-recruitment-style SMS has gone out in
          // the last 24h — including the hourly threshold-alert system —
          // so the same volunteer never gets two "we need help" texts in
          // the same day.
          inArray(smsMessageLogs.messageType, [
            'volunteer_recruitment_weekly',
            'volunteer_recruitment_urgent',
            'volunteer_threshold_alert',
          ])
        )
      )
      .limit(1);
    return recent.length > 0;
  }

  /**
   * Dedup recipients by phone number so a single run never texts the same
   * device twice (e.g., a person with both a staff account and a separate
   * volunteer account that share a phone).
   */
  private static dedupByPhone<T extends { phone: string | null }>(list: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of list) {
      const key = (item.phone ?? "").replace(/\D/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  private static async getCalendarDayShortages(
    tenantId: string,
    targetCalendars: typeof calendars.$inferSelect[],
    startDate: Date,
    endDate: Date,
    defaultMin: number
  ): Promise<DayShortageInfo[]> {
    const calendarMap = new Map(targetCalendars.map((c) => [c.id, c]));
    const calendarIds = targetCalendars.map((c) => c.id);

    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.tenantId, tenantId),
          inArray(calendarEvents.calendarId, calendarIds),
          gte(calendarEvents.startTime, startOfDay(startDate)),
          lte(calendarEvents.startTime, endOfDay(endDate))
        )
      );

    const allDays = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });

    const shortages: DayShortageInfo[] = [];

    for (const cal of targetCalendars) {
      const minRequired = cal.minVolunteersRequired ?? defaultMin;

      for (const day of allDays) {
        const dayStr = format(day, "yyyy-MM-dd");
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        const dayEvents = events.filter(
          (e) =>
            e.calendarId === cal.id &&
            e.startTime >= dayStart &&
            e.startTime <= dayEnd
        );

        const signedUpCount = dayEvents.length;

        if (signedUpCount < minRequired) {
          const names = dayEvents
            .map((e) => {
              if (e.manualVolunteerName) return e.manualVolunteerName.trim();
              const titleMatch = e.title?.match(/^(.+?)\s*-\s*Signup$/i);
              return titleMatch ? titleMatch[1].trim() : e.title || "";
            })
            .filter(Boolean);

          shortages.push({
            calendarId: cal.id,
            calendarName: cal.name,
            date: dayStr,
            minVolunteersRequired: minRequired,
            signedUpCount,
            shortage: minRequired - signedUpCount,
            signedUpNames: names,
          });
        }
      }
    }

    return shortages;
  }

  static async sendWeeklyDigest(tenantId: string): Promise<WeeklyDigestResult> {
    const result: WeeklyDigestResult = {
      tenantId,
      smsSent: 0,
      shortageCount: 0,
      calendarsIncluded: [],
      errors: [],
    };

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) {
      result.errors.push("Tenant not found");
      return result;
    }

    const settings = tenant.volunteerRecruitmentSmsSettings;
    if (!settings?.enabled || !settings?.weeklyDigestEnabled) {
      return result;
    }

    if (await this.hasRecruitmentSmsSentInLast24Hours(tenantId)) {
      return result;
    }

    const allVolunteerCalendars = await db
      .select()
      .from(calendars)
      .where(and(eq(calendars.tenantId, tenantId), eq(calendars.type, "volunteer")));

    const watchedIds = settings.watchedCalendarIds || [];
    const targetCalendars =
      watchedIds.length > 0
        ? allVolunteerCalendars.filter((c) => watchedIds.includes(c.id))
        : allVolunteerCalendars;

    if (targetCalendars.length === 0) {
      return result;
    }

    const now = new Date();
    const defaultMin = settings.minimumVolunteers ?? 2;

    const shortages = await this.getCalendarDayShortages(
      tenantId,
      targetCalendars,
      now,
      addDays(now, 7),
      defaultMin
    );

    if (shortages.length === 0) {
      await db
        .update(tenants)
        .set({
          volunteerRecruitmentSmsSettings: {
            ...settings,
            lastWeeklyDigestAt: now.toISOString(),
          },
        } as any)
        .where(eq(tenants.id, tenantId));
      return result;
    }

    result.shortageCount = shortages.length;

    const byCalendar = new Map<string, DayShortageInfo[]>();
    for (const s of shortages) {
      if (!byCalendar.has(s.calendarName)) byCalendar.set(s.calendarName, []);
      byCalendar.get(s.calendarName)!.push(s);
    }
    result.calendarsIncluded = Array.from(byCalendar.keys());

    const orgName = tenant.name;
    const baseUrl = tenant.customDomain ? `https://${tenant.customDomain}` : (tenant.subdomain ? `https://${tenant.subdomain}.irescue.life` : "");
    const signupUrl = baseUrl ? `${baseUrl}/dashboard/calendar` : "our website";

    const lines: string[] = [`🐕 ${orgName} Volunteers Needed:`];
    for (const [calName, calShortages] of byCalendar) {
      const dayParts = calShortages
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => {
          const dayLabel = format(parseISO(s.date), "EEE M/d");
          return `${dayLabel} (${formatVolunteerShortageStatus(s.signedUpCount, s.minVolunteersRequired)})`;
        });
      lines.push(`${calName}: ${dayParts.join(", ")}`);
    }
    lines.push(`Please sign up: ${signupUrl}`);

    const message = lines.join("\n");

    if (!(await isTwilioEnabled(tenantId))) {
      return result;
    }

    const allUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId)));

    const recipients = this.dedupByPhone(
      allUsers.filter(
        (u) =>
          u.phone &&
          u.smsRecruitmentOptIn !== false &&
          u.roles &&
          u.roles.some((r: string) => ["volunteer", "staff", "admin"].includes(r))
      )
    );

    for (const recipient of recipients) {
      try {
        await sendSms(tenantId, recipient.phone!, message, "volunteer_recruitment_weekly", { skipOrgPrefix: true });
        result.smsSent++;
      } catch (err: any) {
        result.errors.push(`Failed to send to ${recipient.phone}: ${err.message}`);
      }
    }

    await db
      .update(tenants)
      .set({
        volunteerRecruitmentSmsSettings: {
          ...settings,
          lastWeeklyDigestAt: now.toISOString(),
        },
      } as any)
      .where(eq(tenants.id, tenantId));

    return result;
  }

  static async sendUrgentAlerts(tenantId: string): Promise<UrgentAlertResult> {
    const result: UrgentAlertResult = {
      tenantId,
      smsSent: 0,
      urgentDaysAlerted: 0,
      errors: [],
    };

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) {
      result.errors.push("Tenant not found");
      return result;
    }

    const settings = tenant.volunteerRecruitmentSmsSettings;
    if (!settings?.enabled || !settings?.urgentAlertEnabled) {
      return result;
    }

    if (await this.hasRecruitmentSmsSentInLast24Hours(tenantId)) {
      return result;
    }

    if (!(await isTwilioEnabled(tenantId))) {
      return result;
    }

    const daysOut = settings.urgentAlertDaysOut ?? 2;
    const now = new Date();
    const endDate = addDays(now, daysOut);

    const allVolunteerCalendars = await db
      .select()
      .from(calendars)
      .where(and(eq(calendars.tenantId, tenantId), eq(calendars.type, "volunteer")));

    const watchedIds = settings.watchedCalendarIds || [];
    const targetCalendars =
      watchedIds.length > 0
        ? allVolunteerCalendars.filter((c) => watchedIds.includes(c.id))
        : allVolunteerCalendars;

    if (targetCalendars.length === 0) {
      return result;
    }

    const defaultMin = settings.minimumVolunteers ?? 2;

    const shortages = await this.getCalendarDayShortages(
      tenantId,
      targetCalendars,
      now,
      endDate,
      defaultMin
    );

    if (shortages.length === 0) return result;

    const todayStart = startOfDay(new Date());
    const sentTodayRows = await db
      .select({ opportunityId: volunteerThresholdAlertHistory.opportunityId })
      .from(volunteerThresholdAlertHistory)
      .where(
        and(
          eq(volunteerThresholdAlertHistory.tenantId, tenantId),
          gte(volunteerThresholdAlertHistory.createdAt, todayStart)
        )
      );
    const sentTodayIds = new Set(sentTodayRows.map((r) => r.opportunityId).filter(Boolean));

    const allUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId)));

    const recipients = this.dedupByPhone(
      allUsers.filter(
        (u) =>
          u.phone &&
          u.smsRecruitmentOptIn !== false &&
          u.roles &&
          u.roles.some((r: string) => ["volunteer", "staff", "admin"].includes(r))
      )
    );

    if (recipients.length === 0) return result;

    const orgName = tenant.name;
    const baseUrl = tenant.customDomain ? `https://${tenant.customDomain}` : (tenant.subdomain ? `https://${tenant.subdomain}.irescue.life` : "");
    const signupUrl = baseUrl ? `${baseUrl}/dashboard/calendar` : "our website";

    const newShortages = shortages
      .filter((s) => !sentTodayIds.has(`${s.calendarId}:${s.date}`))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (newShortages.length === 0) return result;

    let message: string;
    if (newShortages.length === 1) {
      const s = newShortages[0];
      const dayLabel = format(parseISO(s.date), "EEEE M/d");
      if (s.signedUpCount === 0) {
        message = `🐕 ${orgName}: ${s.calendarName} on ${dayLabel} has 0 volunteers signed up! We need ${s.minVolunteersRequired}.`;
      } else {
        message = `🐕 ${orgName}: ${s.calendarName} on ${dayLabel} needs ${s.shortage} more volunteer${s.shortage !== 1 ? "s" : ""} (${s.signedUpCount}/${s.minVolunteersRequired} signed up).`;
      }
      message += `\nReply SIGNUP to claim this shift!\n${signupUrl}`;
    } else {
      const lines: string[] = [`🐕 ${orgName}: Volunteers needed!`];
      newShortages.forEach((s, i) => {
        const dayLabel = format(parseISO(s.date), "EEE M/d");
        lines.push(`${i + 1}. ${s.calendarName} ${dayLabel} (${formatVolunteerShortageStatus(s.signedUpCount, s.minVolunteersRequired)})`);
      });
      lines.push(`Reply with a # to claim a shift!`);
      lines.push(signupUrl);
      message = lines.join("\n");
    }

    let smsSentCount = 0;
    for (const recipient of recipients) {
      try {
        await sendSms(tenantId, recipient.phone!, message, "volunteer_recruitment_urgent", { skipOrgPrefix: true });
        smsSentCount++;
        result.smsSent++;
      } catch (err: any) {
        result.errors.push(`Failed urgent SMS to ${recipient.phone}: ${err.message}`);
      }
    }

    for (const s of newShortages) {
      const dedupKey = `${s.calendarId}:${s.date}`;
      const dayLabel = format(parseISO(s.date), "EEEE M/d");
      try {
        await db.insert(volunteerThresholdAlertHistory).values({
          alertId: "00000000-0000-0000-0000-000000000000",
          tenantId,
          alertDate: new Date(),
          opportunityId: dedupKey,
          opportunityTitle: `${s.calendarName} - ${dayLabel}`,
          currentVolunteers: s.signedUpCount,
          minimumRequired: s.minVolunteersRequired,
          pushSent: 0,
          smsSent: smsSentCount,
          emailSent: 0,
          totalRecipients: recipients.length,
        });
      } catch (_) {
      }
      result.urgentDaysAlerted++;
    }

    return result;
  }

  static async checkAndRunAllTenants(mode: "weekly" | "urgent"): Promise<void> {
    const allTenants = await db
      .select({ id: tenants.id, name: tenants.name, volunteerRecruitmentSmsSettings: tenants.volunteerRecruitmentSmsSettings })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    for (const tenant of allTenants) {
      const settings = tenant.volunteerRecruitmentSmsSettings;
      if (!settings?.enabled) continue;

      if (mode === "weekly") {
        if (!settings.weeklyDigestEnabled) continue;

        const now = new Date();
        const currentDay = format(now, "EEE").toLowerCase() as "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
        const targetDay = settings.weeklyDigestDayOfWeek ?? "thu";
        if (currentDay !== targetDay) continue;

        try {
          const res = await this.sendWeeklyDigest(tenant.id);
          if (res.smsSent > 0 || res.shortageCount > 0) {
            console.log(`[Volunteer Recruitment SMS] Weekly digest for ${tenant.name}: ${res.smsSent} SMS, ${res.shortageCount} shortages`);
          }
        } catch (err: any) {
          console.error(`[Volunteer Recruitment SMS] Weekly digest error for ${tenant.name}:`, err.message);
        }
      } else {
        if (!settings.urgentAlertEnabled) continue;

        try {
          const res = await this.sendUrgentAlerts(tenant.id);
          if (res.smsSent > 0) {
            console.log(`[Volunteer Recruitment SMS] Urgent alerts for ${tenant.name}: ${res.smsSent} SMS, ${res.urgentDaysAlerted} calendar-days`);
          }
        } catch (err: any) {
          console.error(`[Volunteer Recruitment SMS] Urgent alert error for ${tenant.name}:`, err.message);
        }
      }
    }
  }
}
