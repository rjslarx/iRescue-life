import cron from "node-cron";
import { resetDemoData } from "./demo-reset";
import { runMedicalRemindersForAllTenants } from "./medical-reminders";
import { runOnboardingEmailsJob } from "./onboarding-emails";
import { runImpactStatsCalculation, runReviewRequestEmails } from "./compliance-jobs";
import { runRetentionEmailsJob } from "./retention-emails";
import { VolunteerThresholdAlertService } from "../services/volunteer-threshold-alerts";
import { VolunteerScheduleDigestService } from "../services/volunteer-schedule-digest";

/**
 * Initialize scheduled jobs
 */
export function initializeScheduler() {
  console.log("🕐 Initializing scheduled jobs...");

  // Schedule demo reset daily at midnight (00:00)
  // Format: minute hour day month weekday
  // "0 0 * * *" means: at minute 0, hour 0, every day
  const demoResetSchedule = process.env.DEMO_RESET_SCHEDULE || "0 0 * * *";
  
  cron.schedule(demoResetSchedule, async () => {
    console.log("⏰ Running scheduled demo reset...");
    const result = await resetDemoData();
    
    if (result.success) {
      console.log(`✓ ${result.message}`);
    } else {
      console.error(`❌ Demo reset failed: ${result.message}`);
    }
  }, {
    timezone: "UTC" // Use UTC for consistent scheduling across environments
  });

  console.log(`✓ Demo reset scheduled for: ${demoResetSchedule} (UTC)`);
  
  // Schedule medical reminders daily at 8:00 AM UTC
  // "0 8 * * *" means: at minute 0, hour 8, every day
  const medicalReminderSchedule = process.env.MEDICAL_REMINDER_SCHEDULE || "0 8 * * *";
  
  cron.schedule(medicalReminderSchedule, async () => {
    console.log("🏥 Running medical reminders job...");
    try {
      const result = await runMedicalRemindersForAllTenants();
      console.log(`✓ Medical reminders: ${result.tenantsProcessed} tenants processed, ${result.totalEmailsSent} emails sent`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Medical reminder errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`❌ Medical reminders failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Medical reminders scheduled for: ${medicalReminderSchedule} (UTC)`);

  // Schedule onboarding emails daily at 10:00 AM UTC
  // "0 10 * * *" means: at minute 0, hour 10, every day
  // This sends Day 2 follow-up emails to encourage engagement
  const onboardingEmailSchedule = process.env.ONBOARDING_EMAIL_SCHEDULE || "0 10 * * *";
  
  cron.schedule(onboardingEmailSchedule, async () => {
    console.log("📧 Running onboarding emails job...");
    try {
      const result = await runOnboardingEmailsJob();
      console.log(`✓ Onboarding emails: ${result.emailsSent} emails sent`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Onboarding email errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`❌ Onboarding emails failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Onboarding emails scheduled for: ${onboardingEmailSchedule} (UTC)`);

  // Schedule impact stats calculation daily at 2:00 AM UTC
  // "0 2 * * *" means: at minute 0, hour 2, every day
  const impactStatsSchedule = process.env.IMPACT_STATS_SCHEDULE || "0 2 * * *";
  
  cron.schedule(impactStatsSchedule, async () => {
    console.log("📊 Running impact stats calculation...");
    try {
      const result = await runImpactStatsCalculation();
      console.log(`✓ Impact stats: ${result.tenantsProcessed} tenants processed, ${result.successCount} updated`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Impact stats errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`❌ Impact stats calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Impact stats scheduled for: ${impactStatsSchedule} (UTC)`);

  // Schedule GreatNonprofits review request emails daily at 11:00 AM UTC
  // "0 11 * * *" means: at minute 0, hour 11, every day
  const reviewRequestSchedule = process.env.REVIEW_REQUEST_SCHEDULE || "0 11 * * *";
  
  cron.schedule(reviewRequestSchedule, async () => {
    console.log("⭐ Running review request emails...");
    try {
      const result = await runReviewRequestEmails();
      console.log(`✓ Review requests: ${result.tenantsProcessed} tenants processed, ${result.successCount} emails sent`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Review request errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`❌ Review request emails failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Review request emails scheduled for: ${reviewRequestSchedule} (UTC)`);

  // Schedule adoption retention emails daily at 9:00 AM UTC (3-3-3 Rule)
  // "0 9 * * *" means: at minute 0, hour 9, every day
  const retentionEmailSchedule = process.env.RETENTION_EMAIL_SCHEDULE || "0 9 * * *";
  
  cron.schedule(retentionEmailSchedule, async () => {
    console.log("🐾 Running adoption retention emails (3-3-3 Rule)...");
    try {
      const result = await runRetentionEmailsJob();
      console.log(`✓ Retention emails: ${result.tenantsProcessed} tenants, ${result.emailsSent} sent, ${result.emailsCancelled} cancelled`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Retention email errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`❌ Retention emails failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Retention emails scheduled for: ${retentionEmailSchedule} (UTC)`);

  // Schedule volunteer threshold alerts every hour (they have their own internal timing logic)
  // "0 * * * *" means: at minute 0, every hour
  const volunteerAlertSchedule = process.env.VOLUNTEER_ALERT_SCHEDULE || "0 * * * *";
  
  cron.schedule(volunteerAlertSchedule, async () => {
    console.log("👥 Running volunteer threshold alert check...");
    try {
      const results = await VolunteerThresholdAlertService.checkAllAlerts();
      const alertsSent = results.filter(r => r.shortages.length > 0).length;
      const totalShortages = results.reduce((sum, r) => sum + r.shortages.length, 0);
      console.log(`✓ Volunteer alerts: ${alertsSent} alerts triggered, ${totalShortages} shortages detected`);
    } catch (error) {
      console.error(`❌ Volunteer threshold alerts failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Volunteer threshold alerts scheduled for: ${volunteerAlertSchedule} (UTC)`);

  // Schedule volunteer schedule digest hourly (the service has its own day/time logic)
  // "30 * * * *" means: at minute 30, every hour
  const volunteerDigestSchedule = process.env.VOLUNTEER_DIGEST_SCHEDULE || "30 * * * *";
  
  cron.schedule(volunteerDigestSchedule, async () => {
    console.log("📅 Running volunteer schedule digest check...");
    try {
      const results = await VolunteerScheduleDigestService.checkAndSendAllDigests();
      const totalSent = results.reduce((sum, r) => sum + r.emailsSent, 0);
      const tenantsProcessed = results.length;
      console.log(`✓ Volunteer digest: ${tenantsProcessed} tenants processed, ${totalSent} emails sent`);
      
      for (const result of results) {
        if (result.errors.length > 0) {
          console.warn(`⚠️ Digest errors for ${result.tenantName}: ${result.errors.join('; ')}`);
        }
      }
    } catch (error) {
      console.error(`❌ Volunteer schedule digest failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Volunteer schedule digest scheduled for: ${volunteerDigestSchedule} (UTC)`);

  // Schedule newsletter batch processing every 15 minutes
  // "*/15 * * * *" means: at minute 0, 15, 30, 45 of every hour
  const newsletterBatchSchedule = process.env.NEWSLETTER_BATCH_SCHEDULE || "*/15 * * * *";
  
  cron.schedule(newsletterBatchSchedule, async () => {
    console.log("📧 Running newsletter batch processor...");
    try {
      const { processScheduledBatches } = await import("./newsletter-batch-processor");
      const result = await processScheduledBatches();
      if (result.batchesProcessed > 0) {
        console.log(`✓ Newsletter batches: ${result.batchesProcessed} batches processed, ${result.emailsSent} emails sent`);
      }
      if (result.errors.length > 0) {
        console.warn(`⚠️ Newsletter batch errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`❌ Newsletter batch processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Newsletter batch processor scheduled for: ${newsletterBatchSchedule} (UTC)`);
  
  // Log next scheduled run times
  const nextMidnight = new Date();
  nextMidnight.setUTCHours(24, 0, 0, 0); // Next midnight UTC
  console.log(`   Next demo reset will run at: ${nextMidnight.toISOString()}`);
  
  const next8AM = new Date();
  next8AM.setUTCHours(8, 0, 0, 0);
  if (next8AM <= new Date()) {
    next8AM.setDate(next8AM.getDate() + 1);
  }
  console.log(`   Next medical reminder will run at: ${next8AM.toISOString()}`);

  const next10AM = new Date();
  next10AM.setUTCHours(10, 0, 0, 0);
  if (next10AM <= new Date()) {
    next10AM.setDate(next10AM.getDate() + 1);
  }
  console.log(`   Next onboarding email will run at: ${next10AM.toISOString()}`);

  const next2AM = new Date();
  next2AM.setUTCHours(2, 0, 0, 0);
  if (next2AM <= new Date()) {
    next2AM.setDate(next2AM.getDate() + 1);
  }
  console.log(`   Next impact stats calculation will run at: ${next2AM.toISOString()}`);

  const next11AM = new Date();
  next11AM.setUTCHours(11, 0, 0, 0);
  if (next11AM <= new Date()) {
    next11AM.setDate(next11AM.getDate() + 1);
  }
  console.log(`   Next review request emails will run at: ${next11AM.toISOString()}`);

  const next9AM = new Date();
  next9AM.setUTCHours(9, 0, 0, 0);
  if (next9AM <= new Date()) {
    next9AM.setDate(next9AM.getDate() + 1);
  }
  console.log(`   Next retention emails will run at: ${next9AM.toISOString()}`);
}
