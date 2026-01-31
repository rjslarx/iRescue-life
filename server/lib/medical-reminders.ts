import { db } from "../db";
import { 
  tenants,
  animals,
  users,
  vaccineRecords,
  medicalPrescriptions,
  medicalExams,
  procedureLogs,
  fosterAnimals,
  medicalReminderSettings,
  medicalReminders,
  medicalReminderLogs,
  type MedicalReminderSettings,
  type MedicalReminder,
} from "@shared/schema";
import { eq, and, gte, lte, lt, isNull, or, inArray, desc } from "drizzle-orm";
import { EmailService } from "./email-service";

interface MedicalItem {
  id: string;
  animalId: string;
  animalName: string;
  animalStatus: string;
  itemName: string;
  dueDate: Date;
  sourceType: "vaccine" | "prescription" | "exam" | "procedure";
  assignedFosterId?: string | null;
  fosterName?: string | null;
  fosterEmail?: string | null;
}

interface ReminderDigest {
  overdue: MedicalItem[];
  dueSoon: MedicalItem[];
  upcoming: MedicalItem[];
}

export async function getMedicalReminderSettings(tenantId: string): Promise<MedicalReminderSettings | null> {
  const [settings] = await db
    .select()
    .from(medicalReminderSettings)
    .where(eq(medicalReminderSettings.tenantId, tenantId))
    .limit(1);
  
  return settings || null;
}

export async function createOrUpdateMedicalReminderSettings(
  tenantId: string, 
  data: Partial<MedicalReminderSettings>
): Promise<MedicalReminderSettings> {
  const existing = await getMedicalReminderSettings(tenantId);
  
  if (existing) {
    const [updated] = await db
      .update(medicalReminderSettings)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(medicalReminderSettings.tenantId, tenantId))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(medicalReminderSettings)
      .values({
        tenantId,
        ...data,
      })
      .returning();
    return created;
  }
}

export async function getUpcomingMedicalItems(tenantId: string, daysAhead: number = 14): Promise<MedicalItem[]> {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);
  
  const items: MedicalItem[] = [];
  
  // Get all active animals for this tenant
  const activeAnimals = await db
    .select({
      id: animals.id,
      name: animals.name,
      status: animals.status,
    })
    .from(animals)
    .where(and(
      eq(animals.tenantId, tenantId),
      or(
        eq(animals.status, "available"),
        eq(animals.status, "foster"),
        eq(animals.status, "hold"),
        eq(animals.status, "medical_hold")
      )
    ));
  
  const animalIds = activeAnimals.map(a => a.id);
  const animalMap = new Map(activeAnimals.map(a => [a.id, a]));
  
  if (animalIds.length === 0) return items;
  
  // Get current foster placements for foster animals
  const fosterPlacementsData = await db
    .select({
      animalId: fosterAnimals.animalId,
      fosterId: fosterAnimals.fosterId,
      fosterName: users.fullName,
      fosterEmail: users.email,
    })
    .from(fosterAnimals)
    .leftJoin(users, eq(fosterAnimals.fosterId, users.id))
    .where(and(
      eq(fosterAnimals.tenantId, tenantId),
      eq(fosterAnimals.status, "active"),
      inArray(fosterAnimals.animalId, animalIds)
    ));
  
  const fosterMap = new Map(fosterPlacementsData.map(f => [f.animalId, f]));
  
  // Get vaccines with upcoming due dates
  const vaccines = await db
    .select({
      id: vaccineRecords.id,
      animalId: vaccineRecords.animalId,
      itemName: vaccineRecords.itemName,
      dateDue: vaccineRecords.dateDue,
    })
    .from(vaccineRecords)
    .where(and(
      eq(vaccineRecords.tenantId, tenantId),
      inArray(vaccineRecords.animalId, animalIds),
      lte(vaccineRecords.dateDue, futureDate)
    ));
  
  for (const v of vaccines) {
    if (!v.dateDue) continue;
    const animal = animalMap.get(v.animalId);
    const foster = fosterMap.get(v.animalId);
    if (animal) {
      items.push({
        id: v.id,
        animalId: v.animalId,
        animalName: animal.name,
        animalStatus: animal.status,
        itemName: v.itemName,
        dueDate: v.dateDue,
        sourceType: "vaccine",
        assignedFosterId: foster?.fosterId,
        fosterName: foster?.fosterName,
        fosterEmail: foster?.fosterEmail,
      });
    }
  }
  
  // Get prescriptions with upcoming end dates
  const prescriptions = await db
    .select({
      id: medicalPrescriptions.id,
      animalId: medicalPrescriptions.animalId,
      medicationName: medicalPrescriptions.medicationName,
      endDate: medicalPrescriptions.endDate,
    })
    .from(medicalPrescriptions)
    .where(and(
      eq(medicalPrescriptions.tenantId, tenantId),
      inArray(medicalPrescriptions.animalId, animalIds),
      lte(medicalPrescriptions.endDate, futureDate)
    ));
  
  for (const p of prescriptions) {
    if (!p.endDate) continue;
    const animal = animalMap.get(p.animalId);
    const foster = fosterMap.get(p.animalId);
    if (animal) {
      items.push({
        id: p.id,
        animalId: p.animalId,
        animalName: animal.name,
        animalStatus: animal.status,
        itemName: `${p.medicationName} (prescription ending)`,
        dueDate: p.endDate,
        sourceType: "prescription",
        assignedFosterId: foster?.fosterId,
        fosterName: foster?.fosterName,
        fosterEmail: foster?.fosterEmail,
      });
    }
  }
  
  // Sort by due date
  items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  
  return items;
}

