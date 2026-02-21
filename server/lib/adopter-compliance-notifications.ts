import { db } from '../db';
import {
  users,
  animals,
  applications,
  tenants,
  preventativeCareRecords,
  adopterMedicationReminders,
  adopterNotificationPreferences,
  adopterNotificationLogs,
} from '@shared/schema';
import { eq, and, lte, sql, desc, isNull } from 'drizzle-orm';
import { EmailService } from './email-service';
import { sendSms } from './twilio-service';

interface NotificationResult {
  tenantId: string;
  tenantName: string;
  emailsSent: number;
  smsSent: number;
  errors: string[];
}

function getAppBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return process.env.APP_BASE_URL || 'https://irescue.life';
}

function buildPortalUrl(tenant: { subdomain: string | null; customDomain: string | null }, path: string): string {
  if (tenant.customDomain) {
    return `https://${tenant.customDomain}${path}`;
  }
  const baseUrl = getAppBaseUrl();
  const tenantPath = tenant.subdomain ? `/${tenant.subdomain}` : '';
  return `${baseUrl}${tenantPath}${path}`;
}

async function getAdoptersWithPets(tenantId: string) {
  try {
    const results = await db
      .select({
        userId: users.id,
        userEmail: users.email,
        userName: users.fullName,
        animalId: animals.id,
        animalName: animals.name,
        animalSpecies: animals.species,
      })
      .from(users)
      .innerJoin(
        applications,
        and(
          eq(applications.tenantId, tenantId),
          eq(applications.stage, 'adopted'),
          sql`LOWER(${applications.applicantEmail}) = LOWER(${users.email})`
        )
      )
      .innerJoin(
        animals,
        and(
          eq(animals.id, applications.animalId),
          eq(animals.tenantId, tenantId),
          eq(animals.status, 'adopted')
        )
      )
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        sql`${users.roles} && ARRAY['adopter']::text[]`
      ));

    return results;
  } catch (error) {
    console.error(`[AdopterCompliance] Error fetching adopters with pets for tenant ${tenantId}:`, error);
    return [];
  }
}

interface ComplianceItem {
  type: 'vaccination_due' | 'vaccination_overdue' | 'prevention_due' | 'prevention_overdue' | 'medication_due' | 'medication_overdue';
  itemName: string;
  itemId: string;
  dueDate: string;
  animalId: string;
  animalName: string;
}

