import { db } from "../db";
import {
  tenants,
  calendars,
  calendarEvents,
  users,
  type Tenant,
} from "@shared/schema";
import { eq, and, gte, lte, inArray, isNull } from "drizzle-orm";
import { EmailService } from "../lib/email-service";
import { format } from "date-fns";

// Default local hour (0–23) at which the day-before reminder fires when a tenant
// hasn't chosen one. 17 == 5 PM the evening before the shift.
const DEFAULT_REMINDER_LOCAL_HOUR = 17;

// Fallback timezone used when a tenant has no (or an invalid) IANA timezone on
// file. Without this we'd compute "tomorrow in UTC", which for a US
// (west-of-UTC) tenant is the previous evening locally — so the reminder would
// target the wrong local day. Defaulting to a real US timezone keeps the
// reminder firing the evening BEFORE the shift even before per-tenant timezones
// are configured. (See tenant-timezone-scheduling memory note.)
const HARDCODED_DEFAULT_TIMEZONE = "America/Chicago";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_TENANT_TIMEZONE = ((): string => {
  const env = process.env.DEFAULT_TENANT_TIMEZONE;
  if (env && isValidTimezone(env)) return env;
  if (env) {
    console.warn(
      `[VolunteerShiftReminder] invalid DEFAULT_TENANT_TIMEZONE "${env}"; using ${HARDCODED_DEFAULT_TIMEZONE}`,
    );
  }
  return HARDCODED_DEFAULT_TIMEZONE;
})();

/**
 * Compute the calendar parts (year/month/day/hour) for `now` in the given IANA
 * timezone. Returns null if the timezone string is invalid so callers can skip
 * rather than silently sending at the wrong hour.
 */
function getLocalParts(
  timezone: string,
  now: Date,
): { year: number; month: number; day: number; hour: number } | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(now);
  } catch {
    return null;
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = Number(get("hour")) % 24; // some locales report "24" at midnight
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
  };
}

