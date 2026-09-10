import crypto from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  tenants,
  contacts,
  tutorials,
  volunteerApplications,
  volunteerTrainingAccessSessions,
} from "@shared/schema";
import { EmailService } from "../lib/email-service";
import { buildTenantPublicUrl } from "./invitations";

export function hashTrainingAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const AUTHENTICATED_TRAINING_REQUIRED = "AUTHENTICATED_TRAINING_REQUIRED";

export function decideApplicantTrainingAccess(args: {
  tenantId: string;
  now?: Date;
  application: {
    tenantId: string; contactId?: string | null; userId?: string | null;
    applicantEmail: string; pipelineStatus: string;
  };
  contact?: { id: string; tenantId: string; userId?: string | null; email?: string | null } | null;
  session?: {
    tenantId: string; recipientEmail?: string | null; expiresAt: Date | string;
    revokedAt?: Date | string | null;
  };
}) {
  const { application, contact, session } = args;
  if (application.tenantId !== args.tenantId) return { allowed: false as const, reason: "invalid" as const };
  if (application.userId) {
    return { allowed: false as const, reason: "authenticated_training_required" as const };
  }
  if (application.contactId && (!contact || contact.id !== application.contactId || contact.tenantId !== args.tenantId)) {
    return { allowed: false as const, reason: "invalid" as const };
  }
  if (contact?.userId) {
    return { allowed: false as const, reason: "authenticated_training_required" as const };
  }
  if (!["orientation_scheduled", "waiver_needed"].includes(application.pipelineStatus)) {
    return { allowed: false as const, reason: "invalid" as const };
  }
  const rawRecipientEmail = application.contactId ? contact!.email : application.applicantEmail;
  const recipientEmail = rawRecipientEmail?.trim().toLowerCase() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { allowed: false as const, reason: "invalid" as const };
  }
  if (session) {
    if (session.tenantId !== args.tenantId || session.revokedAt ||
        new Date(session.expiresAt) <= (args.now || new Date()) ||
        !session.recipientEmail ||
        session.recipientEmail.trim().toLowerCase() !== recipientEmail) {
      return { allowed: false as const, reason: "invalid" as const };
    }
  }
  return { allowed: true as const, recipientEmail };
}

export async function revokeApplicantTrainingSessions(args: {
  tenantId: string; applicationId?: string; contactId?: string;
}) {
  let applicationIds = args.applicationId ? [args.applicationId] : [];
  if (args.contactId) {
    const linked = await db.select({ id: volunteerApplications.id }).from(volunteerApplications).where(and(
      eq(volunteerApplications.tenantId, args.tenantId),
      eq(volunteerApplications.contactId, args.contactId),
    ));
    applicationIds = Array.from(new Set([...applicationIds, ...linked.map(row => row.id)]));
  }
  if (!applicationIds.length) return;
  await db.update(volunteerTrainingAccessSessions).set({ revokedAt: new Date() }).where(and(
    eq(volunteerTrainingAccessSessions.tenantId, args.tenantId),
    inArray(volunteerTrainingAccessSessions.volunteerApplicationId, applicationIds),
    isNull(volunteerTrainingAccessSessions.revokedAt),
  ));
}

export async function validatePublicTrainingAccess(tenantId: string, token: string) {
  const [session] = await db.select().from(volunteerTrainingAccessSessions).where(and(
    eq(volunteerTrainingAccessSessions.tenantId, tenantId),
    eq(volunteerTrainingAccessSessions.secureTokenHash, hashTrainingAccessToken(token)),
  )).limit(1);
  if (!session) return null;
  const [application] = await db.select().from(volunteerApplications).where(and(
    eq(volunteerApplications.tenantId, tenantId),
    eq(volunteerApplications.id, session.volunteerApplicationId),
  )).limit(1);
  let contact = null;
  if (application?.contactId) {
    [contact] = await db.select({
      id: contacts.id, tenantId: contacts.tenantId, userId: contacts.userId, email: contacts.email,
    }).from(contacts).where(eq(contacts.id, application.contactId)).limit(1);
  }
  const decision = application ? decideApplicantTrainingAccess({
    tenantId, application, contact, session,
  }) : { allowed: false as const, reason: "invalid" as const };
  if (!decision.allowed) {
    if (!session.revokedAt) await revokeApplicantTrainingSessions({ tenantId, applicationId: session.volunteerApplicationId });
    return null;
  }
  return { session, application, contact, recipientEmail: decision.recipientEmail };
}

