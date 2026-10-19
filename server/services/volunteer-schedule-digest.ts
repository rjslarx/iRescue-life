import { db } from "../db";
import {
  tenants,
  calendars,
  calendarEvents,
  users,
  type Tenant,
} from "@shared/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { EmailService } from "../lib/email-service";
import { format, parseISO } from "date-fns";
import { resolveVolunteerEmailTimezone, volunteerEmailDate, volunteerEmailTime } from "../lib/volunteer-email-time";

interface VolunteerCommitment {
  calendarName: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

interface DigestResult {
  tenantId: string;
  tenantName: string;
  emailsSent: number;
  volunteersWithCommitments: number;
  totalCommitments: number;
  errors: string[];
}

export class VolunteerScheduleDigestService {
  static async sendTenantDigest(tenantId: string): Promise<DigestResult> {
    const result: DigestResult = {
      tenantId,
      tenantName: '',
      emailsSent: 0,
      volunteersWithCommitments: 0,
      totalCommitments: 0,
      errors: [],
    };

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      result.errors.push('Tenant not found');
      return result;
    }

    result.tenantName = tenant.name;
    const settings = tenant.volunteerDigestSettings || {};
    const daysAhead = settings.includeUpcomingDays || 7;
    const timezone = resolveVolunteerEmailTimezone(tenant.timezone);

    const volunteerCalendars = await db
      .select()
      .from(calendars)
      .where(and(eq(calendars.tenantId, tenantId), eq(calendars.type, "volunteer")));

    if (volunteerCalendars.length === 0) {
      return result;
    }

    const calendarMap = new Map(volunteerCalendars.map((c) => [c.id, c]));
    const calendarIds = volunteerCalendars.map((c) => c.id);

