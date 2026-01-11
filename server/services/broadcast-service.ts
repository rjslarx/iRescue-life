import { db } from "../db";
import { 
  broadcasts, 
  broadcastRecipients, 
  broadcastTemplates,
  users,
  pushSubscriptions,
  type Broadcast,
  type BroadcastTemplate,
  type InsertBroadcast,
  type InsertBroadcastRecipient,
} from "@shared/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { PushNotificationService } from "./push-notifications";
import { sendSms, isTwilioEnabled } from "../lib/twilio-service";
import webpush from 'web-push';

type TargetRole = "admin" | "board_member" | "staff" | "foster" | "volunteer";
type Channel = "push" | "sms" | "email";

interface BroadcastRequest {
  tenantId: string;
  title: string;
  message: string;
  channels: Channel[];
  targetRoles?: TargetRole[];
  targetUserIds?: string[];
  templateId?: string;
  sentBy: { id: string; name: string };
}

interface BroadcastResult {
  broadcastId: string;
  totalRecipients: number;
  results: {
    push: { sent: number; failed: number };
    sms: { sent: number; failed: number };
    email: { sent: number; failed: number };
  };
}

export class BroadcastService {
  static async sendBroadcast(request: BroadcastRequest): Promise<BroadcastResult> {
    const { tenantId, title, message, channels, targetRoles, targetUserIds, templateId, sentBy } = request;

    if (templateId) {
      const [template] = await db.select()
        .from(broadcastTemplates)
        .where(and(
          eq(broadcastTemplates.id, templateId),
          eq(broadcastTemplates.tenantId, tenantId)
        ));
      
      if (!template) {
        throw new Error('Template not found or does not belong to this organization');
      }
    }

    let targetUsers: { id: string; fullName: string; email: string; phone?: string | null; roles: string[] }[] = [];

    if (targetUserIds && targetUserIds.length > 0) {
      targetUsers = await db.select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        roles: users.roles,
      })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        inArray(users.id, targetUserIds)
      ));
    } else if (targetRoles && targetRoles.length > 0) {
      const allUsers = await db.select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        roles: users.roles,
      })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true)
      ));

      targetUsers = allUsers.filter(user => 
        user.roles.some(role => targetRoles.includes(role as TargetRole))
      );
    }

    if (targetUsers.length === 0) {
      throw new Error('No recipients found matching the selected roles. Please select different roles or verify users exist with those roles.');
    }

    const [broadcast] = await db.insert(broadcasts).values({
      tenantId,
      templateId,
      title,
      message,
      channels,
      targetRoles,
      targetUserIds,
      status: 'sending',
      sentBy: sentBy.id,
      sentByName: sentBy.name,
    }).returning();

    const results = {
      push: { sent: 0, failed: 0 },
      sms: { sent: 0, failed: 0 },
      email: { sent: 0, failed: 0 },
    };

    for (const user of targetUsers) {
      const recipientData: InsertBroadcastRecipient = {
        broadcastId: broadcast.id,
        userId: user.id,
        userName: user.fullName,
        userEmail: user.email,
        userPhone: user.phone || undefined,
      };

      if (channels.includes('push')) {
        const pushResult = await this.sendPushToUser(user.id, { title, body: message });
        recipientData.pushStatus = pushResult.success ? 'sent' : (pushResult.notSubscribed ? 'not_subscribed' : 'failed');
        recipientData.pushSentAt = pushResult.success ? new Date() : undefined;
        recipientData.pushError = pushResult.error;
        
        if (pushResult.success) results.push.sent++;
        else if (!pushResult.notSubscribed) results.push.failed++;
      }

      if (channels.includes('sms') && user.phone) {
        const smsResult = await sendSms(
          tenantId,
          user.phone,
          `${title}: ${message}`,
          'broadcast',
          { sentBy }
        );
        recipientData.smsStatus = smsResult.status === 'sent' ? 'sent' : 'failed';
        recipientData.smsSentAt = smsResult.status === 'sent' ? new Date() : undefined;
        recipientData.smsError = smsResult.error;
        recipientData.smsSid = smsResult.sid;
        
        if (smsResult.status === 'sent') results.sms.sent++;
        else results.sms.failed++;
      } else if (channels.includes('sms') && !user.phone) {
        recipientData.smsStatus = 'no_phone';
      }

      await db.insert(broadcastRecipients).values(recipientData);
    }

    const finalStatus = this.determineStatus(results, channels);
    
    await db.update(broadcasts)
      .set({
        status: finalStatus,
        totalRecipients: targetUsers.length,
        pushSent: results.push.sent,
        pushFailed: results.push.failed,
        smsSent: results.sms.sent,
        smsFailed: results.sms.failed,
        emailSent: results.email.sent,
        emailFailed: results.email.failed,
        sentAt: new Date(),
      })
      .where(eq(broadcasts.id, broadcast.id));

    return {
      broadcastId: broadcast.id,
      totalRecipients: targetUsers.length,
      results,
    };
  }

  private static async sendPushToUser(userId: string, payload: { title: string; body: string }): Promise<{ success: boolean; notSubscribed?: boolean; error?: string }> {
    try {
      const subscriptions = await db.query.pushSubscriptions.findMany({
        where: and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.isEnabled, true)
        ),
      });

      if (subscriptions.length === 0) {
        return { success: false, notSubscribed: true };
      }

      let anySent = false;
      let lastError: string | undefined;

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            JSON.stringify({
              title: payload.title,
              body: payload.body,
              icon: '/icons/icon-192x192.png',
              badge: '/icons/badge-72x72.png',
              tag: 'broadcast',
              requireInteraction: true,
            })
          );
          anySent = true;
        } catch (error: any) {
          lastError = error.message;
          if (error.statusCode === 404 || error.statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
          }
        }
      }

      return anySent ? { success: true } : { success: false, error: lastError };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private static determineStatus(results: BroadcastResult['results'], channels: Channel[]): 'sent' | 'partial' | 'failed' {
    let totalSent = 0;
    let totalFailed = 0;

    if (channels.includes('push')) {
      totalSent += results.push.sent;
      totalFailed += results.push.failed;
    }
    if (channels.includes('sms')) {
      totalSent += results.sms.sent;
      totalFailed += results.sms.failed;
    }
    if (channels.includes('email')) {
      totalSent += results.email.sent;
      totalFailed += results.email.failed;
    }

    if (totalSent === 0 && totalFailed > 0) return 'failed';
    if (totalSent > 0 && totalFailed > 0) return 'partial';
    return 'sent';
  }

  static async getBroadcasts(tenantId: string, limit = 50): Promise<Broadcast[]> {
    return db.select()
      .from(broadcasts)
      .where(eq(broadcasts.tenantId, tenantId))
      .orderBy(desc(broadcasts.createdAt))
      .limit(limit);
  }

  static async getBroadcastById(tenantId: string, broadcastId: string) {
    const [broadcast] = await db.select()
      .from(broadcasts)
      .where(and(
        eq(broadcasts.tenantId, tenantId),
        eq(broadcasts.id, broadcastId)
      ));

    if (!broadcast) return null;

    const recipients = await db.select()
      .from(broadcastRecipients)
      .where(eq(broadcastRecipients.broadcastId, broadcastId));

    return { ...broadcast, recipients };
  }

  static async getTemplates(tenantId: string): Promise<BroadcastTemplate[]> {
    return db.select()
      .from(broadcastTemplates)
      .where(and(
        eq(broadcastTemplates.tenantId, tenantId),
        eq(broadcastTemplates.isActive, true)
      ))
      .orderBy(broadcastTemplates.name);
  }

  static async createTemplate(tenantId: string, data: Omit<InsertBroadcastRecipient, 'id' | 'createdAt' | 'updatedAt'> & {
    name: string;
    category: 'urgent' | 'event' | 'reminder' | 'general';
    subject: string;
    body: string;
    channels: Channel[];
    targetRoles?: TargetRole[];
    createdBy?: string;
  }): Promise<BroadcastTemplate> {
    const [template] = await db.insert(broadcastTemplates).values({
      tenantId,
      name: data.name,
      category: data.category,
      subject: data.subject,
      body: data.body,
      channels: data.channels,
      targetRoles: data.targetRoles,
      createdBy: data.createdBy,
      isActive: true,
    }).returning();

    return template;
  }

  static async updateTemplate(tenantId: string, templateId: string, data: Partial<{
    name: string;
    category: 'urgent' | 'event' | 'reminder' | 'general';
    subject: string;
    body: string;
    channels: Channel[];
    targetRoles?: TargetRole[];
    isActive: boolean;
  }>): Promise<BroadcastTemplate | null> {
    const [updated] = await db.update(broadcastTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(broadcastTemplates.tenantId, tenantId),
        eq(broadcastTemplates.id, templateId)
      ))
      .returning();

    return updated || null;
  }

  static async deleteTemplate(tenantId: string, templateId: string): Promise<boolean> {
    const result = await db.delete(broadcastTemplates)
      .where(and(
        eq(broadcastTemplates.tenantId, tenantId),
        eq(broadcastTemplates.id, templateId)
      ));

    return true;
  }

  static async seedDefaultTemplates(tenantId: string): Promise<BroadcastTemplate[]> {
    const existingTemplates = await db.select()
      .from(broadcastTemplates)
      .where(eq(broadcastTemplates.tenantId, tenantId))
      .limit(1);

    if (existingTemplates.length > 0) {
      return [];
    }

    const defaultTemplates = [
      {
        tenantId,
        name: "Urgent Foster Needed",
        category: "urgent" as const,
        subject: "URGENT: Foster Home Needed",
        body: "We have an animal in urgent need of a foster home. If you're available, please respond ASAP or contact the rescue.",
        channels: ["push", "sms"] as ("push" | "sms" | "email")[],
        targetRoles: ["foster"] as ("admin" | "board_member" | "staff" | "foster" | "volunteer")[],
        isActive: true,
      },
      {
        tenantId,
        name: "Weather Closure",
        category: "urgent" as const,
        subject: "Weather Alert: Facility Status",
        body: "Due to severe weather conditions, our facility operations have been affected. Please stay safe and await further updates.",
        channels: ["push", "sms"] as ("push" | "sms" | "email")[],
        targetRoles: ["admin", "staff", "volunteer"] as ("admin" | "board_member" | "staff" | "foster" | "volunteer")[],
        isActive: true,
      },
      {
        tenantId,
        name: "Volunteer Event Reminder",
        category: "event" as const,
        subject: "Event Reminder",
        body: "This is a reminder about an upcoming volunteer event. Please check the calendar for details and confirm your attendance.",
        channels: ["push"] as ("push" | "sms" | "email")[],
        targetRoles: ["volunteer"] as ("admin" | "board_member" | "staff" | "foster" | "volunteer")[],
        isActive: true,
      },
      {
        tenantId,
        name: "Transport Help Needed",
        category: "urgent" as const,
        subject: "Transport Volunteer Needed",
        body: "We need a volunteer to help transport an animal. Please respond if you're available to help with this transport.",
        channels: ["push", "sms"] as ("push" | "sms" | "email")[],
        targetRoles: ["volunteer", "foster"] as ("admin" | "board_member" | "staff" | "foster" | "volunteer")[],
        isActive: true,
      },
      {
        tenantId,
        name: "Adoption Event",
        category: "event" as const,
        subject: "Upcoming Adoption Event",
        body: "We have an adoption event coming up! We need volunteers to help make it a success. See the calendar for details.",
        channels: ["push"] as ("push" | "sms" | "email")[],
        targetRoles: ["staff", "volunteer"] as ("admin" | "board_member" | "staff" | "foster" | "volunteer")[],
        isActive: true,
      },
      {
        tenantId,
        name: "Supply Donation Received",
        category: "general" as const,
        subject: "Donation Alert",
        body: "We've received a generous supply donation! Thank you to everyone who contributes to our mission.",
        channels: ["push"] as ("push" | "sms" | "email")[],
        targetRoles: ["admin", "staff"] as ("admin" | "board_member" | "staff" | "foster" | "volunteer")[],
        isActive: true,
      },
      {
        tenantId,
        name: "Foster Update Reminder",
        category: "reminder" as const,
        subject: "Foster Update Needed",
        body: "Please submit your foster animal updates. This helps us track the progress and well-being of animals in foster care.",
        channels: ["push"] as ("push" | "sms" | "email")[],
        targetRoles: ["foster"] as ("admin" | "board_member" | "staff" | "foster" | "volunteer")[],
        isActive: true,
      },
      {
        tenantId,
        name: "Emergency Medical",
        category: "urgent" as const,
        subject: "URGENT: Medical Emergency",
        body: "An animal requires emergency medical attention. If you can provide transport or assistance, please respond immediately.",
        channels: ["push", "sms"] as ("push" | "sms" | "email")[],
        targetRoles: ["admin", "staff", "foster", "volunteer"] as ("admin" | "board_member" | "staff" | "foster" | "volunteer")[],
        isActive: true,
      },
    ];

    const created = await db.insert(broadcastTemplates).values(defaultTemplates).returning();
    return created;
  }

  static async getTargetableUsers(tenantId: string, roles?: TargetRole[]): Promise<{
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
    roles: string[];
    hasPushSubscription: boolean;
  }[]> {
    const allUsers = await db.select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      roles: users.roles,
    })
    .from(users)
    .where(and(
      eq(users.tenantId, tenantId),
      eq(users.isActive, true)
    ));

    const filteredUsers = roles && roles.length > 0
      ? allUsers.filter(user => user.roles.some(role => roles.includes(role as TargetRole)))
      : allUsers;

    const subscriptions = await db.select({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.tenantId, tenantId),
        eq(pushSubscriptions.isEnabled, true)
      ));

    const subscribedUserIds = new Set(subscriptions.map(s => s.userId));

    return filteredUsers.map(user => ({
      ...user,
      hasPushSubscription: subscribedUserIds.has(user.id),
    }));
  }
}