async function getComplianceItemsForAnimal(tenantId: string, animalId: string, animalName: string): Promise<ComplianceItem[]> {
  const items: ComplianceItem[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  threeDaysFromNow.setHours(23, 59, 59, 999);

  const careRecords = await db
    .select({
      id: preventativeCareRecords.id,
      nextDueDate: preventativeCareRecords.nextDueDate,
      careName: preventativeCareRecords.careName,
      careCategory: preventativeCareRecords.careCategory,
    })
    .from(preventativeCareRecords)
    .where(and(
      eq(preventativeCareRecords.tenantId, tenantId),
      eq(preventativeCareRecords.animalId, animalId),
      sql`${preventativeCareRecords.careCategory} IN ('vaccine', 'parasite_prevention')`,
      lte(preventativeCareRecords.nextDueDate, threeDaysFromNow)
    ));

  for (const record of careRecords) {
    if (!record.nextDueDate) continue;
    const rawDate = record.nextDueDate instanceof Date ? record.nextDueDate : new Date(record.nextDueDate);
    const dueDateStr = rawDate.toISOString().split('T')[0];
    const isOverdue = dueDateStr < todayStr;
    const isPrevention = record.careCategory === 'parasite_prevention';
    items.push({
      type: isPrevention 
        ? (isOverdue ? 'prevention_overdue' : 'prevention_due')
        : (isOverdue ? 'vaccination_overdue' : 'vaccination_due'),
      itemName: record.careName || (isPrevention ? 'Parasite Prevention' : 'Vaccination'),
      itemId: record.id,
      dueDate: dueDateStr,
      animalId,
      animalName,
    });
  }

  const medications = await db
    .select({
      id: adopterMedicationReminders.id,
      medicationName: adopterMedicationReminders.medicationName,
      nextDueDate: adopterMedicationReminders.nextDueDate,
    })
    .from(adopterMedicationReminders)
    .where(and(
      eq(adopterMedicationReminders.tenantId, tenantId),
      eq(adopterMedicationReminders.animalId, animalId),
      eq(adopterMedicationReminders.isActive, true),
      lte(adopterMedicationReminders.nextDueDate, threeDaysFromNow)
    ));

  for (const med of medications) {
    if (!med.nextDueDate) continue;
    const rawMedDate = med.nextDueDate instanceof Date ? med.nextDueDate : new Date(med.nextDueDate);
    const medDueStr = rawMedDate.toISOString().split('T')[0];
    const isOverdue = medDueStr < todayStr;
    items.push({
      type: isOverdue ? 'medication_overdue' : 'medication_due',
      itemName: med.medicationName,
      itemId: med.id,
      dueDate: medDueStr,
      animalId,
      animalName,
    });
  }

  return items;
}

async function wasRecentlyNotified(tenantId: string, userId: string, itemId: string, type: string): Promise<boolean> {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const [existing] = await db
    .select({ id: adopterNotificationLogs.id })
    .from(adopterNotificationLogs)
    .where(and(
      eq(adopterNotificationLogs.tenantId, tenantId),
      eq(adopterNotificationLogs.userId, userId),
      eq(adopterNotificationLogs.itemId, itemId),
      eq(adopterNotificationLogs.notificationType, type),
      sql`${adopterNotificationLogs.sentAt} > ${oneDayAgo}`
    ))
    .limit(1);

  return !!existing;
}

function buildComplianceEmailHtml(
  userName: string,
  tenantName: string,
  items: ComplianceItem[],
  portalUrl: string
): string {
  const overdueItems = items.filter(i => i.type.includes('overdue'));
  const dueItems = items.filter(i => !i.type.includes('overdue'));

  let itemsHtml = '';

  if (overdueItems.length > 0) {
    itemsHtml += `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <h3 style="color: #dc2626; margin: 0 0 12px 0; font-size: 16px;">Overdue Items</h3>
        ${overdueItems.map(item => `
          <div style="padding: 8px 0; border-bottom: 1px solid #fecaca;">
            <strong>${item.animalName}</strong> - ${item.itemName}
            <br><span style="color: #dc2626; font-size: 13px;">Was due: ${new Date(item.dueDate).toLocaleDateString()}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (dueItems.length > 0) {
    itemsHtml += `
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <h3 style="color: #d97706; margin: 0 0 12px 0; font-size: 16px;">Coming Up Soon</h3>
        ${dueItems.map(item => `
          <div style="padding: 8px 0; border-bottom: 1px solid #fde68a;">
            <strong>${item.animalName}</strong> - ${item.itemName}
            <br><span style="color: #d97706; font-size: 13px;">Due: ${new Date(item.dueDate).toLocaleDateString()}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #374151;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1f2937; font-size: 22px; margin: 0;">Pet Care Reminder</h1>
        <p style="color: #6b7280; margin: 8px 0 0 0;">from ${tenantName}</p>
      </div>

      <p style="font-size: 15px;">Hi ${userName},</p>
      <p style="font-size: 15px;">Here's a quick update on your pet's care needs:</p>

      ${itemsHtml}

      <div style="text-align: center; margin: 24px 0;">
        <a href="${portalUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
          View My Pets Portal
        </a>
      </div>

      <p style="font-size: 13px; color: #9ca3af; text-align: center; margin-top: 32px;">
        You're receiving this because you opted in to pet care reminders. 
        You can update your notification preferences in your My Pets portal.
      </p>
    </body>
    </html>
  `;
}

function buildComplianceSmsMessage(items: ComplianceItem[], portalUrl: string): string {
  const overdueCount = items.filter(i => i.type.includes('overdue')).length;
  const dueCount = items.filter(i => !i.type.includes('overdue')).length;

  let msg = 'Pet Care Reminder: ';
  const parts: string[] = [];
  if (overdueCount > 0) parts.push(`${overdueCount} overdue item${overdueCount > 1 ? 's' : ''}`);
  if (dueCount > 0) parts.push(`${dueCount} item${dueCount > 1 ? 's' : ''} due soon`);
  msg += parts.join(', ');
  msg += `. View details: ${portalUrl}`;
  return msg;
}

export async function runAdopterComplianceNotifications(tenantId: string): Promise<NotificationResult> {
  const result: NotificationResult = {
    tenantId,
    tenantName: '',
    emailsSent: 0,
    smsSent: 0,
    errors: [],
  };

  try {
    const [tenant] = await db
      .select({
        name: tenants.name,
        subdomain: tenants.subdomain,
        customDomain: tenants.customDomain,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      result.errors.push('Tenant not found');
      return result;
    }

    result.tenantName = tenant.name;
    const portalUrl = buildPortalUrl(tenant, '/my-pets');

    const adoptersWithPets = await getAdoptersWithPets(tenantId);

    const adopterMap = new Map<string, {
      userId: string;
      email: string;
      name: string;
      pets: { animalId: string; animalName: string; species: string | null }[];
    }>();

    for (const row of adoptersWithPets) {
      if (!adopterMap.has(row.userId)) {
        adopterMap.set(row.userId, {
          userId: row.userId,
          email: row.userEmail,
          name: row.userName,
          pets: [],
        });
      }
      adopterMap.get(row.userId)!.pets.push({
        animalId: row.animalId,
        animalName: row.animalName,
        species: row.animalSpecies,
      });
    }

    for (const [userId, adopter] of adopterMap) {
      try {
        const [prefs] = await db
          .select()
          .from(adopterNotificationPreferences)
          .where(and(
            eq(adopterNotificationPreferences.userId, userId),
            eq(adopterNotificationPreferences.tenantId, tenantId)
          ))
          .limit(1);

        const emailEnabled = prefs ? prefs.emailNotifications : true;
        const smsEnabled = prefs ? prefs.smsNotifications : false;
        const vaccinationEnabled = prefs ? prefs.vaccinationReminders : true;
        const medicationEnabled = prefs ? prefs.medicationReminders : true;
        const smsPhone = prefs?.phone || null;

        if (!emailEnabled && !smsEnabled) continue;

        let allItems: ComplianceItem[] = [];
        for (const pet of adopter.pets) {
          const petItems = await getComplianceItemsForAnimal(tenantId, pet.animalId, pet.animalName);
          allItems.push(...petItems);
        }

        allItems = allItems.filter(item => {
          if ((item.type.includes('vaccination') || item.type.includes('prevention')) && !vaccinationEnabled) return false;
          if (item.type.includes('medication') && !medicationEnabled) return false;
          return true;
        });

        const newItems: ComplianceItem[] = [];
        for (const item of allItems) {
          const alreadyNotified = await wasRecentlyNotified(tenantId, userId, item.itemId, item.type);
          if (!alreadyNotified) {
            newItems.push(item);
          }
        }

        if (newItems.length === 0) continue;

        if (emailEnabled) {
          try {
            const emailService = await EmailService.forTenant(tenantId);
            if (emailService) {
              const petPortalUrl = adopter.pets.length === 1
                ? buildPortalUrl(tenant, `/my-pets/${adopter.pets[0].animalId}`)
                : portalUrl;

              const emailResult = await emailService.send({
                to: adopter.email,
                subject: `Pet Care Reminder: ${newItems.length} item${newItems.length > 1 ? 's' : ''} need attention`,
                html: buildComplianceEmailHtml(adopter.name, tenant.name, newItems, petPortalUrl),
              });

              if (emailResult.success) {
                result.emailsSent++;
                for (const item of newItems) {
                  await db.insert(adopterNotificationLogs).values({
                    tenantId,
                    userId,
                    animalId: item.animalId,
                    notificationType: item.type,
                    channel: 'email',
                    subject: `Pet Care Reminder: ${item.itemName}`,
                    message: `${item.animalName} - ${item.itemName} ${item.type.includes('overdue') ? 'is overdue' : 'is due soon'} (${item.dueDate})`,
                    itemId: item.itemId,
                  });
                }
              } else {
                result.errors.push(`Email failed for ${adopter.email}: ${emailResult.error}`);
              }
            }
          } catch (emailErr) {
            result.errors.push(`Email error for ${adopter.email}: ${emailErr instanceof Error ? emailErr.message : 'Unknown'}`);
          }
        }

        if (smsEnabled && smsPhone) {
          try {
            const petPortalUrl = adopter.pets.length === 1
              ? buildPortalUrl(tenant, `/my-pets/${adopter.pets[0].animalId}`)
              : portalUrl;

            const smsMessage = buildComplianceSmsMessage(newItems, petPortalUrl);
            const smsResult = await sendSms(tenantId, smsPhone, smsMessage, 'reminder');

            if (smsResult.status === 'sent') {
              result.smsSent++;
              for (const item of newItems) {
                await db.insert(adopterNotificationLogs).values({
                  tenantId,
                  userId,
                  animalId: item.animalId,
                  notificationType: item.type,
                  channel: 'sms',
                  message: smsMessage,
                  itemId: item.itemId,
                });
              }
            } else {
              result.errors.push(`SMS failed for ${smsPhone}: ${smsResult.error}`);
            }
          } catch (smsErr) {
            result.errors.push(`SMS error for ${smsPhone}: ${smsErr instanceof Error ? smsErr.message : 'Unknown'}`);
          }
        }
      } catch (adopterErr) {
        result.errors.push(`Error processing adopter ${adopter.email}: ${adopterErr instanceof Error ? adopterErr.message : 'Unknown'}`);
      }
    }
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  return result;
}

export async function runAdopterComplianceForAllTenants(): Promise<{
  tenantsProcessed: number;
  totalEmailsSent: number;
  totalSmsSent: number;
  errors: string[];
}> {
  const activeTenants = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  let totalEmailsSent = 0;
  let totalSmsSent = 0;
  const errors: string[] = [];

  for (const tenant of activeTenants) {
    try {
      const result = await runAdopterComplianceNotifications(tenant.id);
      totalEmailsSent += result.emailsSent;
      totalSmsSent += result.smsSent;
      errors.push(...result.errors);
    } catch (error) {
      errors.push(`Tenant ${tenant.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    tenantsProcessed: activeTenants.length,
    totalEmailsSent,
    totalSmsSent,
    errors,
  };
}
