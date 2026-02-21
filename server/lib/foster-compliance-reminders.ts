import { db } from '../db';
import { 
  tenants, 
  animals, 
  users,
  fosterAnimals,
  preventativeCareRecords,
  complianceReminders,
  complianceReminderNotifications,
  type ComplianceReminder,
} from '@shared/schema';
import { eq, and, gte, lte, lt, or, isNull, inArray } from 'drizzle-orm';
import { EmailService } from './email-service';
import { sendSms, isTwilioEnabled } from './twilio-service';
import { randomBytes } from 'crypto';

interface JobResult {
  tenantsProcessed: number;
  remindersCreated: number;
  notificationsSent: number;
  errors: string[];
}

interface ConfirmationResult {
  success: boolean;
  alreadyConfirmed?: boolean;
  expired?: boolean;
  notFound?: boolean;
  reminder?: ComplianceReminder;
  error?: string;
}

export function generateMagicLinkToken(): string {
  return randomBytes(32).toString('hex');
}

export function getMagicLinkUrl(tenantSubdomain: string, token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.APP_BASE_URL || 'https://irescue.life';
  return `${base}/${tenantSubdomain}/confirm/${token}`;
}

export async function processConfirmation(token: string, confirmedVia: 'magic_link' | 'sms_reply' = 'magic_link'): Promise<ConfirmationResult> {
  try {
    const [reminder] = await db
      .select()
      .from(complianceReminders)
      .where(eq(complianceReminders.magicLinkToken, token));

    if (!reminder) {
      return { success: false, notFound: true };
    }

    if (reminder.confirmedAt) {
      return { success: false, alreadyConfirmed: true, reminder };
    }

    if (reminder.magicLinkExpiresAt && new Date() > reminder.magicLinkExpiresAt) {
      return { success: false, expired: true };
    }

    const [updated] = await db
      .update(complianceReminders)
      .set({
        state: 'confirmed',
        confirmedAt: new Date(),
        confirmedVia,
        updatedAt: new Date(),
      })
      .where(eq(complianceReminders.id, reminder.id))
      .returning();

    return { success: true, reminder: updated };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function createRemindersForDuePreventativeCare(tenantId: string): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const fosterAnimalsList = await db
      .select({
        fosterAnimalId: fosterAnimals.id,
        animalId: fosterAnimals.animalId,
        fosterId: fosterAnimals.fosterId,
      })
      .from(fosterAnimals)
      .where(and(
        eq(fosterAnimals.tenantId, tenantId),
        eq(fosterAnimals.status, 'active')
      ));

    if (fosterAnimalsList.length === 0) {
      return { created: 0, errors: [] };
    }

    const animalIds = fosterAnimalsList.map(fa => fa.animalId);
    const fosterAnimalMap = new Map(fosterAnimalsList.map(fa => [fa.animalId, fa]));

    const careRecords = await db
      .select({
        id: preventativeCareRecords.id,
        animalId: preventativeCareRecords.animalId,
        careName: preventativeCareRecords.careName,
        nextDueDate: preventativeCareRecords.nextDueDate,
      })
      .from(preventativeCareRecords)
      .where(and(
        eq(preventativeCareRecords.tenantId, tenantId),
        inArray(preventativeCareRecords.animalId, animalIds),
        lte(preventativeCareRecords.nextDueDate, threeDaysFromNow.toISOString().split('T')[0]),
        or(
          isNull(preventativeCareRecords.dateGiven),
          lt(preventativeCareRecords.dateGiven, preventativeCareRecords.nextDueDate)
        )
      ));

    for (const record of careRecords) {
      const fosterAnimal = fosterAnimalMap.get(record.animalId);
      if (!fosterAnimal || !record.nextDueDate) continue;

      const safeDueDate = record.nextDueDate instanceof Date
        ? record.nextDueDate
        : new Date(record.nextDueDate);

      const existingReminder = await db
        .select({ id: complianceReminders.id })
        .from(complianceReminders)
        .where(and(
          eq(complianceReminders.tenantId, tenantId),
          eq(complianceReminders.preventativeCareRecordId, record.id),
          eq(complianceReminders.dueDate, safeDueDate),
          or(
            eq(complianceReminders.state, 'pending'),
            eq(complianceReminders.state, 'notified_3day'),
            eq(complianceReminders.state, 'notified_due'),
            eq(complianceReminders.state, 'overdue'),
            eq(complianceReminders.state, 'requires_intervention')
          )
        ))
        .limit(1);

      if (existingReminder.length > 0) {
        continue;
      }

      const magicToken = generateMagicLinkToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      try {
        await db.insert(complianceReminders).values({
          tenantId,
          animalId: record.animalId,
          fosterId: fosterAnimal.fosterId,
          fosterAnimalId: fosterAnimal.fosterAnimalId,
          preventativeCareRecordId: record.id,
          reminderType: 'preventative_care',
          careName: record.careName,
          dueDate: safeDueDate,
          state: 'pending',
          magicLinkToken: magicToken,
          magicLinkExpiresAt: expiresAt,
        });
        created++;
      } catch (err) {
        errors.push(`Failed to create reminder for ${record.careName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return { created, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { created, errors };
  }
}

export async function send3DayWarningEmails(tenantId: string): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0];

    const reminders = await db
      .select({
        id: complianceReminders.id,
        animalId: complianceReminders.animalId,
        fosterId: complianceReminders.fosterId,
        careName: complianceReminders.careName,
        dueDate: complianceReminders.dueDate,
        magicLinkToken: complianceReminders.magicLinkToken,
      })
      .from(complianceReminders)
      .where(and(
        eq(complianceReminders.tenantId, tenantId),
        eq(complianceReminders.state, 'pending'),
        eq(complianceReminders.dueDate, threeDaysStr)
      ));

    if (reminders.length === 0) {
      return { sent: 0, errors: [] };
    }

    const [tenant] = await db
      .select({ 
        name: tenants.name, 
        subdomain: tenants.subdomain,
        resendApiKey: tenants.resendApiKey,
        defaultFromEmail: tenants.defaultFromEmail,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant?.resendApiKey) {
      return { sent: 0, errors: ['Email not configured for tenant'] };
    }

    const emailService = new EmailService(tenant.resendApiKey, tenant.defaultFromEmail);

    for (const reminder of reminders) {
      if (!reminder.fosterId) continue;

      const [foster] = await db
        .select({ 
          email: users.email, 
          fullName: users.fullName,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, reminder.fosterId));

      const [animal] = await db
        .select({ name: animals.name })
        .from(animals)
        .where(eq(animals.id, reminder.animalId));

      if (!foster?.email || !animal) continue;

      const dueDate = new Date(reminder.dueDate);
      const formattedDate = dueDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      
      const subject = `Inventory Check: ${animal.name} is due for ${reminder.careName} on ${formattedDate}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>📋 Inventory Check</h2>
          <p>Hi ${foster.fullName || 'Foster Parent'},</p>
          <p><strong>${animal.name}</strong> is due for <strong>${reminder.careName}</strong> on <strong>${formattedDate}</strong>.</p>
          <p>Do you have a dose on hand? If not, please contact us to request a refill.</p>
          <p style="margin-top: 24px;">
            <a href="${getMagicLinkUrl(tenant.subdomain, reminder.magicLinkToken!)}" 
               style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              I have it ready
            </a>
          </p>
          <p style="margin-top: 24px; color: #666; font-size: 14px;">
            This reminder is from ${tenant.name}. Click the button above to confirm you're prepared.
          </p>
        </div>
      `;

      try {
        const result = await emailService.send({
          to: foster.email,
          subject,
          html,
        });

        if (result.success) {
          await db.insert(complianceReminderNotifications).values({
            tenantId,
            complianceReminderId: reminder.id,
            channel: 'email',
            notificationType: '3_day_warning',
            recipientEmail: foster.email,
            recipientName: foster.fullName,
            messageBody: subject,
            deliveryStatus: 'sent',
            externalMessageId: result.messageId,
          });

          await db
            .update(complianceReminders)
            .set({ state: 'notified_3day', updatedAt: new Date() })
            .where(eq(complianceReminders.id, reminder.id));

          sent++;
        } else {
          errors.push(`Failed to email ${foster.email}: ${result.error}`);
        }
      } catch (err) {
        errors.push(`Error emailing ${foster.email}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    return { sent, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { sent, errors };
  }
}

export async function sendMorningOfSmsReminders(tenantId: string): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    const twilioEnabled = await isTwilioEnabled(tenantId);
    if (!twilioEnabled) {
      return { sent: 0, errors: [] };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const reminders = await db
      .select({
        id: complianceReminders.id,
        animalId: complianceReminders.animalId,
        fosterId: complianceReminders.fosterId,
        careName: complianceReminders.careName,
        magicLinkToken: complianceReminders.magicLinkToken,
      })
      .from(complianceReminders)
      .where(and(
        eq(complianceReminders.tenantId, tenantId),
        or(
          eq(complianceReminders.state, 'pending'),
          eq(complianceReminders.state, 'notified_3day')
        ),
        eq(complianceReminders.dueDate, todayStr)
      ));

    if (reminders.length === 0) {
      return { sent: 0, errors: [] };
    }

    const [tenant] = await db
      .select({ subdomain: tenants.subdomain })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    for (const reminder of reminders) {
      if (!reminder.fosterId) continue;

      const [foster] = await db
        .select({ phone: users.phone, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, reminder.fosterId));

      const [animal] = await db
        .select({ name: animals.name })
        .from(animals)
        .where(eq(animals.id, reminder.animalId));

      if (!foster?.phone || !animal) continue;

      const magicLink = getMagicLinkUrl(tenant?.subdomain || '', reminder.magicLinkToken!);
      const message = `ACTION: Please give ${animal.name} their ${reminder.careName} today. Reply 'DONE' or click link to confirm: ${magicLink}`;

      try {
        const result = await sendSms(tenantId, foster.phone, message, 'reminder');

        if (result.status === 'sent') {
          await db.insert(complianceReminderNotifications).values({
            tenantId,
            complianceReminderId: reminder.id,
            channel: 'sms',
            notificationType: 'morning_of',
            recipientPhone: foster.phone,
            recipientName: foster.fullName,
            messageBody: message,
            deliveryStatus: 'sent',
            externalMessageId: result.sid,
          });

          await db
            .update(complianceReminders)
            .set({ state: 'notified_due', updatedAt: new Date() })
            .where(eq(complianceReminders.id, reminder.id));

          sent++;
        } else {
          errors.push(`Failed to SMS ${foster.phone}: ${result.error}`);
        }
      } catch (err) {
        errors.push(`Error SMS ${foster.phone}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    return { sent, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { sent, errors };
  }
}

export async function escalateOverdueReminders(tenantId: string): Promise<{ escalated: number; errors: string[] }> {
  const errors: string[] = [];
  let escalated = 0;

  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

    const remindersToEscalate24h = await db
      .select({ id: complianceReminders.id })
      .from(complianceReminders)
      .where(and(
        eq(complianceReminders.tenantId, tenantId),
        eq(complianceReminders.state, 'notified_due'),
        lte(complianceReminders.dueDate, yesterdayStr)
      ));

    for (const reminder of remindersToEscalate24h) {
      await db
        .update(complianceReminders)
        .set({ 
          state: 'overdue', 
          escalationLevel: 1,
          escalatedAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(complianceReminders.id, reminder.id));
      escalated++;
    }

    const remindersToEscalate48h = await db
      .select({ id: complianceReminders.id })
      .from(complianceReminders)
      .where(and(
        eq(complianceReminders.tenantId, tenantId),
        eq(complianceReminders.state, 'overdue'),
        lte(complianceReminders.dueDate, twoDaysAgoStr)
      ));

    for (const reminder of remindersToEscalate48h) {
      await db
        .update(complianceReminders)
        .set({ 
          state: 'requires_intervention', 
          escalationLevel: 2,
          callListAddedAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(complianceReminders.id, reminder.id));
      escalated++;
    }

    return { escalated, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { escalated, errors };
  }
}

export async function getCallList(tenantId: string): Promise<{
  items: Array<{
    reminderId: string;
    animalName: string;
    animalId: string;
    fosterName: string;
    fosterEmail: string;
    fosterPhone: string | null;
    careName: string;
    dueDate: string;
    daysOverdue: number;
    addedToCallListAt: Date | null;
  }>;
  error?: string;
}> {
  try {
    const reminders = await db
      .select({
        id: complianceReminders.id,
        animalId: complianceReminders.animalId,
        fosterId: complianceReminders.fosterId,
        careName: complianceReminders.careName,
        dueDate: complianceReminders.dueDate,
        callListAddedAt: complianceReminders.callListAddedAt,
      })
      .from(complianceReminders)
      .where(and(
        eq(complianceReminders.tenantId, tenantId),
        eq(complianceReminders.state, 'requires_intervention')
      ));

    const items = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const reminder of reminders) {
      if (!reminder.fosterId) continue;

      const [foster] = await db
        .select({ 
          fullName: users.fullName, 
          email: users.email, 
          phone: users.phone 
        })
        .from(users)
        .where(eq(users.id, reminder.fosterId));

      const [animal] = await db
        .select({ name: animals.name })
        .from(animals)
        .where(eq(animals.id, reminder.animalId));

      if (!foster || !animal) continue;

      const dueDate = new Date(reminder.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      items.push({
        reminderId: reminder.id,
        animalName: animal.name,
        animalId: reminder.animalId,
        fosterName: foster.fullName || 'Unknown',
        fosterEmail: foster.email,
        fosterPhone: foster.phone,
        careName: reminder.careName,
        dueDate: reminder.dueDate,
        daysOverdue,
        addedToCallListAt: reminder.callListAddedAt,
      });
    }

    return { items };
  } catch (error) {
    return { 
      items: [], 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function resolveCallListItem(
  reminderId: string, 
  resolvedByUserId: string, 
  notes?: string,
  markAsConfirmed: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates: Record<string, any> = {
      callListResolvedAt: new Date(),
      callListResolvedByUserId: resolvedByUserId,
      callListNotes: notes,
      updatedAt: new Date(),
    };

    if (markAsConfirmed) {
      updates.state = 'confirmed';
      updates.confirmedAt = new Date();
      updates.confirmedVia = 'staff_override';
      updates.confirmedByUserId = resolvedByUserId;
    }

    await db
      .update(complianceReminders)
      .set(updates)
      .where(eq(complianceReminders.id, reminderId));

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function getComplianceStats(tenantId: string): Promise<{
  onTrack: number;
  upcoming: number;
  critical: number;
  complianceRate: number;
}> {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0];

    const confirmed = await db
      .select({ id: complianceReminders.id })
      .from(complianceReminders)
      .where(and(
        eq(complianceReminders.tenantId, tenantId),
        eq(complianceReminders.state, 'confirmed')
      ));

    const upcoming = await db
      .select({ id: complianceReminders.id })
      .from(complianceReminders)
      .where(and(
        eq(complianceReminders.tenantId, tenantId),
        or(
          eq(complianceReminders.state, 'pending'),
          eq(complianceReminders.state, 'notified_3day')
        ),
        gte(complianceReminders.dueDate, todayStr),
        lte(complianceReminders.dueDate, threeDaysStr)
      ));

    const critical = await db
      .select({ id: complianceReminders.id })
      .from(complianceReminders)
      .where(and(
        eq(complianceReminders.tenantId, tenantId),
        or(
          eq(complianceReminders.state, 'overdue'),
          eq(complianceReminders.state, 'requires_intervention')
        )
      ));

    const total = confirmed.length + upcoming.length + critical.length;
    const complianceRate = total > 0 ? Math.round((confirmed.length / total) * 100) : 100;

    return {
      onTrack: confirmed.length,
      upcoming: upcoming.length,
      critical: critical.length,
      complianceRate,
    };
  } catch (error) {
    return { onTrack: 0, upcoming: 0, critical: 0, complianceRate: 100 };
  }
}

export async function runFosterComplianceRemindersForAllTenants(): Promise<JobResult> {
  const result: JobResult = {
    tenantsProcessed: 0,
    remindersCreated: 0,
    notificationsSent: 0,
    errors: [],
  };

  try {
    const activeTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    for (const tenant of activeTenants) {
      try {
        result.tenantsProcessed++;

        const createResult = await createRemindersForDuePreventativeCare(tenant.id);
        result.remindersCreated += createResult.created;
        result.errors.push(...createResult.errors.map(e => `${tenant.name}: ${e}`));

        const emailResult = await send3DayWarningEmails(tenant.id);
        result.notificationsSent += emailResult.sent;
        result.errors.push(...emailResult.errors.map(e => `${tenant.name}: ${e}`));

        const smsResult = await sendMorningOfSmsReminders(tenant.id);
        result.notificationsSent += smsResult.sent;
        result.errors.push(...smsResult.errors.map(e => `${tenant.name}: ${e}`));

        const escalateResult = await escalateOverdueReminders(tenant.id);
        result.errors.push(...escalateResult.errors.map(e => `${tenant.name}: ${e}`));

      } catch (err) {
        result.errors.push(`${tenant.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    return result;
  }
}
