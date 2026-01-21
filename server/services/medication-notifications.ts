import { db } from '../db';
import { 
  adopterMedicationReminders, 
  magicLinks, 
  animals, 
  users, 
  tenants,
  animalAdopters 
} from '@shared/schema';
import { eq, and, lte, isNull, or } from 'drizzle-orm';
import crypto from 'crypto';

interface NotificationResult {
  sent: number;
  failed: number;
  skipped: number;
}

export async function sendDueDateNotifications(): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, failed: 0, skipped: 0 };
  
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const dueReminders = await db
      .select({
        reminder: adopterMedicationReminders,
        animal: animals,
        adopter: animalAdopters,
      })
      .from(adopterMedicationReminders)
      .innerJoin(animals, eq(adopterMedicationReminders.animalId, animals.id))
      .innerJoin(animalAdopters, and(
        eq(animalAdopters.animalId, animals.id),
        eq(animalAdopters.isPrimaryAdopter, true)
      ))
      .where(and(
        eq(adopterMedicationReminders.isActive, true),
        lte(adopterMedicationReminders.nextDueDate, today),
        or(
          isNull(adopterMedicationReminders.lastNotifiedDate),
          lte(adopterMedicationReminders.lastNotifiedDate, 
            new Date(today.getTime() - 24 * 60 * 60 * 1000))
        )
      ));

    for (const { reminder, animal, adopter } of dueReminders) {
      try {
        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, adopter.userId))
          .limit(1)
          .then(rows => rows[0]);

        if (!user) {
          result.skipped++;
          continue;
        }

        const tenant = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, reminder.tenantId))
          .limit(1)
          .then(rows => rows[0]);

        if (!tenant) {
          result.skipped++;
          continue;
        }

        const magicLinkToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await db.insert(magicLinks).values({
          tenantId: reminder.tenantId,
          userId: user.id,
          token: magicLinkToken,
          expiresAt,
          purpose: 'medication_confirm',
          targetId: reminder.id,
        });

        const baseUrl = process.env.REPLIT_SLUG 
          ? `https://${process.env.REPLIT_SLUG}.${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000';
        
        const tenantPath = tenant.subdomain ? `/${tenant.subdomain}` : '';
        const confirmUrl = `${baseUrl}${tenantPath}/api/adopter/confirm-medication/${magicLinkToken}`;
        const portalUrl = `${baseUrl}${tenantPath}/my-pets/${animal.id}?tab=health`;

        const { EmailService } = await import('../lib/email-service');
        const emailService = new EmailService();

        const animalPhoto = (animal.photoUrls as string[])?.[0] || '';
        const subject = `ACTION REQUIRED: ${reminder.medicationName} for ${animal.name}`;
        
        const preheaderText = `It's time to give ${animal.name} their ${reminder.medicationName}. Click to confirm when done.`;

        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <span style="display: none; max-height: 0; overflow: hidden;">${preheaderText}</span>
  <span style="display: none; max-height: 0; overflow: hidden;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #f97316; padding: 20px 30px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Medication Reminder</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <div style="display: flex; align-items: center; margin-bottom: 20px;">
                ${animalPhoto ? `
                <img src="${animalPhoto}" alt="${animal.name}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-right: 15px;">
                ` : ''}
                <div>
                  <h2 style="color: #1f2937; margin: 0;">${animal.name}</h2>
                  <p style="color: #6b7280; margin: 5px 0 0;">${reminder.medicationName}</p>
                </div>
              </div>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hi ${user.firstName || 'there'},
              </p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                It's time to give <strong>${animal.name}</strong> their <strong>${reminder.medicationName}</strong>.
                ${reminder.dosage ? `<br><br><strong>Dosage:</strong> ${reminder.dosage}` : ''}
                ${reminder.instructions ? `<br><strong>Instructions:</strong> ${reminder.instructions}` : ''}
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${confirmUrl}" style="display: inline-block; background-color: #22c55e; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                  Confirm Medication Given
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 20px 0;">
                One click confirms - no login required!
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                <a href="${portalUrl}" style="color: #8b5cf6;">View ${animal.name}'s health records</a> | 
                <a href="${baseUrl}${tenantPath}/my-pets" style="color: #8b5cf6;">Pet Portal</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
                ${tenant.name} | Questions? Just reply to this email!
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        await emailService.sendEmail(
          reminder.tenantId,
          user.email,
          subject,
          html,
          {
            category: 'medication_reminder',
            tags: ['medication', 'reminder', 'double-tap'],
          }
        );

        await db
          .update(adopterMedicationReminders)
          .set({ lastNotifiedDate: now })
          .where(eq(adopterMedicationReminders.id, reminder.id));

        console.log(`[Medication Reminder] Sent due date notification for ${animal.name}'s ${reminder.medicationName} to ${user.email}`);
        result.sent++;
      } catch (error) {
        console.error(`[Medication Reminder] Failed to send notification for reminder ${reminder.id}:`, error);
        result.failed++;
      }
    }

    return result;
  } catch (error) {
    console.error('[Medication Reminder] Failed to process due date notifications:', error);
    return result;
  }
}

