import { db } from '../db';
import { messageQueue, tenants } from '@shared/schema';
import { eq, and, lte, sql } from 'drizzle-orm';

export async function queueMessage(params: {
  tenantId: string;
  channel: 'sms' | 'email';
  recipientAddress: string;
  recipientName?: string;
  recipientUserId?: string;
  relatedAnimalId?: string;
  subject?: string;
  messageBody: string;
  scheduledFor: Date;
  sourceType?: 'broadcast' | 'reminder' | 'compliance' | 'newsletter' | 'manual' | 'other';
  createdBy?: string;
}) {
  const [row] = await db.insert(messageQueue).values({
    tenantId: params.tenantId,
    channel: params.channel,
    direction: 'outbound',
    recipientAddress: params.recipientAddress,
    recipientName: params.recipientName,
    recipientUserId: params.recipientUserId,
    relatedAnimalId: params.relatedAnimalId,
    subject: params.subject,
    messageBody: params.messageBody,
    scheduledFor: params.scheduledFor,
    status: 'scheduled',
    sourceType: params.sourceType || 'other',
    createdBy: params.createdBy,
  }).returning();
  return row;
}

export async function processMessageQueue() {
  const now = new Date();

  const claimed = await db.execute(sql`
    UPDATE message_queue
    SET status = 'processing', updated_at = NOW()
    WHERE id IN (
      SELECT id FROM message_queue
      WHERE status = 'scheduled' AND scheduled_for <= ${now}
      ORDER BY scheduled_for ASC
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  const pendingMessages = (claimed as any).rows || claimed;

  if (!pendingMessages || pendingMessages.length === 0) return { processed: 0, sent: 0, failed: 0, skipped: 0 };

  const tenantIds = [...new Set(pendingMessages.map((m: any) => m.tenant_id))];
  const tenantRows = await db
    .select({ id: tenants.id, commsPaused: tenants.commsPaused })
    .from(tenants)
    .where(sql`${tenants.id} IN (${sql.join(tenantIds.map((id: string) => sql`${id}::uuid`), sql`, `)})`);

  const pausedTenants = new Set(tenantRows.filter(t => t.commsPaused).map(t => t.id));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const msg of pendingMessages) {
    const msgId = msg.id;
    const msgTenantId = msg.tenant_id;
    const msgChannel = msg.channel;

    if (pausedTenants.has(msgTenantId)) {
      await db.update(messageQueue)
        .set({ status: 'scheduled', updatedAt: new Date() })
        .where(eq(messageQueue.id, msgId));
      skipped++;
      continue;
    }

    try {
      if (msgChannel === 'sms') {
        const { sendSms } = await import('../lib/twilio-service');
        const result = await sendSms(
          msgTenantId,
          msg.recipient_address,
          msg.message_body,
          'other',
          {
            recipientUserId: msg.recipient_user_id || undefined,
            relatedAnimalId: msg.related_animal_id || undefined,
          }
        );

        if (result.status === 'sent') {
          await db.update(messageQueue)
            .set({
              status: 'delivered',
              sentAt: new Date(),
              providerSid: result.sid,
              updatedAt: new Date(),
            })
            .where(eq(messageQueue.id, msgId));
          sent++;
        } else {
          await db.update(messageQueue)
            .set({
              status: 'failed',
              errorLog: result.error || 'SMS send failed',
              updatedAt: new Date(),
            })
            .where(eq(messageQueue.id, msgId));
          failed++;
        }
      } else if (msgChannel === 'email') {
        const { EmailService } = await import('../lib/email-service');
        const emailService = await EmailService.forTenant(msgTenantId);
        const result = await emailService.send({
          to: msg.recipient_address,
          subject: msg.subject || '(No subject)',
          html: msg.message_body,
        });

        if (result.success) {
          await db.update(messageQueue)
            .set({
              status: 'delivered',
              sentAt: new Date(),
              providerSid: result.messageId,
              updatedAt: new Date(),
            })
            .where(eq(messageQueue.id, msgId));
          sent++;
        } else {
          await db.update(messageQueue)
            .set({
              status: 'failed',
              errorLog: result.error || 'Email send failed',
              updatedAt: new Date(),
            })
            .where(eq(messageQueue.id, msgId));
          failed++;
        }
      }
    } catch (error) {
      await db.update(messageQueue)
        .set({
          status: 'failed',
          errorLog: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(messageQueue.id, msgId));
      failed++;
    }
  }

  return { processed: pendingMessages.length, sent, failed, skipped };
}
