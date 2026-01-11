import { eq, and, lte } from 'drizzle-orm';
import { db } from '../db';
import { newsletterBatchSchedule, newsletterCampaigns, newsletterSubscribers, animals, happyTails, tenants } from '@shared/schema';
import { EmailService } from './email-service';

interface BatchProcessResult {
  batchesProcessed: number;
  emailsSent: number;
  errors: string[];
}

/**
 * Process scheduled newsletter batches that are due to be sent
 * This is called by the scheduler every 15 minutes
 */
export async function processScheduledBatches(): Promise<BatchProcessResult> {
  const result: BatchProcessResult = {
    batchesProcessed: 0,
    emailsSent: 0,
    errors: []
  };

  try {
    const now = new Date();
    
    const pendingBatches = await db
      .select()
      .from(newsletterBatchSchedule)
      .where(and(
        eq(newsletterBatchSchedule.status, 'pending'),
        lte(newsletterBatchSchedule.scheduledFor, now)
      ))
      .limit(10);

    if (pendingBatches.length === 0) {
      return result;
    }

    console.log(`[Newsletter Batch] Found ${pendingBatches.length} batches to process`);

    for (const batch of pendingBatches) {
      try {
        await db
          .update(newsletterBatchSchedule)
          .set({ status: 'sending', updatedAt: new Date() })
          .where(eq(newsletterBatchSchedule.id, batch.id));

        const batchResult = await processSingleBatch(batch);
        
        // Only mark as 'sent' if the batch fully completed
        // If not completed, the batch was rescheduled (status already set to 'pending')
        if (batchResult.completed) {
          // Calculate total success/error counts including any previous partial runs
          const totalSuccess = (batch.successCount || 0) + batchResult.successCount;
          const totalError = (batch.errorCount || 0) + batchResult.errorCount;
          
          await db
            .update(newsletterBatchSchedule)
            .set({
              status: 'sent',
              sentAt: new Date(),
              successCount: totalSuccess,
              errorCount: totalError,
              updatedAt: new Date()
            })
            .where(eq(newsletterBatchSchedule.id, batch.id));

          result.batchesProcessed++;
          result.emailsSent += batchResult.successCount;
          console.log(`[Newsletter Batch] Batch ${batch.batchNumber} for campaign ${batch.campaignId} completed: ${totalSuccess} sent, ${totalError} errors`);
        } else {
          // Batch was rescheduled due to quota exhaustion - status already updated in processSingleBatch
          result.emailsSent += batchResult.successCount;
          console.log(`[Newsletter Batch] Batch ${batch.batchNumber} for campaign ${batch.campaignId} rescheduled: ${batchResult.successCount} sent this run, quota exhausted`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Batch ${batch.id}: ${errorMessage}`);
        
        await db
          .update(newsletterBatchSchedule)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(newsletterBatchSchedule.id, batch.id));
      }
    }

    await updateCampaignStatus();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Global error: ${errorMessage}`);
  }

  return result;
}

/**
 * Process a single newsletter batch
 * Returns completed: true if all subscribers were processed, false if batch was rescheduled
 */
async function processSingleBatch(batch: typeof newsletterBatchSchedule.$inferSelect): Promise<{ successCount: number; errorCount: number; completed: boolean }> {
  let successCount = 0;
  let errorCount = 0;

  const [campaign] = await db
    .select()
    .from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.id, batch.campaignId))
    .limit(1);

  if (!campaign) {
    throw new Error(`Campaign ${batch.campaignId} not found`);
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, batch.tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error(`Tenant ${batch.tenantId} not found`);
  }

  const emailService = await EmailService.forTenant(batch.tenantId);
  if (!emailService) {
    throw new Error(`Email service not available for tenant ${batch.tenantId}`);
  }

  const subscriberIds = batch.subscriberIds || [];
  
  if (subscriberIds.length === 0) {
    console.log(`[Newsletter Batch] Batch ${batch.batchNumber} has no subscriber IDs, skipping`);
    return { successCount: 0, errorCount: 0, completed: true };
  }
  
  // Query ONLY the specific subscribers for this batch by their stored IDs
  // Using inArray for efficient database-level filtering
  const { inArray } = await import('drizzle-orm');
  const batchSubscribers = await db
    .select()
    .from(newsletterSubscribers)
    .where(and(
      eq(newsletterSubscribers.tenantId, batch.tenantId),
      eq(newsletterSubscribers.status, 'active'),
      inArray(newsletterSubscribers.id, subscriberIds)
    ));

  // CRITICAL: Check Gmail quota before processing batch
  const isUsingGmail = emailService.isUsingGmail();
  if (isUsingGmail) {
    const gmailQuota = await emailService.checkGmailQuota(batchSubscribers.length);
    if (!gmailQuota.allowed) {
      console.log(`[Newsletter Batch] Gmail quota insufficient for batch ${batch.batchNumber}: need ${batchSubscribers.length}, have ${gmailQuota.remaining}`);
      
      // Reschedule for 4 hours from now (enough time for quota to partially reset)
      const nextAttempt = new Date();
      nextAttempt.setTime(nextAttempt.getTime() + 4 * 60 * 60 * 1000);
      
      await db
        .update(newsletterBatchSchedule)
        .set({
          status: 'pending', // Keep as pending so it will be retried
          scheduledFor: nextAttempt, // Reschedule for later
          updatedAt: new Date()
        })
        .where(eq(newsletterBatchSchedule.id, batch.id));
      
      console.log(`[Newsletter Batch] Pre-flight quota check failed, rescheduled batch ${batch.batchNumber} for ${nextAttempt.toISOString()}`);
      
      // Return completed: false so parent doesn't mark as sent
      return { successCount: 0, errorCount: 0, completed: false };
    }
    console.log(`[Newsletter Batch] Gmail quota check passed: ${gmailQuota.remaining} remaining, need ${batchSubscribers.length}`);
  }

  const allAnimals = await db
    .select()
    .from(animals)
    .where(eq(animals.tenantId, batch.tenantId));

  const allHappyTails = await db
    .select()
    .from(happyTails)
    .where(eq(happyTails.tenantId, batch.tenantId));

  const baseUrl = tenant.customDomain
    ? `https://${tenant.customDomain}`
    : `https://irescue.life/${tenant.subdomain}`;

  const { renderNewsletterTemplate, cleanSubjectLine, generateUnsubscribeHeader } = await import('./email-service');

  // isUsingGmail already declared above during quota check
  const delayMs = isUsingGmail ? 2000 : 200;

  for (let i = 0; i < batchSubscribers.length; i++) {
    const subscriber = batchSubscribers[i];
    
    try {
      const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe/${subscriber.unsubscribeToken}`;

      const { renderNewsletterTemplate } = await import('../emails/newsletter-renderer');
      
      const { html, text } = await renderNewsletterTemplate({
        campaign,
        tenant,
        animals: allAnimals,
        happyTails: allHappyTails,
        baseUrl,
        unsubscribeUrl,
      });

      const unsubscribeHeader = generateUnsubscribeHeader(subscriber.email, tenant.subdomain);

      const sendResult = await emailService.send({
        to: subscriber.email,
        subject: cleanSubjectLine(campaign.subject),
        html,
        text,
        headers: {
          'List-Unsubscribe': unsubscribeHeader,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        strictGmailQuota: isUsingGmail, // Fail on quota exceeded instead of falling back
      });

      if (sendResult.success) {
        successCount++;
      } else {
        // Check for recoverable errors that should trigger a reschedule
        const isQuotaError = sendResult.error?.includes('GMAIL_QUOTA_EXCEEDED');
        const isAuthError = sendResult.error?.includes('invalid_grant') || 
                           sendResult.error?.includes('Token has been expired') ||
                           sendResult.error?.includes('Token has been revoked') ||
                           sendResult.error?.includes('401') ||
                           sendResult.error?.includes('403');
        
        if (isQuotaError || isAuthError) {
          // Don't count as error since subscriber will be retried
          const errorType = isQuotaError ? 'Gmail quota exceeded' : 'Gmail auth failure';
          console.log(`[Newsletter Batch] Stopping batch ${batch.batchNumber} - ${errorType} after ${successCount} successful sends`);
          
          // Save partial progress - include current subscriber (slice(i)) since they weren't sent
          // This ensures we don't lose the subscriber that triggered the error
          const remainingSubscriberIds = batchSubscribers.slice(i).map(s => s.id);
          
          // Reschedule for later (4 hours for quota, 1 hour for auth to allow user to fix)
          const delayHours = isQuotaError ? 4 : 1;
          const nextAttempt = new Date();
          nextAttempt.setTime(nextAttempt.getTime() + delayHours * 60 * 60 * 1000);
          
          await db
            .update(newsletterBatchSchedule)
            .set({
              status: 'pending', // Keep as pending so it will be retried
              successCount: (batch.successCount || 0) + successCount, // Accumulate success count
              errorCount: (batch.errorCount || 0) + errorCount, // Accumulate error count
              subscriberIds: remainingSubscriberIds, // Update to only remaining subscribers
              scheduledFor: nextAttempt, // Reschedule for later
              updatedAt: new Date()
            })
            .where(eq(newsletterBatchSchedule.id, batch.id));
          
          console.log(`[Newsletter Batch] Rescheduled batch ${batch.batchNumber} for ${nextAttempt.toISOString()} with ${remainingSubscriberIds.length} remaining subscribers (${errorType})`);
          
          // Return partial progress (batch will be retried with remaining subscribers)
          return { successCount, errorCount, completed: false };
        } else {
          // Non-recoverable error, count it and continue
          errorCount++;
        }
      }

      if (i < batchSubscribers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      errorCount++;
    }
  }

  return { successCount, errorCount, completed: true };
}

/**
 * Update campaign status based on batch statuses
 */
async function updateCampaignStatus(): Promise<void> {
  const campaigns = await db
    .selectDistinct({ campaignId: newsletterBatchSchedule.campaignId })
    .from(newsletterBatchSchedule);

  for (const { campaignId } of campaigns) {
    const batches = await db
      .select()
      .from(newsletterBatchSchedule)
      .where(eq(newsletterBatchSchedule.campaignId, campaignId));

    const allSent = batches.every(b => b.status === 'sent');
    const anyFailed = batches.some(b => b.status === 'failed');
    const anySending = batches.some(b => b.status === 'sending');

    let newStatus: 'sending' | 'sent' | 'failed' | 'scheduled' = 'scheduled';
    if (allSent) {
      newStatus = 'sent';
    } else if (anyFailed && !anySending) {
      newStatus = 'failed';
    } else if (anySending || batches.some(b => b.status === 'pending')) {
      newStatus = 'sending';
    }

    const totalSuccess = batches.reduce((sum, b) => sum + (b.successCount || 0), 0);
    const totalError = batches.reduce((sum, b) => sum + (b.errorCount || 0), 0);

    await db
      .update(newsletterCampaigns)
      .set({
        status: newStatus,
        recipientCount: totalSuccess,
        sentAt: allSent ? new Date() : null,
        updatedAt: new Date()
      })
      .where(eq(newsletterCampaigns.id, campaignId));
  }
}

/**
 * Create batch schedule for a large campaign
 * Batches are scheduled across multiple days with staggered times to prevent simultaneous sends
 * First batch starts at the NEXT 10:00 UTC slot (at least 1 hour in the future), 
 * subsequent batches at 10:00 UTC on following days
 * Gmail daily limit resets on a 24-hour rolling window, so spacing batches 24 hours apart is safe
 */
export async function createBatchSchedule(
  campaignId: string,
  tenantId: string,
  subscriberIds: string[],
  batchSize: number = 500
): Promise<{ batchCount: number; scheduledFor: Date[] }> {
  const batches: { subscriberIds: string[]; scheduledFor: Date }[] = [];
  const now = new Date();
  
  // Calculate send slots chronologically, starting from the first available slot
  // that is at least 1 hour in the future, then assigning subsequent slots in order
  const sendHours = [10, 14, 18]; // UTC hours for sending (staggered across day)
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  
  // Build a list of all available time slots starting from today
  const availableSlots: Date[] = [];
  const maxDays = 30; // Generate enough slots for up to 30 days (90 batches max)
  
  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    for (const hour of sendHours) {
      const slot = new Date(now);
      slot.setDate(slot.getDate() + dayOffset);
      slot.setUTCHours(hour, 0, 0, 0);
      
      // Only include slots that are at least 1 hour in the future
      if (slot > oneHourFromNow) {
        availableSlots.push(slot);
      }
    }
  }
  
  // Get the slot for a given batch index (monotonically increasing)
  const getNextSendSlot = (batchIndex: number): Date => {
    if (batchIndex >= availableSlots.length) {
      // Fallback: extend beyond 30 days if needed
      const lastSlot = availableSlots[availableSlots.length - 1];
      const extraSlot = new Date(lastSlot);
      extraSlot.setDate(extraSlot.getDate() + Math.ceil((batchIndex - availableSlots.length + 1) / sendHours.length));
      return extraSlot;
    }
    return new Date(availableSlots[batchIndex]);
  };

  for (let i = 0; i < subscriberIds.length; i += batchSize) {
    const batchSubscriberIds = subscriberIds.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    
    batches.push({
      subscriberIds: batchSubscriberIds,
      scheduledFor: getNextSendSlot(batchIndex)
    });
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await db.insert(newsletterBatchSchedule).values({
      campaignId,
      tenantId,
      batchNumber: i + 1,
      subscriberIds: batch.subscriberIds,
      recipientCount: batch.subscriberIds.length,
      scheduledFor: batch.scheduledFor,
      status: 'pending'
    });
  }

  await db
    .update(newsletterCampaigns)
    .set({ status: 'scheduled', updatedAt: new Date() })
    .where(eq(newsletterCampaigns.id, campaignId));

  return {
    batchCount: batches.length,
    scheduledFor: batches.map(b => b.scheduledFor)
  };
}