export async function getMedicalDigest(tenantId: string): Promise<ReminderDigest> {
  const now = new Date();
  const settings = await getMedicalReminderSettings(tenantId);
  const leadDays = settings?.vaccineLeadDays || 7;
  
  const items = await getUpcomingMedicalItems(tenantId, leadDays + 7);
  
  const overdue: MedicalItem[] = [];
  const dueSoon: MedicalItem[] = [];
  const upcoming: MedicalItem[] = [];
  
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const soonDate = new Date(todayStart);
  soonDate.setDate(soonDate.getDate() + 7);
  
  for (const item of items) {
    const dueDate = new Date(item.dueDate);
    if (dueDate < todayStart) {
      overdue.push(item);
    } else if (dueDate <= soonDate) {
      dueSoon.push(item);
    } else {
      upcoming.push(item);
    }
  }
  
  return { overdue, dueSoon, upcoming };
}

export async function generateMedicalReminderEmail(
  tenantId: string,
  digest: ReminderDigest,
  recipientName: string
): Promise<{ subject: string; html: string }> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  
  const orgName = tenant?.name || "Your Organization";
  const totalItems = digest.overdue.length + digest.dueSoon.length + digest.upcoming.length;
  
  const subject = digest.overdue.length > 0 
    ? `🔴 ${digest.overdue.length} Overdue Medical Item${digest.overdue.length > 1 ? 's' : ''} - ${orgName}`
    : `📋 Medical Reminder: ${totalItems} Item${totalItems > 1 ? 's' : ''} Need Attention - ${orgName}`;
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };
  
  const getDaysText = (date: Date) => {
    const now = new Date();
    const diff = Math.ceil((new Date(date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} overdue`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `In ${diff} days`;
  };
  
  const renderItem = (item: MedicalItem, isOverdue: boolean = false) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 8px; font-weight: 500;">${item.animalName}</td>
      <td style="padding: 12px 8px;">${item.itemName}</td>
      <td style="padding: 12px 8px; ${isOverdue ? 'color: #dc2626; font-weight: 600;' : ''}">${formatDate(item.dueDate)}</td>
      <td style="padding: 12px 8px; color: ${isOverdue ? '#dc2626' : '#6b7280'};">${getDaysText(item.dueDate)}</td>
      <td style="padding: 12px 8px;">${item.fosterName ? `Foster: ${item.fosterName}` : item.animalStatus === 'foster' ? 'In Foster' : 'In Shelter'}</td>
    </tr>
  `;
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
      <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #2563eb; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🏥 Medical Reminders</h1>
          <p style="color: #bfdbfe; margin: 8px 0 0 0;">${orgName}</p>
        </div>
        
        <div style="padding: 24px;">
          <p style="color: #374151; margin: 0 0 20px 0;">Hi ${recipientName},</p>
          <p style="color: #374151; margin: 0 0 24px 0;">Here's your daily medical reminder summary:</p>
  `;
  
  // Overdue section
  if (digest.overdue.length > 0) {
    html += `
      <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0;">
        <h2 style="color: #dc2626; margin: 0 0 16px 0; font-size: 18px;">🔴 Overdue (${digest.overdue.length})</h2>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 4px;">
          <thead>
            <tr style="background: #fef2f2; text-align: left;">
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Animal</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Item</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Due Date</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Status</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Location</th>
            </tr>
          </thead>
          <tbody>
            ${digest.overdue.map(item => renderItem(item, true)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  // Due soon section
  if (digest.dueSoon.length > 0) {
    html += `
      <div style="background: #fefce8; border-left: 4px solid #ca8a04; padding: 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0;">
        <h2 style="color: #ca8a04; margin: 0 0 16px 0; font-size: 18px;">🟡 Due This Week (${digest.dueSoon.length})</h2>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 4px;">
          <thead>
            <tr style="background: #fefce8; text-align: left;">
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Animal</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Item</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Due Date</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Status</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Location</th>
            </tr>
          </thead>
          <tbody>
            ${digest.dueSoon.map(item => renderItem(item)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  // Upcoming section
  if (digest.upcoming.length > 0) {
    html += `
      <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0;">
        <h2 style="color: #16a34a; margin: 0 0 16px 0; font-size: 18px;">🟢 Upcoming (${digest.upcoming.length})</h2>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 4px;">
          <thead>
            <tr style="background: #f0fdf4; text-align: left;">
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Animal</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Item</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Due Date</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Status</th>
              <th style="padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #6b7280;">Location</th>
            </tr>
          </thead>
          <tbody>
            ${digest.upcoming.map(item => renderItem(item)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  if (totalItems === 0) {
    html += `
      <div style="text-align: center; padding: 40px; color: #6b7280;">
        <p style="font-size: 48px; margin: 0;">✅</p>
        <p style="margin: 16px 0 0 0;">No medical items need attention right now!</p>
      </div>
    `;
  }
  
  html += `
        </div>
        
        <div style="background: #f3f4f6; padding: 16px; text-align: center; color: #6b7280; font-size: 14px;">
          <p style="margin: 0;">This is an automated reminder from ${orgName}.</p>
          <p style="margin: 8px 0 0 0;">Manage notification settings in your dashboard.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, html };
}

export async function generateFosterReminderEmail(
  tenantId: string,
  fosterItems: MedicalItem[],
  fosterName: string
): Promise<{ subject: string; html: string }> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  
  const orgName = tenant?.name || "Your Organization";
  const overdueItems = fosterItems.filter(item => new Date(item.dueDate) < new Date());
  
  const subject = overdueItems.length > 0
    ? `🔴 Action Needed: ${overdueItems.length} Overdue Medical Item${overdueItems.length > 1 ? 's' : ''} for Your Foster Pet${fosterItems.length > 1 ? 's' : ''}`
    : `📋 Medical Reminder for Your Foster Pet${fosterItems.length > 1 ? 's' : ''} - ${orgName}`;
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #7c3aed; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">💊 Foster Pet Medical Reminder</h1>
          <p style="color: #c4b5fd; margin: 8px 0 0 0;">${orgName}</p>
        </div>
        
        <div style="padding: 24px;">
          <p style="color: #374151; margin: 0 0 20px 0;">Hi ${fosterName},</p>
          <p style="color: #374151; margin: 0 0 24px 0;">This is a friendly reminder about upcoming medical needs for your foster pet${fosterItems.length > 1 ? 's' : ''}:</p>
          
          <div style="background: #f5f3ff; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
  `;
  
  for (const item of fosterItems) {
    const isOverdue = new Date(item.dueDate) < new Date();
    html += `
      <div style="background: white; border-radius: 4px; padding: 16px; margin-bottom: 12px; border-left: 4px solid ${isOverdue ? '#dc2626' : '#7c3aed'};">
        <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${item.animalName}</div>
        <div style="color: #6b7280; margin-bottom: 4px;">${item.itemName}</div>
        <div style="color: ${isOverdue ? '#dc2626' : '#7c3aed'}; font-weight: 500;">
          ${isOverdue ? '⚠️ Overdue - was due ' : '📅 Due '} ${formatDate(item.dueDate)}
        </div>
      </div>
    `;
  }
  
  html += `
          </div>
          
          <p style="color: #374151; margin: 0 0 16px 0;">
            <strong>What to do:</strong>
          </p>
          <ul style="color: #374151; margin: 0 0 24px 0; padding-left: 20px;">
            <li style="margin-bottom: 8px;">For vaccines: Please schedule an appointment with your vet or contact us for assistance.</li>
            <li style="margin-bottom: 8px;">For medications: Ensure you have enough supply and administer as directed.</li>
            <li>If you have any questions, please reach out to us!</li>
          </ul>
          
          <p style="color: #6b7280; font-size: 14px; margin: 0;">
            Thank you for being an amazing foster parent! 💜
          </p>
        </div>
        
        <div style="background: #f3f4f6; padding: 16px; text-align: center; color: #6b7280; font-size: 14px;">
          <p style="margin: 0;">Questions? Reply to this email or contact ${orgName}.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, html };
}

export async function sendMedicalReminders(tenantId: string): Promise<{
  success: boolean;
  emailsSent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let emailsSent = 0;
  
  try {
    const settings = await getMedicalReminderSettings(tenantId);
    
    // If settings don't exist or reminders are disabled, skip
    if (!settings || !settings.isEnabled) {
      return { success: true, emailsSent: 0, errors: [] };
    }
    
    const digest = await getMedicalDigest(tenantId);
    const totalItems = digest.overdue.length + digest.dueSoon.length + digest.upcoming.length;
    
    // If no items, skip
    if (totalItems === 0) {
      return { success: true, emailsSent: 0, errors: [] };
    }
    
    // Get email service
    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      return { success: false, emailsSent: 0, errors: ["Email service not configured"] };
    }
    
    // Get recipients based on settings
    const recipients: { email: string; name: string; role: "admin" | "staff" | "foster" }[] = [];
    
    if (settings.notifyAdmins || settings.notifyStaff) {
      const staffUsers = await db
        .select({
          email: users.email,
          fullName: users.fullName,
          roles: users.roles,
        })
        .from(users)
        .where(and(
          eq(users.tenantId, tenantId),
          eq(users.isActive, true)
        ));
      
      for (const user of staffUsers) {
        const isAdmin = user.roles.includes("admin");
        const isStaff = user.roles.includes("staff");
        
        if ((settings.notifyAdmins && isAdmin) || (settings.notifyStaff && isStaff)) {
          recipients.push({
            email: user.email,
            name: user.fullName,
            role: isAdmin ? "admin" : "staff",
          });
        }
      }
    }
    
    // Send digest emails to staff/admins
    if (settings.sendDailyDigest && recipients.length > 0) {
      for (const recipient of recipients) {
        try {
          const { subject, html } = await generateMedicalReminderEmail(
            tenantId,
            digest,
            recipient.name
          );
          
          const result = await emailService.send({
            to: recipient.email,
            subject,
            html,
          });
          
          if (result.success) {
            emailsSent++;
            
            // Log the email
            await db.insert(medicalReminderLogs).values({
              tenantId,
              recipientEmail: recipient.email,
              recipientName: recipient.name,
              recipientRole: recipient.role,
              emailType: "digest",
              subject,
              messageId: result.messageId,
              status: "sent",
            });
          } else {
            errors.push(`Failed to send to ${recipient.email}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`Error sending to ${recipient.email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    // Send foster-specific emails
    if (settings.notifyFosters) {
      // Group items by foster
      const fosterItems = new Map<string, { email: string; name: string; items: MedicalItem[] }>();
      
      for (const item of [...digest.overdue, ...digest.dueSoon]) {
        if (item.assignedFosterId && item.fosterEmail && item.fosterName) {
          if (!fosterItems.has(item.assignedFosterId)) {
            fosterItems.set(item.assignedFosterId, {
              email: item.fosterEmail,
              name: item.fosterName,
              items: [],
            });
          }
          fosterItems.get(item.assignedFosterId)!.items.push(item);
        }
      }
      
      // Send email to each foster
      for (const [fosterId, fosterData] of fosterItems) {
        try {
          const { subject, html } = await generateFosterReminderEmail(
            tenantId,
            fosterData.items,
            fosterData.name
          );
          
          const result = await emailService.send({
            to: fosterData.email,
            subject,
            html,
          });
          
          if (result.success) {
            emailsSent++;
            
            await db.insert(medicalReminderLogs).values({
              tenantId,
              recipientEmail: fosterData.email,
              recipientName: fosterData.name,
              recipientRole: "foster",
              emailType: "foster_confirmation",
              subject,
              messageId: result.messageId,
              status: "sent",
            });
          } else {
            errors.push(`Failed to send to foster ${fosterData.email}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`Error sending to foster ${fosterData.email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    return { success: errors.length === 0, emailsSent, errors };
  } catch (error) {
    return {
      success: false,
      emailsSent,
      errors: [...errors, error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

export async function runMedicalRemindersForAllTenants(): Promise<{
  tenantsProcessed: number;
  totalEmailsSent: number;
  errors: string[];
}> {
  let tenantsProcessed = 0;
  let totalEmailsSent = 0;
  const errors: string[] = [];
  
  try {
    // Get all active tenants
    const activeTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.isActive, true));
    
    for (const tenant of activeTenants) {
      try {
        const result = await sendMedicalReminders(tenant.id);
        tenantsProcessed++;
        totalEmailsSent += result.emailsSent;
        
        if (result.errors.length > 0) {
          errors.push(`Tenant ${tenant.name}: ${result.errors.join(', ')}`);
        }
      } catch (error) {
        errors.push(`Tenant ${tenant.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return { tenantsProcessed, totalEmailsSent, errors };
  } catch (error) {
    return {
      tenantsProcessed,
      totalEmailsSent,
      errors: [...errors, error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Get upcoming preventative care items for a tenant
 * Returns items grouped by urgency (overdue, dueToday, comingSoon)
 */
export async function getPreventativeCareReminders(tenantId: string, daysAhead: number = 7) {
  const { preventativeCareRecords, preventativeCareTypes, animals: animalsTable, fosterAnimals: fosterAnimalsTable, users: usersTable } = await import('@shared/schema');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);
  futureDate.setHours(23, 59, 59, 999);

  // Get all preventative care records with next due date within range or overdue
  const records = await db
    .select({
      record: preventativeCareRecords,
      type: preventativeCareTypes,
      animal: {
        id: animalsTable.id,
        name: animalsTable.name,
        species: animalsTable.species,
        status: animalsTable.status,
        location: animalsTable.location,
      },
    })
    .from(preventativeCareRecords)
    .innerJoin(preventativeCareTypes, eq(preventativeCareRecords.careTypeId, preventativeCareTypes.id))
    .innerJoin(animalsTable, eq(preventativeCareRecords.animalId, animalsTable.id))
    .where(and(
      eq(preventativeCareRecords.tenantId, tenantId),
      lte(preventativeCareRecords.nextDueDate, futureDate),
      or(
        eq(animalsTable.status, 'available'),
        eq(animalsTable.status, 'foster'),
        eq(animalsTable.status, 'hold'),
        eq(animalsTable.status, 'medical_hold')
      )
    ))
    .orderBy(preventativeCareRecords.nextDueDate);

  // Get foster assignments for foster animals
  const fosterAnimalIds = records
    .filter(r => r.animal.location === 'foster')
    .map(r => r.animal.id);

  const fosterAssignments = fosterAnimalIds.length > 0
    ? await db
        .select({
          animalId: fosterAnimalsTable.animalId,
          userId: fosterAnimalsTable.userId,
          userEmail: usersTable.email,
          userName: usersTable.name,
        })
        .from(fosterAnimalsTable)
        .innerJoin(usersTable, eq(fosterAnimalsTable.userId, usersTable.id))
        .where(and(
          inArray(fosterAnimalsTable.animalId, fosterAnimalIds),
          eq(fosterAnimalsTable.status, 'active')
        ))
    : [];

  const fosterMap = new Map(fosterAssignments.map(f => [f.animalId, f]));

  interface PreventativeCareReminderItem {
    recordId: string;
    animalId: string;
    animalName: string;
    careName: string;
    careCategory: string;
    nextDueDate: Date;
    isCore: boolean;
    location: string | null;
    fosterEmail?: string;
    fosterName?: string;
  }

  const items: PreventativeCareReminderItem[] = records.map(r => {
    const foster = fosterMap.get(r.animal.id);
    return {
      recordId: r.record.id,
      animalId: r.animal.id,
      animalName: r.animal.name,
      careName: r.type.name,
      careCategory: r.type.category,
      nextDueDate: new Date(r.record.nextDueDate!),
      isCore: r.type.isCore,
      location: r.animal.location,
      fosterEmail: foster?.userEmail,
      fosterName: foster?.userName,
    };
  });

  const overdue: PreventativeCareReminderItem[] = [];
  const dueToday: PreventativeCareReminderItem[] = [];
  const comingSoon: PreventativeCareReminderItem[] = [];

  items.forEach(item => {
    const dueDate = new Date(item.nextDueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    if (dueDate < today) {
      overdue.push(item);
    } else if (dueDate.getTime() === today.getTime()) {
      dueToday.push(item);
    } else {
      comingSoon.push(item);
    }
  });

  return { overdue, dueToday, comingSoon };
}
