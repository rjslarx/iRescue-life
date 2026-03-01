import twilio from 'twilio';
import { db } from '../db';
import { tenants, smsMessageLogs, smsProxySessions, transportEvents, users, fosterAnimals, supplyRequests, fosterUpdates, medicationTasks, complianceReminders, animals } from '@shared/schema';
import { eq, and, desc, gte, isNotNull, inArray, or } from 'drizzle-orm';
import { decrypt, encrypt } from './encryption';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  messagingServiceSid?: string | null;
}

interface SendResult {
  number: string;
  status: 'sent' | 'failed';
  sid?: string;
  error?: string;
}

export async function getTwilioConfigForTenant(tenantId: string): Promise<TwilioConfig | null> {
  return getTwilioConfig(tenantId);
}

async function getTwilioConfig(tenantId: string): Promise<TwilioConfig | null> {
  const [tenant] = await db
    .select({
      twilioAccountSidEncrypted: tenants.twilioAccountSidEncrypted,
      twilioAuthTokenEncrypted: tenants.twilioAuthTokenEncrypted,
      twilioPhoneNumber: tenants.twilioPhoneNumber,
      twilioMessagingServiceSid: tenants.twilioMessagingServiceSid,
      twilioEnabled: tenants.twilioEnabled,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant || !tenant.twilioEnabled) {
    return null;
  }

  if (!tenant.twilioAccountSidEncrypted || !tenant.twilioAuthTokenEncrypted || !tenant.twilioPhoneNumber) {
    return null;
  }

  try {
    const accountSid = decrypt(tenant.twilioAccountSidEncrypted);
    const authToken = decrypt(tenant.twilioAuthTokenEncrypted);

    return {
      accountSid,
      authToken,
      phoneNumber: tenant.twilioPhoneNumber,
      messagingServiceSid: tenant.twilioMessagingServiceSid,
    };
  } catch (error) {
    console.error('Failed to decrypt Twilio credentials:', error);
    return null;
  }
}

function createTwilioClient(config: TwilioConfig) {
  return twilio(config.accountSid, config.authToken);
}

function getStatusCallbackUrl(): string | undefined {
  const base = process.env.APP_BASE_URL || process.env.REPLIT_DEV_DOMAIN || 'https://irescue.life';
  const origin = base.startsWith('http') ? base : `https://${base}`;
  return `${origin}/api/webhooks/twilio/status`;
}

function buildMessageOptions(config: TwilioConfig, to: string, body: string, useDirectNumber = false) {
  const statusCallback = getStatusCallbackUrl();
  if (config.messagingServiceSid && !useDirectNumber) {
    return {
      body,
      messagingServiceSid: config.messagingServiceSid,
      to,
      ...(statusCallback ? { statusCallback } : {}),
    };
  }
  return {
    body,
    from: config.phoneNumber,
    to,
    ...(statusCallback ? { statusCallback } : {}),
  };
}

async function sendWithFallback(
  client: ReturnType<typeof createTwilioClient>,
  config: TwilioConfig,
  to: string,
  body: string
) {
  try {
    return await client.messages.create(buildMessageOptions(config, to, body));
  } catch (error: any) {
    const code = error?.code ?? error?.status;
    if (config.messagingServiceSid && (code === 21704 || code === 21703 || code === 21711)) {
      console.warn(`[TWILIO FALLBACK] Messaging Service failed (${code}), retrying with direct phone number ${config.phoneNumber}`);
      return await client.messages.create(buildMessageOptions(config, to, body, true));
    }
    throw error;
  }
}

export async function broadcastTransportUpdate(
  tenantId: string,
  transportId: string,
  message: string,
  phoneNumbers: string[],
  sentBy?: { id: string; name: string }
): Promise<SendResult[]> {
  const config = await getTwilioConfig(tenantId);
  if (!config) {
    return phoneNumbers.map(number => ({
      number,
      status: 'failed' as const,
      error: 'Twilio not configured for this organization',
    }));
  }

  const client = createTwilioClient(config);
  const results: SendResult[] = [];

  const formattedMessage = `iRescue Transport Update: ${message}`;

  const promises = phoneNumbers.map(async (number) => {
    try {
      const twilioMessage = await sendWithFallback(client, config, number, formattedMessage);

      await db.insert(smsMessageLogs).values({
        tenantId,
        twilioMessageSid: twilioMessage.sid,
        direction: 'outbound',
        fromNumber: config.phoneNumber,
        toNumber: number,
        body: formattedMessage,
        messageType: 'transport_alert',
        transportId,
        status: 'sent',
        sentBy: sentBy?.id,
        sentByName: sentBy?.name,
      });

      return { number, status: 'sent' as const, sid: twilioMessage.sid };
    } catch (error: any) {
      await db.insert(smsMessageLogs).values({
        tenantId,
        direction: 'outbound',
        fromNumber: config.phoneNumber,
        toNumber: number,
        body: formattedMessage,
        messageType: 'transport_alert',
        transportId,
        status: 'failed',
        errorMessage: error.message,
        sentBy: sentBy?.id,
        sentByName: sentBy?.name,
      });

      return { number, status: 'failed' as const, error: error.message };
    }
  });

  return Promise.all(promises);
}

export async function sendSms(
  tenantId: string,
  toNumber: string,
  message: string,
  messageType: 'transport_alert' | 'proxy_message' | 'broadcast' | 'reminder' | 'other',
  context?: {
    transportId?: string;
    proxySessionId?: string;
    sentBy?: { id: string; name: string };
    recipientUserId?: string;
    relatedAnimalId?: string;
  }
): Promise<SendResult> {
  const config = await getTwilioConfig(tenantId);
  if (!config) {
    return {
      number: toNumber,
      status: 'failed',
      error: 'Twilio not configured for this organization',
    };
  }

  const client = createTwilioClient(config);

  try {
    const twilioMessage = await sendWithFallback(client, config, toNumber, message);

    await db.insert(smsMessageLogs).values({
      tenantId,
      twilioMessageSid: twilioMessage.sid,
      direction: 'outbound',
      fromNumber: twilioMessage.from || config.phoneNumber,
      toNumber,
      body: message,
      messageType,
      transportId: context?.transportId,
      proxySessionId: context?.proxySessionId,
      status: 'sent',
      sentBy: context?.sentBy?.id,
      sentByName: context?.sentBy?.name,
      recipientUserId: context?.recipientUserId,
      relatedAnimalId: context?.relatedAnimalId,
    });

    return { number: toNumber, status: 'sent', sid: twilioMessage.sid };
  } catch (error: any) {
    await db.insert(smsMessageLogs).values({
      tenantId,
      direction: 'outbound',
      fromNumber: config.phoneNumber,
      toNumber,
      body: message,
      messageType,
      transportId: context?.transportId,
      proxySessionId: context?.proxySessionId,
      status: 'failed',
      errorMessage: error.message,
      sentBy: context?.sentBy?.id,
      sentByName: context?.sentBy?.name,
      recipientUserId: context?.recipientUserId,
      relatedAnimalId: context?.relatedAnimalId,
    });

    return { number: toNumber, status: 'failed', error: error.message };
  }
}

export async function createProxySession(
  tenantId: string,
  partyAPhone: string,
  partyBPhone: string,
  options?: {
    partyAAlias?: string;
    partyBAlias?: string;
    partyAUserId?: string;
    partyBContactId?: string;
    animalId?: string;
    applicationId?: string;
    expiresAt?: Date;
  }
): Promise<{ id: string } | null> {
  const config = await getTwilioConfig(tenantId);
  if (!config) {
    return null;
  }

  const [session] = await db.insert(smsProxySessions).values({
    tenantId,
    partyAPhone,
    partyBPhone,
    partyAAlias: options?.partyAAlias || 'Foster',
    partyBAlias: options?.partyBAlias || 'Adopter',
    partyAUserId: options?.partyAUserId,
    partyBContactId: options?.partyBContactId,
    animalId: options?.animalId,
    applicationId: options?.applicationId,
    expiresAt: options?.expiresAt,
    isActive: true,
  }).returning({ id: smsProxySessions.id });

  return session;
}

interface FosterIdentity {
  tenantId: string;
  fosterId: string;
  animalId: string;
  fosterName: string;
}

export async function identifyFosterByPhone(fromNumber: string, toNumber: string): Promise<FosterIdentity | null> {
  try {
    // 1. Find the tenant that owns this Twilio number
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.twilioPhoneNumber, toNumber))
      .limit(1);

    if (!tenant) return null;

    // 2. Find an active user in that tenant with this phone number
    const [user] = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(
        eq(users.tenantId, tenant.id),
        eq(users.phone, fromNumber),
        eq(users.isActive, true)
      ))
      .limit(1);

    if (!user) return null;

    // 3. Find their most recent active foster assignment
    const [assignment] = await db
      .select({ animalId: fosterAnimals.animalId })
      .from(fosterAnimals)
      .where(and(
        eq(fosterAnimals.tenantId, tenant.id),
        eq(fosterAnimals.fosterId, user.id),
        eq(fosterAnimals.status, 'active')
      ))
      .orderBy(desc(fosterAnimals.createdAt))
      .limit(1);

    if (!assignment) return null;

    return {
      tenantId: tenant.id,
      fosterId: user.id,
      animalId: assignment.animalId,
      fosterName: user.fullName,
    };
  } catch (error) {
    console.error('[TWILIO] identifyFosterByPhone error:', error);
    return null;
  }
}

