import { db } from '../db';
import { scheduledCommunications, animals, tenants } from '@shared/schema';
import { eq, and, lte, ne } from 'drizzle-orm';
import { EmailService } from './email-service';

interface RetentionEmailResult {
  tenantsProcessed: number;
  emailsSent: number;
  emailsCancelled: number;
  errors: string[];
}

// Email templates for each milestone
const emailTemplates = {
  '3_days': {
    subject: (animalName: string) => `Day 3 Check-in: Don't Panic!`,
    html: (adopterName: string, animalName: string, tenantName: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Day 3 Check-in: How's ${animalName} Settling In?</h2>
        
        <p>Dear ${adopterName},</p>
        
        <p>It's been 3 days since ${animalName} joined your family, and we wanted to check in!</p>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <h3 style="color: #92400e; margin-top: 0;">🐾 Don't Panic - This is Normal!</h3>
          <p style="margin: 5px 0;">During these first few days, ${animalName} may be:</p>
          <ul style="margin: 10px 0; color: #78350f;">
            <li><strong>Overwhelmed and scared</strong> - A new environment is a lot to take in!</li>
            <li><strong>Sleeping a lot</strong> - This is their way of processing stress</li>
            <li><strong>Not eating much</strong> - Anxiety can suppress appetite</li>
            <li><strong>Hiding or being clingy</strong> - Both are normal stress responses</li>
          </ul>
        </div>

        <h3 style="color: #2563eb;">What You Can Do:</h3>
        <ul>
          <li>Keep things calm and quiet</li>
          <li>Give ${animalName} space to explore at their own pace</li>
          <li>Maintain a consistent routine</li>
          <li>Don't force interactions - let them come to you</li>
        </ul>

        <p style="background-color: #f0fdf4; padding: 15px; border-radius: 8px;">
          <strong>💚 Remember:</strong> It takes about <strong>3 weeks</strong> for most pets to start feeling comfortable. 
          You're doing great by giving ${animalName} time to adjust!
        </p>

        <p>If you have any concerns, don't hesitate to reach out.</p>
        
        <p style="margin-top: 30px;">
          With gratitude,<br>
          <strong>The ${tenantName} Team</strong>
        </p>
      </div>
    `,
  },
  '3_weeks': {
    subject: (animalName: string) => `Week 3: ${animalName} May Be Testing Boundaries`,
    html: (adopterName: string, animalName: string, tenantName: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Week 3 Update: ${animalName}'s Progress</h2>
        
        <p>Dear ${adopterName},</p>
        
        <p>You've made it to 3 weeks with ${animalName} - congratulations!</p>
        
        <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">🔄 The Testing Phase</h3>
          <p style="margin: 5px 0;">Around this time, ${animalName} is likely:</p>
          <ul style="margin: 10px 0; color: #1e3a8a;">
            <li><strong>Testing boundaries</strong> - Seeing what they can get away with</li>
            <li><strong>Showing more personality</strong> - The "real" ${animalName} is emerging!</li>
            <li><strong>Forming deeper bonds</strong> - Building trust with their new family</li>
            <li><strong>Establishing routines</strong> - Learning your household patterns</li>
          </ul>
        </div>

        <h3 style="color: #2563eb;">Tips for This Phase:</h3>
        <ul>
          <li><strong>Stay consistent</strong> - Boundaries help pets feel secure</li>
          <li><strong>Use positive reinforcement</strong> - Reward good behavior with treats and praise</li>
          <li><strong>Be patient</strong> - Setbacks are normal and temporary</li>
          <li><strong>Keep training fun</strong> - Short, positive sessions work best</li>
        </ul>

        <p style="background-color: #f0fdf4; padding: 15px; border-radius: 8px;">
          <strong>💪 You're halfway there!</strong> By the 3-month mark, ${animalName} will feel truly at home.
          Keep up the amazing work!
        </p>

        <p>We'd love to hear how things are going. Reply to this email anytime!</p>
        
        <p style="margin-top: 30px;">
          Warmly,<br>
          <strong>The ${tenantName} Team</strong>
        </p>
      </div>
    `,
  },
  '3_months': {
    subject: (animalName: string) => `🎉 Happy 3 Months with ${animalName}!`,
    html: (adopterName: string, animalName: string, tenantName: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">🎉 Happy 3 Months Together!</h2>
        
        <p>Dear ${adopterName},</p>
        
        <p>It's been 3 months since ${animalName} became part of your family, and we couldn't be happier!</p>
        
        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
          <h3 style="color: #065f46; margin-top: 0;">🏠 ${animalName} is Home!</h3>
          <p style="margin: 5px 0;">By now, ${animalName} should be:</p>
          <ul style="margin: 10px 0; color: #064e3b;">
            <li><strong>Comfortable and secure</strong> - Truly feeling at home</li>
            <li><strong>Showing their full personality</strong> - All quirks on display!</li>
            <li><strong>Bonded with the family</strong> - Deep trust has formed</li>
            <li><strong>Following the household routine</strong> - A full member of the family</li>
          </ul>
        </div>

        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h3 style="color: #92400e; margin-top: 0;">📸 We'd Love to See ${animalName}!</h3>
          <p style="margin: 10px 0;">Would you share a photo update with us?</p>
          <p style="margin: 5px 0; font-size: 14px;">
            Reply to this email with a photo of ${animalName} in their new home.<br>
            We might feature your happy tails story to inspire other adopters!
          </p>
        </div>

        <h3 style="color: #2563eb;">One Small Request:</h3>
        <p>If you've had a positive experience, would you consider leaving us a review? 
        Your feedback helps us continue our mission and encourages others to adopt!</p>

        <p>Thank you for choosing adoption and giving ${animalName} a second chance at happiness.</p>
        
        <p style="margin-top: 30px;">
          With heartfelt gratitude,<br>
          <strong>The ${tenantName} Team</strong>
        </p>
      </div>
    `,
  },
};

/**
 * Process scheduled retention emails for all tenants
 * Runs daily to send 3-3-3 Rule emails
 */
export async function runRetentionEmailsJob(): Promise<RetentionEmailResult> {
  const result: RetentionEmailResult = {
    tenantsProcessed: 0,
    emailsSent: 0,
    emailsCancelled: 0,
    errors: [],
  };

  try {
    // Get all pending communications where send_date <= today
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of day

    const pendingEmails = await db
      .select({
        comm: scheduledCommunications,
        animal: animals,
        tenant: tenants,
      })
      .from(scheduledCommunications)
      .innerJoin(animals, eq(scheduledCommunications.animalId, animals.id))
      .innerJoin(tenants, eq(scheduledCommunications.tenantId, tenants.id))
      .where(
        and(
          eq(scheduledCommunications.status, 'pending'),
          lte(scheduledCommunications.sendDate, today)
        )
      );

    // Track processed tenants
    const processedTenants = new Set<string>();

    for (const { comm, animal, tenant } of pendingEmails) {
      processedTenants.add(comm.tenantId);

      try {
        // CRITICAL CHECK: Verify animal is still adopted
        if (animal.status !== 'adopted') {
          // Animal was returned or status changed - cancel the email
          await db
            .update(scheduledCommunications)
            .set({
              status: 'cancelled',
              cancelReason: `Animal status changed to: ${animal.status}`,
            })
            .where(eq(scheduledCommunications.id, comm.id));

          result.emailsCancelled++;
          console.log(`[Retention] Cancelled email for ${animal.name} - status: ${animal.status}`);
          continue;
        }

        // Get email service for tenant
        const emailService = await EmailService.forTenant(comm.tenantId);
        if (!emailService) {
          result.errors.push(`No email service for tenant ${tenant.name}`);
          continue;
        }

        // Get template for this message type
        const template = emailTemplates[comm.messageType as keyof typeof emailTemplates];
        if (!template) {
          result.errors.push(`Unknown message type: ${comm.messageType}`);
          continue;
        }

        // Send the email
        await emailService.send({
          to: comm.adopterEmail,
          subject: template.subject(comm.animalName),
          html: template.html(comm.adopterName, comm.animalName, tenant.name),
        });

        // Mark as sent
        await db
          .update(scheduledCommunications)
          .set({
            status: 'sent',
            sentAt: new Date(),
          })
          .where(eq(scheduledCommunications.id, comm.id));

        result.emailsSent++;
        console.log(`[Retention] Sent ${comm.messageType} email to ${comm.adopterEmail} for ${comm.animalName}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to send ${comm.messageType} to ${comm.adopterEmail}: ${errorMsg}`);
        console.error(`[Retention] Failed to send email:`, error);
      }
    }

    result.tenantsProcessed = processedTenants.size;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Job failed: ${errorMsg}`);
    console.error('[Retention] Job failed:', error);
  }

  return result;
}
