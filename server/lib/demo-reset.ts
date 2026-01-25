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

    // Find admin user to preserve
    const adminUser = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, "admin@demo.com")))
      .limit(1);

    const adminUserId = adminUser.length > 0 ? adminUser[0].id : null;

    if (!adminUserId) {
      console.warn("⚠️  Admin user not found - will recreate");
    }

    // Track deletion counts for reporting
    const deletedCounts: Record<string, number> = {};

    // Delete data in order (respecting foreign key constraints)
    // Start with child tables and work up to parent tables

    // Medical records (depends on animals)
    deletedCounts.medicalDoses = (await db.delete(medicalDoses).where(eq(medicalDoses.tenantId, tenantId))).rowCount || 0;
    deletedCounts.medicalPrescriptions = (await db.delete(medicalPrescriptions).where(eq(medicalPrescriptions.tenantId, tenantId))).rowCount || 0;
    deletedCounts.vaccineRecords = (await db.delete(vaccineRecords).where(eq(vaccineRecords.tenantId, tenantId))).rowCount || 0;
    deletedCounts.medicalExams = (await db.delete(medicalExams).where(eq(medicalExams.tenantId, tenantId))).rowCount || 0;
    deletedCounts.diagnosticTests = (await db.delete(diagnosticTests).where(eq(diagnosticTests.tenantId, tenantId))).rowCount || 0;
    deletedCounts.procedureLogs = (await db.delete(procedureLogs).where(eq(procedureLogs.tenantId, tenantId))).rowCount || 0;
    deletedCounts.medicalFiles = (await db.delete(medicalFiles).where(eq(medicalFiles.tenantId, tenantId))).rowCount || 0;
    deletedCounts.medicalBills = (await db.delete(medicalBills).where(eq(medicalBills.tenantId, tenantId))).rowCount || 0;
    deletedCounts.medicalRecordPermissions = (await db.delete(medicalRecordPermissions).where(eq(medicalRecordPermissions.tenantId, tenantId))).rowCount || 0;
    deletedCounts.medicalRecordRolePermissions = (await db.delete(medicalRecordRolePermissions).where(eq(medicalRecordRolePermissions.tenantId, tenantId))).rowCount || 0;
    deletedCounts.globalMedicalRecordRolePermissions = (await db.delete(globalMedicalRecordRolePermissions).where(eq(globalMedicalRecordRolePermissions.tenantId, tenantId))).rowCount || 0;
    deletedCounts.controlledSubstanceLog = (await db.delete(controlledSubstanceLog).where(eq(controlledSubstanceLog.tenantId, tenantId))).rowCount || 0;
    deletedCounts.tasks = (await db.delete(tasks).where(eq(tasks.tenantId, tenantId))).rowCount || 0;

    // Foster system
    deletedCounts.fosterUpdates = (await db.delete(fosterUpdates).where(eq(fosterUpdates.tenantId, tenantId))).rowCount || 0;
    deletedCounts.fosterAnimals = (await db.delete(fosterAnimals).where(eq(fosterAnimals.tenantId, tenantId))).rowCount || 0;

    // Supply system
    deletedCounts.supplyDonations = (await db.delete(supplyDonations).where(eq(supplyDonations.tenantId, tenantId))).rowCount || 0;
    deletedCounts.supplyRequests = (await db.delete(supplyRequests).where(eq(supplyRequests.tenantId, tenantId))).rowCount || 0;
    deletedCounts.supplyItems = (await db.delete(supplyItems).where(eq(supplyItems.tenantId, tenantId))).rowCount || 0;
    deletedCounts.supplyCategories = (await db.delete(supplyCategories).where(eq(supplyCategories.tenantId, tenantId))).rowCount || 0;

    // Kennel system
    deletedCounts.kennels = (await db.delete(kennels).where(eq(kennels.tenantId, tenantId))).rowCount || 0;

    // Applications and adoptions
    deletedCounts.adoptions = (await db.delete(adoptions).where(eq(adoptions.tenantId, tenantId))).rowCount || 0;
    deletedCounts.applications = (await db.delete(applications).where(eq(applications.tenantId, tenantId))).rowCount || 0;
    deletedCounts.volunteerApplications = (await db.delete(volunteerApplications).where(eq(volunteerApplications.tenantId, tenantId))).rowCount || 0;
    deletedCounts.fosterApplications = (await db.delete(fosterApplications).where(eq(fosterApplications.tenantId, tenantId))).rowCount || 0;
    deletedCounts.animalSurrenders = (await db.delete(animalSurrenders).where(eq(animalSurrenders.tenantId, tenantId))).rowCount || 0;

    // Animals and related
    deletedCounts.animalNotes = (await db.delete(animalNotes).where(eq(animalNotes.tenantId, tenantId))).rowCount || 0;
    deletedCounts.animalPlatformSyncs = (await db.delete(animalPlatformSyncs).where(eq(animalPlatformSyncs.tenantId, tenantId))).rowCount || 0;
    deletedCounts.animals = (await db.delete(animals).where(eq(animals.tenantId, tenantId))).rowCount || 0;
    deletedCounts.happyTails = (await db.delete(happyTails).where(eq(happyTails.tenantId, tenantId))).rowCount || 0;

    // Events and volunteers
    deletedCounts.volunteerSignups = (await db.delete(volunteerSignups).where(eq(volunteerSignups.tenantId, tenantId))).rowCount || 0;
    deletedCounts.volunteerOpportunities = (await db.delete(volunteerOpportunities).where(eq(volunteerOpportunities.tenantId, tenantId))).rowCount || 0;
    deletedCounts.calendarEvents = (await db.delete(calendarEvents).where(eq(calendarEvents.tenantId, tenantId))).rowCount || 0;

    // Calendar and permissions
    deletedCounts.calendarPermissions = (await db.delete(calendarPermissions).where(eq(calendarPermissions.tenantId, tenantId))).rowCount || 0;
    deletedCounts.calendarRolePermissions = (await db.delete(calendarRolePermissions).where(eq(calendarRolePermissions.tenantId, tenantId))).rowCount || 0;
    deletedCounts.calendars = (await db.delete(calendars).where(eq(calendars.tenantId, tenantId))).rowCount || 0;
    deletedCounts.pagePermissions = (await db.delete(pagePermissions).where(eq(pagePermissions.tenantId, tenantId))).rowCount || 0;

    // Content and documents
    deletedCounts.customPages = (await db.delete(customPages).where(eq(customPages.tenantId, tenantId))).rowCount || 0;
    deletedCounts.documents = (await db.delete(documents).where(eq(documents.tenantId, tenantId))).rowCount || 0;
    deletedCounts.inboundEmails = (await db.delete(inboundEmails).where(eq(inboundEmails.tenantId, tenantId))).rowCount || 0;

    // Financial
    deletedCounts.expenditures = (await db.delete(expenditures).where(eq(expenditures.tenantId, tenantId))).rowCount || 0;
    deletedCounts.payments = (await db.delete(payments).where(eq(payments.tenantId, tenantId))).rowCount || 0;
    deletedCounts.donations = (await db.delete(donations).where(eq(donations.tenantId, tenantId))).rowCount || 0;
    deletedCounts.contacts = (await db.delete(contacts).where(eq(contacts.tenantId, tenantId))).rowCount || 0;
    deletedCounts.rescueContacts = (await db.delete(rescueContacts).where(eq(rescueContacts.tenantId, tenantId))).rowCount || 0;

    // Communications
    deletedCounts.newsletterSubscribers = (await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.tenantId, tenantId))).rowCount || 0;
    deletedCounts.pushSubscriptions = (await db.delete(pushSubscriptions).where(eq(pushSubscriptions.tenantId, tenantId))).rowCount || 0;

    // Form fields
    deletedCounts.adoptionFormFields = (await db.delete(adoptionFormFields).where(eq(adoptionFormFields.tenantId, tenantId))).rowCount || 0;
    deletedCounts.fosterFormFields = (await db.delete(fosterFormFields).where(eq(fosterFormFields.tenantId, tenantId))).rowCount || 0;
    deletedCounts.volunteerFormFields = (await db.delete(volunteerFormFields).where(eq(volunteerFormFields.tenantId, tenantId))).rowCount || 0;

    // Integrations and feedback
    deletedCounts.platformIntegrations = (await db.delete(platformIntegrations).where(eq(platformIntegrations.tenantId, tenantId))).rowCount || 0;
    deletedCounts.platformFeedback = (await db.delete(platformFeedback).where(eq(platformFeedback.tenantId, tenantId))).rowCount || 0;

    // Delete non-admin users
    if (adminUserId) {
      deletedCounts.users = (
        await db.delete(users).where(and(eq(users.tenantId, tenantId), ne(users.id, adminUserId)))
      ).rowCount || 0;
    } else {
      deletedCounts.users = (await db.delete(users).where(eq(users.tenantId, tenantId))).rowCount || 0;
    }

    // Recreate admin user if it was deleted
    if (!adminUserId) {
      const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);
      await db.insert(users).values({
        tenantId: tenant.id,
        email: "admin@demo.com",
        passwordHash,
        fullName: "Demo Admin",
        roles: ["admin"],
        isActive: true,
      });
      console.log("✓ Recreated admin user");
    }

    // Reset tenant counters
    await db
      .update(tenants)
      .set({
        emailsSentThisMonth: 0,
        lastEmailQuotaReset: new Date(),
        wizardCompleted: false,
        wizardStep: 0,
        wizardSkipped: false,
      })
      .where(eq(tenants.id, tenantId));

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