/** Given local Y/M/D, return the "next day" as a YYYY-MM-DD string. */
function nextDayString(year: number, month: number, day: number): string {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format an absolute instant as a YYYY-MM-DD calendar date in the given tz. */
function localDateString(timezone: string, when: Date): string | null {
  const parts = getLocalParts(timezone, when);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

/** Format an absolute instant as a friendly local time (e.g. "9:00 AM") in tz. */
function localTimeString(timezone: string, when: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(when);
  } catch {
    return format(when, "h:mm a");
  }
}

/**
 * A volunteer self-signup on the calendar creates an event titled
 * "{Their Name} - Signup" with `createdBy` = their own user id but often no
 * `volunteerContactId`. To reach them we fall back to the creator's email — but
 * ONLY when the title actually names the creator, so we never email a
 * coordinator who typed someone else's name into a bare "{Name} - Signup" event.
 */
function titleNamesCreator(title: string, creatorFullName: string): boolean {
  if (!title || !creatorFullName) return false;
  // Normalize: lowercase and collapse internal/trailing whitespace so cosmetic
  // spacing differences don't cause misses.
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedCreator = normalize(creatorFullName);
  if (!normalizedCreator) return false;
  // Strip a trailing " - Signup" (with flexible spacing) to get the named person.
  const titleName = normalize(title.replace(/\s*-\s*signup\s*$/i, ""));
  if (!titleName) return false;
  // Strict equality only: prefix matching risks emailing a coordinator who typed
  // a short name that happens to prefix their own (e.g. creator "Ann Marie",
  // title "Ann - Signup").
  return titleName === normalizedCreator;
}

/** Friendly long date (e.g. "Monday, July 6") for a YYYY-MM-DD string. */
function friendlyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export interface ShiftReminderResult {
  tenantId: string;
  tenantName: string;
  emailsSent: number;
  shiftsFound: number;
  errors: string[];
}

interface ShiftForReminder {
  eventId: string;
  calendarName: string;
  timeLabel: string;
  location: string;
  volunteerEmail: string;
  volunteerName: string;
}

/**
 * Core worker: find every volunteer shift happening on `targetDateStr` (a
 * YYYY-MM-DD calendar date in the tenant's local timezone) with a reachable
 * email that hasn't already been reminded, email each volunteer, and stamp a
 * `reminderEmailSentAt` dedupe column so we never double-send.
 *
 * Targets volunteer calendar shifts (calendars.type='volunteer'). A volunteer's
 * email is resolved from the event in this priority order:
 *   1. An explicitly assigned volunteer: calendarEvents.volunteerContactId → users.email.
 *   2. A self-signup: the creator's own "{Name} - Signup" event
 *      (calendarEvents.createdBy → users.email), only when the title names the
 *      creator, so a coordinator who typed someone else's name is never emailed.
 * Events with only a manual name / bare title (no reachable email) are skipped.
 *
 * Shared by the hourly cron and the manual "Send test reminder" button.
 */
async function sendRemindersForTenantDate(
  tenant: Pick<Tenant, "id" | "name" | "footerAddress" | "timezone">,
  timezone: string,
  targetDateStr: string,
): Promise<ShiftReminderResult> {
  const result: ShiftReminderResult = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    emailsSent: 0,
    shiftsFound: 0,
    errors: [],
  };

  const shifts: ShiftForReminder[] = [];

  // ---- Source 1: internal calendar shifts (type=volunteer) with a linked user.
  const volunteerCalendars = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.tenantId, tenant.id), eq(calendars.type, "volunteer")));

  if (volunteerCalendars.length > 0) {
    const calendarMap = new Map(volunteerCalendars.map((c) => [c.id, c]));
    const calendarIds = volunteerCalendars.map((c) => c.id);

    // Pull a broad UTC window (now .. +3 days) and filter to the exact local
    // date below. This avoids fragile UTC-offset math: we simply format each
    // event's start into the tenant timezone and compare calendar dates.
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // No volunteerContactId filter here: we also want volunteer self-signups,
    // which set `createdBy` (the volunteer) but frequently leave
    // `volunteerContactId` null (identity lives in the "{Name} - Signup" title).
    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.tenantId, tenant.id),
          inArray(calendarEvents.calendarId, calendarIds),
          gte(calendarEvents.startTime, now),
          lte(calendarEvents.startTime, windowEnd),
          isNull(calendarEvents.reminderEmailSentAt),
        ),
      );

    const dueEvents = events.filter(
      (e) => localDateString(timezone, e.startTime) === targetDateStr,
    );

    if (dueEvents.length > 0) {
      // Look up both the assigned volunteer (volunteerContactId) and the event
      // creator (createdBy, for self-signups) so we can resolve either to an email.
      const userIds = [
        ...new Set(
          dueEvents
            .flatMap((e) => [e.volunteerContactId, e.createdBy])
            .filter((id): id is string => !!id),
        ),
      ];

      const userRows = userIds.length
        ? await db
            .select({ id: users.id, fullName: users.fullName, email: users.email })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];

      const userMap = new Map(
        userRows
          .filter((u) => u.email)
          .map((u) => [u.id, { name: u.fullName || u.email, email: u.email }]),
      );

      for (const event of dueEvents) {
        const cal = calendarMap.get(event.calendarId);
        if (!cal) continue;

        // Priority 1: an explicitly assigned volunteer with an email on file.
        let volunteer = event.volunteerContactId
          ? userMap.get(event.volunteerContactId)
          : undefined;

        // Priority 2: a self-signup — the creator's own "{Name} - Signup" event.
        // Guard with titleNamesCreator so a coordinator who typed someone else's
        // name into a bare signup event never receives the reminder themselves.
        if (
          !volunteer &&
          !event.volunteerContactId &&
          !event.manualVolunteerName?.trim() &&
          event.createdBy
        ) {
          const creator = userMap.get(event.createdBy);
          if (creator && titleNamesCreator(event.title, creator.name)) {
            volunteer = creator;
          }
        }

        if (!volunteer) continue; // no reachable email (manual-only / bare name)

        result.shiftsFound += 1;
        const start = localTimeString(timezone, event.startTime);
        const end = event.endTime ? localTimeString(timezone, event.endTime) : "";
        shifts.push({
          eventId: event.id,
          calendarName: cal.name,
          timeLabel: end ? `${start} – ${end}` : start,
          location: event.location || "",
          volunteerEmail: volunteer.email.toLowerCase(),
          volunteerName: volunteer.name,
        });
      }
    }
  }

  if (shifts.length === 0) return result;

  const emailService = await EmailService.forTenant(tenant.id);
  if (!emailService) {
    result.errors.push("Email service not configured");
    return result;
  }

  for (const shift of shifts) {
    try {
      const html = buildReminderHtml(tenant, shift, targetDateStr);
      await emailService.send({
        to: shift.volunteerEmail,
        subject: `Reminder: your volunteer shift tomorrow — ${tenant.name}`,
        html,
      });

      await db
        .update(calendarEvents)
        .set({ reminderEmailSentAt: new Date() })
        .where(
          and(
            eq(calendarEvents.id, shift.eventId),
            eq(calendarEvents.tenantId, tenant.id),
          ),
        );

      result.emailsSent++;
    } catch (error: any) {
      result.errors.push(
        `Failed to send to ${shift.volunteerEmail}: ${error?.message || "unknown error"}`,
      );
    }
  }

  return result;
}

