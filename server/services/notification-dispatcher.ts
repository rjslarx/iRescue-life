import { db } from '../db';
import { notificationPreferences, users } from '@shared/schema';
import type { NotificationEventKey } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

interface NotificationRecipient {
  email: string;
  fullName: string;
  userId?: string;
}

interface NotificationContext {
  tenantId: string;
  eventKey: NotificationEventKey;
  subject: string;
  htmlBody: string;
  textBody?: string;
  smsBody?: string;
  metadata?: Record<string, any>;
}

export async function getNotificationRecipients(
  tenantId: string,
  eventKey: NotificationEventKey,
  channel: string = "email"
): Promise<{ enabled: boolean; recipients: NotificationRecipient[]; recipientPhones?: string[] }> {
  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenantId, tenantId),
        eq(notificationPreferences.eventKey, eventKey),
        eq(notificationPreferences.channel, channel),
      )
    )
    .limit(1);

  if (prefs.length === 0 || !prefs[0].isEnabled) {
    return { enabled: false, recipients: [], recipientPhones: [] };
  }

  const pref = prefs[0];
  const recipients: NotificationRecipient[] = [];
  const seenEmails = new Set<string>();

  if (pref.recipientRoles && pref.recipientRoles.length > 0) {
    const tenantUsers = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roles: users.roles,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));

    for (const user of tenantUsers) {
      const userRoles = user.roles || [];
      const hasMatchingRole = pref.recipientRoles.some(role => userRoles.includes(role as any));
      if (hasMatchingRole && !seenEmails.has(user.email.toLowerCase())) {
        seenEmails.add(user.email.toLowerCase());
        recipients.push({
          email: user.email,
          fullName: user.fullName,
          userId: user.id,
        });
      }
    }
  }

  if (pref.recipientEmails && pref.recipientEmails.length > 0) {
    for (const email of pref.recipientEmails) {
      const normalized = email.toLowerCase().trim();
      if (normalized && !seenEmails.has(normalized)) {
        seenEmails.add(normalized);
        recipients.push({
          email: normalized,
          fullName: normalized,
        });
      }
    }
  }

  return { enabled: true, recipients, recipientPhones: pref.recipientPhones || [] };
}

export async function shouldNotify(
  tenantId: string,
  eventKey: NotificationEventKey,
  channel: string = "email"
): Promise<boolean> {
  const { enabled, recipients } = await getNotificationRecipients(tenantId, eventKey, channel);
  return enabled && recipients.length > 0;
}

export async function dispatchEventNotification(
  context: NotificationContext
): Promise<{ sent: boolean; recipientCount: number; smsSent?: number }> {
  const { tenantId, eventKey, subject, htmlBody, textBody, smsBody } = context;

  // --- Email dispatch ---
  const { enabled, recipients } = await getNotificationRecipients(tenantId, eventKey, "email");

  console.log(`[NotificationDispatcher] ${eventKey} for tenant ${tenantId}: enabled=${enabled}, recipientCount=${recipients.length}`);

  let emailSentCount = 0;
  if (enabled && recipients.length > 0) {
    try {
      const { EmailService } = await import('../lib/email-service');
      const emailService = await EmailService.forTenant(tenantId);

      if (!emailService) {
        console.warn(`[NotificationDispatcher] Email service not configured for tenant ${tenantId}, skipping ${eventKey} email`);
      } else {
        for (const recipient of recipients) {
          try {
            await emailService.send({
              to: recipient.email,
              subject,
              html: htmlBody,
              text: textBody,
            });
            emailSentCount++;
            console.log(`[NotificationDispatcher] Sent ${eventKey} email to ${recipient.email}`);
          } catch (emailError) {
            console.error(`[NotificationDispatcher] Failed email ${eventKey} to ${recipient.email}:`, emailError);
          }
        }
      }
    } catch (error) {
      console.error(`[NotificationDispatcher] Error dispatching ${eventKey} email:`, error);
    }
  } else {
    console.log(`[NotificationDispatcher] Skipping ${eventKey} email - ${!enabled ? 'not enabled' : 'no recipients configured'} for tenant ${tenantId}`);
  }

  // --- SMS dispatch ---
  let smsSentCount = 0;
  try {
    const smsPrefs = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.tenantId, tenantId),
          eq(notificationPreferences.eventKey, eventKey),
          eq(notificationPreferences.channel, 'sms'),
        )
      )
      .limit(1);

    if (smsPrefs.length > 0 && smsPrefs[0].isEnabled && smsPrefs[0].recipientPhones?.length > 0) {
      const { sendSms, isTwilioEnabled } = await import('../lib/twilio-service');
      const twilioReady = await isTwilioEnabled(tenantId);

      if (twilioReady) {
        const message = smsBody
          || (textBody ? textBody.substring(0, 155) + (textBody.length > 155 ? '...' : '') : `iRescue: ${subject}`.substring(0, 160));

        for (const phone of smsPrefs[0].recipientPhones) {
          try {
            await sendSms(tenantId, phone, message, 'other');
            smsSentCount++;
            console.log(`[NotificationDispatcher] Sent ${eventKey} SMS to ${phone}`);
          } catch (smsError) {
            console.error(`[NotificationDispatcher] Failed SMS ${eventKey} to ${phone}:`, smsError);
          }
        }
      } else {
        console.log(`[NotificationDispatcher] Twilio not configured for tenant ${tenantId}, skipping SMS for ${eventKey}`);
      }
    }
  } catch (smsDispatchError) {
    console.error(`[NotificationDispatcher] Error in SMS dispatch for ${eventKey}:`, smsDispatchError);
  }

  return { sent: emailSentCount > 0 || smsSentCount > 0, recipientCount: emailSentCount, smsSent: smsSentCount };
}