const SUPPLY_KEYWORD_REGEX = /\b(supply|supplies|need|needs|out of|running low|ran out|can you send|can you bring)\b/i;

export async function handleIncomingSms(
  fromNumber: string,
  toNumber: string,
  body: string,
  mediaUrls: string[] = []
): Promise<{ success: boolean; routedAs?: 'supply_request' | 'foster_update' | null; message?: string }> {
  const normalizedBody = body.trim().toUpperCase();
  
  if (normalizedBody === 'DONE' || normalizedBody === 'YES' || normalizedBody === 'CONFIRMED') {
    const handled = await handleComplianceConfirmationReply(fromNumber);
    if (handled.success) {
      return { ...handled, routedAs: null };
    }
  }

  // Identify if the sender is a registered foster parent with an active animal
  const fosterIdentity = await identifyFosterByPhone(fromNumber, toNumber);

  if (fosterIdentity) {
    const { tenantId, fosterId, animalId } = fosterIdentity;

    try {
      // Branch A0: NEED reply — create a contextual supply request linked to the pending preventative care reminder
      if (normalizedBody === 'NEED' || normalizedBody.startsWith('NEED ')) {
        let supplyItem = body.substring(0, 200);
        try {
          const { or: orOp, desc: descOp, isNull: isNullOp } = await import('drizzle-orm');
          const [pendingCareReminder] = await db
            .select({
              careName: complianceReminders.careName,
            })
            .from(complianceReminders)
            .where(and(
              eq(complianceReminders.tenantId, tenantId),
              eq(complianceReminders.fosterId, fosterId),
              eq(complianceReminders.reminderType, 'preventative_care'),
              orOp(
                eq(complianceReminders.state, 'pending'),
                eq(complianceReminders.state, 'notified_due')
              ),
              isNullOp(complianceReminders.confirmedAt)
            ))
            .orderBy(descOp(complianceReminders.createdAt))
            .limit(1);

          const [animalRow] = await db
            .select({ name: animals.name })
            .from(animals)
            .where(eq(animals.id, animalId))
            .limit(1);

          if (pendingCareReminder?.careName && animalRow?.name) {
            supplyItem = `${pendingCareReminder.careName} for ${animalRow.name}`;
          }
        } catch (e) {
          // fall through with raw body as item
        }

        await db.insert(supplyRequests).values({
          tenantId,
          fosterId,
          animalId,
          category: 'medical',
          item: supplyItem,
          quantity: '1',
          notes: "Foster replied NEED via SMS — out of stock",
          source: 'sms',
          status: 'pending',
        });
        console.log(`[TWILIO] Created contextual supply_request for foster ${fosterId}: ${supplyItem}`);
        return { success: true, routedAs: 'supply_request' };
      }

      // Branch A: Supply request (keyword detected)
      if (SUPPLY_KEYWORD_REGEX.test(body)) {
        await db.insert(supplyRequests).values({
          tenantId,
          fosterId,
          animalId,
          category: 'other',
          item: body.substring(0, 200),
          quantity: '1',
          notes: 'Received via SMS',
          source: 'sms',
          status: 'pending',
        });
        console.log(`[TWILIO] Created supply_request for foster ${fosterId}, animal ${animalId}`);
        return { success: true, routedAs: 'supply_request' };
      }

      // Branch B: Photo / MMS update
      if (mediaUrls.length > 0) {
        await db.insert(fosterUpdates).values({
          tenantId,
          fosterId,
          animalId,
          updateType: 'photo_update',
          description: body || 'Photo received via SMS',
          photoUrls: mediaUrls,
          source: 'sms',
          priority: 'normal',
          status: 'pending',
        });
        console.log(`[TWILIO] Created photo foster_update for foster ${fosterId}, animal ${animalId}`);
        return { success: true, routedAs: 'foster_update' };
      }

      // Branch C: General text update
      await db.insert(fosterUpdates).values({
        tenantId,
        fosterId,
        animalId,
        updateType: 'general_update',
        description: body || '(No message body)',
        photoUrls: [],
        source: 'sms',
        priority: 'normal',
        status: 'pending',
      });
      console.log(`[TWILIO] Created general foster_update for foster ${fosterId}, animal ${animalId}`);
      return { success: true, routedAs: 'foster_update' };

    } catch (routingError) {
      console.error('[TWILIO] Error routing foster SMS to DB:', routingError);
      // Return success so Twilio doesn't retry — message was received, just not stored
      return { success: true, routedAs: null, message: 'Routing error' };
    }
  }

  // Not an identified foster — fall through to proxy session handling
  const [activeSession] = await db
    .select()
    .from(smsProxySessions)
    .where(
      and(
        eq(smsProxySessions.isActive, true),
        eq(smsProxySessions.partyAPhone, fromNumber)
      )
    );

  if (!activeSession) {
    const [sessionAsPartyB] = await db
      .select()
      .from(smsProxySessions)
      .where(
        and(
          eq(smsProxySessions.isActive, true),
          eq(smsProxySessions.partyBPhone, fromNumber)
        )
      );

    if (!sessionAsPartyB) {
      return { success: false, routedAs: null, message: 'No active session found for this number' };
    }

    const config = await getTwilioConfig(sessionAsPartyB.tenantId);
    if (!config) {
      return { success: false, message: 'Twilio not configured' };
    }

    const client = createTwilioClient(config);
    const forwardMessage = `(From ${sessionAsPartyB.partyBAlias}): ${body}`;

    try {
      const twilioMessage = await client.messages.create(
        buildMessageOptions(config, sessionAsPartyB.partyAPhone, forwardMessage)
      );

      await db.insert(smsMessageLogs).values({
        tenantId: sessionAsPartyB.tenantId,
        twilioMessageSid: twilioMessage.sid,
        direction: 'outbound',
        fromNumber: config.messagingServiceSid || config.phoneNumber,
        toNumber: sessionAsPartyB.partyAPhone,
        body: forwardMessage,
        messageType: 'proxy_message',
        proxySessionId: sessionAsPartyB.id,
        status: 'sent',
      });

      await db.insert(smsMessageLogs).values({
        tenantId: sessionAsPartyB.tenantId,
        direction: 'inbound',
        fromNumber,
        toNumber,
        body,
        messageType: 'proxy_message',
        proxySessionId: sessionAsPartyB.id,
        status: 'received',
      });

      return { success: true, routedAs: null };
    } catch (error: any) {
      return { success: false, routedAs: null, message: error.message };
    }
  }

  const config = await getTwilioConfig(activeSession.tenantId);
  if (!config) {
    return { success: false, routedAs: null, message: 'Twilio not configured' };
  }

  const client = createTwilioClient(config);
  const forwardMessage = `(From ${activeSession.partyAAlias}): ${body}`;

  try {
    const twilioMessage = await client.messages.create(
      buildMessageOptions(config, activeSession.partyBPhone, forwardMessage)
    );

    await db.insert(smsMessageLogs).values({
      tenantId: activeSession.tenantId,
      twilioMessageSid: twilioMessage.sid,
      direction: 'outbound',
      fromNumber: config.messagingServiceSid || config.phoneNumber,
      toNumber: activeSession.partyBPhone,
      body: forwardMessage,
      messageType: 'proxy_message',
      proxySessionId: activeSession.id,
      status: 'sent',
    });

    await db.insert(smsMessageLogs).values({
      tenantId: activeSession.tenantId,
      direction: 'inbound',
      fromNumber,
      toNumber,
      body,
      messageType: 'proxy_message',
      proxySessionId: activeSession.id,
      status: 'received',
    });

    return { success: true, routedAs: null };
  } catch (error: any) {
    return { success: false, routedAs: null, message: error.message };
  }
}

