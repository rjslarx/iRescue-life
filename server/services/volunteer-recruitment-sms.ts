import { db } from "../db";
import {
  tenants,
  calendars,
  volunteerOpportunities,
  volunteerSignups,
  volunteerThresholdAlertHistory,
  users,
  type Tenant,
} from "@shared/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { sendSms, isTwilioEnabled } from "../lib/twilio-service";
import { format, addDays, startOfDay, endOfDay, parseISO } from "date-fns";

interface ShortageInfo {
  opportunityId: string;
  title: string;
  date: string;
  time: string;
  calendarId: string;
  calendarName: string;
  minVolunteersRequired: number;
  slotsFilled: number;
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
  urgentOpportunitiesAlerted: number;
  errors: string[];
}

export class VolunteerRecruitmentSmsService {
  /**
   * Send weekly grouped digest SMS for a specific tenant
   */
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

    // Guard: prevent double-send on same day
    if (settings.lastWeeklyDigestAt) {
      const lastSentDate = format(new Date(settings.lastWeeklyDigestAt), "yyyy-MM-dd");
      const today = format(new Date(), "yyyy-MM-dd");
      if (lastSentDate === today) {
        return result;
      }
    }

    // Load volunteer-type calendars
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

    const calendarMap = new Map(targetCalendars.map((c) => [c.id, c]));
    const calendarIds = targetCalendars.map((c) => c.id);

    // Load upcoming opportunities within next 7 days
    const now = new Date();
    const startDateStr = format(startOfDay(now), "yyyy-MM-dd");
    const endDateStr = format(endOfDay(addDays(now, 7)), "yyyy-MM-dd");

    const opportunities = await db
      .select()
      .from(volunteerOpportunities)
      .where(
        and(
          eq(volunteerOpportunities.tenantId, tenantId),
          inArray(volunteerOpportunities.calendarId as any, calendarIds)
        )
      );

    const upcomingOpps = opportunities.filter(
      (o) => o.date >= startDateStr && o.date <= endDateStr
    );

    const defaultMin = settings.minimumVolunteers ?? 2;

    // Find shortages
    const shortages: ShortageInfo[] = [];
    for (const opp of upcomingOpps) {
      const cal = opp.calendarId ? calendarMap.get(opp.calendarId) : undefined;
      const minRequired = cal?.minVolunteersRequired ?? defaultMin;
      const filled = opp.slotsFilled;

      if (filled < minRequired) {
        // Load signups for names
        const sigs = await db
          .select({ applicantName: volunteerSignups.applicantName, userId: volunteerSignups.userId })
          .from(volunteerSignups)
          .where(eq(volunteerSignups.opportunityId, opp.id));

        const names = sigs.map((s) => s.applicantName).filter(Boolean) as string[];

        shortages.push({
          opportunityId: opp.id,
          title: opp.title,
          date: opp.date,
          time: opp.time,
          calendarId: opp.calendarId ?? "",
          calendarName: cal?.name ?? "Volunteer Shift",
          minVolunteersRequired: minRequired,
          slotsFilled: filled,
          shortage: minRequired - filled,
          signedUpNames: names,
        });
      }
    }

    if (shortages.length === 0) {
      // No shortages — still update lastWeeklyDigestAt so we don't re-check today
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

    // Group by calendar name
    const byCalendar = new Map<string, ShortageInfo[]>();
    for (const s of shortages) {
      if (!byCalendar.has(s.calendarName)) byCalendar.set(s.calendarName, []);
      byCalendar.get(s.calendarName)!.push(s);
    }
    result.calendarsIncluded = Array.from(byCalendar.keys());

    // Build SMS body
    const orgName = tenant.name;
    const orgDomain = tenant.domain ? `https://${tenant.domain}` : "";
    const signupUrl = orgDomain ? `${orgDomain}/volunteer` : "our website";

    const lines: string[] = [`${orgName} Volunteers Needed:`];
    for (const [calName, calShortages] of byCalendar) {
      const dayParts = calShortages
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => {
          const dayLabel = format(parseISO(s.date), "EEE M/d");
          return `${dayLabel} (need ${s.shortage})`;
        });
      lines.push(`• ${calName}: ${dayParts.join(", ")}`);
    }
    lines.push(`Sign up: ${signupUrl}`);

    const message = lines.join("\n");

    // Find opted-in recipients
    if (!(await isTwilioEnabled(tenantId))) {
      return result;
    }