function invalidPublicAttestation(message = "Training link is invalid or has expired") {
  return Object.assign(new Error(message), { status: 404, code: "PUBLIC_TRAINING_ACCESS_INVALID" });
}

/**
 * Atomically revalidates a bearer session against the locked application
 * identity and records the attestation. The preliminary lookup is routing-only.
 */
export async function recordPublicTrainingCompletion(args: {
  tenantId: string;
  token: string;
  tutorialId: string;
  requirementVersion: number;
}) {
  const tokenHash = hashTrainingAccessToken(args.token);
  const [hint] = await db.select({
    id: volunteerTrainingAccessSessions.id,
    tenantId: volunteerTrainingAccessSessions.tenantId,
    applicationId: volunteerTrainingAccessSessions.volunteerApplicationId,
  }).from(volunteerTrainingAccessSessions).where(and(
    eq(volunteerTrainingAccessSessions.tenantId, args.tenantId),
    eq(volunteerTrainingAccessSessions.secureTokenHash, tokenHash),
  )).limit(1);
  if (!hint) throw invalidPublicAttestation();

  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`volunteer-application-person:${hint.tenantId}:${hint.applicationId}`}, 0))`);
    await tx.execute(sql`SELECT id FROM volunteer_applications WHERE tenant_id = ${hint.tenantId} AND id = ${hint.applicationId} FOR NO KEY UPDATE`);
    const [application] = await tx.select().from(volunteerApplications).where(and(
      eq(volunteerApplications.tenantId, hint.tenantId),
      eq(volunteerApplications.id, hint.applicationId),
    )).limit(1);
    if (!application || application.tenantId !== args.tenantId) throw invalidPublicAttestation();

    let contact = null;
    if (application.contactId) {
      await tx.execute(sql`SELECT id FROM contacts WHERE tenant_id = ${hint.tenantId} AND id = ${application.contactId} FOR NO KEY UPDATE`);
      [contact] = await tx.select({
        id: contacts.id,
        tenantId: contacts.tenantId,
        userId: contacts.userId,
        email: contacts.email,
      }).from(contacts).where(and(
        eq(contacts.tenantId, hint.tenantId), eq(contacts.id, application.contactId),
      )).limit(1);
    }

    const [session] = await tx.select().from(volunteerTrainingAccessSessions).where(and(
      eq(volunteerTrainingAccessSessions.id, hint.id),
      eq(volunteerTrainingAccessSessions.tenantId, hint.tenantId),
      eq(volunteerTrainingAccessSessions.volunteerApplicationId, hint.applicationId),
      eq(volunteerTrainingAccessSessions.secureTokenHash, tokenHash),
    )).limit(1).for("no key update");
    if (!session) throw invalidPublicAttestation();
    const access = decideApplicantTrainingAccess({
      tenantId: args.tenantId,
      application,
      contact,
      session,
    });
    if (!access.allowed) {
      throw invalidPublicAttestation(
        access.reason === "authenticated_training_required"
          ? "This applicant must use authenticated Help & Training"
          : undefined,
      );
    }

    const {
      recordCompletionWithExecutor,
      getApplicationCompliance,
      projectPublicApplicationCompliance,
    } = await import("./volunteer-training");
    const identityKey = contact ? `contact:${contact.id}` : `application:${application.id}`;
    const completion = await recordCompletionWithExecutor(tx, {
      tenantId: args.tenantId,
      tutorialId: args.tutorialId,
      identityKey,
      actorId: null,
      contactId: contact?.id,
      applicationId: application.id,
      type: "attestation",
      requirementVersion: args.requirementVersion,
    });
    const compliance = await getApplicationCompliance(args.tenantId, application.id, tx);
    if (!compliance) throw invalidPublicAttestation();
    return {
      completion,
      trainingCompliance: projectPublicApplicationCompliance(compliance),
    };
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

export async function sendVolunteerTrainingAccess(args: {
  tenantId: string;
  applicationId: string;
  createdByUserId: string;
}) {
  const [[application], [tenant], required] = await Promise.all([
    db.select().from(volunteerApplications).where(and(
      eq(volunteerApplications.tenantId, args.tenantId),
      eq(volunteerApplications.id, args.applicationId),
    )).limit(1),
    db.select({
      id: tenants.id,
      name: tenants.name,
      subdomain: tenants.subdomain,
      customDomain: tenants.customDomain,
    }).from(tenants).where(eq(tenants.id, args.tenantId)).limit(1),
    db.select({ id: tutorials.id }).from(tutorials).where(and(
      eq(tutorials.tenantId, args.tenantId),
      eq(tutorials.requiredForVolunteers, true),
    )),
  ]);
  if (!application || !tenant) throw new Error("Volunteer application not found");
  let linkedContact = null;
  if (application.contactId) {
    [linkedContact] = await db.select({
      id: contacts.id, tenantId: contacts.tenantId, userId: contacts.userId, email: contacts.email,
    }).from(contacts).where(eq(contacts.id, application.contactId)).limit(1);
  }
  const access = decideApplicantTrainingAccess({
    tenantId: args.tenantId,
    application,
    contact: linkedContact,
  });
  if (!access.allowed) {
    await revokeApplicantTrainingSessions({ tenantId: args.tenantId, applicationId: application.id });
    if (access.reason === "authenticated_training_required") {
      throw Object.assign(new Error("This volunteer has an account and must use authenticated Help & Training"), {
        status: 409,
        code: AUTHENTICATED_TRAINING_REQUIRED,
      });
    }
    throw Object.assign(new Error("Applicant training access is not available for this application"), {
      status: 409,
      code: "APPLICANT_TRAINING_ACCESS_INVALID",
    });
  }
  if (!required.length) return { skipped: true as const, reason: "no_required_training" as const };

  const emailService = await EmailService.forTenant(args.tenantId);
  if (!emailService) throw new Error("Email service is not configured for this organization");

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  const now = new Date();

  await db.update(volunteerTrainingAccessSessions).set({ revokedAt: now }).where(and(
    eq(volunteerTrainingAccessSessions.tenantId, args.tenantId),
    eq(volunteerTrainingAccessSessions.volunteerApplicationId, application.id),
    isNull(volunteerTrainingAccessSessions.revokedAt),
  ));
  const [session] = await db.insert(volunteerTrainingAccessSessions).values({
    tenantId: args.tenantId,
    volunteerApplicationId: application.id,
    secureTokenHash: hashTrainingAccessToken(token),
    recipientEmail: access.recipientEmail,
    expiresAt,
    createdByUserId: args.createdByUserId,
  }).returning();

  const accessUrl = buildTenantPublicUrl(tenant, `/volunteer-training/${encodeURIComponent(token)}`);
  try {
    const result = await emailService.send({
      to: access.recipientEmail,
      subject: `Action required: volunteer training for ${tenant.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2>Volunteer training</h2>
          <p>Hello ${escapeHtml(application.applicantName)},</p>
          <p>Please open and review the required volunteer training for <strong>${escapeHtml(tenant.name)}</strong>, then explicitly attest that you watched each assigned video.</p>
          <p><a href="${accessUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Open required training</a></p>
          <p style="color:#666;font-size:14px">This link expires in 14 days. Opening a video alone does not record completion; you must use the attestation button.</p>
        </div>`,
      text: `Hello ${application.applicantName},\n\nPlease complete the required volunteer training for ${tenant.name}, then explicitly attest that you watched each assigned video:\n${accessUrl}\n\nThis link expires in 14 days. Opening a video alone does not record completion.`,
    });
    if (!result.success) {
      throw new Error(result.error || "Failed to send volunteer training email");
    }
  } catch (error) {
    await db.update(volunteerTrainingAccessSessions).set({ revokedAt: new Date() })
      .where(eq(volunteerTrainingAccessSessions.id, session.id));
    throw error;
  }
  await db.update(volunteerTrainingAccessSessions).set({ sentAt: new Date() })
    .where(eq(volunteerTrainingAccessSessions.id, session.id));
  return { skipped: false as const, sessionId: session.id, expiresAt };
}