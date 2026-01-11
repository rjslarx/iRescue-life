import { db } from "../db";
import { 
  tenants,
  volunteerOpportunities,
  volunteerSignups,
  type Tenant 
} from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { EmailService } from "../lib/email-service";
import { format, addDays, startOfDay, endOfDay, parseISO } from "date-fns";

interface VolunteerCommitment {
  opportunityId: string;
  title: string;
  date: string;
  time: string;
  location: string;
  signupDate: string;
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
  /**
   * Send weekly schedule digest to all volunteers for a specific tenant
   */
  static async sendTenantDigest(tenantId: string): Promise<DigestResult> {
    const result: DigestResult = {
      tenantId,
      tenantName: '',
      emailsSent: 0,
      volunteersWithCommitments: 0,
      totalCommitments: 0,
      errors: [],
    };

    // Get tenant settings
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

    // Get upcoming volunteer opportunities
    const now = new Date();
    const startDate = format(startOfDay(now), 'yyyy-MM-dd');
    const endDate = format(endOfDay(addDays(now, daysAhead)), 'yyyy-MM-dd');

    const opportunities = await db
      .select()
      .from(volunteerOpportunities)
      .where(eq(volunteerOpportunities.tenantId, tenantId));

    // Filter opportunities by date
    const upcomingOpportunities = opportunities.filter(opp => {
      const oppDate = opp.date;
      return oppDate >= startDate && oppDate <= endDate;
    });

    if (upcomingOpportunities.length === 0) {
      return result; // No upcoming opportunities, nothing to send
    }

    // Get all signups for upcoming opportunities
    const opportunityIds = upcomingOpportunities.map(o => o.id);
    const signups = await db
      .select()
      .from(volunteerSignups)
      .where(eq(volunteerSignups.tenantId, tenantId));

    // Filter signups for upcoming opportunities
    const upcomingSignups = signups.filter(s => opportunityIds.includes(s.opportunityId));

    // Group signups by email
    const signupsByEmail = new Map<string, VolunteerCommitment[]>();
    
    for (const signup of upcomingSignups) {
      const opportunity = upcomingOpportunities.find(o => o.id === signup.opportunityId);
      if (!opportunity) continue;

      const email = signup.applicantEmail.toLowerCase();
      const commitment: VolunteerCommitment = {
        opportunityId: signup.opportunityId,
        title: opportunity.title,
        date: opportunity.date,
        time: opportunity.time,
        location: opportunity.location,
        signupDate: format(signup.createdAt, 'MMM d, yyyy'),
      };

      if (!signupsByEmail.has(email)) {
        signupsByEmail.set(email, []);
      }
      signupsByEmail.get(email)!.push(commitment);
      result.totalCommitments++;
    }

    result.volunteersWithCommitments = signupsByEmail.size;

    // Send digest emails
    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      result.errors.push('Email service not configured');
      return result;
    }

    for (const [email, commitments] of signupsByEmail) {
      try {
        // Sort commitments by date
        commitments.sort((a, b) => a.date.localeCompare(b.date));

        // Generate email content
        const html = this.generateDigestHtml(tenant, commitments, daysAhead);
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

    // Update last sent timestamp
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

  /**
   * Generate HTML content for the digest email
   */
  private static generateDigestHtml(
    tenant: Tenant,
    commitments: VolunteerCommitment[],
    daysAhead: number
  ): string {
    const commitmentsHtml = commitments.map(c => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong style="color: #333;">${c.title}</strong><br>
          <span style="color: #666; font-size: 14px;">
            ${this.formatDate(c.date)} at ${c.time}
          </span><br>
          <span style="color: #888; font-size: 13px;">
            ${c.location}
          </span>
        </td>
      </tr>
    `).join('');

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
          <p style="margin-top: 0;">Hi there,</p>
          
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

  /**
   * Format date for display
   */
  private static formatDate(dateStr: string): string {
    try {
      const date = parseISO(dateStr);
      return format(date, 'EEEE, MMMM d, yyyy');
    } catch {
      return dateStr;
    }
  }

  /**
   * Check and send digests for all tenants that are due
   */
  static async checkAndSendAllDigests(): Promise<DigestResult[]> {
    const now = new Date();
    const currentDayOfWeek = format(now, 'EEEE').toLowerCase() as "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
    const currentTime = format(now, 'HH:mm');

    // Get all active tenants with digest enabled
    const allTenants = await db
      .select()
      .from(tenants)
      .where(eq(tenants.isActive, true));

    const results: DigestResult[] = [];

    for (const tenant of allTenants) {
      const settings = tenant.volunteerDigestSettings;
      
      // Skip if digest not enabled
      if (!settings?.enabled) {
        continue;
      }

      // Check if today is the right day
      const targetDay = settings.dayOfWeek || 'sunday';
      if (currentDayOfWeek !== targetDay) {
        continue;
      }

      // Check if it's within 30 minutes of the send time
      const targetTime = settings.sendTime || '08:00';
      const [targetHour, targetMinute] = targetTime.split(':').map(Number);
      const [currentHour, currentMinute] = currentTime.split(':').map(Number);
      
      const targetMinutes = targetHour * 60 + targetMinute;
      const currentMinutes = currentHour * 60 + currentMinute;
      
      if (Math.abs(currentMinutes - targetMinutes) > 30) {
        continue;
      }

      // Check if already sent today
      if (settings.lastSentAt) {
        const lastSentDate = format(new Date(settings.lastSentAt), 'yyyy-MM-dd');
        const today = format(now, 'yyyy-MM-dd');
        if (lastSentDate === today) {
          continue;
        }
      }

      // Send digest for this tenant
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

  /**
   * Manually trigger digest for a tenant (for testing)
   */
  static async triggerManualDigest(tenantId: string): Promise<DigestResult> {
    return this.sendTenantDigest(tenantId);
  }
}