function buildReminderHtml(
  tenant: Pick<Tenant, "name" | "footerAddress">,
  shift: ShiftForReminder,
  targetDateStr: string,
): string {
  const greeting = shift.volunteerName
    ? `Hi ${shift.volunteerName.split(" ")[0]},`
    : "Hi there,";
  const dateDisplay = friendlyDate(targetDateStr);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Your Shift Is Tomorrow</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${dateDisplay}</p>
      </div>

      <div style="background: #fff; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px; padding: 20px;">
        <p style="margin-top: 0;">${greeting}</p>
        <p>This is a friendly reminder that you have a volunteer shift scheduled tomorrow at <strong>${tenant.name}</strong>:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tbody>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee;">
                <strong style="color: #333;">${shift.calendarName}</strong><br>
                <span style="color: #666; font-size: 14px;">${dateDisplay} at ${shift.timeLabel}</span><br>
                ${shift.location ? `<span style="color: #888; font-size: 13px;">${shift.location}</span>` : ""}
              </td>
            </tr>
          </tbody>
        </table>

        <p style="color: #666; font-size: 14px;">
          If you can no longer make this shift, please let us know as soon as possible so we can arrange coverage.
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
          ${tenant.footerAddress || ""}
        </p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Cron entrypoint: for every active tenant that has day-before shift reminders
 * enabled, when the current hour in that tenant's local timezone matches its
 * configured reminder hour, email each volunteer assigned to a shift "tomorrow".
 *
 * Designed to run hourly. The per-event `reminderEmailSentAt` dedupe column
 * prevents double-sends across runs.
 */
export async function runVolunteerShiftRemindersForAllTenants(): Promise<{
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
      .select()
      .from(tenants)
      .where(eq(tenants.isActive, true));

    for (const tenant of activeTenants) {
      try {
        const settings = tenant.volunteerDigestSettings || {};
        if (!settings.shiftReminderEnabled) continue;

        const reminderHour =
          typeof settings.shiftReminderHour === "number" &&
          settings.shiftReminderHour >= 0 &&
          settings.shiftReminderHour <= 23
            ? settings.shiftReminderHour
            : DEFAULT_REMINDER_LOCAL_HOUR;

        const effectiveTz = tenant.timezone || DEFAULT_TENANT_TIMEZONE;
        let local = getLocalParts(effectiveTz, now);
        if (!local && tenant.timezone) {
          errors.push(
            `[${tenant.id}] invalid timezone "${tenant.timezone}"; using ${DEFAULT_TENANT_TIMEZONE}`,
          );
          local = getLocalParts(DEFAULT_TENANT_TIMEZONE, now);
        }
        if (!local) {
          errors.push(`[${tenant.id}] could not resolve a timezone; skipping`);
          continue;
        }

        if (local.hour !== reminderHour) continue; // not the send hour locally

        const resolvedTz = getLocalParts(effectiveTz, now)
          ? effectiveTz
          : DEFAULT_TENANT_TIMEZONE;
        const tomorrowStr = nextDayString(local.year, local.month, local.day);

        tenantsProcessed++;
        const result = await sendRemindersForTenantDate(
          tenant,
          resolvedTz,
          tomorrowStr,
        );
        remindersSent += result.emailsSent;
        errors.push(...result.errors.map((e) => `[${tenant.id}] ${e}`));
      } catch (tenantErr: any) {
        errors.push(`[${tenant.id}] ${tenantErr?.message || "tenant error"}`);
      }
    }
  } catch (error: any) {
    errors.push(error?.message || "Unknown error");
  }

  return { tenantsProcessed, remindersSent, errors };
}

/**
 * Manual trigger for the settings "Send test reminder" button. Sends reminders
 * for tomorrow's shifts immediately, bypassing the local-hour gate but still
 * respecting the per-event dedupe (so it can't double-email volunteers who were
 * already reminded by the cron).
 */
export async function triggerManualShiftReminders(
  tenantId: string,
): Promise<ShiftReminderResult> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) {
    return {
      tenantId,
      tenantName: "",
      emailsSent: 0,
      shiftsFound: 0,
      errors: ["Tenant not found"],
    };
  }

  const effectiveTz = getLocalParts(tenant.timezone || "", new Date())
    ? (tenant.timezone as string)
    : DEFAULT_TENANT_TIMEZONE;

  const local = getLocalParts(effectiveTz, new Date());
  if (!local) {
    return {
      tenantId,
      tenantName: tenant.name,
      emailsSent: 0,
      shiftsFound: 0,
      errors: ["Could not resolve timezone"],
    };
  }

  const tomorrowStr = nextDayString(local.year, local.month, local.day);
  return sendRemindersForTenantDate(tenant, effectiveTz, tomorrowStr);
}
