import { db } from "../db";
import {
  tenants,
  users,
  animals,
  applications,
  contacts,
  payments,
  donations,
  expenditures,
  calendarEvents,
  volunteerOpportunities,
  volunteerApplications,
  fosterApplications,
  newsletterSubscribers,
  customPages,
  documents,
  adoptionFormFields,
  fosterFormFields,
  volunteerFormFields,
  supplyItems,
  supplyRequests,
  fosterAnimals,
  fosterUpdates,
  calendars,
  calendarPermissions,
  pagePermissions,
  vaccineRecords,
  medicalExams,
  diagnosticTests,
  procedureLogs,
  medicalPrescriptions,
  medicalDoses,
  medicalFiles,
  medicalBills,
  tasks,
  happyTails,
  platformIntegrations,
  kennels,
  animalSurrenders,
  featureFlags,
  auditLogs,
  platformAnnouncements,
  pushSubscriptions,
  adoptions,
  volunteerSignups,
  fosterRequests,
  animalNotes,
  medicalRecordPermissions,
  medicalRecordRolePermissions,
  globalMedicalRecordRolePermissions,
  controlledSubstanceLog,
  supplyCategories,
  supplyDonations,
  animalPlatformSyncs,
  calendarRolePermissions,
  rescueContacts,
  inboundEmails,
  platformFeedback,
} from "@shared/schema";
import { eq, and, ne } from "drizzle-orm";
import bcrypt from "bcrypt";

const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "Demo123!";

/**
 * Reset demo tenant data to a clean state
 * - Preserves the demo tenant and admin user
 * - Deletes all other data associated with the demo tenant
 * - Resets email quota counters
 */
