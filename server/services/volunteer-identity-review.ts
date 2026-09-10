import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  contacts,
  users,
  volunteerApplications,
  volunteerTrainingAccessSessions,
  volunteerTrainingCompletions,
} from "@shared/schema";
import { resolveApplicationCompletionOwners } from "./volunteer-training";

const normalizeName = (value?: string | null) => (value || "").trim().replace(/\s+/g, " ").toLowerCase();
const normalizePhone = (value?: string | null) => (value || "").replace(/\D/g, "");

export function identityReviewCandidateMatches(
  application: { applicantName: string; applicantPhone?: string | null },
  contact: { name: string; phone?: string | null },
) {
  const name = normalizeName(application.applicantName);
  const phone = normalizePhone(application.applicantPhone);
  return (!!name && normalizeName(contact.name) === name) ||
    (!!phone && normalizePhone(contact.phone) === phone);
}

function reviewConflict(message: string, code = "VOLUNTEER_IDENTITY_REVIEW_REQUIRED") {
  return Object.assign(new Error(message), { status: 409, code });
}

async function candidateRows(executor: any, tenantId: string, email: string) {
  return executor.select({
    id: contacts.id,
    tenantId: contacts.tenantId,
    userId: contacts.userId,
    name: contacts.name,
    email: contacts.email,
    phone: contacts.phone,
    role: contacts.role,
    source: contacts.source,
    tags: contacts.tags,
  }).from(contacts).where(and(
    eq(contacts.tenantId, tenantId),
    sql`lower(trim(${contacts.email})) = ${email.trim().toLowerCase()}`,
  ));
}

export async function getVolunteerIdentityReviewCandidate(tenantId: string, applicationId: string) {
  const [application] = await db.select({
    id: volunteerApplications.id,
    applicantName: volunteerApplications.applicantName,
    applicantEmail: volunteerApplications.applicantEmail,
    applicantPhone: volunteerApplications.applicantPhone,
  }).from(volunteerApplications).where(and(
    eq(volunteerApplications.tenantId, tenantId),
    eq(volunteerApplications.id, applicationId),
  )).limit(1);
  if (!application) return null;
  const candidates = await candidateRows(db, tenantId, application.applicantEmail);
  if (candidates.length !== 1 || !identityReviewCandidateMatches(application, candidates[0])) {
    return { candidate: null };
  }
  const candidate = candidates[0];
  return {
    candidate: {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      phone: candidate.phone,
      roles: candidate.role || [],
      source: candidate.source || [],
      linkedToUser: !!candidate.userId,
    },
  };
}

export async function verifyVolunteerApplicationIdentity(args: {
  tenantId: string;
  applicationId: string;
  contactId: string;
  actorId: string;
  reason: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`volunteer-application-person:${args.tenantId}:${args.applicationId}`}, 0))`);
    const [application] = await tx.select().from(volunteerApplications).where(and(
      eq(volunteerApplications.tenantId, args.tenantId),
      eq(volunteerApplications.id, args.applicationId),
    )).limit(1).for("update");
    if (!application) throw Object.assign(new Error("Volunteer application not found"), { status: 404 });
    await tx.execute(sql`SELECT id FROM contacts WHERE tenant_id = ${args.tenantId} AND id = ${args.contactId} FOR UPDATE`);
    const candidates = await candidateRows(tx, args.tenantId, application.applicantEmail);
    if (candidates.length !== 1 || candidates[0].id !== args.contactId ||
        !identityReviewCandidateMatches(application, candidates[0])) {
      throw reviewConflict("The unique identity-review candidate changed; resolve contact data before retrying");
    }
    const candidate = candidates[0];
    if (candidate.userId) {
      const [ownedUser] = await tx.select({ id: users.id }).from(users).where(and(
        eq(users.tenantId, args.tenantId),
        eq(users.id, candidate.userId),
      )).limit(1);
      if (!ownedUser) throw reviewConflict("The candidate is linked to a user outside this tenant");
    }
    const completions = await tx.select({
      userId: volunteerTrainingCompletions.userId,
      contactId: volunteerTrainingCompletions.contactId,
      volunteerApplicationId: volunteerTrainingCompletions.volunteerApplicationId,
    }).from(volunteerTrainingCompletions).where(and(
      eq(volunteerTrainingCompletions.tenantId, args.tenantId),
      eq(volunteerTrainingCompletions.volunteerApplicationId, args.applicationId),
    ));
    let established;
    try {
      established = resolveApplicationCompletionOwners(application, completions);
    } catch {
      throw reviewConflict("Application training has conflicting established ownership");
    }
    if ((established.contactId && established.contactId !== candidate.id) ||
        (established.userId && established.userId !== candidate.userId)) {
      throw reviewConflict("Application training is owned by a different established person");
    }
    await tx.update(volunteerApplications).set({
      contactId: candidate.id,
      userId: candidate.userId || null,
      updatedAt: new Date(),
    }).where(and(
      eq(volunteerApplications.tenantId, args.tenantId),
      eq(volunteerApplications.id, args.applicationId),
    ));
    await tx.update(volunteerTrainingCompletions).set({
      contactId: candidate.id,
      ...(candidate.userId ? { userId: candidate.userId } : {}),
    }).where(and(
      eq(volunteerTrainingCompletions.tenantId, args.tenantId),
      eq(volunteerTrainingCompletions.volunteerApplicationId, args.applicationId),
    ));
    await tx.update(contacts).set({
      source: Array.from(new Set([...(candidate.source || []), "volunteer_application" as const])),
      tags: Array.from(new Set([...(candidate.tags || []), "Volunteer Applicant"])),
      updatedAt: new Date(),
    }).where(and(eq(contacts.tenantId, args.tenantId), eq(contacts.id, candidate.id)));
    await tx.update(volunteerTrainingAccessSessions).set({ revokedAt: new Date() }).where(and(
      eq(volunteerTrainingAccessSessions.tenantId, args.tenantId),
      eq(volunteerTrainingAccessSessions.volunteerApplicationId, args.applicationId),
      isNull(volunteerTrainingAccessSessions.revokedAt),
    ));
    await tx.insert(auditLogs).values({
      userId: args.actorId,
      tenantId: args.tenantId,
      action: "volunteer.identity_verified",
      entityType: "volunteer_application",
      entityId: args.applicationId,
      changes: { after: { applicationId: args.applicationId, contactId: candidate.id } },
      metadata: { applicationId: args.applicationId, contactId: candidate.id, reason: args.reason.trim() },
      ipAddress: args.ipAddress || null,
      userAgent: args.userAgent || null,
    });
    return { applicationId: args.applicationId, contactId: candidate.id, userId: candidate.userId || null };
  });
}