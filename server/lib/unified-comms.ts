import { db } from '../db';
import { messageQueue } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sendSms } from './twilio-service';
import { EmailService } from './email-service';

export type CommsSourceType =
  | 'broadcast'
  | 'reminder'
  | 'compliance'
  | 'newsletter'
  | 'manual'
  | 'other';

export interface SendCommunicationInput {
  tenantId: string;
  channel: 'sms' | 'email';
  sourceType: CommsSourceType;
  recipientAddress: string;
  recipientName?: string | null;
  recipientUserId?: string | null;
  relatedAnimalId?: string | null;
  subject?: string | null;
  messageBody: string;
  createdBy?: string | null;
  /**
   * 'immediate' (default) writes a message_queue row and dispatches now.
   * 'scheduled' only writes the row with status='scheduled' for the worker
   * to pick up later.
   */
  mode?: 'immediate' | 'scheduled';
  scheduledFor?: Date;
  smsContext?: {
    skipOrgPrefix?: boolean;
    bypassQuietHours?: boolean;
    relatedTaskIds?: string[];
  };
  emailAttachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export interface SendCommunicationResult {
  messageQueueId: string;
  status: 'delivered' | 'failed' | 'scheduled';
  providerSid?: string | null;
  error?: string;
}

/**
 * Unified outbound communication helper. Every adopter / foster automated
 * SMS or email goes through this so the Communications Switchboard can show
 * a single audit row per send. Returns the inserted message_queue row id so
 * callers can persist it on their own audit tables (FK).
 */
export async function sendCommunication(
  input: SendCommunicationInput,
): Promise<SendCommunicationResult> {
  if (!input.tenantId) {
    throw new Error('sendCommunication: tenantId is required');
  }
  if (!input.recipientAddress) {
    throw new Error('sendCommunication: recipientAddress is required');
  }
  const mode = input.mode ?? 'immediate';
  const scheduledFor = input.scheduledFor ?? new Date();

  const [row] = await db
    .insert(messageQueue)
    .values({
      tenantId: input.tenantId,
      channel: input.channel,
      direction: 'outbound',
      recipientAddress: input.recipientAddress,
      recipientName: input.recipientName ?? null,
      recipientUserId: input.recipientUserId ?? null,
      relatedAnimalId: input.relatedAnimalId ?? null,
      subject: input.subject ?? null,
      messageBody: input.messageBody,
      scheduledFor,
      status: mode === 'scheduled' ? 'scheduled' : 'processing',
      sourceType: input.sourceType,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: messageQueue.id });

  const messageQueueId = row.id;

  if (mode === 'scheduled') {
    return { messageQueueId, status: 'scheduled' };
  }

  try {
    if (input.channel === 'sms') {
      const result = await sendSms(
        input.tenantId,
        input.recipientAddress,
        input.messageBody,
        'notification',
        {
          recipientUserId: input.recipientUserId ?? undefined,
          relatedAnimalId: input.relatedAnimalId ?? undefined,
          skipOrgPrefix: input.smsContext?.skipOrgPrefix,
          bypassQuietHours: input.smsContext?.bypassQuietHours,
          relatedTaskIds: input.smsContext?.relatedTaskIds,
          messageQueueId,
        },
      );
      if (result.status === 'sent') {
        await db
          .update(messageQueue)
          .set({
            status: 'delivered',
            sentAt: new Date(),
            providerSid: result.sid ?? null,
            updatedAt: new Date(),
          })
          .where(eq(messageQueue.id, messageQueueId));
        return { messageQueueId, status: 'delivered', providerSid: result.sid };
      }
      await db
        .update(messageQueue)
        .set({
          status: 'failed',
          errorLog: result.error || 'SMS send failed',
          updatedAt: new Date(),
        })
        .where(eq(messageQueue.id, messageQueueId));
      return { messageQueueId, status: 'failed', error: result.error };
    }

    // Email
    const emailService = await EmailService.forTenant(input.tenantId);
    if (!emailService) {
      const err = 'Email service is not configured for this organization';
      await db
        .update(messageQueue)
        .set({ status: 'failed', errorLog: err, updatedAt: new Date() })
        .where(eq(messageQueue.id, messageQueueId));
      return { messageQueueId, status: 'failed', error: err };
    }
    const result = await emailService.send({
      to: input.recipientAddress,
      subject: input.subject || '(No subject)',
      html: input.messageBody,
      attachments: input.emailAttachments,
    });
    if (result.success) {
      await db
        .update(messageQueue)
        .set({
          status: 'delivered',
          sentAt: new Date(),
          providerSid: result.messageId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(messageQueue.id, messageQueueId));
      return { messageQueueId, status: 'delivered', providerSid: result.messageId };
    }
    await db
      .update(messageQueue)
      .set({
        status: 'failed',
        errorLog: result.error || 'Email send failed',
        updatedAt: new Date(),
      })
      .where(eq(messageQueue.id, messageQueueId));
    return { messageQueueId, status: 'failed', error: result.error };
  } catch (err: any) {
    const msg = err?.message || 'Unknown send error';
    await db
      .update(messageQueue)
      .set({ status: 'failed', errorLog: msg, updatedAt: new Date() })
      .where(eq(messageQueue.id, messageQueueId));
    return { messageQueueId, status: 'failed', error: msg };
  }
}