export async function endProxySession(sessionId: string): Promise<boolean> {
  const result = await db
    .update(smsProxySessions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(smsProxySessions.id, sessionId));

  return true;
}

export async function getTransportSmsSubscribers(transportId: string): Promise<string[]> {
  const [transport] = await db
    .select({ smsSubscribers: transportEvents.smsSubscribers })
    .from(transportEvents)
    .where(eq(transportEvents.id, transportId));

  return transport?.smsSubscribers || [];
}

export async function addTransportSmsSubscriber(
  transportId: string,
  phoneNumber: string
): Promise<boolean> {
  const [transport] = await db
    .select({ smsSubscribers: transportEvents.smsSubscribers })
    .from(transportEvents)
    .where(eq(transportEvents.id, transportId));

  if (!transport) return false;

  const currentSubscribers = transport.smsSubscribers || [];
  if (currentSubscribers.includes(phoneNumber)) {
    return true;
  }

  await db
    .update(transportEvents)
    .set({ smsSubscribers: [...currentSubscribers, phoneNumber] })
    .where(eq(transportEvents.id, transportId));

  return true;
}

export async function removeTransportSmsSubscriber(
  transportId: string,
  phoneNumber: string
): Promise<boolean> {
  const [transport] = await db
    .select({ smsSubscribers: transportEvents.smsSubscribers })
    .from(transportEvents)
    .where(eq(transportEvents.id, transportId));

  if (!transport) return false;

  const currentSubscribers = transport.smsSubscribers || [];
  const newSubscribers = currentSubscribers.filter(n => n !== phoneNumber);

  await db
    .update(transportEvents)
    .set({ smsSubscribers: newSubscribers })
    .where(eq(transportEvents.id, transportId));

  return true;
}

