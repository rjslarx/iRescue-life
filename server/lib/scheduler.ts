import cron from "node-cron";
import { resetDemoData } from "./demo-reset";
import { runMedicalRemindersForAllTenants } from "./medical-reminders";
import { runOnboardingEmailsJob } from "./onboarding-emails";
import { runImpactStatsCalculation, runReviewRequestEmails } from "./compliance-jobs";
import { runRetentionEmailsJob } from "./retention-emails";
import { resetMonthlyEmailQuotas } from "./email-quota-reset";
import { VolunteerThresholdAlertService } from "../services/volunteer-threshold-alerts";
import { VolunteerScheduleDigestService } from "../services/volunteer-schedule-digest";
import { VolunteerRecruitmentSmsService } from "../services/volunteer-recruitment-sms";

let schedulerInitialized = false;

/**
 * Initialize scheduled jobs
 */
export function initializeScheduler() {
  if (schedulerInitialized) {
    console.log("[Scheduler] Already initialized, skipping duplicate init");
    return;
  }
  schedulerInitialized = true;
  console.log("🕐 Initializing scheduled jobs...");

  // Schedule demo reset daily at midnight (00:00)
  // Format: minute hour day month weekday
  // "0 0 * * *" means: at minute 0, hour 0, every day
  const demoResetSchedule = process.env.DEMO_RESET_SCHEDULE || "0 0 * * *";
  
  cron.schedule(demoResetSchedule, async () => {
    console.log("Running scheduled demo reset...");
    try {
      const result = await resetDemoData();
      
      if (result.success) {
        console.log(`Demo reset completed: ${result.message}`);
      } else {
        console.error(`Demo reset failed: ${result.message}`);
      }
    } catch (error) {
      console.error(`Demo reset crashed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  const dailyBriefingEmailSchedule = process.env.DAILY_BRIEFING_EMAIL_SCHEDULE || "0 5 * * *";
  cron.schedule(dailyBriefingEmailSchedule, async () => {
    console.log("📋 Running daily briefing emails...");
    try {
      const { sendDailyBriefingForAllTenants } = await import("../services/daily-briefing-email");
      const result = await sendDailyBriefingForAllTenants();
      if (result.sent > 0) {
        console.log(`✓ Daily briefing: ${result.sent} email(s) sent`);
      }
      if (result.errors.length > 0) {
        console.warn(`⚠️ Daily briefing errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Daily briefing emails failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Daily briefing email scheduled for: ${dailyBriefingEmailSchedule} (UTC)`);

  const pendingAppsDigestSchedule = process.env.PENDING_APPS_DIGEST_SCHEDULE || "0 7 * * *";
  cron.schedule(pendingAppsDigestSchedule, async () => {
    console.log("📬 Running pending applications digest...");
    try {
      const { sendPendingApplicationsDigestForAllTenants } = await import("../services/pending-applications-digest");
      const result = await sendPendingApplicationsDigestForAllTenants();
      if (result.sent > 0) {
        console.log(`✓ Pending apps digest: ${result.sent} email(s) sent`);
      }
      if (result.errors.length > 0) {
        console.warn(`⚠️ Pending apps digest errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Pending apps digest failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Pending applications digest scheduled for: ${pendingAppsDigestSchedule} (UTC)`);

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

  // Schedule monthly email quota reset (self-healing, runs daily).
  // Resets emailsSentThisMonth for any tenant whose last reset predates the
  // current calendar month, so platform-email quotas (default 500/mo) roll over
  // instead of accumulating forever and permanently locking tenants out.
  // "0 0 * * *" means: at 00:00 every day (start of day, UTC).
  const emailQuotaResetSchedule = process.env.EMAIL_QUOTA_RESET_SCHEDULE || "0 0 * * *";

  cron.schedule(emailQuotaResetSchedule, async () => {
    try {
      const result = await resetMonthlyEmailQuotas();
      if (result.resetCount > 0) {
        console.log(`✓ Email quota reset: ${result.resetCount} tenant(s) rolled over to a new month`);
      }
    } catch (error) {
      console.error(`❌ Email quota reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Email quota reset scheduled for: ${emailQuotaResetSchedule} (UTC)`);

  // Self-heal on boot: immediately roll over any tenant overdue for a monthly
  // reset, so a deploy/restart unblocks tenants that already hit their cap
  // instead of waiting for the next scheduled run.
  void (async () => {
    try {
      const result = await resetMonthlyEmailQuotas();
      if (result.resetCount > 0) {
        console.log(`✓ Email quota reset (boot self-heal): ${result.resetCount} tenant(s) rolled over to a new month`);
      }
    } catch (error) {
      console.error(`❌ Email quota reset (boot self-heal) failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  })();

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

  // Schedule Pro trial expiration check daily at 3:00 AM UTC
  // "0 3 * * *" means: at minute 0, hour 3, every day
  // This reverts expired Pro trials back to Free tier
  const trialExpirationSchedule = process.env.TRIAL_EXPIRATION_SCHEDULE || "0 3 * * *";
  
  cron.schedule(trialExpirationSchedule, async () => {
    console.log("⏰ Running Pro trial expiration check...");
    try {
      const { runTrialExpirationCheck } = await import("./trial-expiration");
      const result = await runTrialExpirationCheck();
      if (result.expiredCount > 0) {
        console.log(`✓ Trial expiration: ${result.expiredCount} trials expired, ${result.emailsSent} notification emails sent`);
      } else {
        console.log(`✓ Trial expiration: No trials expired`);
      }
      if (result.errors.length > 0) {
        console.warn(`⚠️ Trial expiration errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`❌ Trial expiration check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Trial expiration check scheduled for: ${trialExpirationSchedule} (UTC)`);

  // Schedule storage backup daily at 4:00 AM UTC
  // "0 4 * * *" means: at minute 0, hour 4, every day
  // This backs up files from Replit Object Storage to Google Drive for all tenants
  const storageBackupSchedule = process.env.STORAGE_BACKUP_SCHEDULE || "0 4 * * *";
  
  cron.schedule(storageBackupSchedule, async () => {
    console.log("💾 Running storage backup to Google Drive...");
    try {
      const { runStorageBackupForAllTenants } = await import("./storage-backup-service");
      const result = await runStorageBackupForAllTenants();
      console.log(`✓ Storage backup: ${result.tenantsProcessed} tenants processed, ${result.totalFilesBackedUp} files backed up`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Storage backup errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Storage backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Storage backup scheduled for: ${storageBackupSchedule} (UTC)`);

  // Schedule bio/photo compliance task generation daily at 3:00 PM UTC (9:00 AM CST)
  // Must run during US daytime: this job sends SMS to fosters, and the quiet-hours
  // gate (8 PM – 6 AM local) silently blocks texts sent overnight.
  const bioPhotoComplianceSchedule = process.env.BIO_PHOTO_COMPLIANCE_SCHEDULE || "0 15 * * *";
  cron.schedule(bioPhotoComplianceSchedule, async () => {
    console.log("📸 Running bio/photo compliance task generation...");
    try {
      const { generateBioPhotoComplianceTasks, sendBioPhotoSmsToFosters } = await import("./foster-compliance-reminders");
      const { db } = await import("../db");
      const { tenants } = await import("@shared/schema");
      const allTenants = await db.select({ id: tenants.id }).from(tenants);
      let totalGenerated = 0;
      let totalSmsSent = 0;
      const errors: string[] = [];
      for (const tenant of allTenants) {
        const result = await generateBioPhotoComplianceTasks(tenant.id);
        totalGenerated += result.generated;
        errors.push(...result.errors.map(e => `${tenant.id}: ${e}`));
        const smsResult = await sendBioPhotoSmsToFosters(tenant.id);
        totalSmsSent += smsResult.sent;
        errors.push(...smsResult.errors.map(e => `${tenant.id}: ${e}`));
      }
      console.log(`✓ Bio/photo compliance: ${totalGenerated} tasks generated, ${totalSmsSent} SMS sent across ${allTenants.length} tenants`);
      if (errors.length > 0) {
        console.warn(`⚠️ Bio/photo compliance errors: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Bio/photo compliance generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Bio/photo compliance task generation scheduled for: ${bioPhotoComplianceSchedule} (UTC)`);

  // Schedule database backup daily at 9:00 AM UTC (3:00 AM CST)
  // "0 9 * * *" means: at minute 0, hour 9, every day
  // This backs up the PostgreSQL database to Google Cloud Storage
  const databaseBackupSchedule = process.env.DATABASE_BACKUP_SCHEDULE || "0 9 * * *";
  
  cron.schedule(databaseBackupSchedule, async () => {
    console.log("🗄️ Running database backup to Google Cloud Storage...");
    try {
      const { runDatabaseBackupJob } = await import("./database-backup-service");
      const result = await runDatabaseBackupJob();
      
      if (result.backup.success) {
        console.log(`✓ Database backup: ${result.backup.fileName} (${((result.backup.fileSize || 0) / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        console.error(`❌ Database backup failed: ${result.backup.message}`);
      }
      
      if (result.retention.deletedCount > 0) {
        console.log(`✓ Retention: ${result.retention.message}`);
      }
    } catch (error) {
      console.error(`❌ Database backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Database backup scheduled for: ${databaseBackupSchedule} (UTC)`);

  // Schedule foster compliance reminders daily at 3:30 PM UTC (9:30 AM CST)
  // This creates new reminders and sends warning emails/SMS. Must run during US
  // daytime: SMS sent overnight are blocked by the quiet-hours gate (8 PM – 6 AM local).
  const fosterComplianceSchedule = process.env.FOSTER_COMPLIANCE_SCHEDULE || "30 15 * * *";
  
  cron.schedule(fosterComplianceSchedule, async () => {
    console.log("📋 Running foster compliance reminders job...");
    try {
      const { runFosterComplianceRemindersForAllTenants } = await import("./foster-compliance-reminders");
      const result = await runFosterComplianceRemindersForAllTenants();
      console.log(`✓ Foster compliance: ${result.tenantsProcessed} tenants, ${result.remindersCreated} reminders created, ${result.notificationsSent} notifications sent`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Foster compliance errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Foster compliance reminders failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Foster compliance reminders scheduled for: ${fosterComplianceSchedule} (UTC)`);

  // Schedule hourly medication SMS digest
  // Runs at the top of every hour; sends grouped 'DONE'-able SMS to fosters with tasks due this hour
  cron.schedule("0 * * * *", async () => {
    console.log("💊 Running hourly medication SMS digest...");
    try {
      const { sendMedicationDigestForAllTenants } = await import("../services/medicationSmsDigest");
      const result = await sendMedicationDigestForAllTenants();
      if (result.sent > 0) {
        console.log(`✓ Medication digest: ${result.sent} SMS sent`);
      }
      if (result.errors.length > 0) {
        console.warn(`⚠️ Medication digest errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Medication SMS digest failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Hourly medication SMS digest scheduled: 0 * * * * (UTC)`);

  const fosterNudgeSchedule = process.env.FOSTER_NUDGE_SCHEDULE || "0 17 * * *";
  cron.schedule(fosterNudgeSchedule, async () => {
    console.log("💊 Running foster evening nudge reminders...");
    try {
      const { sendFosterNudgeForAllTenants } = await import("../services/medicationSmsDigest");
      const result = await sendFosterNudgeForAllTenants();
      if (result.sent > 0) {
        console.log(`✓ Foster nudge: ${result.sent} SMS sent`);
      }
      if (result.errors.length > 0) {
        console.warn(`⚠️ Foster nudge errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Foster nudge reminders failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Foster evening nudge scheduled for: ${fosterNudgeSchedule} (UTC)`);

  // Schedule foster appointment reminders daily at 14:00 UTC (10 AM Eastern)
  // Sends 24-hour advance reminder SMS to fosters whose animal has a pending exam tomorrow
  cron.schedule("0 14 * * *", async () => {
    console.log("📅 Running foster appointment reminders (24h before exams)...");
    try {
      const { sendAppointmentRemindersForAllTenants } = await import("./foster-compliance-reminders");
      const result = await sendAppointmentRemindersForAllTenants();
      console.log(`✓ Appointment reminders: ${result.sent} SMS sent`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Appointment reminder errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Foster appointment reminders failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Foster appointment reminders scheduled for: 0 14 * * * (UTC)`);

  // Schedule surgery day reminder SMS hourly so the per-tenant gate inside
  // runSurgeryDayRemindersForAllTenants can honor each tenant's local
  // timezone (firing ~6 PM the night before the surgery, no matter where the
  // rescue is). Tenants without a configured timezone fall back to the legacy
  // "midnight UTC" behavior, which the service enforces internally.
  const surgeryDayReminderSchedule = process.env.SURGERY_DAY_REMINDER_SCHEDULE || "0 * * * *";

  cron.schedule(surgeryDayReminderSchedule, async () => {
    console.log("🩺 Running surgery day reminder SMS job...");
    try {
      const { runSurgeryDayRemindersForAllTenants } = await import("../services/surgery-day-reminders");
      const result = await runSurgeryDayRemindersForAllTenants();
      console.log(`✓ Surgery day reminders: ${result.tenantsProcessed} tenants processed, ${result.remindersSent} SMS sent`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Surgery day reminder errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Surgery day reminders failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Surgery day reminders scheduled for: ${surgeryDayReminderSchedule} (UTC)`);

  // Schedule volunteer day-before shift reminders hourly so the per-tenant gate
  // inside runVolunteerShiftRemindersForAllTenants can honor each tenant's local
  // timezone (firing at the tenant's configured hour, default 5 PM, the evening
  // before the shift). The per-event reminder_email_sent_at dedupe column
  // prevents double-sends across hourly runs.
  const volunteerShiftReminderSchedule = process.env.VOLUNTEER_SHIFT_REMINDER_SCHEDULE || "0 * * * *";

  cron.schedule(volunteerShiftReminderSchedule, async () => {
    console.log("📅 Running volunteer shift reminder emails...");
    try {
      const { runVolunteerShiftRemindersForAllTenants } = await import("../services/volunteer-shift-reminders");
      const result = await runVolunteerShiftRemindersForAllTenants();
      if (result.remindersSent > 0) {
        console.log(`✓ Volunteer shift reminders: ${result.tenantsProcessed} tenants processed, ${result.remindersSent} emails sent`);
      }
      if (result.errors.length > 0) {
        console.warn(`⚠️ Volunteer shift reminder errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`❌ Volunteer shift reminders failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Volunteer shift reminders scheduled for: ${volunteerShiftReminderSchedule} (UTC)`);

  // Schedule foster compliance escalation hourly
  // "0 * * * *" means: at minute 0, every hour
  // This escalates overdue reminders (24h → overdue, 48h → requires_intervention)
  const fosterEscalationSchedule = process.env.FOSTER_ESCALATION_SCHEDULE || "0 * * * *";
  
  cron.schedule(fosterEscalationSchedule, async () => {
    try {
      const { db } = await import("../db");
      const { tenants } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { escalateOverdueReminders } = await import("./foster-compliance-reminders");
      
      const activeTenants = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.isActive, true));

      let totalEscalated = 0;
      for (const tenant of activeTenants) {
        const result = await escalateOverdueReminders(tenant.id);
        totalEscalated += result.escalated;
      }
      
      if (totalEscalated > 0) {
        console.log(`⚠️ Foster escalation: ${totalEscalated} reminders escalated`);
      }
    } catch (error) {
      console.error(`❌ Foster escalation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Foster compliance escalation scheduled for: ${fosterEscalationSchedule} (UTC)`);

  const adopterComplianceSchedule = process.env.ADOPTER_COMPLIANCE_SCHEDULE || "0 14 * * *";
  
  cron.schedule(adopterComplianceSchedule, async () => {
    console.log("Running adopter compliance notifications job...");
    try {
      const {
        runAdopterComplianceForAllTenants,
        sendSpayNeuterWarningsForAllTenants,
        sendAnnualVaccineRemindersForAllTenants,
        escalateOverdueSpayNeuterForAllTenants,
      } = await import("./adopter-compliance-notifications");

      // 0. Defense-in-depth sweep (Task #167): catch any adopted animals
      // missing an adoptions row before the warning engine runs, so the
      // heartworm/parasite-prevention compliance jobs below don't silently
      // skip them. Idempotent — does nothing on quiet days.
      try {
        const { runAdoptionsOrphanSweep } = await import("./adoptions-orphan-sweep");
        const sweepResult = await runAdoptionsOrphanSweep();
        if (sweepResult.totalInserted > 0 || sweepResult.totalOrphans > 0) {
          console.log(
            `✓ Adoptions orphan sweep: inserted=${sweepResult.totalInserted}, orphansRemaining=${sweepResult.totalOrphans}`,
          );
        }
        if (sweepResult.errors.length > 0) {
          console.warn(`Adoptions orphan sweep errors: ${sweepResult.errors.slice(0, 3).join('; ')}`);
        }
      } catch (sweepErr) {
        console.error(
          `Adoptions orphan sweep failed: ${sweepErr instanceof Error ? sweepErr.message : 'Unknown error'}`,
        );
      }

      // 1. Core vaccine/preventative compliance reminders
      const result = await runAdopterComplianceForAllTenants();
      console.log(`Adopter compliance: ${result.tenantsProcessed} tenants, ${result.totalEmailsSent} emails, ${result.totalSmsSent} SMS sent`);
      if (result.errors.length > 0) {
        console.warn(`Adopter compliance errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }

      // 2. Spay/Neuter 14-day warning SMS
      const snResult = await sendSpayNeuterWarningsForAllTenants();
      if (snResult.sent > 0) console.log(`✓ Spay/neuter warnings: ${snResult.sent} SMS sent`);
      if (snResult.errors.length > 0) console.warn(`Spay/neuter warning errors: ${snResult.errors.slice(0, 3).join('; ')}`);

      // 3. Spay/Neuter breach escalation (overdue with no proof)
      const breachResult = await escalateOverdueSpayNeuterForAllTenants();
      if (breachResult.escalated > 0) console.log(`✓ Spay/neuter breaches: ${breachResult.escalated} escalated, ${breachResult.notified} notified`);
      if (breachResult.errors.length > 0) console.warn(`Spay/neuter breach errors: ${breachResult.errors.slice(0, 3).join('; ')}`);

      // 4. Annual vaccine planning reminder SMS (11-month mark)
      const avResult = await sendAnnualVaccineRemindersForAllTenants();
      if (avResult.sent > 0) console.log(`✓ Annual vaccine reminders: ${avResult.sent} SMS sent`);
      if (avResult.errors.length > 0) console.warn(`Annual vaccine reminder errors: ${avResult.errors.slice(0, 3).join('; ')}`);

      // 5. Heartworm/parasite-prevention contract-enforcement warnings (≥14d overdue, no proof)
      const { runComplianceWarningsForAllTenants } = await import("./adopter-compliance-warnings");
      const hwResult = await runComplianceWarningsForAllTenants();
      if (hwResult.totalSent > 0) console.log(`✓ Heartworm compliance warnings: ${hwResult.totalSent} sent across ${hwResult.tenantsProcessed} tenants`);
      if (hwResult.errors.length > 0) console.warn(`Heartworm warning errors: ${hwResult.errors.slice(0, 3).join('; ')}`);
    } catch (error) {
      console.error(`Adopter compliance notifications failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`Adopter compliance notifications scheduled for: ${adopterComplianceSchedule} (UTC)`);

  // Schedule calendar share image cleanup daily at 5:00 AM UTC
  // "0 5 * * *" means: at minute 0, hour 5, every day
  // This deletes calendar share images older than 14 days from object storage
  const calendarShareCleanupSchedule = process.env.CALENDAR_SHARE_CLEANUP_SCHEDULE || "0 5 * * *";

  cron.schedule(calendarShareCleanupSchedule, async () => {
    console.log("Running calendar share image cleanup...");
    try {
      const { runCalendarShareCleanup } = await import("./calendar-share-cleanup");
      const result = await runCalendarShareCleanup();
      if (result.totalFilesDeleted > 0) {
        console.log(`Calendar share cleanup: ${result.tenantsProcessed} tenants processed, ${result.totalFilesDeleted} old images deleted`);
      }
      if (result.errors.length > 0) {
        console.warn(`Calendar share cleanup errors: ${result.errors.slice(0, 5).join('; ')}${result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''}`);
      }
    } catch (error) {
      console.error(`Calendar share cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`Calendar share cleanup scheduled for: ${calendarShareCleanupSchedule} (UTC)`);

  // Shop order expiry — cancel abandoned unpaid checkouts (pending/processing
  // for >24h). Raffle drawings already only include paid orders; this keeps
  // the staff orders list clean. Runs hourly.
  const shopOrderExpirySchedule = process.env.SHOP_ORDER_EXPIRY_SCHEDULE || "45 * * * *";
  cron.schedule(shopOrderExpirySchedule, async () => {
    try {
      const { expireAbandonedShopOrders } = await import("./shop-order-expiry");
      const cancelled = await expireAbandonedShopOrders(24);
      if (cancelled > 0) {
        console.log(`🛒 Shop order expiry: cancelled ${cancelled} abandoned unpaid order(s)`);
      }
    } catch (error) {
      console.error(`❌ Shop order expiry failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, { timezone: "UTC" });
  console.log(`✓ Shop order expiry scheduled: ${shopOrderExpirySchedule} (UTC)`);

  // Volunteer Recruitment SMS — weekly + urgent run sequentially to prevent race-condition duplicates
  cron.schedule('30 0 * * *', async () => {
    try {
      await VolunteerRecruitmentSmsService.checkAndRunAllTenants('weekly');
    } catch (err: any) {
      console.error('[Scheduler] Volunteer recruitment weekly SMS error:', err.message);
    }
    try {
      await VolunteerRecruitmentSmsService.checkAndRunAllTenants('urgent');
    } catch (err: any) {
      console.error('[Scheduler] Volunteer recruitment urgent SMS error:', err.message);
    }
  }, { timezone: "UTC" });
  console.log("✓ Volunteer recruitment SMS (weekly + urgent) scheduled: 30 0 * * * (UTC / 6:30 PM CST)");

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

  cron.schedule("* * * * *", async () => {
    try {
      const { processMessageQueue } = await import("../services/message-queue-dispatcher");
      const result = await processMessageQueue();
      if (result.processed > 0) {
        console.log(`📨 Message queue: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped (paused)`);
      }
    } catch (error) {
      console.error(`❌ Message queue dispatcher failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, {
    timezone: "UTC"
  });

  console.log(`✓ Message queue dispatcher scheduled: * * * * * (every minute, UTC)`);

  // Reconcile any donor with an active recurring donation but no matching
  // `subscriptions` row — happens when Stripe's checkout.session.completed
  // event lands without `session.subscription` populated. Runs hourly so the
  // donor shows up in the VIP roster + Wall of Heroes within an hour at most.
  const subReconcilerSchedule = process.env.SUB_RECONCILER_SCHEDULE || "15 * * * *";
  cron.schedule(subReconcilerSchedule, async () => {
    try {
      const { reconcileMissingSubscriptions } = await import("./subscription-reconciler");
      const result = await reconcileMissingSubscriptions();
      if (result.totalCreated > 0) {
        console.log(`🔄 Sub reconciler: created ${result.totalCreated} missing subscription row(s) across ${result.tenantsProcessed} tenants`);
      }
      const errors = result.results.flatMap((r) => r.errors);
      if (errors.length > 0) {
        console.warn(`⚠️ Sub reconciler errors (${errors.length}): ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ""}`);
      }
    } catch (error) {
      console.error(`❌ Sub reconciler failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, {
    timezone: "UTC",
  });

  console.log(`✓ Subscription reconciler scheduled: ${subReconcilerSchedule} (UTC)`);

  // Govee temperature poller — fetch latest readings from Govee for every
  // tenant with an active integration. Default every 10 minutes so the
  // dashboard temperature widget never goes more than ~10 min stale.
  const goveePollerSchedule = process.env.GOVEE_POLLER_SCHEDULE || "*/10 * * * *";
  cron.schedule(goveePollerSchedule, async () => {
    try {
      const { runGoveePollOnce } = await import("../services/govee-poller");
      await runGoveePollOnce();
    } catch (error) {
      console.error(`❌ Govee poller failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, {
    timezone: "UTC",
  });

  console.log(`✓ Govee temperature poller scheduled: ${goveePollerSchedule} (UTC)`);

  // Task #197 — daily VIP gift announcement email job. Runs once per day
  // and sends "you've been honored" notes to honorees whose announcement
  // date has arrived. Idempotent via subscription_gifts.announcement_sent_at.
  const giftAnnouncementSchedule = process.env.VIP_GIFT_ANNOUNCEMENT_SCHEDULE || "0 13 * * *";
  cron.schedule(giftAnnouncementSchedule, async () => {
    console.log("🎁 Running VIP gift announcement job...");
    try {
      const { runGiftAnnouncementJob } = await import("../services/vip-gift-emails");
      const result = await runGiftAnnouncementJob();
      if (result.sent || result.failed || result.skipped) {
        console.log(`✓ VIP gift announcements: sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}`);
      }
    } catch (error) {
      console.error(`❌ VIP gift announcement job failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, { timezone: "UTC" });
  console.log(`✓ VIP gift announcements scheduled: ${giftAnnouncementSchedule} (UTC)`);

  // Kick off an immediate poll on startup so dashboards aren't stale until
  // the first scheduled tick fires.
  (async () => {
    try {
      const { runGoveePollOnce } = await import("../services/govee-poller");
      await runGoveePollOnce();
    } catch (error) {
      console.error(`❌ Initial Govee poll failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  })();
}
