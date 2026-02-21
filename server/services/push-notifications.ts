import webpush from 'web-push';
import { db } from "../db";
import { pushSubscriptions, users, type PushSubscription } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// VAPID keys should be generated once and stored as environment variables
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@irescue.life';

// Initialize web-push with VAPID keys
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
  actions?: Array<{ action: string; title: string }>;
  requireInteraction?: boolean;
}

export class PushNotificationService {
  /**
   * Subscribe a user to push notifications
   */
  static async subscribe(
    tenantId: string,
    userId: string,
    subscription: {
      endpoint: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    },
    userAgent?: string
  ): Promise<PushSubscription> {
    // Check if subscription already exists for this tenant and user
    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.tenantId, tenantId),
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, subscription.endpoint)
      ))
      .limit(1);

    if (existing) {
      // Update existing subscription with fresh keys and ensure tenant/user are current
      const [updated] = await db.update(pushSubscriptions)
        .set({
          tenantId,  // Always refresh tenant context
          userId,    // Always refresh user context
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent,
          isEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, existing.id))
        .returning();
      
      return updated;
    }

    const [otherUserSub] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
      .limit(1);

    if (otherUserSub) {
      // Device switched users/tenants - remove old subscription
      await db.delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, otherUserSub.id));
    }

    // Create new subscription
    const [newSubscription] = await db.insert(pushSubscriptions)
      .values({
        tenantId,
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
        isEnabled: true,
      })
      .returning();

    return newSubscription;
  }

  /**
   * Unsubscribe a user from push notifications
   */
  static async unsubscribe(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  /**
   * Toggle subscription enabled status
   */
  static async toggleSubscription(
    userId: string,
    endpoint: string,
    isEnabled: boolean
  ): Promise<PushSubscription | null> {
    const [updated] = await db.update(pushSubscriptions)
      .set({ isEnabled, updatedAt: new Date() })
      .where(and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint)
      ))
      .returning();

    return updated || null;
  }

  /**
   * Get all subscriptions for a user
   */
  static async getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
    return db
      .select()
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.isEnabled, true)
      ));
  }

  /**
   * Send push notification to a specific user
   */
  static async sendToUser(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<{ success: number; failed: number }> {
    const subscriptions = await this.getUserSubscriptions(userId);
    
    let success = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload)
        );
        success++;
      } catch (error: any) {
        console.error('Failed to send push notification:', error);
        
        // If subscription is expired or invalid, remove it
        if (error.statusCode === 404 || error.statusCode === 410) {
          await this.unsubscribe(subscription.endpoint);
        }
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Send push notification to multiple users
   */
  static async sendToUsers(
    userIds: string[],
    payload: PushNotificationPayload
  ): Promise<{ success: number; failed: number }> {
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const userId of userIds) {
      const result = await this.sendToUser(userId, payload);
      totalSuccess += result.success;
      totalFailed += result.failed;
    }

    return { success: totalSuccess, failed: totalFailed };
  }

  /**
   * Send push notification to all users in a tenant with specific roles
   */
  static async sendToTenantRoles(
    tenantId: string,
    roles: string[],
    payload: PushNotificationPayload
  ): Promise<{ success: number; failed: number }> {
    const subs = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        userRoles: users.roles,
      })
      .from(pushSubscriptions)
      .innerJoin(users, eq(pushSubscriptions.userId, users.id))
      .where(and(
        eq(pushSubscriptions.tenantId, tenantId),
        eq(pushSubscriptions.isEnabled, true)
      ));

    const targetSubs = subs.filter((sub) => 
      sub.userRoles && sub.userRoles.some((role: string) => roles.includes(role))
    );

    let success = 0;
    let failed = 0;

    for (const subscription of targetSubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload)
        );
        success++;
      } catch (error: any) {
        console.error('Failed to send push notification:', error);
        
        if (error.statusCode === 404 || error.statusCode === 410) {
          await this.unsubscribe(subscription.endpoint);
        }
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Get VAPID public key for client-side subscription
   */
  static getVapidPublicKey(): string {
    return VAPID_PUBLIC_KEY;
  }

  /**
   * Check if push notifications are configured
   */
  static isConfigured(): boolean {
    return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  }
}
