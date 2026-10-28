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
  adopterComplianceConfirmations,
  complianceObligations,
  vaccineRecords,
  adoptions,
  smsMessageLogs,
} from '@shared/schema';
import { eq, and, lte, sql, desc, isNull, gte, lt, isNotNull, like } from 'drizzle-orm';
import { sendCommunication } from './unified-comms';
import { getLatestVaccineExpiries } from '../services/portal-rabies-coverage';
import { reminderVaccineFamily, vaccineReminderCovered, vaccineReminderDeadline } from './vaccine-renewal-coverage';

interface NotificationResult {
  tenantId: string;
  tenantName: string;
  emailsSent: number;
  smsSent: number;
  errors: string[];
}

import { getAppBaseUrl } from './app-base-url';

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

export async function getComplianceItemsForAnimal(tenantId: string, animalId: string, animalName: string): Promise<ComplianceItem[]> {
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

  // Skip items the adopter has already submitted proof for: a confirmation in
  // pending_review or approved means the staff has (or will) review it — the
  // adopter shouldn't keep getting overdue emails in the meantime. Mirrors the
  // portal's own due-care filtering in server/routes/adopterPortal.ts.
  const existingConfirmations = await db
    .select({ preventativeCareRecordId: adopterComplianceConfirmations.preventativeCareRecordId })
    .from(adopterComplianceConfirmations)
    .where(and(
      eq(adopterComplianceConfirmations.tenantId, tenantId),
      eq(adopterComplianceConfirmations.animalId, animalId),
      sql`${adopterComplianceConfirmations.status} IN ('pending_review', 'approved')`
    ));
  const confirmedRecordIds = new Set(existingConfirmations.map(c => c.preventativeCareRecordId));
  const vaccineExpiries = await getLatestVaccineExpiries(tenantId, animalId);
  const includedRenewals = new Set<string>();

  for (const record of careRecords) {
    if (!record.nextDueDate) continue;
    if (confirmedRecordIds.has(record.id)) continue;
    const isVaccine = record.careCategory === 'vaccine';
    const storedDate = new Date(record.nextDueDate);
    const rawDate = isVaccine
      ? vaccineReminderDeadline(record.careName || '', storedDate, vaccineExpiries)
      : storedDate;
    if (rawDate > threeDaysFromNow) continue;
    // Multiple historical doses/placeholders may now resolve to one renewal.
    if (isVaccine) {
      const renewalKey = `${reminderVaccineFamily(record.careName || '')}|${rawDate.getTime()}`;
      if (includedRenewals.has(renewalKey)) continue;
      includedRenewals.add(renewalKey);
    }
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

async function wasRecentlyNotified(tenantId: string, userId: string, itemId: string, type: string, frequencyDays: number = 1): Promise<boolean> {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - Math.max(1, frequencyDays));

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
        adopterReminderFrequencyDays: tenants.adopterReminderFrequencyDays,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      result.errors.push('Tenant not found');
      return result;
    }

    // Tenant-configurable cadence: 0 = paused, N = min days between repeat
    // reminders for the same item (default 1 = daily while due/overdue).
    const reminderFrequencyDays = tenant.adopterReminderFrequencyDays ?? 1;
    if (reminderFrequencyDays === 0) {
      result.tenantName = tenant.name;
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
          const alreadyNotified = await wasRecentlyNotified(tenantId, userId, item.itemId, item.type, reminderFrequencyDays);
          if (!alreadyNotified) {
            newItems.push(item);
          }
        }

        if (newItems.length === 0) continue;

        if (emailEnabled) {
          try {
            const petPortalUrl = adopter.pets.length === 1
              ? buildPortalUrl(tenant, `/my-pets/${adopter.pets[0].animalId}`)
              : portalUrl;

            const emailResult = await sendCommunication({
              tenantId,
              channel: 'email',
              sourceType: 'compliance',
              recipientUserId: userId,
              recipientAddress: adopter.email,
              recipientName: adopter.name,
              relatedAnimalId: newItems.length === 1 ? newItems[0].animalId : null,
              subject: `Pet Care Reminder: ${newItems.length} item${newItems.length > 1 ? 's' : ''} need attention`,
              messageBody: buildComplianceEmailHtml(adopter.name, tenant.name, newItems, petPortalUrl),
            });

            if (emailResult.status === 'delivered') {
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
                  messageQueueId: emailResult.messageQueueId,
                });
              }
            } else {
              result.errors.push(`Email failed for ${adopter.email}: ${emailResult.error}`);
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
            const smsResult = await sendCommunication({
              tenantId,
              channel: 'sms',
              sourceType: 'reminder',
              recipientUserId: userId,
              recipientAddress: smsPhone,
              recipientName: adopter.name,
              relatedAnimalId: newItems.length === 1 ? newItems[0].animalId : null,
              messageBody: smsMessage,
            });

            if (smsResult.status === 'delivered') {
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
                  messageQueueId: smsResult.messageQueueId,
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

// ─── T003: Spay/Neuter 14-Day Warning SMS ───────────────────────────────────

export async function sendSpayNeuterWarnings(tenantId: string): Promise<{ sent: number; errors: string[] }> {
  const result = { sent: 0, errors: [] as string[] };

  try {
    const today = new Date();
    const warningStart = new Date(today);
    warningStart.setDate(warningStart.getDate() + 14);
    warningStart.setHours(0, 0, 0, 0);
    const warningEnd = new Date(warningStart);
    warningEnd.setHours(23, 59, 59, 999);

    // contractualDueDate is stored as text (ISO date string) — compare lexicographically
    const warningStartStr = warningStart.toISOString().split('T')[0];
    const warningEndStr = warningEnd.toISOString().split('T')[0];

    const obligations = await db
      .select({
        id: complianceObligations.id,
        animalId: complianceObligations.animalId,
        adopterName: complianceObligations.adopterName,
        adopterPhone: complianceObligations.adopterPhone,
        contractualDueDate: complianceObligations.contractualDueDate,
        animalName: animals.name,
      })
      .from(complianceObligations)
      .innerJoin(animals, eq(animals.id, complianceObligations.animalId))
      .where(and(
        eq(complianceObligations.tenantId, tenantId),
        eq(complianceObligations.obligationType, 'spay_neuter'),
        eq(complianceObligations.status, 'pending'),
        gte(complianceObligations.contractualDueDate, warningStartStr),
        lte(complianceObligations.contractualDueDate, warningEndStr),
      ));

    const [tenantRecord] = await db
      .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    for (const obligation of obligations) {
      if (!obligation.adopterPhone) continue;

      try {
        // Dedup: skip if we sent a spay/neuter warning to this number in last 3 days
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const recentLog = await db
          .select({ id: smsMessageLogs.id })
          .from(smsMessageLogs)
          .where(and(
            eq(smsMessageLogs.tenantId, tenantId),
            eq(smsMessageLogs.direction, 'outbound'),
            eq(smsMessageLogs.toNumber, obligation.adopterPhone),
            gte(smsMessageLogs.createdAt, threeDaysAgo),
            like(smsMessageLogs.body, `%${obligation.animalName}%`),
            like(smsMessageLogs.body, '%spay/neuter%'),
          ))
          .limit(1);

        if (recentLog.length > 0) continue;

        const portalUrl = tenantRecord
          ? buildPortalUrl(tenantRecord, '/my-pets')
          : 'https://irescue.life/my-pets';

        const firstName = obligation.adopterName.split(' ')[0];
        const formattedDate = new Date(obligation.contractualDueDate).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        });

        const message = `Hi ${firstName}! A reminder from the rescue that ${obligation.animalName}'s spay/neuter procedure is required by ${formattedDate}. Please upload a photo of your vet receipt in your Adopter Portal: ${portalUrl}`;

        await sendCommunication({
          tenantId,
          channel: 'sms',
          sourceType: 'compliance',
          recipientAddress: obligation.adopterPhone,
          recipientName: obligation.adopterName,
          relatedAnimalId: obligation.animalId,
          messageBody: message,
        });

        result.sent++;
        console.log(`[SpayNeuterWarning] Sent 14-day SMS to ${obligation.adopterPhone} for ${obligation.animalName}`);
      } catch (err) {
        result.errors.push(`Obligation ${obligation.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  } catch (err) {
    result.errors.push(`Tenant ${tenantId}: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return result;
}

export async function sendSpayNeuterWarningsForAllTenants(): Promise<{ sent: number; errors: string[] }> {
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  let totalSent = 0;
  const allErrors: string[] = [];

  for (const tenant of activeTenants) {
    try {
      const r = await sendSpayNeuterWarnings(tenant.id);
      totalSent += r.sent;
      allErrors.push(...r.errors);
    } catch (err) {
      allErrors.push(`Tenant ${tenant.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return { sent: totalSent, errors: allErrors };
}

// ─── T005: Annual Vaccine Planning Reminder SMS (11-month mark) ─────────────

export async function sendAnnualVaccineReminders(tenantId: string): Promise<{ sent: number; errors: string[] }> {
  const result = { sent: 0, errors: [] as string[] };

  try {
    const today = new Date();
    // 30-day lookahead window centered on 11 months after a 1-year vaccine was given
    const dueStart = new Date(today);
    dueStart.setDate(dueStart.getDate() + 25);
    dueStart.setHours(0, 0, 0, 0);
    const dueEnd = new Date(today);
    dueEnd.setDate(dueEnd.getDate() + 35);
    dueEnd.setHours(23, 59, 59, 999);

    // Find 1-year vaccines due in the window for adopted animals
    const dueVaccines = await db
      .select({
        vaccineId: vaccineRecords.id,
        animalId: vaccineRecords.animalId,
        itemName: vaccineRecords.itemName,
        dateDue: vaccineRecords.dateDue,
        animalName: animals.name,
        adopterName: adoptions.adopterName,
        adopterPhone: adoptions.adopterPhone,
        adopterEmail: adoptions.adopterEmail,
      })
      .from(vaccineRecords)
      .innerJoin(animals, and(
        eq(animals.id, vaccineRecords.animalId),
        eq(animals.tenantId, tenantId),
        eq(animals.status, 'adopted'),
      ))
      .innerJoin(adoptions, and(eq(adoptions.animalId, vaccineRecords.animalId), eq(adoptions.tenantId, tenantId)))
      .where(and(
        eq(vaccineRecords.tenantId, tenantId),
        eq(vaccineRecords.validDurationMonths, 12),
        isNotNull(vaccineRecords.dateDue),
        gte(vaccineRecords.dateDue, dueStart),
        lte(vaccineRecords.dateDue, dueEnd),
      ));

    for (const vaccine of dueVaccines) {
      if (!vaccine.adopterPhone) continue;

      try {
        const expiries = await getLatestVaccineExpiries(tenantId, vaccine.animalId);
        if (vaccineReminderCovered(vaccine.itemName, vaccine.dateDue, expiries)) continue;
        // Dedup: skip if we sent an annual vaccine reminder to this phone in last 20 days
        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

        const recentLog = await db
          .select({ id: smsMessageLogs.id })
          .from(smsMessageLogs)
          .where(and(
            eq(smsMessageLogs.tenantId, tenantId),
            eq(smsMessageLogs.direction, 'outbound'),
            eq(smsMessageLogs.toNumber, vaccine.adopterPhone),
            gte(smsMessageLogs.createdAt, twentyDaysAgo),
            like(smsMessageLogs.body, `%${vaccine.animalName}%`),
            like(smsMessageLogs.body, '%annual vet%'),
          ))
          .limit(1);

        if (recentLog.length > 0) continue;

        const firstName = vaccine.adopterName.split(' ')[0];
        const message = `Hi ${firstName}! It's been almost a year since ${vaccine.animalName} was adopted. This is a friendly reminder that they'll be due for their annual vet checkup and vaccines next month! Please schedule an appointment with your vet soon.`;

        await sendCommunication({
          tenantId,
          channel: 'sms',
          sourceType: 'reminder',
          recipientAddress: vaccine.adopterPhone,
          recipientName: vaccine.adopterName,
          relatedAnimalId: vaccine.animalId,
          messageBody: message,
        });

        result.sent++;
        console.log(`[AnnualVaccine] Sent reminder to ${vaccine.adopterPhone} for ${vaccine.animalName}`);
      } catch (err) {
        result.errors.push(`Vaccine ${vaccine.vaccineId}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  } catch (err) {
    result.errors.push(`Tenant ${tenantId}: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return result;
}

// ─── Spay/Neuter Breach Escalation ──────────────────────────────────────────

export async function escalateOverdueSpayNeuter(tenantId: string): Promise<{ escalated: number; notified: number; errors: string[] }> {
  const result = { escalated: 0, notified: 0, errors: [] as string[] };

  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const overdueObligations = await db
      .select({
        id: complianceObligations.id,
        animalId: complianceObligations.animalId,
        adopterName: complianceObligations.adopterName,
        adopterEmail: complianceObligations.adopterEmail,
        adopterPhone: complianceObligations.adopterPhone,
        contractualDueDate: complianceObligations.contractualDueDate,
        animalName: animals.name,
      })
      .from(complianceObligations)
      .innerJoin(animals, eq(animals.id, complianceObligations.animalId))
      .where(and(
        eq(complianceObligations.tenantId, tenantId),
        eq(complianceObligations.obligationType, 'spay_neuter'),
        eq(complianceObligations.status, 'pending'),
        isNull(complianceObligations.proofDocumentUrl),
        lt(complianceObligations.contractualDueDate, todayStr),
      ));

    if (overdueObligations.length === 0) return result;

    const [tenantRecord] = await db
      .select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    for (const obligation of overdueObligations) {
      try {
        await db
          .update(complianceObligations)
          .set({ status: 'overdue', updatedAt: new Date() })
          .where(eq(complianceObligations.id, obligation.id));
        result.escalated++;
        console.log(`[SpayNeuterBreach] Escalated obligation ${obligation.id} for ${obligation.animalName} to overdue`);

        const portalUrl = tenantRecord
          ? buildPortalUrl(tenantRecord, '/my-pets')
          : 'https://irescue.life/my-pets';
        const firstName = obligation.adopterName.split(' ')[0];
        const formattedDate = new Date(obligation.contractualDueDate).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        });

        // Dedup: skip if we already sent a breach notification to this phone in the last 7 days
        let skipSms = false;
        let skipEmail = false;
        if (obligation.adopterPhone) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const recentSms = await db
            .select({ id: smsMessageLogs.id })
            .from(smsMessageLogs)
            .where(and(
              eq(smsMessageLogs.tenantId, tenantId),
              eq(smsMessageLogs.direction, 'outbound'),
              eq(smsMessageLogs.toNumber, obligation.adopterPhone),
              gte(smsMessageLogs.createdAt, sevenDaysAgo),
              like(smsMessageLogs.body, '%spay/neuter was due%'),
            ))
            .limit(1);
          if (recentSms.length > 0) skipSms = true;
        }

        const recentNotif = await db
          .select({ id: adopterNotificationLogs.id })
          .from(adopterNotificationLogs)
          .where(and(
            eq(adopterNotificationLogs.tenantId, tenantId),
            eq(adopterNotificationLogs.animalId, obligation.animalId),
            eq(adopterNotificationLogs.notificationType, 'spay_neuter_breach'),
            sql`${adopterNotificationLogs.sentAt} > NOW() - INTERVAL '7 days'`,
          ))
          .limit(1);
        if (recentNotif.length > 0) skipEmail = true;

        const breachMessage = `Important: ${obligation.animalName}'s spay/neuter procedure was due on ${formattedDate} and we haven't received proof yet. Please upload a photo of your vet receipt in your Adopter Portal: ${portalUrl} — or contact us if you need help scheduling.`;

        if (obligation.adopterPhone && !skipSms) {
          try {
            await sendCommunication({
              tenantId,
              channel: 'sms',
              sourceType: 'compliance',
              recipientAddress: obligation.adopterPhone,
              recipientName: obligation.adopterName,
              relatedAnimalId: obligation.animalId,
              messageBody: breachMessage,
            });
            result.notified++;
          } catch (smsErr) {
            result.errors.push(`SMS breach notification failed for ${obligation.adopterPhone}: ${smsErr instanceof Error ? smsErr.message : 'Unknown'}`);
          }
        }

        if (obligation.adopterEmail && !skipEmail) {
          try {
            const breachEmailHtml = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #374151;">
                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                      <h2 style="color: #dc2626; margin: 0 0 12px 0;">Spay/Neuter Compliance Overdue</h2>
                      <p>Hi ${firstName},</p>
                      <p>Our records show that <strong>${obligation.animalName}</strong>'s spay/neuter procedure was required by <strong>${formattedDate}</strong>, and we haven't received proof of completion yet.</p>
                      <p>This is a contractual requirement of your adoption agreement. Please:</p>
                      <ol>
                        <li>Schedule the procedure with your veterinarian if not already done</li>
                        <li>Upload a photo of the vet receipt to your Adopter Portal</li>
                      </ol>
                    </div>
                    <div style="text-align: center; margin: 24px 0;">
                      <a href="${portalUrl}" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
                        Upload Proof Now
                      </a>
                    </div>
                    <p style="font-size: 13px; color: #6b7280;">If you need help scheduling or have questions, please contact us at ${tenantRecord?.name || 'the rescue'}. We're here to help!</p>
                  </div>
                `;

            const emailRes = await sendCommunication({
              tenantId,
              channel: 'email',
              sourceType: 'compliance',
              recipientAddress: obligation.adopterEmail,
              recipientName: obligation.adopterName,
              relatedAnimalId: obligation.animalId,
              subject: `Spay/Neuter Compliance Overdue: ${obligation.animalName}`,
              messageBody: breachEmailHtml,
            });

            if (emailRes.status === 'delivered') {
              await db.insert(adopterNotificationLogs).values({
                tenantId,
                userId: '',
                animalId: obligation.animalId,
                notificationType: 'spay_neuter_breach',
                channel: 'email',
                subject: `Spay/Neuter Compliance Overdue: ${obligation.animalName}`,
                message: breachMessage,
                itemId: obligation.id,
                messageQueueId: emailRes.messageQueueId,
              });
              result.notified++;
            } else {
              result.errors.push(`Email breach notification failed for ${obligation.adopterEmail}: ${emailRes.error}`);
            }
          } catch (emailErr) {
            result.errors.push(`Email breach notification failed for ${obligation.adopterEmail}: ${emailErr instanceof Error ? emailErr.message : 'Unknown'}`);
          }
        }
      } catch (err) {
        result.errors.push(`Obligation ${obligation.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  } catch (err) {
    result.errors.push(`Tenant ${tenantId}: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return result;
}

export async function escalateOverdueSpayNeuterForAllTenants(): Promise<{ escalated: number; notified: number; errors: string[] }> {
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  let totalEscalated = 0;
  let totalNotified = 0;
  const allErrors: string[] = [];

  for (const tenant of activeTenants) {
    try {
      const r = await escalateOverdueSpayNeuter(tenant.id);
      totalEscalated += r.escalated;
      totalNotified += r.notified;
      allErrors.push(...r.errors);
    } catch (err) {
      allErrors.push(`Tenant ${tenant.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return { escalated: totalEscalated, notified: totalNotified, errors: allErrors };
}

export async function sendAnnualVaccineRemindersForAllTenants(): Promise<{ sent: number; errors: string[] }> {
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  let totalSent = 0;
  const allErrors: string[] = [];

  for (const tenant of activeTenants) {
    try {
      const r = await sendAnnualVaccineReminders(tenant.id);
      totalSent += r.sent;
      allErrors.push(...r.errors);
    } catch (err) {
      allErrors.push(`Tenant ${tenant.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return { sent: totalSent, errors: allErrors };
}