    const allUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId)));

    const recipients = allUsers.filter(
      (u) =>
        u.phone &&
        u.smsRecruitmentOptIn !== false &&
        u.roles &&
        u.roles.some((r: string) => ["volunteer", "staff", "admin"].includes(r))
    );

    for (const recipient of recipients) {
      try {
        await sendSms(tenantId, recipient.phone!, message, "volunteer_recruitment_weekly");
        result.smsSent++;
      } catch (err: any) {
        result.errors.push(`Failed to send to ${recipient.phone}: ${err.message}`);
      }
    }

    // Update lastWeeklyDigestAt
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

  /**
   * Send urgent personalized SMS for opportunities that are X days away and understaffed
   */
  static async sendUrgentAlerts(tenantId: string): Promise<UrgentAlertResult> {
    const result: UrgentAlertResult = {
      tenantId,
      smsSent: 0,
      urgentOpportunitiesAlerted: 0,
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

    if (!(await isTwilioEnabled(tenantId))) {
      return result;
    }

    const daysOut = settings.urgentAlertDaysOut ?? 2;
    const targetDate = format(addDays(new Date(), daysOut), "yyyy-MM-dd");

    // Load volunteer-type calendars
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

    const calendarMap = new Map(targetCalendars.map((c) => [c.id, c]));
    const calendarIds = targetCalendars.map((c) => c.id);
    const defaultMin = settings.minimumVolunteers ?? 2;

    const opportunities = await db
      .select()
      .from(volunteerOpportunities)
      .where(
        and(
          eq(volunteerOpportunities.tenantId, tenantId),
          inArray(volunteerOpportunities.calendarId as any, calendarIds)
        )
      );

    const targetOpps = opportunities.filter((o) => o.date === targetDate);

    const orgName = tenant.name;
    const orgDomain = tenant.domain ? `https://${tenant.domain}` : "";
    const signupUrl = orgDomain ? `${orgDomain}/volunteer` : "our website";

    // Duplicate-alert guard: check today's sent alerts for this tenant
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

    // Find opted-in recipients
    const allUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId)));

    const recipients = allUsers.filter(
      (u) =>
        u.phone &&
        u.smsRecruitmentOptIn !== false &&
        u.roles &&
        u.roles.some((r: string) => ["volunteer", "staff", "admin"].includes(r))
    );

    if (recipients.length === 0) return result;

    for (const opp of targetOpps) {
      if (sentTodayIds.has(opp.id)) continue;

      const cal = opp.calendarId ? calendarMap.get(opp.calendarId) : undefined;
      const minRequired = cal?.minVolunteersRequired ?? defaultMin;
      const filled = opp.slotsFilled;

      if (filled >= minRequired) continue;

      const shortage = minRequired - filled;

      // Load signups to get names
      const sigs = await db
        .select({ applicantName: volunteerSignups.applicantName })
        .from(volunteerSignups)
        .where(eq(volunteerSignups.opportunityId, opp.id));

      const names = sigs.map((s) => s.applicantName).filter(Boolean) as string[];
      const calName = cal?.name ?? opp.title;
      const dayLabel = format(parseISO(opp.date), "EEEE M/d");

      let message: string;
      if (filled === 0) {
        message = `${orgName}: ${calName} on ${dayLabel} has 0 volunteers signed up! We need ${minRequired}. Sign up: ${signupUrl}`;
      } else if (filled === 1 && names.length === 1) {
        message = `${orgName}: We only have 1 volunteer for ${calName} on ${dayLabel}! Please sign up to help ${names[0]}. Sign up: ${signupUrl}`;
      } else {
        message = `${orgName}: ${calName} on ${dayLabel} needs ${shortage} more volunteer${shortage !== 1 ? "s" : ""} (${filled}/${minRequired} signed up). Sign up: ${signupUrl}`;
      }

      let smsSentCount = 0;
      for (const recipient of recipients) {
        try {
          await sendSms(tenantId, recipient.phone!, message, "volunteer_recruitment_urgent");
          smsSentCount++;
          result.smsSent++;
        } catch (err: any) {
          result.errors.push(`Failed urgent SMS to ${recipient.phone}: ${err.message}`);
        }
      }

      // Log to alert history to prevent double-send
      try {
        await db.insert(volunteerThresholdAlertHistory).values({
          alertId: "00000000-0000-0000-0000-000000000000",
          tenantId,
          alertDate: new Date(),
          opportunityId: opp.id,
          opportunityTitle: opp.title,
          currentVolunteers: filled,
          minimumRequired: minRequired,
          pushSent: 0,
          smsSent: smsSentCount,
          emailSent: 0,
          totalRecipients: recipients.length,
        });
      } catch (_) {
        // History logging is best-effort
      }

      result.urgentOpportunitiesAlerted++;
    }

    return result;
  }

  /**
   * Check and run all active tenants for a given mode
   */
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

        // Check day of week
        const now = new Date();
        const currentDay = format(now, "EEE").toLowerCase() as "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
        const targetDay = settings.weeklyDigestDayOfWeek ?? "thu";
        if (currentDay !== targetDay) continue;

        // Check time window (within 30 min of configured time)
        const targetTime = settings.weeklyDigestTime ?? "09:00";
        const [th, tm] = targetTime.split(":").map(Number);
        const [ch, cm] = format(now, "HH:mm").split(":").map(Number);
        if (Math.abs(th * 60 + tm - (ch * 60 + cm)) > 30) continue;

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
            console.log(`[Volunteer Recruitment SMS] Urgent alerts for ${tenant.name}: ${res.smsSent} SMS, ${res.urgentOpportunitiesAlerted} opportunities`);
          }
        } catch (err: any) {
          console.error(`[Volunteer Recruitment SMS] Urgent alert error for ${tenant.name}:`, err.message);
        }
      }
    }
  }
}