    const now = new Date();
    const firstDate = volunteerEmailDate(now, timezone);
    const lastDay = new Date(`${firstDate}T12:00:00Z`);
    lastDay.setUTCDate(lastDay.getUTCDate() + daysAhead);
    const lastDate = lastDay.toISOString().slice(0, 10);
    // Fetch a broad UTC range, then select exact tenant-local calendar dates.
    const windowStart = new Date(`${firstDate}T00:00:00Z`);
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
    const windowEnd = new Date(`${lastDate}T00:00:00Z`);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 2);
    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.tenantId, tenantId),
          inArray(calendarEvents.calendarId, calendarIds),
          gte(calendarEvents.startTime, windowStart),
          lte(calendarEvents.startTime, windowEnd)
        )
      );

    if (events.length === 0) {
      return result;
    }

    const volunteerUserIds = events
      .map((e) => e.volunteerContactId)
      .filter((id): id is string => !!id);

    const uniqueUserIds = [...new Set(volunteerUserIds)];
    let userMap = new Map<string, { name: string; email: string }>();

    if (uniqueUserIds.length > 0) {
      const userRows = await db
        .select({ id: users.id, fullName: users.fullName, email: users.email })
        .from(users)
        .where(inArray(users.id, uniqueUserIds));

      userMap = new Map(
        userRows
          .filter((u) => u.email)
          .map((u) => [u.id, { name: u.fullName || u.email, email: u.email }])
      );
    }

    const commitmentsByEmail = new Map<string, { name: string; commitments: VolunteerCommitment[] }>();

    for (const event of events) {
      const localDate = volunteerEmailDate(event.startTime, timezone);
      if (localDate < firstDate || localDate > lastDate) continue;
      const cal = calendarMap.get(event.calendarId);
      if (!cal) continue;

      let volunteerEmail: string | null = null;
      let volunteerName: string = '';

      if (event.volunteerContactId && userMap.has(event.volunteerContactId)) {
        const volunteer = userMap.get(event.volunteerContactId)!;
        volunteerEmail = volunteer.email.toLowerCase();
        volunteerName = volunteer.name;
      }

      if (!volunteerEmail) continue;

      const commitment: VolunteerCommitment = {
        calendarName: cal.name,
        date: localDate,
        startTime: volunteerEmailTime(event.startTime, timezone),
        endTime: event.endTime ? volunteerEmailTime(event.endTime, timezone) : '',
        location: event.location || '',
      };

      if (!commitmentsByEmail.has(volunteerEmail)) {
        commitmentsByEmail.set(volunteerEmail, { name: volunteerName, commitments: [] });
      }
      commitmentsByEmail.get(volunteerEmail)!.commitments.push(commitment);
      result.totalCommitments++;
    }

    result.volunteersWithCommitments = commitmentsByEmail.size;

    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      result.errors.push('Email service not configured');
      return result;
    }

    for (const [email, { name, commitments }] of commitmentsByEmail) {
      try {
        commitments.sort((a, b) => a.date.localeCompare(b.date));

        const html = this.generateDigestHtml(tenant, name, commitments, daysAhead);
        const subject = `Your Volunteer Schedule for the Week - ${tenant.name}`;

        await emailService.send({
          to: email,
          subject,
          html,
        });

        result.emailsSent++;
      } catch (error: any) {
        result.errors.push(`Failed to send to ${email}: ${error.message}`);
      }
    }

    await db.update(tenants)
      .set({
        volunteerDigestSettings: {
          ...settings,
          lastSentAt: now.toISOString(),
        },
      })
      .where(eq(tenants.id, tenantId));

    return result;
  }

  private static generateDigestHtml(
    tenant: Tenant,
    volunteerName: string,
    commitments: VolunteerCommitment[],
    daysAhead: number
  ): string {
    const greeting = volunteerName ? `Hi ${volunteerName.split(' ')[0]},` : 'Hi there,';

    const commitmentsHtml = commitments.map(c => {
      const timeDisplay = c.endTime ? `${c.startTime} - ${c.endTime}` : c.startTime;
      return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong style="color: #333;">${c.calendarName}</strong><br>
          <span style="color: #666; font-size: 14px;">
            ${this.formatDate(c.date)} at ${timeDisplay}
          </span><br>
          ${c.location ? `<span style="color: #888; font-size: 13px;">${c.location}</span>` : ''}
        </td>
      </tr>
    `}).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Your Volunteer Schedule</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">
            Upcoming shifts for the next ${daysAhead} days
          </p>
        </div>
        
        <div style="background: #fff; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px; padding: 20px;">
          <p style="margin-top: 0;">${greeting}</p>
          
          <p>Here's a summary of your upcoming volunteer commitments at <strong>${tenant.name}</strong>:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tbody>
              ${commitmentsHtml}
            </tbody>
          </table>
          
          <p style="color: #666; font-size: 14px;">
            You have <strong>${commitments.length} shift${commitments.length !== 1 ? 's' : ''}</strong> scheduled.
          </p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 13px; margin: 0;">
              Thank you for volunteering with us! Your dedication makes a real difference in the lives of animals.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
          <p style="margin: 0;">
            ${tenant.name}<br>
            ${tenant.footerAddress || ''}
          </p>
        </div>
      </body>
      </html>
    `;
  }

  private static formatDate(dateStr: string): string {
    try {
      const date = parseISO(dateStr);
      return format(date, 'EEEE, MMMM d, yyyy');
    } catch {
      return dateStr;
    }
  }

  static async checkAndSendAllDigests(): Promise<DigestResult[]> {
    const now = new Date();
    const currentDayOfWeek = format(now, 'EEEE').toLowerCase() as "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
    const currentTime = format(now, 'HH:mm');

    const allTenants = await db
      .select()
      .from(tenants)
      .where(eq(tenants.isActive, true));

    const results: DigestResult[] = [];

    for (const tenant of allTenants) {
      const settings = tenant.volunteerDigestSettings;
      
      if (!settings?.enabled) {
        continue;
      }

      const targetDay = settings.dayOfWeek || 'sunday';
      if (currentDayOfWeek !== targetDay) {
        continue;
      }

      const targetTime = settings.sendTime || '08:00';
      const [targetHour, targetMinute] = targetTime.split(':').map(Number);
      const [currentHour, currentMinute] = currentTime.split(':').map(Number);
      
      const targetMinutes = targetHour * 60 + targetMinute;
      const currentMinutes = currentHour * 60 + currentMinute;
      
      if (Math.abs(currentMinutes - targetMinutes) > 30) {
        continue;
      }

      if (settings.lastSentAt) {
        const lastSentDate = format(new Date(settings.lastSentAt), 'yyyy-MM-dd');
        const today = format(now, 'yyyy-MM-dd');
        if (lastSentDate === today) {
          continue;
        }
      }

      try {
        const result = await this.sendTenantDigest(tenant.id);
        results.push(result);
        console.log(`Sent volunteer digest for ${tenant.name}: ${result.emailsSent} emails`);
      } catch (error: any) {
        console.error(`Failed to send volunteer digest for ${tenant.name}:`, error);
        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          emailsSent: 0,
          volunteersWithCommitments: 0,
          totalCommitments: 0,
          errors: [error.message],
        });
      }
    }

    return results;
  }

  static async triggerManualDigest(tenantId: string): Promise<DigestResult> {
    return this.sendTenantDigest(tenantId);
  }
}
