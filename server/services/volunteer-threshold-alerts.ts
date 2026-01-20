import { db } from "../db";
import { 
  volunteerThresholdAlerts, 
  volunteerThresholdAlertHistory,
  calendars,
  calendarEvents,
  users,
  type VolunteerThresholdAlert 
} from "@shared/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { PushNotificationService } from "./push-notifications";
import { sendSms, isTwilioEnabled } from "../lib/twilio-service";
import { format, addDays, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";

interface CalendarDayShortage {
  calendarId: string;
  calendarName: string;
  date: string;
  currentVolunteers: number;
  minimumRequired: number;
  shortage: number;
}

interface OpportunityShortage {
  opportunity: {
    id: string;
    title: string;
    date: string;
    time: string;
    location: string;
    slotsTotal: number;
    slotsFilled: number;
  };
  currentVolunteers: number;
  minimumRequired: number;
  shortage: number;
}

interface AlertResult {
  alertId: string;
  tenantId: string;
  shortages: OpportunityShortage[];
  calendarShortages: CalendarDayShortage[];
  pushSent: number;
  smsSent: number;
  emailSent: number;
  totalRecipients: number;
}

export class VolunteerThresholdAlertService {
  /**
   * Check all enabled alerts for a specific tenant
   */
  static async checkTenantAlerts(tenantId: string): Promise<AlertResult[]> {
    const alerts = await db.query.volunteerThresholdAlerts.findMany({
      where: and(
        eq(volunteerThresholdAlerts.tenantId, tenantId),
        eq(volunteerThresholdAlerts.isEnabled, true)
      ),
    });

    const results: AlertResult[] = [];
    
    for (const alert of alerts) {
      const result = await this.processAlert(alert);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Check all enabled alerts across all tenants
   */
  static async checkAllAlerts(): Promise<AlertResult[]> {
    const now = new Date();
    const currentHour = format(now, 'HH:mm');
    const currentDayOfWeek = format(now, 'EEE').toLowerCase().substring(0, 3) as "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

    const alerts = await db.query.volunteerThresholdAlerts.findMany({
      where: eq(volunteerThresholdAlerts.isEnabled, true),
    });

    const results: AlertResult[] = [];

    for (const alert of alerts) {
      // Check if alert should run today
      const daysOfWeek = alert.daysOfWeek || ["mon", "tue", "wed", "thu", "fri"];
      if (!daysOfWeek.includes(currentDayOfWeek)) {
        continue;
      }

      // Check if it's time to run (within 30 minutes of check time)
      const [checkHour, checkMinute] = (alert.checkTime || "09:00").split(':').map(Number);
      const [nowHour, nowMinute] = currentHour.split(':').map(Number);
      const checkMinutes = checkHour * 60 + checkMinute;
      const nowMinutes = nowHour * 60 + nowMinute;
      
      if (Math.abs(nowMinutes - checkMinutes) > 30) {
        continue;
      }

      // Check if already ran today
      if (alert.lastCheckedAt) {
        const lastCheckDate = format(alert.lastCheckedAt, 'yyyy-MM-dd');
        const today = format(now, 'yyyy-MM-dd');
        if (lastCheckDate === today) {
          continue;
        }
      }

      const result = await this.processAlert(alert);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Process a single alert and send notifications if threshold not met
   */
  static async processAlert(alert: VolunteerThresholdAlert): Promise<AlertResult | null> {
    const now = new Date();
    const daysAhead = alert.daysAhead || 3;
    const minimumVolunteers = alert.minimumVolunteers || 2;

    // Update last checked timestamp
    await db.update(volunteerThresholdAlerts)
      .set({ lastCheckedAt: now, updatedAt: now })
      .where(eq(volunteerThresholdAlerts.id, alert.id));

    // Find calendar events in the check window that are below threshold
    const startDate = startOfDay(now);
    const endDate = endOfDay(addDays(now, daysAhead));

    // Get calendars to check - either specific ones or all volunteer calendars
    let calendarsToCheck: { id: string; name: string }[] = [];
    
    if (alert.calendarIds && alert.calendarIds.length > 0) {
      // Check specific calendars
      const specificCalendars = await db.query.calendars.findMany({
        where: and(
          eq(calendars.tenantId, alert.tenantId),
          inArray(calendars.id, alert.calendarIds)
        ),
      });
      calendarsToCheck = specificCalendars.map(c => ({ id: c.id, name: c.name }));
    } else {
      // Check all volunteer-type calendars for this tenant
      const volunteerCalendars = await db.query.calendars.findMany({
        where: and(
          eq(calendars.tenantId, alert.tenantId),
          eq(calendars.type, "volunteer")
        ),
      });
      calendarsToCheck = volunteerCalendars.map(c => ({ id: c.id, name: c.name }));
    }

    if (calendarsToCheck.length === 0) {
      console.log(`No calendars to check for alert ${alert.id}`);
      return null;
    }

    // Get all days in the range to check
    const daysToCheck = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Check calendar events for volunteer shortages
    const calendarShortages: CalendarDayShortage[] = [];

    for (const calendar of calendarsToCheck) {
      // Get all events for this calendar in the date range
      const events = await db.query.calendarEvents.findMany({
        where: and(
          eq(calendarEvents.calendarId, calendar.id),
          gte(calendarEvents.startTime, startDate),
          lte(calendarEvents.startTime, endDate)
        ),
      });

      // Count events per day (each event = one volunteer signup)
      for (const day of daysToCheck) {
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        
        // Count events that start on this day
        const eventsOnDay = events.filter(event => {
          const eventStart = new Date(event.startTime);
          return eventStart >= dayStart && eventStart <= dayEnd;
        });

        const volunteerCount = eventsOnDay.length;

        // Check if below threshold
        if (volunteerCount < minimumVolunteers) {
          calendarShortages.push({
            calendarId: calendar.id,
            calendarName: calendar.name,
            date: format(day, 'yyyy-MM-dd'),
            currentVolunteers: volunteerCount,
            minimumRequired: minimumVolunteers,
            shortage: minimumVolunteers - volunteerCount,
          });
        }
      }
    }

    // Legacy: Keep empty shortages array for backward compatibility
    const shortages: OpportunityShortage[] = [];

    if (calendarShortages.length === 0) {
      return null; // No shortages, no need to send alerts
    }

    // Send notifications
    const result = await this.sendCalendarAlertNotifications(alert, calendarShortages);

    // Update last alert sent timestamp
    await db.update(volunteerThresholdAlerts)
      .set({ lastAlertSentAt: now, updatedAt: now })
      .where(eq(volunteerThresholdAlerts.id, alert.id));

    // Record alert history for calendar shortages
    for (const shortage of calendarShortages) {
      await db.insert(volunteerThresholdAlertHistory).values({
        alertId: alert.id,
        tenantId: alert.tenantId,
        alertDate: now,
        opportunityId: shortage.calendarId, // Use calendarId as opportunityId for history
        opportunityTitle: `${shortage.calendarName} - ${shortage.date}`,
        currentVolunteers: shortage.currentVolunteers,
        minimumRequired: shortage.minimumRequired,
        pushSent: result.pushSent,
        smsSent: result.smsSent,
        emailSent: result.emailSent,
        totalRecipients: result.totalRecipients,
      });
    }

    return {
      alertId: alert.id,
      tenantId: alert.tenantId,
      shortages,
      calendarShortages,
      ...result,
    };
  }

  /**
   * Send notifications for volunteer shortages
   */
  static async sendAlertNotifications(
    alert: VolunteerThresholdAlert,
    shortages: OpportunityShortage[]
  ): Promise<{ pushSent: number; smsSent: number; emailSent: number; totalRecipients: number }> {
    let pushSent = 0;
    let smsSent = 0;
    let emailSent = 0;

    // Build notification message
    const shortagesList = shortages.map(s => 
      `${s.opportunity.title} on ${s.opportunity.date} (${s.currentVolunteers}/${s.minimumRequired} volunteers)`
    ).join('\n');

    const title = "Volunteers Needed!";
    const body = alert.messageTemplate 
      ? alert.messageTemplate.replace('{shortages}', shortagesList)
      : `The following shifts need more volunteers:\n${shortagesList}`;

    // Determine target roles
    let targetRoles: string[] = [];
    if (alert.targetAllVolunteers) {
      targetRoles = ["admin", "staff", "volunteer", "foster", "board_member"];
    } else if (alert.targetRoles) {
      targetRoles = alert.targetRoles;
    }

    // Get target users
    const targetUsers = await db.query.users.findMany({
      where: eq(users.tenantId, alert.tenantId),
    });

    const eligibleUsers = targetUsers.filter(user => 
      user.roles && user.roles.some((role: string) => targetRoles.includes(role))
    );

    const totalRecipients = eligibleUsers.length;

    // Send push notifications
    if (alert.pushEnabled && PushNotificationService.isConfigured()) {
      try {
        const pushResult = await PushNotificationService.sendToTenantRoles(
          alert.tenantId,
          targetRoles,
          {
            title,
            body,
            tag: 'volunteer-shortage',
            data: {
              type: 'volunteer_shortage',
              alertId: alert.id,
              shortages: shortages.map(s => ({
                opportunityId: s.opportunity.id,
                title: s.opportunity.title,
              })),
            },
            actions: [
              { action: 'view', title: 'View Opportunities' },
            ],
            requireInteraction: true,
          }
        );
        pushSent = pushResult.success;
      } catch (error) {
        console.error('Error sending push notifications for volunteer threshold alert:', error);
      }
    }

    // Send SMS if enabled and tenant has Twilio configured
    if (alert.smsEnabled) {
      const twilioConfigured = await isTwilioEnabled(alert.tenantId);
      if (twilioConfigured) {
        const smsMessage = `${title}\n${body}`;
        for (const user of eligibleUsers) {
          if (user.phone) {
            try {
              const result = await sendSms(
                alert.tenantId,
                user.phone,
                smsMessage,
                'reminder',
                { sentBy: { id: 'system', name: 'Volunteer Alert System' } }
              );
              if (result.status === 'sent') {
                smsSent++;
              }
            } catch (error) {
              console.error(`Failed to send SMS to ${user.phone}:`, error);
            }
          }
        }
      } else {
        console.log(`SMS alerts requested for volunteer shortage but Twilio not configured for tenant ${alert.tenantId}`);
      }
    }

    // Email sending would be handled here
    if (alert.emailEnabled) {
      // TODO: Implement email sending for volunteer shortage alerts
      console.log(`Email alerts requested for volunteer shortage - sending to ${eligibleUsers.length} users`);
    }

    return { pushSent, smsSent, emailSent, totalRecipients };
  }

  /**
   * Send notifications for calendar-based volunteer shortages
   */
  static async sendCalendarAlertNotifications(
    alert: VolunteerThresholdAlert,
    shortages: CalendarDayShortage[]
  ): Promise<{ pushSent: number; smsSent: number; emailSent: number; totalRecipients: number }> {
    let pushSent = 0;
    let smsSent = 0;
    let emailSent = 0;

    // Group shortages by calendar for better readability
    const shortagesByCalendar = shortages.reduce((acc, s) => {
      if (!acc[s.calendarName]) {
        acc[s.calendarName] = [];
      }
      acc[s.calendarName].push(s);
      return acc;
    }, {} as Record<string, CalendarDayShortage[]>);

    // Build notification message
    const shortagesList = Object.entries(shortagesByCalendar).map(([calendarName, calendarShortages]) => {
      const dates = calendarShortages.map(s => 
        `  - ${s.date}: ${s.currentVolunteers}/${s.minimumRequired} signed up`
      ).join('\n');
      return `${calendarName}:\n${dates}`;
    }).join('\n\n');

    const title = "Volunteers Needed!";
    const body = alert.messageTemplate 
      ? alert.messageTemplate.replace('{shortages}', shortagesList)
      : `The following shifts need more volunteers:\n\n${shortagesList}`;

    // Determine target roles
    let targetRoles: string[] = [];
    if (alert.targetAllVolunteers) {
      targetRoles = ["admin", "staff", "volunteer", "foster", "board_member"];
    } else if (alert.targetRoles) {
      targetRoles = alert.targetRoles;
    }

    // Get target users
    const targetUsers = await db.query.users.findMany({
      where: eq(users.tenantId, alert.tenantId),
    });

    const eligibleUsers = targetUsers.filter(user => 
      user.roles && user.roles.some((role: string) => targetRoles.includes(role))
    );

    const totalRecipients = eligibleUsers.length;

    // Send push notifications
    if (alert.pushEnabled && PushNotificationService.isConfigured()) {
      try {
        const pushResult = await PushNotificationService.sendToTenantRoles(
          alert.tenantId,
          targetRoles,
          {
            title,
            body,
            tag: 'volunteer-shortage',
            data: {
              type: 'volunteer_calendar_shortage',
              alertId: alert.id,
              shortages: shortages.map(s => ({
                calendarId: s.calendarId,
                calendarName: s.calendarName,
                date: s.date,
              })),
            },
            actions: [
              { action: 'view', title: 'View Calendar' },
            ],
            requireInteraction: true,
          }
        );
        pushSent = pushResult.success;
      } catch (error) {
        console.error('Error sending push notifications for volunteer calendar alert:', error);
      }
    }

    // Send SMS if enabled and tenant has Twilio configured
    if (alert.smsEnabled) {
      const twilioConfigured = await isTwilioEnabled(alert.tenantId);
      if (twilioConfigured) {
        const smsMessage = `${title}\n${body}`;
        for (const user of eligibleUsers) {
          if (user.phone) {
            try {
              const result = await sendSms(
                alert.tenantId,
                user.phone,
                smsMessage,
                'reminder',
                { sentBy: { id: 'system', name: 'Volunteer Alert System' } }
              );
              if (result.status === 'sent') {
                smsSent++;
              }
            } catch (error) {
              console.error(`Failed to send SMS to ${user.phone}:`, error);
            }
          }
        }
      } else {
        console.log(`SMS alerts requested for volunteer calendar shortage but Twilio not configured for tenant ${alert.tenantId}`);
      }
    }

    // Email sending would be handled here
    if (alert.emailEnabled) {
      console.log(`Email alerts requested for volunteer calendar shortage - sending to ${eligibleUsers.length} users`);
    }

    return { pushSent, smsSent, emailSent, totalRecipients };
  }

  /**
   * Get alert settings for a tenant
   */
  static async getTenantAlerts(tenantId: string): Promise<VolunteerThresholdAlert[]> {
    return db.query.volunteerThresholdAlerts.findMany({
      where: eq(volunteerThresholdAlerts.tenantId, tenantId),
    });
  }

  /**
   * Get alert by ID
   */
  static async getAlertById(alertId: string): Promise<VolunteerThresholdAlert | undefined> {
    return db.query.volunteerThresholdAlerts.findFirst({
      where: eq(volunteerThresholdAlerts.id, alertId),
    });
  }

  /**
   * Create a new alert
   */
  static async createAlert(
    data: Omit<VolunteerThresholdAlert, 'id' | 'createdAt' | 'updatedAt' | 'lastCheckedAt' | 'lastAlertSentAt'>
  ): Promise<VolunteerThresholdAlert> {
    const [alert] = await db.insert(volunteerThresholdAlerts)
      .values(data)
      .returning();
    return alert;
  }

  /**
   * Update an alert
   */
  static async updateAlert(
    alertId: string,
    data: Partial<Omit<VolunteerThresholdAlert, 'id' | 'createdAt' | 'tenantId'>>
  ): Promise<VolunteerThresholdAlert | null> {
    const [updated] = await db.update(volunteerThresholdAlerts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(volunteerThresholdAlerts.id, alertId))
      .returning();
    return updated || null;
  }

  /**
   * Delete an alert
   */
  static async deleteAlert(alertId: string): Promise<boolean> {
    const result = await db.delete(volunteerThresholdAlerts)
      .where(eq(volunteerThresholdAlerts.id, alertId));
    return true;
  }

  /**
   * Get alert history for a tenant
   */
  static async getAlertHistory(
    tenantId: string, 
    limit: number = 50
  ): Promise<any[]> {
    return db.query.volunteerThresholdAlertHistory.findMany({
      where: eq(volunteerThresholdAlertHistory.tenantId, tenantId),
      orderBy: (h, { desc }) => [desc(h.createdAt)],
      limit,
    });
  }

  /**
   * Manually trigger an alert check for testing
   */
  static async triggerAlertCheck(alertId: string): Promise<AlertResult | null> {
    const alert = await this.getAlertById(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }
    return this.processAlert(alert);
  }
}