export async function isTwilioEnabled(tenantId: string): Promise<boolean> {
  const config = await getTwilioConfig(tenantId);
  return config !== null;
}

async function handleComplianceConfirmationReply(
  fromNumber: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const { complianceReminders, complianceReminderNotifications, users } = await import('@shared/schema');
    const { or, desc } = await import('drizzle-orm');
    
    const normalizedPhone = fromNumber.replace(/\D/g, '');
    const phonePatterns = [
      fromNumber,
      normalizedPhone,
      `+${normalizedPhone}`,
      `+1${normalizedPhone.replace(/^1/, '')}`,
    ];

    const matchingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(or(...phonePatterns.map(p => eq(users.phone, p))));

    if (matchingUsers.length === 0) {
      return { success: false, message: 'No user found with this phone number' };
    }

    const userIds = matchingUsers.map(u => u.id);

    const { inArray, isNull, not } = await import('drizzle-orm');

    const [pendingReminder] = await db
      .select({
        id: complianceReminders.id,
        tenantId: complianceReminders.tenantId,
        magicLinkToken: complianceReminders.magicLinkToken,
      })
      .from(complianceReminders)
      .where(and(
        inArray(complianceReminders.fosterId, userIds),
        or(
          eq(complianceReminders.state, 'notified_due'),
          eq(complianceReminders.state, 'overdue')
        ),
        isNull(complianceReminders.confirmedAt)
      ))
      .orderBy(desc(complianceReminders.createdAt))
      .limit(1);

    if (!pendingReminder) {
      // No compliance reminder found — check for a medication digest batch sent in the last 4 hours
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const normalizedFromPhone = fromNumber.replace(/D/g, '');
      const phonePatterns2 = [
        fromNumber,
        normalizedFromPhone,
        `+${normalizedFromPhone}`,
        `+1${normalizedFromPhone.replace(/^1/, '')}`,
      ];

      const [digestLog] = await db
        .select({ relatedTaskIds: smsMessageLogs.relatedTaskIds, tenantId: smsMessageLogs.tenantId })
        .from(smsMessageLogs)
        .where(and(
          or(...phonePatterns2.map(p => eq(smsMessageLogs.toNumber, p))),
          eq(smsMessageLogs.direction, 'outbound'),
          eq(smsMessageLogs.messageType, 'reminder'),
          gte(smsMessageLogs.createdAt, fourHoursAgo),
          isNotNull(smsMessageLogs.relatedTaskIds)
        ))
        .orderBy(desc(smsMessageLogs.createdAt))
        .limit(1);

      if (digestLog?.relatedTaskIds && digestLog.relatedTaskIds.length > 0) {
        await db
          .update(medicationTasks)
          .set({ status: 'given', completedAt: new Date() })
          .where(and(
            inArray(medicationTasks.id, digestLog.relatedTaskIds),
            eq(medicationTasks.status, 'pending')
          ));
        console.log(`[TWILIO] Marked ${digestLog.relatedTaskIds.length} medication task(s) as given via DONE reply from ${fromNumber}`);
        return { success: true, message: `Medication batch (${digestLog.relatedTaskIds.length} tasks) marked as given via SMS reply` };
      }

      return { success: false, message: 'No pending reminder found' };
    }

    const { processConfirmation } = await import('./foster-compliance-reminders');
    const result = await processConfirmation(pendingReminder.magicLinkToken!, 'sms_reply');

    if (result.success) {
      await db.insert(complianceReminderNotifications).values({
        tenantId: pendingReminder.tenantId,
        complianceReminderId: pendingReminder.id,
        channel: 'sms',
        notificationType: 'confirmation_received',
        recipientPhone: fromNumber,
        messageBody: 'DONE',
        deliveryStatus: 'received',
      });

      return { success: true, message: 'Confirmation recorded via SMS reply' };
    }

    return { success: false, message: result.error || 'Failed to confirm' };
  } catch (error) {
    console.error('Error handling compliance confirmation reply:', error);
    return { success: false, message: 'Error processing confirmation' };
  }
}
