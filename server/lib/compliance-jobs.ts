import { db } from '../db';
import { 
  tenants, 
  animals, 
  impactStats, 
  reviewRequests,
  applications,
} from '@shared/schema';
import { eq, and, gte, lt, lte, desc, sql } from 'drizzle-orm';
import { EmailService } from './email-service';

interface JobResult {
  tenantsProcessed: number;
  successCount: number;
  errors: string[];
}

/**
 * Calculate and store impact stats (Live Release Rate) for all tenants
 * Runs nightly to update stats for each tenant with impact tracking enabled
 */
export async function runImpactStatsCalculation(): Promise<JobResult> {
  const result: JobResult = {
    tenantsProcessed: 0,
    successCount: 0,
    errors: [],
  };

  try {
    const allTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        impactSettings: tenants.impactSettings,
      })
      .from(tenants);

    for (const tenant of allTenants) {
      try {
        const settings = (tenant.impactSettings as any) || {};
        
        if (!settings.enabled) {
          continue;
        }

        result.tenantsProcessed++;

        const periodType = settings.periodType || 'rolling_12_months';
        const excludeOre = settings.excludeOre !== false;

        const endDate = new Date();
        let startDate: Date;

        switch (periodType) {
          case 'monthly':
            startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
            break;
          case 'quarterly':
            startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 3, 1);
            break;
          case 'annual':
            startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), 1);
            break;
          default:
            startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());
        }

        const animalsWithOutcomes = await db
          .select({
            id: animals.id,
            status: animals.status,
            adoptionDate: animals.adoptionDate,
            deceasedDate: animals.deceasedDate,
            causeOfDeath: animals.causeOfDeath,
            intakeDate: animals.intakeDate,
          })
          .from(animals)
          .where(eq(animals.tenantId, tenant.id));

        let liveOutcomes = 0;
        let totalOutcomes = 0;
        let adoptionsCount = 0;
        let transfersOutCount = 0;
        let returnedToOwnerCount = 0;
        let euthanasiaCount = 0;
        let diedInCareCount = 0;
        let ownerRequestedEuthanasia = 0;
        let totalIntakes = 0;

        for (const animal of animalsWithOutcomes) {
          if (animal.intakeDate) {
            const intakeDate = new Date(animal.intakeDate);
            if (intakeDate >= startDate && intakeDate < endDate) {
              totalIntakes++;
            }
          }

          const outcomeDate = animal.adoptionDate || animal.deceasedDate;
          if (!outcomeDate) continue;

          const outDate = new Date(outcomeDate);
          if (outDate < startDate || outDate >= endDate) continue;

          totalOutcomes++;

          if (animal.status === 'adopted') {
            liveOutcomes++;
            adoptionsCount++;
          } else if (animal.status === 'transferred_out') {
            liveOutcomes++;
            transfersOutCount++;
          } else if (animal.status === 'returned_to_owner') {
            liveOutcomes++;
            returnedToOwnerCount++;
          } else if (animal.status === 'returned_to_field') {
            liveOutcomes++;
          } else if (animal.status === 'owner_intended_euthanasia') {
            ownerRequestedEuthanasia++;
            euthanasiaCount++;
          } else if (animal.status === 'deceased') {
            if (animal.causeOfDeath === 'euthanasia') {
              euthanasiaCount++;
            } else {
              diedInCareCount++;
            }
          }
        }

        const denominator = excludeOre ? (totalOutcomes - ownerRequestedEuthanasia) : totalOutcomes;
        const liveReleaseRate = denominator > 0 ? (liveOutcomes / denominator * 100).toFixed(2) : '0.00';

        await db.insert(impactStats).values({
          tenantId: tenant.id,
          periodStart: startDate,
          periodEnd: endDate,
          periodType,
          liveOutcomes,
          totalOutcomes,
          ownerRequestedEuthanasia,
          excludedOre: excludeOre,
          liveReleaseRate: liveReleaseRate,
          totalIntakes,
          adoptionsCount,
          transfersOutCount,
          returnedToOwnerCount,
          euthanasiaCount,
          diedInCareCount,
        });

        result.successCount++;
      } catch (error) {
        result.errors.push(`Tenant ${tenant.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  } catch (error) {
    result.errors.push(`Global error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Send GreatNonprofits review request emails to adopters
 * Sends emails to adopters who adopted X days ago (configurable delay)
 */
export async function runReviewRequestEmails(): Promise<JobResult> {
  const result: JobResult = {
    tenantsProcessed: 0,
    successCount: 0,
    errors: [],
  };

  try {
    const allTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
        greatNonprofitsSettings: tenants.greatNonprofitsSettings,
      })
      .from(tenants);

    for (const tenant of allTenants) {
      try {
        const settings = (tenant.greatNonprofitsSettings as any) || {};
        
        if (!settings.enabled || !settings.reviewUrl) {
          continue;
        }

        result.tenantsProcessed++;

        const delayDays = settings.delayDays || 7;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - delayDays);
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const pendingRequests = await db
          .select()
          .from(reviewRequests)
          .where(and(
            eq(reviewRequests.tenantId, tenant.id),
            eq(reviewRequests.status, 'pending'),
            gte(reviewRequests.scheduledFor, startOfDay),
            lt(reviewRequests.scheduledFor, endOfDay),
          ));

        if (pendingRequests.length === 0) {
          const recentAdoptions = await db
            .select({
              id: applications.id,
              applicantName: applications.applicantName,
              applicantEmail: applications.applicantEmail,
              animalId: applications.animalId,
              updatedAt: applications.updatedAt,
            })
            .from(applications)
            .where(and(
              eq(applications.tenantId, tenant.id),
              eq(applications.status, 'approved'),
              gte(applications.updatedAt, startOfDay),
              lt(applications.updatedAt, endOfDay),
            ));

          for (const adoption of recentAdoptions) {
            if (!adoption.applicantEmail) continue;

            const existingRequest = await db
              .select({ id: reviewRequests.id })
              .from(reviewRequests)
              .where(and(
                eq(reviewRequests.tenantId, tenant.id),
                eq(reviewRequests.adopterEmail, adoption.applicantEmail),
              ))
              .limit(1);

            if (existingRequest.length > 0) continue;

            await db.insert(reviewRequests).values({
              tenantId: tenant.id,
              adoptionApplicationId: adoption.id,
              adopterName: adoption.applicantName,
              adopterEmail: adoption.applicantEmail,
              status: 'pending',
              scheduledFor: new Date(),
            });
          }
        }

        const requestsToSend = await db
          .select()
          .from(reviewRequests)
          .where(and(
            eq(reviewRequests.tenantId, tenant.id),
            eq(reviewRequests.status, 'pending'),
            lte(reviewRequests.scheduledFor, new Date()),
          ))
          .limit(50);

        const emailService = await EmailService.forTenant(tenant.id);
        if (!emailService) {
          result.errors.push(`Tenant ${tenant.name}: No email service available`);
          continue;
        }

        const emailSubject = settings.emailSubject || 'Share your adoption experience!';

        for (const request of requestsToSend) {
          try {
            const emailHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Thank you for adopting from ${tenant.name}!</h2>
                <p>Dear ${request.adopterName},</p>
                <p>We hope your new family member is settling in well! Your adoption experience matters to us and to other potential adopters.</p>
                <p>Would you mind taking a moment to share your experience on GreatNonprofits? Your review helps other people find us and supports our mission to save more animals.</p>
                <p style="text-align: center; margin: 30px 0;">
                  <a href="${settings.reviewUrl}" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Write a Review
                  </a>
                </p>
                <p>Thank you for being a part of our rescue family!</p>
                <p>With gratitude,<br>${tenant.name}</p>
              </div>
            `;

            const sendResult = await emailService.send({
              to: request.adopterEmail,
              subject: emailSubject,
              html: emailHtml,
            });

            if (sendResult.success) {
              await db
                .update(reviewRequests)
                .set({
                  status: 'sent',
                  sentAt: new Date(),
                })
                .where(eq(reviewRequests.id, request.id));
              result.successCount++;
            } else {
              await db
                .update(reviewRequests)
                .set({
                  status: 'failed',
                  errorMessage: sendResult.error,
                })
                .where(eq(reviewRequests.id, request.id));
              result.errors.push(`Failed to send to ${request.adopterEmail}: ${sendResult.error}`);
            }
          } catch (error) {
            result.errors.push(`Request ${request.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      } catch (error) {
        result.errors.push(`Tenant ${tenant.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  } catch (error) {
    result.errors.push(`Global error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}
