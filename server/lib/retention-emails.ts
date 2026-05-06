import { db } from '../db';
import { scheduledCommunications, animals, tenants, adoptionCheckoutSessions, contacts, microchipRecords } from '@shared/schema';
import { eq, and, lte, ne } from 'drizzle-orm';
import { EmailService } from './email-service';
import { sendCommunication } from './unified-comms';

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

const microchipManufacturerNames: Record<string, string> = {
  homeagain: 'HomeAgain',
  '24petwatch': '24PetWatch',
  fi: 'Fi',
  akc: 'AKC Reunite',
  avid: 'AVID',
  foundanimals: 'Found Animals',
  petlink: 'PetLink',
  other: 'Other',
};

const microchipRegistrationUrls: Record<string, string> = {
  homeagain: 'https://www.homeagain.com',
  '24petwatch': 'https://www.24petwatch.com',
  fi: 'https://tryfi.com',
  akc: 'https://www.akcreunite.org',
  avid: 'https://www.avidid.com',
  foundanimals: 'https://www.foundanimals.org',
  petlink: 'https://www.petlink.net',
  other: 'https://www.freepetchipregistry.com',
};

function getMicrochipEmailTemplate(
  adopterName: string,
  animalName: string,
  tenantName: string,
  microchipNumber: string,
  manufacturer: string
) {
  const mfgName = microchipManufacturerNames[manufacturer] || manufacturer;
  const registrationUrl = microchipRegistrationUrls[manufacturer] || microchipRegistrationUrls.other;

  return {
    subject: `Action Required: Register ${animalName}'s Microchip`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Register ${animalName}'s Microchip in Your Name</h2>
        
        <p>Dear ${adopterName},</p>
        
        <p>It's been one week since you adopted ${animalName} - congratulations! There's one important step 
        to make sure ${animalName} can always find their way back to you: <strong>registering their microchip 
        in your name</strong>.</p>
        
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">Microchip Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 10px; font-weight: bold; color: #1e3a8a;">Microchip Number:</td>
              <td style="padding: 5px 10px; font-family: monospace; font-size: 16px;">${microchipNumber}</td>
            </tr>
            <tr>
              <td style="padding: 5px 10px; font-weight: bold; color: #1e3a8a;">Manufacturer:</td>
              <td style="padding: 5px 10px;">${mfgName}</td>
            </tr>
          </table>
        </div>

        <h3 style="color: #2563eb;">How to Register:</h3>
        <ol>
          <li>Visit <a href="${registrationUrl}" style="color: #2563eb;">${mfgName}'s registration website</a></li>
          <li>Enter the microchip number: <strong>${microchipNumber}</strong></li>
          <li>Update the contact information to your current name, address, and phone number</li>
          <li>Save your registration confirmation for your records</li>
        </ol>

        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
          <h3 style="color: #991b1b; margin-top: 0;">Why This Matters</h3>
          <p style="margin: 5px 0; color: #7f1d1d;">A microchip only works if the registration is up to date. 
          Without your current contact information linked to the chip, a found pet cannot be returned to you. 
          This takes less than 5 minutes and could save ${animalName}'s life.</p>
        </div>

        <p>If you have any trouble with the registration process, please don't hesitate to contact us for help.</p>
        
        <p style="margin-top: 30px;">
          Thank you for keeping ${animalName} safe,<br>
          <strong>The ${tenantName} Team</strong>
        </p>
      </div>
    `,
  };
}

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

        // Verify email service is configured for tenant before attempting sends
        const emailService = await EmailService.forTenant(comm.tenantId);
        if (!emailService) {
          result.errors.push(`No email service for tenant ${tenant.name}`);
          continue;
        }

        if (comm.messageType === '7_days_microchip') {
          const [chipRecord] = await db
            .select()
            .from(microchipRecords)
            .where(and(
              eq(microchipRecords.animalId, comm.animalId),
              eq(microchipRecords.tenantId, comm.tenantId)
            ))
            .limit(1);

          if (!chipRecord) {
            console.log(`[Retention] No microchip record for ${comm.animalName} (${comm.animalId}) — cancelling 7_days_microchip reminder`);
            await db
              .update(scheduledCommunications)
              .set({
                status: 'cancelled',
                cancelReason: 'No microchip record found for animal',
              })
              .where(eq(scheduledCommunications.id, comm.id));
            result.emailsCancelled++;
            continue;
          }

          const chipTemplate = getMicrochipEmailTemplate(
            comm.adopterName,
            comm.animalName,
            tenant.name,
            chipRecord.microchipNumber,
            chipRecord.manufacturer
          );

          await sendCommunication({
            tenantId: comm.tenantId,
            channel: 'email',
            sourceType: 'reminder',
            recipientAddress: comm.adopterEmail,
            recipientName: comm.adopterName,
            relatedAnimalId: comm.animalId,
            subject: chipTemplate.subject,
            messageBody: chipTemplate.html,
          });
        } else {
          const template = emailTemplates[comm.messageType as keyof typeof emailTemplates];
          if (!template) {
            result.errors.push(`Unknown message type: ${comm.messageType}`);
            continue;
          }

          await sendCommunication({
            tenantId: comm.tenantId,
            channel: 'email',
            sourceType: 'reminder',
            recipientAddress: comm.adopterEmail,
            recipientName: comm.adopterName,
            relatedAnimalId: comm.animalId,
            subject: template.subject(comm.animalName),
            messageBody: template.html(comm.adopterName, comm.animalName, tenant.name),
          });
        }

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

        // Also send SMS alongside the email
        try {
          const [checkout] = await db
            .select({ adopterContactId: adoptionCheckoutSessions.adopterContactId })
            .from(adoptionCheckoutSessions)
            .where(eq(adoptionCheckoutSessions.id, comm.adoptionId))
            .limit(1);

          if (checkout?.adopterContactId) {
            const [adopterContact] = await db
              .select({ phone: contacts.phone })
              .from(contacts)
              .where(eq(contacts.id, checkout.adopterContactId))
              .limit(1);

            if (adopterContact?.phone) {
              const firstName = comm.adopterName.split(' ')[0];
              let microchipSmsExtra = '';
              if (comm.messageType === '7_days_microchip') {
                const [chipForSms] = await db
                  .select({ microchipNumber: microchipRecords.microchipNumber, manufacturer: microchipRecords.manufacturer })
                  .from(microchipRecords)
                  .where(and(
                    eq(microchipRecords.animalId, comm.animalId),
                    eq(microchipRecords.tenantId, comm.tenantId)
                  ))
                  .limit(1);
                if (chipForSms) {
                  const mfgName = microchipManufacturerNames[chipForSms.manufacturer] || chipForSms.manufacturer;
                  microchipSmsExtra = `Hi ${firstName}! Reminder: Please register ${comm.animalName}'s microchip (${chipForSms.microchipNumber}) in your name at ${mfgName}'s website. This ensures ${comm.animalName} can always be returned to you if lost.`;
                }
              }
              const smsTemplates: Record<string, string> = {
                '3_days': `Hi ${firstName}! It's been 3 days with ${comm.animalName}. They're still decompressing — keep things calm and quiet. Reply HELP if you need advice from our team!`,
                '3_weeks': `Happy 3 Weeks with ${comm.animalName}! They should be settling into their routine now. We'd love to see a photo — reply with a pic!`,
                '3_months': `Happy 3 Month Rescue Anniversary to ${comm.animalName}! Thank you for giving them a forever home!`,
                '7_days_microchip': microchipSmsExtra,
              };
              const smsBody = smsTemplates[comm.messageType];
              if (smsBody) {
                await sendCommunication({
                  tenantId: comm.tenantId,
                  channel: 'sms',
                  sourceType: 'reminder',
                  recipientAddress: adopterContact.phone,
                  recipientName: comm.adopterName,
                  relatedAnimalId: comm.animalId,
                  messageBody: smsBody,
                });
                console.log(`[Retention] Sent ${comm.messageType} SMS to ${adopterContact.phone} for ${comm.animalName}`);
              }
            }
          }
        } catch (smsErr) {
          console.warn(`[Retention] SMS failed for ${comm.adopterEmail} (non-blocking):`, smsErr instanceof Error ? smsErr.message : 'Unknown');
        }

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