export async function resetDemoData(): Promise<{
  success: boolean;
  message: string;
  deletedCounts?: Record<string, number>;
}> {
  try {
    console.log("🔄 Starting demo data reset...");

    // Find demo tenant
    const demoTenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.subdomain, "demo"))
      .limit(1);

    if (demoTenant.length === 0) {
      return {
        success: false,
        message: "Demo tenant not found",
      };
    }

    const tenant = demoTenant[0];
    const tenantId = tenant.id;

    console.log(`✓ Found demo tenant: ${tenant.name}`);

    const adminUser = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, "admin@demo.com")))
      .limit(1);

    const adminUserId = adminUser.length > 0 ? adminUser[0].id : null;

    if (!adminUserId) {
      console.warn("⚠️  Admin user not found - will recreate");
    }

    const passwordHash = !adminUserId ? await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10) : null;

    const deletedCounts: Record<string, number> = {};

    await db.transaction(async (tx) => {
      deletedCounts.medicalDoses = (await tx.delete(medicalDoses).where(eq(medicalDoses.tenantId, tenantId))).rowCount || 0;
      deletedCounts.medicalPrescriptions = (await tx.delete(medicalPrescriptions).where(eq(medicalPrescriptions.tenantId, tenantId))).rowCount || 0;
      deletedCounts.vaccineRecords = (await tx.delete(vaccineRecords).where(eq(vaccineRecords.tenantId, tenantId))).rowCount || 0;
      deletedCounts.medicalExams = (await tx.delete(medicalExams).where(eq(medicalExams.tenantId, tenantId))).rowCount || 0;
      deletedCounts.diagnosticTests = (await tx.delete(diagnosticTests).where(eq(diagnosticTests.tenantId, tenantId))).rowCount || 0;
      deletedCounts.procedureLogs = (await tx.delete(procedureLogs).where(eq(procedureLogs.tenantId, tenantId))).rowCount || 0;
      deletedCounts.medicalFiles = (await tx.delete(medicalFiles).where(eq(medicalFiles.tenantId, tenantId))).rowCount || 0;
      deletedCounts.medicalBills = (await tx.delete(medicalBills).where(eq(medicalBills.tenantId, tenantId))).rowCount || 0;
      deletedCounts.medicalRecordPermissions = (await tx.delete(medicalRecordPermissions).where(eq(medicalRecordPermissions.tenantId, tenantId))).rowCount || 0;
      deletedCounts.medicalRecordRolePermissions = (await tx.delete(medicalRecordRolePermissions).where(eq(medicalRecordRolePermissions.tenantId, tenantId))).rowCount || 0;
      deletedCounts.globalMedicalRecordRolePermissions = (await tx.delete(globalMedicalRecordRolePermissions).where(eq(globalMedicalRecordRolePermissions.tenantId, tenantId))).rowCount || 0;
      deletedCounts.controlledSubstanceLog = (await tx.delete(controlledSubstanceLog).where(eq(controlledSubstanceLog.tenantId, tenantId))).rowCount || 0;
      deletedCounts.tasks = (await tx.delete(tasks).where(eq(tasks.tenantId, tenantId))).rowCount || 0;

      deletedCounts.fosterUpdates = (await tx.delete(fosterUpdates).where(eq(fosterUpdates.tenantId, tenantId))).rowCount || 0;
      deletedCounts.fosterAnimals = (await tx.delete(fosterAnimals).where(eq(fosterAnimals.tenantId, tenantId))).rowCount || 0;

      deletedCounts.supplyDonations = (await tx.delete(supplyDonations).where(eq(supplyDonations.tenantId, tenantId))).rowCount || 0;
      deletedCounts.supplyRequests = (await tx.delete(supplyRequests).where(eq(supplyRequests.tenantId, tenantId))).rowCount || 0;
      deletedCounts.supplyItems = (await tx.delete(supplyItems).where(eq(supplyItems.tenantId, tenantId))).rowCount || 0;
      deletedCounts.supplyCategories = (await tx.delete(supplyCategories).where(eq(supplyCategories.tenantId, tenantId))).rowCount || 0;

      deletedCounts.kennels = (await tx.delete(kennels).where(eq(kennels.tenantId, tenantId))).rowCount || 0;

      deletedCounts.adoptions = (await tx.delete(adoptions).where(eq(adoptions.tenantId, tenantId))).rowCount || 0;
      deletedCounts.applications = (await tx.delete(applications).where(eq(applications.tenantId, tenantId))).rowCount || 0;
      deletedCounts.volunteerApplications = (await tx.delete(volunteerApplications).where(eq(volunteerApplications.tenantId, tenantId))).rowCount || 0;
      deletedCounts.fosterApplications = (await tx.delete(fosterApplications).where(eq(fosterApplications.tenantId, tenantId))).rowCount || 0;
      deletedCounts.animalSurrenders = (await tx.delete(animalSurrenders).where(eq(animalSurrenders.tenantId, tenantId))).rowCount || 0;

      deletedCounts.animalNotes = (await tx.delete(animalNotes).where(eq(animalNotes.tenantId, tenantId))).rowCount || 0;
      deletedCounts.animalPlatformSyncs = (await tx.delete(animalPlatformSyncs).where(eq(animalPlatformSyncs.tenantId, tenantId))).rowCount || 0;
      deletedCounts.animals = (await tx.delete(animals).where(eq(animals.tenantId, tenantId))).rowCount || 0;
      deletedCounts.happyTails = (await tx.delete(happyTails).where(eq(happyTails.tenantId, tenantId))).rowCount || 0;

      deletedCounts.volunteerSignups = (await tx.delete(volunteerSignups).where(eq(volunteerSignups.tenantId, tenantId))).rowCount || 0;
      deletedCounts.volunteerOpportunities = (await tx.delete(volunteerOpportunities).where(eq(volunteerOpportunities.tenantId, tenantId))).rowCount || 0;
      deletedCounts.calendarEvents = (await tx.delete(calendarEvents).where(eq(calendarEvents.tenantId, tenantId))).rowCount || 0;

      deletedCounts.calendarPermissions = (await tx.delete(calendarPermissions).where(eq(calendarPermissions.tenantId, tenantId))).rowCount || 0;
      deletedCounts.calendarRolePermissions = (await tx.delete(calendarRolePermissions).where(eq(calendarRolePermissions.tenantId, tenantId))).rowCount || 0;
      deletedCounts.calendars = (await tx.delete(calendars).where(eq(calendars.tenantId, tenantId))).rowCount || 0;
      deletedCounts.pagePermissions = (await tx.delete(pagePermissions).where(eq(pagePermissions.tenantId, tenantId))).rowCount || 0;

      deletedCounts.customPages = (await tx.delete(customPages).where(eq(customPages.tenantId, tenantId))).rowCount || 0;
      deletedCounts.documents = (await tx.delete(documents).where(eq(documents.tenantId, tenantId))).rowCount || 0;
      deletedCounts.inboundEmails = (await tx.delete(inboundEmails).where(eq(inboundEmails.tenantId, tenantId))).rowCount || 0;

      deletedCounts.expenditures = (await tx.delete(expenditures).where(eq(expenditures.tenantId, tenantId))).rowCount || 0;
      deletedCounts.payments = (await tx.delete(payments).where(eq(payments.tenantId, tenantId))).rowCount || 0;
      deletedCounts.donations = (await tx.delete(donations).where(eq(donations.tenantId, tenantId))).rowCount || 0;
      deletedCounts.contacts = (await tx.delete(contacts).where(eq(contacts.tenantId, tenantId))).rowCount || 0;
      deletedCounts.rescueContacts = (await tx.delete(rescueContacts).where(eq(rescueContacts.tenantId, tenantId))).rowCount || 0;

      deletedCounts.newsletterSubscribers = (await tx.delete(newsletterSubscribers).where(eq(newsletterSubscribers.tenantId, tenantId))).rowCount || 0;
      deletedCounts.pushSubscriptions = (await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.tenantId, tenantId))).rowCount || 0;

      deletedCounts.adoptionFormFields = (await tx.delete(adoptionFormFields).where(eq(adoptionFormFields.tenantId, tenantId))).rowCount || 0;
      deletedCounts.fosterFormFields = (await tx.delete(fosterFormFields).where(eq(fosterFormFields.tenantId, tenantId))).rowCount || 0;
      deletedCounts.volunteerFormFields = (await tx.delete(volunteerFormFields).where(eq(volunteerFormFields.tenantId, tenantId))).rowCount || 0;

      deletedCounts.platformIntegrations = (await tx.delete(platformIntegrations).where(eq(platformIntegrations.tenantId, tenantId))).rowCount || 0;
      deletedCounts.platformFeedback = (await tx.delete(platformFeedback).where(eq(platformFeedback.tenantId, tenantId))).rowCount || 0;

      if (adminUserId) {
        deletedCounts.users = (
          await tx.delete(users).where(and(eq(users.tenantId, tenantId), ne(users.id, adminUserId)))
        ).rowCount || 0;
      } else {
        deletedCounts.users = (await tx.delete(users).where(eq(users.tenantId, tenantId))).rowCount || 0;
      }

      if (!adminUserId && passwordHash) {
        await tx.insert(users).values({
          tenantId: tenant.id,
          email: "admin@demo.com",
          passwordHash,
          fullName: "Demo Admin",
          roles: ["admin"],
          isActive: true,
        });
        console.log("✓ Recreated admin user");
      }

      await tx
        .update(tenants)
        .set({
          emailsSentThisMonth: 0,
          lastEmailQuotaReset: new Date(),
          wizardCompleted: false,
          wizardStep: 0,
          wizardSkipped: false,
        })
        .where(eq(tenants.id, tenantId));
    });

    console.log("✓ Reset tenant counters");

    // Log summary
    const totalDeleted = Object.values(deletedCounts).reduce((sum, count) => sum + count, 0);
    console.log(`✓ Demo reset complete - deleted ${totalDeleted} records`);
    console.log("Breakdown:", deletedCounts);

    return {
      success: true,
      message: `Demo data reset successfully. Deleted ${totalDeleted} records.`,
      deletedCounts,
    };
  } catch (error) {
    console.error("❌ Error resetting demo data:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error during reset",
    };
  }
}
