import twilio from 'twilio';
import { db } from '../db';
import { tenants, smsMessageLogs, smsProxySessions, transportEvents } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt, encrypt } from './encryption';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

interface SendResult {
  number: string;
  status: 'sent' | 'failed';
  sid?: string;
  error?: string;
}

async function getTwilioConfig(tenantId: string): Promise<TwilioConfig | null> {
  const [tenant] = await db
    .select({
      twilioAccountSidEncrypted: tenants.twilioAccountSidEncrypted,
      twilioAuthTokenEncrypted: tenants.twilioAuthTokenEncrypted,
      twilioPhoneNumber: tenants.twilioPhoneNumber,
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
    };
  } catch (error) {
    console.error('Failed to decrypt Twilio credentials:', error);
    return null;
  }
}

function createTwilioClient(config: TwilioConfig) {
  return twilio(config.accountSid, config.authToken);
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
      const twilioMessage = await client.messages.create({
        body: formattedMessage,
        from: config.phoneNumber,
        to: number,
      });

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
    const twilioMessage = await client.messages.create({
      body: message,
      from: config.phoneNumber,
      to: toNumber,
    });

    await db.insert(smsMessageLogs).values({
      tenantId,
      twilioMessageSid: twilioMessage.sid,
      direction: 'outbound',
      fromNumber: config.phoneNumber,
      toNumber,
      body: message,
      messageType,
      transportId: context?.transportId,
      proxySessionId: context?.proxySessionId,
      status: 'sent',
      sentBy: context?.sentBy?.id,
      sentByName: context?.sentBy?.name,
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

export async function handleIncomingSms(
  fromNumber: string,
  toNumber: string,
  body: string
): Promise<{ success: boolean; message?: string }> {
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
      return { success: false, message: 'No active session found for this number' };
    }

    const config = await getTwilioConfig(sessionAsPartyB.tenantId);
    if (!config) {
      return { success: false, message: 'Twilio not configured' };
    }

    const client = createTwilioClient(config);
    const forwardMessage = `(From ${sessionAsPartyB.partyBAlias}): ${body}`;

    try {
      const twilioMessage = await client.messages.create({
        body: forwardMessage,
        from: config.phoneNumber,
        to: sessionAsPartyB.partyAPhone,
      });

      await db.insert(smsMessageLogs).values({
        tenantId: sessionAsPartyB.tenantId,
        twilioMessageSid: twilioMessage.sid,
        direction: 'outbound',
        fromNumber: config.phoneNumber,
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

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  const config = await getTwilioConfig(activeSession.tenantId);
  if (!config) {
    return { success: false, message: 'Twilio not configured' };
  }

  const client = createTwilioClient(config);
  const forwardMessage = `(From ${activeSession.partyAAlias}): ${body}`;

  try {
    const twilioMessage = await client.messages.create({
      body: forwardMessage,
      from: config.phoneNumber,
      to: activeSession.partyBPhone,
    });

    await db.insert(smsMessageLogs).values({
      tenantId: activeSession.tenantId,
      twilioMessageSid: twilioMessage.sid,
      direction: 'outbound',
      fromNumber: config.phoneNumber,
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

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
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