export async function sendFollowUpNotifications(): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, failed: 0, skipped: 0 };
  
  try {
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    
    const overdueReminders = await db
      .select({
        reminder: adopterMedicationReminders,
        animal: animals,
        adopter: animalAdopters,
      })
      .from(adopterMedicationReminders)
      .innerJoin(animals, eq(adopterMedicationReminders.animalId, animals.id))
      .innerJoin(animalAdopters, and(
        eq(animalAdopters.animalId, animals.id),
        eq(animalAdopters.isPrimaryAdopter, true)
      ))
      .where(and(
        eq(adopterMedicationReminders.isActive, true),
        lte(adopterMedicationReminders.nextDueDate, fortyEightHoursAgo),
        or(
          isNull(adopterMedicationReminders.lastConfirmedDate),
          lte(adopterMedicationReminders.lastConfirmedDate, adopterMedicationReminders.nextDueDate)
        )
      ));

    for (const { reminder, animal, adopter } of overdueReminders) {
      try {
        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, adopter.userId))
          .limit(1)
          .then(rows => rows[0]);

        if (!user) {
          result.skipped++;
          continue;
        }

        const tenant = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, reminder.tenantId))
          .limit(1)
          .then(rows => rows[0]);

        if (!tenant) {
          result.skipped++;
          continue;
        }

        const lastFollowUp = await db
          .select()
          .from(magicLinks)
          .where(and(
            eq(magicLinks.userId, user.id),
            eq(magicLinks.purpose, 'medication_followup'),
            eq(magicLinks.targetId, reminder.id)
          ))
          .orderBy(magicLinks.createdAt)
          .limit(1)
          .then(rows => rows[0]);

        if (lastFollowUp && new Date(lastFollowUp.createdAt) > fortyEightHoursAgo) {
          result.skipped++;
          continue;
        }

        const magicLinkToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await db.insert(magicLinks).values({
          tenantId: reminder.tenantId,
          userId: user.id,
          token: magicLinkToken,
          expiresAt,
          purpose: 'medication_followup',
          targetId: reminder.id,
        });

        const baseUrl = process.env.REPLIT_SLUG 
          ? `https://${process.env.REPLIT_SLUG}.${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000';
        
        const tenantPath = tenant.subdomain ? `/${tenant.subdomain}` : '';
        const confirmUrl = `${baseUrl}${tenantPath}/api/adopter/confirm-medication/${magicLinkToken}`;
        const portalUrl = `${baseUrl}${tenantPath}/my-pets/${animal.id}?tab=health`;

        const { EmailService } = await import('../lib/email-service');
        const emailService = new EmailService();

        const animalPhoto = (animal.photoUrls as string[])?.[0] || '';
        const subject = `REMINDER: ${animal.name}'s ${reminder.medicationName} is overdue`;
        
        const preheaderText = `We haven't received confirmation that ${animal.name} received their medication. Please confirm or let us know if you need help.`;

        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <span style="display: none; max-height: 0; overflow: hidden;">${preheaderText}</span>
  <span style="display: none; max-height: 0; overflow: hidden;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #dc2626; padding: 20px 30px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Medication Follow-Up</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hi ${user.firstName || 'there'},
              </p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                We noticed that <strong>${animal.name}'s</strong> <strong>${reminder.medicationName}</strong> was due and we haven't received confirmation yet.
              </p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                If you've already given the medication, please click below to confirm. If you're having any trouble or have questions, just reply to this email - we're here to help!
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${confirmUrl}" style="display: inline-block; background-color: #22c55e; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                  Yes, Medication Was Given
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 20px 0;">
                One click confirms - no login required!
              </p>
              
              <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0;">
                  <strong>Need help?</strong> If you're having trouble with the medication or have any questions, please reply to this email or contact ${tenant.name} directly. We want to make sure ${animal.name} stays healthy!
                </p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                <a href="${portalUrl}" style="color: #8b5cf6;">View ${animal.name}'s health records</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
                ${tenant.name} | Questions? Just reply to this email!
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        await emailService.sendEmail(
          reminder.tenantId,
          user.email,
          subject,
          html,
          {
            category: 'medication_reminder',
            tags: ['medication', 'follow-up', 'overdue'],
          }
        );

        console.log(`[Medication Reminder] Sent follow-up notification for ${animal.name}'s ${reminder.medicationName} to ${user.email}`);
        result.sent++;
      } catch (error) {
        console.error(`[Medication Reminder] Failed to send follow-up for reminder ${reminder.id}:`, error);
        result.failed++;
      }
    }

    return result;
  } catch (error) {
    console.error('[Medication Reminder] Failed to process follow-up notifications:', error);
    return result;
  }
}

export async function runMedicationNotifications(): Promise<void> {
  console.log('[Medication Reminder] Running medication notification job...');
  
  const dueResult = await sendDueDateNotifications();
  console.log(`[Medication Reminder] Due date notifications - Sent: ${dueResult.sent}, Failed: ${dueResult.failed}, Skipped: ${dueResult.skipped}`);
  
  const followUpResult = await sendFollowUpNotifications();
  console.log(`[Medication Reminder] Follow-up notifications - Sent: ${followUpResult.sent}, Failed: ${followUpResult.failed}, Skipped: ${followUpResult.skipped}`);
}
