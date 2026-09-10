import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  contacts,
  tutorials,
  users,
  volunteerApplications,
  volunteerTrainingCompletions,
  volunteerTrainingAccessSessions,
  volunteerTrainingVersions,
} from "@shared/schema";

type ApplicationOwnerRow = {
  userId?: string | null;
  contactId?: string | null;
  volunteerApplicationId?: string | null;
};

export async function acquireVolunteerTrainingActivationPolicyLock(executor: any, tenantId: string) {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`volunteer-training-activation-policy:${tenantId}`}, 0))`);
}

export async function withVolunteerTrainingActivationPolicyLock<T>(
  executor: any,
  tenantId: string,
  work: () => Promise<T>,
) {
  await acquireVolunteerTrainingActivationPolicyLock(executor, tenantId);
  return work();
}

export async function applyLockedVolunteerRoleUpdate<T>(args: {
  lockedCurrentRoles: string[];
  desiredRoles?: string[];
  complianceGate: () => Promise<void>;
  write: () => Promise<T>;
}) {
  if (args.desiredRoles?.includes("volunteer") && !args.lockedCurrentRoles.includes("volunteer")) {
    await args.complianceGate();
  }
  return args.write();
}

export async function applyLockedVolunteerAccessUpdate<T>(args: {
  lockedCurrentRoles: string[];
  restoring: boolean;
  complianceGate: () => Promise<void>;
  write: () => Promise<T>;
}) {
  if (args.restoring && args.lockedCurrentRoles.includes("volunteer")) {
    await args.complianceGate();
  }
  return args.write();
}

export function resolveApplicationCompletionOwners(
  application: { id: string; userId?: string | null; contactId?: string | null },
  completions: ApplicationOwnerRow[],
) {
  const applicationIds = new Set(completions.map(row => row.volunteerApplicationId).filter(Boolean));
  if (applicationIds.size > 1 || (applicationIds.size === 1 && !applicationIds.has(application.id))) {
    throw new Error("Application-bound training has conflicting application ownership");
  }
  const contactIds = new Set([
    ...(application.contactId ? [application.contactId] : []),
    ...completions.map(row => row.contactId).filter((id): id is string => !!id),
  ]);
  const userIds = new Set([
    ...(application.userId ? [application.userId] : []),
    ...completions.map(row => row.userId).filter((id): id is string => !!id),
  ]);
  if (contactIds.size > 1 || userIds.size > 1) {
    throw new Error("Application-bound training has conflicting person ownership");
  }
  return {
    contactId: contactIds.values().next().value as string | undefined,
    userId: userIds.values().next().value as string | undefined,
  };
}

export function assertActivationIdentityDisposition(
  established: { contactId?: string; userId?: string },
  proposed: { contactId?: string | null; userId?: string | null },
) {
  if ((established.contactId && established.contactId !== proposed.contactId) ||
      (established.userId && established.userId !== proposed.userId)) {
    throw new Error("Proposed activation identity conflicts with training ownership");
  }
  return {
    contactId: established.contactId || proposed.contactId || undefined,
    userId: established.userId || proposed.userId || undefined,
  };
}

export function assertResolvedContactUserPair(
  contact: { id: string; userId?: string | null },
  contactId?: string | null,
  userId?: string | null,
) {
  if (contactId && contact.id !== contactId) {
    throw new Error("Resolved contact does not match the proposed contact");
  }
  if (contact.userId && userId && contact.userId !== userId) {
    throw new Error("Resolved contact and user ownership are incompatible");
  }
}

export type TrainingState = "current" | "due_soon" | "overdue" | "incomplete";
export type TrainingOwnerContext = { userId?: string; contactId?: string; applicationId?: string };

export const authenticatedAttestationSchema = z.object({
  attested: z.literal(true),
  requirementVersion: z.number().int().positive(),
}).strict();

export function completionMatchesOwner(
  completion: { userId?: string | null; contactId?: string | null; volunteerApplicationId?: string | null },
  owner?: TrainingOwnerContext,
): boolean {
  if (!owner) return true;
  if (owner.userId && completion.userId && completion.userId !== owner.userId) return false;
  if (owner.contactId && completion.contactId && completion.contactId !== owner.contactId) return false;
  if (owner.applicationId && completion.volunteerApplicationId &&
      completion.volunteerApplicationId !== owner.applicationId) return false;
  return true;
}

function ownerConditions(owner?: TrainingOwnerContext) {
  return [
    ...(owner?.userId ? [or(
      isNull(volunteerTrainingCompletions.userId),
      eq(volunteerTrainingCompletions.userId, owner.userId),
    )] : []),
    ...(owner?.applicationId ? [or(
      isNull(volunteerTrainingCompletions.volunteerApplicationId),
      eq(volunteerTrainingCompletions.volunteerApplicationId, owner.applicationId),
    )] : []),
    ...(owner?.contactId ? [or(
      isNull(volunteerTrainingCompletions.contactId),
      eq(volunteerTrainingCompletions.contactId, owner.contactId),
    )] : []),
  ];
}

export function applicationTrainingIdentity(
  application: { id: string; userId?: string | null; contactId?: string | null },
  linkedCompletions: Array<{ identityKey: string; userId?: string | null; contactId?: string | null }>,
) {
  const userId = application.userId || linkedCompletions.find(row => row.userId)?.userId || null;
  const contactId = application.contactId || linkedCompletions.find(row => row.contactId)?.contactId || null;
  const keys = [`application:${application.id}`];
  if (userId) keys.unshift(`user:${userId}`);
  if (contactId) keys.unshift(`contact:${contactId}`);
  for (const completion of linkedCompletions) {
    if (!completionMatchesOwner(completion, {
      userId: userId || undefined,
      contactId: contactId || undefined,
    })) continue;
    if (!keys.includes(completion.identityKey)) keys.push(completion.identityKey);
  }
  return { userId, contactId, keys };
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function renewalPlan(
  previousDueAt: Date | string | null | undefined,
  previousAttestedAt: Date | string | null | undefined,
  now = new Date(),
): { renewable: boolean; baseDate: Date } {
  if (!previousDueAt || !previousAttestedAt) return { renewable: true, baseDate: now };
  const due = new Date(previousDueAt);
  const attested = new Date(previousAttestedAt);
  const termMs = Math.max(0, due.getTime() - attested.getTime());
  const dayMs = 24 * 60 * 60 * 1000;
  // Annual/long terms retain the 30-day window. Short terms use only their
  // final 25% (with a one-day floor), so recording a completion cannot make
  // its own immediate retry renewable.
  const earlyWindowMs = Math.min(30 * dayMs, Math.max(dayMs, termMs * 0.25));
  const earlyRenewalStarts = new Date(due);
  earlyRenewalStarts.setTime(earlyRenewalStarts.getTime() - earlyWindowMs);
  return {
    renewable: now >= earlyRenewalStarts,
    baseDate: due > now ? due : now,
  };
}

export function activationAllowed(status: TrainingState | null | undefined): boolean {
  return status === "current" || status === "due_soon";
}

export function requestedVolunteerApplicationActivation(input: {
  pipelineStatus?: string;
  status?: string;
}) {
  return input.pipelineStatus === "active_pool" || input.status === "approved";
}

export function finalizedVolunteerApplicationActivationTransition(
  previousPipelineStatus: string,
  activated: boolean,
): boolean {
  return activated && previousPipelineStatus !== "active_pool";
}

export function waiverActivationDisposition(status: TrainingState | null | undefined) {
  const activate = activationAllowed(status);
  return {
    activate,
    preserveSignedWaiver: true,
    keepPipelineStatus: activate ? null : "waiver_needed" as const,
    runActivationSideEffects: activate,
  };
}

export function assertCurrentRequirementVersion(displayedVersion: number, currentVersion: number): void {
  if (displayedVersion === currentVersion) return;
  const error = new Error("Training content changed. Reopen the current version before attesting.") as Error & { status?: number; code?: string };
  error.status = 409;
  error.code = "VOLUNTEER_TRAINING_VERSION_STALE";
  throw error;
}

export function canonicalTrainingIdentity(args: {
  identityKey: string; userId?: string | null; contactId?: string | null; applicationId?: string | null;
}): string {
  return args.contactId || args.applicationId || args.userId || args.identityKey;
}

export async function getActivationTrainingGuard(tenantId: string, applicationId: string, executor: any = db) {
  const compliance = await getApplicationCompliance(tenantId, applicationId, executor);
  const disposition = waiverActivationDisposition(compliance?.overallStatus);
  return { allowed: !!compliance && disposition.activate, compliance, disposition };
}

export function stateFor(
  dueAt?: Date | string | null,
  completed = false,
  now = new Date(),
  attestedAt?: Date | string | null,
): TrainingState {
  if (!completed || !dueAt) return "incomplete";
  const due = new Date(dueAt);
  if (due <= now) return "overdue";
  if (attestedAt) return renewalPlan(due, attestedAt, now).renewable ? "due_soon" : "current";
  const soon = new Date(now);
  soon.setUTCDate(soon.getUTCDate() + 30);
  return due <= soon ? "due_soon" : "current";
}

async function ensureVersion(executor: any, tenantId: string, tutorial: typeof tutorials.$inferSelect, actorId: string | null) {
  const [existing] = await executor.select().from(volunteerTrainingVersions).where(and(
    eq(volunteerTrainingVersions.tenantId, tenantId),
    eq(volunteerTrainingVersions.tutorialId, tutorial.id),
    eq(volunteerTrainingVersions.version, tutorial.requirementVersion),
  )).limit(1);
  if (existing) return existing;
  const [created] = await executor.insert(volunteerTrainingVersions).values({
    tenantId,
    tutorialId: tutorial.id,
    version: tutorial.requirementVersion,
    titleSnapshot: tutorial.title,
    descriptionSnapshot: tutorial.description,
    videoUrlSnapshot: tutorial.youtubeUrl,
    renewalMonthsSnapshot: tutorial.renewalMonths,
    createdBy: actorId,
  }).onConflictDoNothing().returning();
  if (created) return created;
  const [raced] = await executor.select().from(volunteerTrainingVersions).where(and(
    eq(volunteerTrainingVersions.tenantId, tenantId),
    eq(volunteerTrainingVersions.tutorialId, tutorial.id),
    eq(volunteerTrainingVersions.version, tutorial.requirementVersion),
  )).limit(1);
  return raced;
}

type TutorialUpdateInput = {
  title?: string;
  description?: string;
  youtubeUrl?: string;
  category?: string;
  sortOrder?: number;
  visibleToRoles?: Array<"admin" | "board_member" | "staff" | "foster" | "volunteer"> | null;
  requiredForVolunteers?: boolean;
  renewalMonths?: number;
};

export function planTutorialRequirementUpdate(
  current: Pick<typeof tutorials.$inferSelect,
    "title" | "description" | "youtubeUrl" | "visibleToRoles" |
    "requiredForVolunteers" | "renewalMonths" | "requirementVersion"
  >,
  input: TutorialUpdateInput,
) {
  const remainsRequired = input.requiredForVolunteers ?? current.requiredForVolunteers;
  const requirementContentChanged =
    (input.title !== undefined && input.title !== current.title) ||
    (input.description !== undefined && input.description !== current.description) ||
    (input.youtubeUrl !== undefined && input.youtubeUrl !== current.youtubeUrl) ||
    (input.renewalMonths !== undefined && input.renewalMonths !== current.renewalMonths);
  const requirementEnabled = !current.requiredForVolunteers && remainsRequired;
  const advancesRequirementVersion = remainsRequired && (requirementEnabled || requirementContentChanged);
  return {
    remainsRequired,
    requirementContentChanged,
    requirementEnabled,
    advancesRequirementVersion,
    requirementVersion: current.requirementVersion + (advancesRequirementVersion ? 1 : 0),
    visibleToRoles: remainsRequired
      ? Array.from(new Set([...(input.visibleToRoles || current.visibleToRoles || []), "admin", "staff", "volunteer"]))
      : input.visibleToRoles,
  };
}

export async function updateTutorialWithRequirementVersion(args: {
  tenantId: string;
  tutorialId: string;
  actorId: string;
  input: TutorialUpdateInput;
}) {
  return db.transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, args.tenantId);
    await tx.execute(sql`SELECT id FROM tutorials WHERE tenant_id = ${args.tenantId} AND id = ${args.tutorialId} FOR UPDATE`);
    const [current] = await tx.select().from(tutorials).where(and(
      eq(tutorials.tenantId, args.tenantId),
      eq(tutorials.id, args.tutorialId),
    )).limit(1);
    if (!current) return null;

    const plan = planTutorialRequirementUpdate(current, args.input);
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of ["title", "description", "youtubeUrl", "category", "sortOrder", "requiredForVolunteers", "renewalMonths"] as const) {
      if (args.input[field] !== undefined) updateFields[field] = args.input[field];
    }
    if (args.input.visibleToRoles !== undefined || plan.remainsRequired) {
      updateFields.visibleToRoles = plan.visibleToRoles?.length ? plan.visibleToRoles : null;
    }
    if (plan.advancesRequirementVersion) {
      updateFields.requirementVersion = plan.requirementVersion;
    }

    const [updated] = await tx.update(tutorials).set(updateFields).where(and(
      eq(tutorials.tenantId, args.tenantId),
      eq(tutorials.id, args.tutorialId),
    )).returning();
    if (!updated) return null;
    if (updated.requiredForVolunteers) {
      await ensureVersion(tx, args.tenantId, updated, args.actorId);
    }
    return updated;
  });
}

export async function snapshotRequiredTutorial(tenantId: string, tutorialId: string, actorId: string) {
  return db.transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, tenantId);
    await tx.execute(sql`SELECT id FROM tutorials WHERE tenant_id = ${tenantId} AND id = ${tutorialId} FOR UPDATE`);
    const [tutorial] = await tx.select().from(tutorials).where(and(
      eq(tutorials.id, tutorialId), eq(tutorials.tenantId, tenantId),
    )).limit(1);
    if (!tutorial || !tutorial.requiredForVolunteers) return null;
    return ensureVersion(tx, tenantId, tutorial, actorId);
  });
}

export async function createTutorialWithRequirementVersion(args: {
  tenantId: string;
  actorId: string;
  data: typeof tutorials.$inferInsert;
}) {
  return db.transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, args.tenantId);
    const [tutorial] = await tx.insert(tutorials).values(args.data).returning();
    if (tutorial?.requiredForVolunteers) {
      const version = await ensureVersion(tx, args.tenantId, tutorial, args.actorId);
      if (!version) throw new Error("Unable to publish the initial volunteer training version");
    }
    return tutorial;
  });
}

export async function deleteTutorialWithTrainingPolicy(tenantId: string, tutorialId: string) {
  return db.transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, tenantId);
    const [tutorial] = await tx.select({ id: tutorials.id, requiredForVolunteers: tutorials.requiredForVolunteers })
      .from(tutorials).where(and(eq(tutorials.tenantId, tenantId), eq(tutorials.id, tutorialId)))
      .limit(1).for("update");
    if (!tutorial) return { status: "not_found" as const };
    if (tutorial.requiredForVolunteers) return { status: "required" as const };
    const [version] = await tx.select({ id: volunteerTrainingVersions.id }).from(volunteerTrainingVersions)
      .where(and(eq(volunteerTrainingVersions.tenantId, tenantId), eq(volunteerTrainingVersions.tutorialId, tutorialId))).limit(1);
    if (version) return { status: "history" as const };
    const [deleted] = await tx.delete(tutorials).where(and(
      eq(tutorials.tenantId, tenantId), eq(tutorials.id, tutorialId),
    )).returning();
    return deleted ? { status: "deleted" as const, tutorial: deleted } : { status: "not_found" as const };
  });
}

export async function identityKeysForApplication(tenantId: string, applicationId: string, executor: any = db) {
  const [application] = await executor.select().from(volunteerApplications).where(and(
    eq(volunteerApplications.tenantId, tenantId),
    eq(volunteerApplications.id, applicationId),
  )).limit(1);
  if (!application) return null;
  const linkedCompletions = await executor.select({
    identityKey: volunteerTrainingCompletions.identityKey,
    userId: volunteerTrainingCompletions.userId,
    contactId: volunteerTrainingCompletions.contactId,
  })
    .from(volunteerTrainingCompletions).where(and(
      eq(volunteerTrainingCompletions.tenantId, tenantId),
      eq(volunteerTrainingCompletions.volunteerApplicationId, application.id),
    ));
  const identity = applicationTrainingIdentity(application, linkedCompletions);
  return { application, ...identity };
}

async function complianceForKeys(tenantId: string, keys: string[], owner?: TrainingOwnerContext, executor: any = db) {
  const required = await executor.select().from(tutorials).where(and(
    eq(tutorials.tenantId, tenantId), eq(tutorials.requiredForVolunteers, true),
  )) as Array<typeof tutorials.$inferSelect>;
  if (!required.length) return { overallStatus: "current" as TrainingState, requirements: [] };
  const completions = (keys.length ? await executor.select({
    completion: volunteerTrainingCompletions,
    titleSnapshot: volunteerTrainingVersions.titleSnapshot,
  }).from(volunteerTrainingCompletions)
    .innerJoin(volunteerTrainingVersions, eq(volunteerTrainingCompletions.trainingVersionId, volunteerTrainingVersions.id))
    .where(and(
      eq(volunteerTrainingCompletions.tenantId, tenantId),
      inArray(volunteerTrainingCompletions.identityKey, keys),
      ...ownerConditions(owner),
    )) : []) as Array<{
      completion: typeof volunteerTrainingCompletions.$inferSelect;
      titleSnapshot: string;
    }>;
  const requirements = required.map(tutorial => {
    const completion = completions
      .filter(row => row.completion.tutorialId === tutorial.id && row.completion.requirementVersion === tutorial.requirementVersion)
      .sort((a, b) => +new Date(b.completion.attestedAt) - +new Date(a.completion.attestedAt))[0];
    return {
      tutorialId: tutorial.id,
      title: tutorial.title,
      requirementVersion: tutorial.requirementVersion,
      renewalMonths: tutorial.renewalMonths,
      status: stateFor(
        completion?.completion.renewalDueAt,
        !!completion,
        new Date(),
        completion?.completion.attestedAt,
      ),
      completion: completion ? { ...completion.completion, titleSnapshot: completion.titleSnapshot } : null,
    };
  });
  const rank: Record<TrainingState, number> = { current: 0, due_soon: 1, overdue: 2, incomplete: 3 };
  const overallStatus = requirements.reduce<TrainingState>(
    (worst, item) => rank[item.status] > rank[worst] ? item.status : worst, "current",
  );
  return { overallStatus, requirements };
}

export async function getApplicationCompliance(tenantId: string, applicationId: string, executor: any = db) {
  const identity = await identityKeysForApplication(tenantId, applicationId, executor);
  if (!identity) return null;
  return {
    ...await complianceForKeys(tenantId, identity.keys, {
      applicationId,
      contactId: identity.contactId || undefined,
      userId: identity.userId || undefined,
    }, executor),
    identity,
  };
}

export function projectPublicApplicationCompliance(compliance: {
  overallStatus: TrainingState;
  requirements: Array<{
    tutorialId: string;
    status: TrainingState;
    completion?: {
      attestedAt?: Date | string | null;
      renewalDueAt?: Date | string | null;
    } | null;
  }>;
}) {
  return {
    overallStatus: compliance.overallStatus,
    requirements: compliance.requirements.map(requirement => ({
      tutorialId: requirement.tutorialId,
      status: requirement.status,
      ...(requirement.completion?.attestedAt ? { attestedAt: requirement.completion.attestedAt } : {}),
      ...(requirement.completion?.renewalDueAt ? { renewalDueAt: requirement.completion.renewalDueAt } : {}),
    })),
  };
}

export async function identityKeysForUser(tenantId: string, userId: string, executor: any = db) {
  const contactRows = await executor.select({ id: contacts.id }).from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.userId, userId))) as Array<{ id: string }>;
  const linkedCompletions = await executor.select({
    identityKey: volunteerTrainingCompletions.identityKey,
    applicationId: volunteerTrainingCompletions.volunteerApplicationId,
  }).from(volunteerTrainingCompletions).where(and(
    eq(volunteerTrainingCompletions.tenantId, tenantId),
    or(
      eq(volunteerTrainingCompletions.userId, userId),
      ...(contactRows.length ? [and(
        inArray(volunteerTrainingCompletions.contactId, contactRows.map(row => row.id)),
        or(
          isNull(volunteerTrainingCompletions.userId),
          eq(volunteerTrainingCompletions.userId, userId),
        ),
      )] : []),
    ),
  )) as Array<{ identityKey: string; applicationId: string | null }>;
  const keys = [`user:${userId}`, ...contactRows.map(c => `contact:${c.id}`)];
  for (const completion of linkedCompletions) {
    if (!keys.includes(completion.identityKey)) keys.push(completion.identityKey);
    if (completion.applicationId && !keys.includes(`application:${completion.applicationId}`)) keys.push(`application:${completion.applicationId}`);
  }
  return keys;
}

export async function getUserCompliance(tenantId: string, userId: string, executor: any = db) {
  return complianceForKeys(tenantId, await identityKeysForUser(tenantId, userId, executor), { userId }, executor);
}

const AUTHENTICATED_APPLICANT_TRAINING_STAGES = [
  "new_applicant", "orientation_scheduled", "waiver_needed", "active_pool",
] as const;

export function authenticatedApplicantTrainingOwnershipMatches(args: {
  tenantMatches: boolean;
  pipelineStatus: string;
  requestedUserId: string;
  applicationUserId?: string | null;
  applicationContactId?: string | null;
  userContactIds: string[];
}) {
  if (!args.tenantMatches || !AUTHENTICATED_APPLICANT_TRAINING_STAGES.includes(args.pipelineStatus as any)) return false;
  if (args.applicationUserId && args.applicationUserId !== args.requestedUserId) return false;
  if (args.applicationContactId) return args.userContactIds.includes(args.applicationContactId);
  return args.applicationUserId === args.requestedUserId;
}

/**
 * Resolves only durable, tenant-scoped ownership for authenticated training.
 * Email is deliberately never an identity signal.
 */
export async function getAuthenticatedTrainingOwner(args: {
  tenantId: string;
  userId: string;
  isVolunteer: boolean;
  executor?: any;
}) {
  const executor = args.executor || db;
  const contactRows = await executor.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.tenantId, args.tenantId), eq(contacts.userId, args.userId),
  )) as Array<{ id: string }>;
  if (args.isVolunteer) {
    return {
      userId: args.userId,
      contactId: contactRows[0]?.id || null,
      applicationId: null,
    };
  }
  const ownership = [
    eq(volunteerApplications.userId, args.userId),
    ...(contactRows.length ? [inArray(volunteerApplications.contactId, contactRows.map(row => row.id))] : []),
  ];
  const [application] = await executor.select({
    id: volunteerApplications.id,
    userId: volunteerApplications.userId,
    contactId: volunteerApplications.contactId,
    pipelineStatus: volunteerApplications.pipelineStatus,
  }).from(volunteerApplications).where(and(
    eq(volunteerApplications.tenantId, args.tenantId),
    inArray(volunteerApplications.pipelineStatus, [...AUTHENTICATED_APPLICANT_TRAINING_STAGES]),
    or(...ownership),
  )).limit(1);
  if (!application) return null;
  const contactId = application.contactId || contactRows[0]?.id || null;
  if (!authenticatedApplicantTrainingOwnershipMatches({
    tenantMatches: true,
    pipelineStatus: application.pipelineStatus,
    requestedUserId: args.userId,
    applicationUserId: application.userId,
    applicationContactId: application.contactId,
    userContactIds: contactRows.map(row => row.id),
  })) return null;
  return { userId: args.userId, contactId, applicationId: application.id };
}

export async function recordAuthenticatedTrainingCompletion(args: {
  tenantId: string;
  userId: string;
  isVolunteer: boolean;
  tutorialId: string;
  requirementVersion: number;
}) {
  return db.transaction(async tx => {
    let owner = await getAuthenticatedTrainingOwner({ ...args, executor: tx });
    if (!owner) {
      throw Object.assign(new Error("Volunteer training is not available for this account"), { status: 403 });
    }
    if (owner.applicationId) {
      await tx.execute(sql`SELECT id FROM volunteer_applications WHERE tenant_id = ${args.tenantId} AND id = ${owner.applicationId} FOR NO KEY UPDATE`);
      owner = await getAuthenticatedTrainingOwner({ ...args, executor: tx });
      if (!owner?.applicationId) {
        throw Object.assign(new Error("Volunteer application training eligibility changed"), { status: 409 });
      }
      if (!owner.contactId) {
        throw Object.assign(new Error("Volunteer application contact ownership is not established"), { status: 409 });
      }
      await tx.execute(sql`SELECT id FROM contacts WHERE tenant_id = ${args.tenantId} AND id = ${owner.contactId} FOR NO KEY UPDATE`);
      owner = await getAuthenticatedTrainingOwner({ ...args, executor: tx });
      if (!owner?.applicationId || !owner.contactId) {
        throw Object.assign(new Error("Volunteer application contact ownership changed"), { status: 409 });
      }
    }
    return recordCompletionWithExecutor(tx, {
      tenantId: args.tenantId,
      tutorialId: args.tutorialId,
      identityKey: `user:${args.userId}`,
      actorId: args.userId,
      userId: args.userId,
      contactId: owner.contactId,
      applicationId: owner.applicationId,
      type: "attestation",
      requirementVersion: args.requirementVersion,
    });
  });
}

export function volunteerTrainingRequiredError(message = "Volunteer training is required before activation") {
  return Object.assign(new Error(message), {
    status: 409,
    code: "VOLUNTEER_TRAINING_REQUIRED",
  });
}

export function volunteerActivationPolicyDisposition(
  status: TrainingState,
  requirementCount: number,
  overrideReason?: string,
) {
  if (!requirementCount || activationAllowed(status)) return { action: "allow" as const };
  const reason = overrideReason?.trim();
  if (!reason || reason.length < 10 || reason.length > 1000) return { action: "reject" as const };
  return { action: "override" as const, reason };
}

/**
 * The single policy gate for granting/restoring an existing user's volunteer
 * access. Staff overrides are immutable training completions, never user data.
 */
export async function ensureUserVolunteerActivationCompliance(args: {
  tenantId: string;
  userId: string;
  actorId: string;
  overrideReason?: string;
  executor?: any;
}) {
  const executor = args.executor || db;
  let compliance = await getUserCompliance(args.tenantId, args.userId, executor);
  const disposition = volunteerActivationPolicyDisposition(
    compliance.overallStatus,
    compliance.requirements.length,
    args.overrideReason,
  );
  if (disposition.action === "allow") {
    return { compliance, overrideUsed: false };
  }
  if (disposition.action === "reject") {
    throw volunteerTrainingRequiredError(
      "Volunteer training is incomplete. Provide a 10–1000 character audited override reason.",
    );
  }
  const reason = disposition.reason;
  const [contact] = await executor.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.tenantId, args.tenantId),
    eq(contacts.userId, args.userId),
  )).limit(1);
  if (!contact) {
    throw volunteerTrainingRequiredError("Volunteer contact ownership must be established before recording an override");
  }
  for (const requirement of compliance.requirements.filter(item => !activationAllowed(item.status))) {
    await recordCompletionWithExecutor(executor, {
      tenantId: args.tenantId,
      tutorialId: requirement.tutorialId,
      identityKey: `user:${args.userId}`,
      actorId: args.actorId,
      userId: args.userId,
      contactId: contact.id,
      type: "staff_override",
      reason,
      requirementVersion: requirement.requirementVersion,
    });
  }
  compliance = await getUserCompliance(args.tenantId, args.userId, executor);
  if (!activationAllowed(compliance.overallStatus)) {
    throw volunteerTrainingRequiredError();
  }
  return { compliance, overrideUsed: true };
}

export async function finalizeVolunteerApplicationActivation(args: {
  tenantId: string;
  applicationId: string;
  expectedPipelineStatuses: string[];
  extraApplicationUpdate?: Record<string, unknown>;
  blockedAsResult?: boolean;
}) {
  return db.transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, args.tenantId);
    await tx.execute(sql`SELECT id FROM volunteer_applications WHERE tenant_id = ${args.tenantId} AND id = ${args.applicationId} FOR NO KEY UPDATE`);
    const [application] = await tx.select().from(volunteerApplications).where(and(
      eq(volunteerApplications.tenantId, args.tenantId),
      eq(volunteerApplications.id, args.applicationId),
    )).limit(1);
    if (!application) throw Object.assign(new Error("Volunteer application was not found"), { status: 404 });
    if (!args.expectedPipelineStatuses.includes(application.pipelineStatus)) {
      throw Object.assign(new Error("Volunteer application stage changed before activation"), {
        status: 409, code: "VOLUNTEER_ACTIVATION_STAGE_CONFLICT",
      });
    }
    const established = await getApplicationEstablishedIdentity(args.tenantId, args.applicationId, tx);
    if (!established.contactId) {
      throw Object.assign(new Error("Volunteer identity requires staff verification"), {
        status: 409, code: "VOLUNTEER_IDENTITY_REVIEW_REQUIRED",
      });
    }
    const [contact] = await tx.select({ id: contacts.id, userId: contacts.userId }).from(contacts).where(and(
      eq(contacts.tenantId, args.tenantId), eq(contacts.id, established.contactId),
    )).limit(1);
    if (!contact || (established.userId && contact.userId && contact.userId !== established.userId)) {
      throw Object.assign(new Error("Established volunteer identity changed before activation"), {
        status: 409, code: "VOLUNTEER_IDENTITY_REVIEW_REQUIRED",
      });
    }
    const compliance = await getApplicationCompliance(args.tenantId, args.applicationId, tx);
    if (!compliance || !activationAllowed(compliance.overallStatus)) {
      if (args.blockedAsResult) {
        return {
          activated: false as const,
          application,
          contact,
          compliance,
          previousApplication: application,
          transitionedToActivePool: false as const,
        };
      }
      throw volunteerTrainingRequiredError();
    }
    const [updatedApplication] = await tx.update(volunteerApplications).set({
      pipelineStatus: "active_pool",
      status: "approved",
      contactId: established.contactId,
      ...(established.userId ? { userId: established.userId } : {}),
      ...(args.extraApplicationUpdate || {}),
      updatedAt: new Date(),
    }).where(and(
      eq(volunteerApplications.tenantId, args.tenantId),
      eq(volunteerApplications.id, args.applicationId),
      eq(volunteerApplications.pipelineStatus, application.pipelineStatus),
    )).returning();
    if (!updatedApplication) {
      throw Object.assign(new Error("Volunteer application changed before activation"), {
        status: 409, code: "VOLUNTEER_ACTIVATION_FINALIZATION_CONFLICT",
      });
    }
    const { markVolunteerContactActiveWithExecutor } = await import("./contacts");
    await markVolunteerContactActiveWithExecutor(tx, args.tenantId, established.contactId);
    return {
      activated: true as const,
      application: updatedApplication,
      contact,
      compliance,
      previousApplication: application,
      transitionedToActivePool: finalizedVolunteerApplicationActivationTransition(
        application.pipelineStatus,
        true,
      ),
    };
  });
}

export async function recordCompletion(args: {
  tenantId: string; tutorialId: string; identityKey: string; actorId: string | null;
  userId?: string | null; contactId?: string | null; applicationId?: string | null;
  type: "attestation" | "staff_override"; reason?: string; requirementVersion: number;
}) {
  return db.transaction(async tx => recordCompletionWithExecutor(tx, args));
}

export async function recordCompletionWithExecutor(tx: any, args: {
  tenantId: string; tutorialId: string; identityKey: string; actorId: string | null;
  userId?: string | null; contactId?: string | null; applicationId?: string | null;
  type: "attestation" | "staff_override"; reason?: string; requirementVersion: number;
}) {
    const lockIdentity = canonicalTrainingIdentity(args);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${
      `volunteer-training:${args.tenantId}:${lockIdentity}:${args.tutorialId}`
    }, 0))`);
    await tx.execute(sql`SELECT id FROM tutorials WHERE tenant_id = ${args.tenantId} AND id = ${args.tutorialId} FOR SHARE`);
    const [tutorial] = await tx.select().from(tutorials).where(and(
      eq(tutorials.tenantId, args.tenantId), eq(tutorials.id, args.tutorialId),
      eq(tutorials.requiredForVolunteers, true),
    )).limit(1);
    if (!tutorial) throw new Error("Required volunteer training was not found");
    assertCurrentRequirementVersion(args.requirementVersion, tutorial.requirementVersion);
    const version = await ensureVersion(tx, args.tenantId, tutorial, args.actorId);
    if (!version) throw new Error("Unable to create training version");
    const attestedAt = new Date();
    const identityMatches = [
      eq(volunteerTrainingCompletions.identityKey, args.identityKey),
      ...(args.userId ? [eq(volunteerTrainingCompletions.userId, args.userId)] : []),
      ...(args.contactId ? [eq(volunteerTrainingCompletions.contactId, args.contactId)] : []),
      ...(args.applicationId ? [eq(volunteerTrainingCompletions.volunteerApplicationId, args.applicationId)] : []),
    ];
    const previousMatches = await tx.select().from(volunteerTrainingCompletions).where(and(
      eq(volunteerTrainingCompletions.tenantId, args.tenantId),
      eq(volunteerTrainingCompletions.trainingVersionId, version.id),
      or(...identityMatches),
    )).orderBy(sql`${volunteerTrainingCompletions.renewalCycle} desc`);
    assertPreviousCompletionOwnership(previousMatches, args);
    const previous = previousMatches[0];
    const plan = renewalPlan(previous?.renewalDueAt, previous?.attestedAt, attestedAt);
    // Retries and attempts before the 30-day renewal window return the
    // immutable current completion. Due-soon and overdue items create a cycle.
    if (previous && !plan.renewable) return previous;
    const renewalDueAt = addMonths(plan.baseDate, version.renewalMonthsSnapshot);
    const renewalCycle = (previous?.renewalCycle || 0) + 1;
    const [completion] = await tx.insert(volunteerTrainingCompletions).values({
      tenantId: args.tenantId,
      tutorialId: tutorial.id,
      trainingVersionId: version.id,
      requirementVersion: version.version,
      renewalCycle,
      identityKey: args.identityKey,
      userId: args.userId,
      contactId: args.contactId,
      volunteerApplicationId: args.applicationId,
      completionType: args.type,
      attestedAt,
      renewalDueAt,
      recordedByUserId: args.actorId,
      overrideReason: args.type === "staff_override" ? args.reason : null,
    }).onConflictDoNothing().returning();
    if (completion) return completion;
    const [existing] = await tx.select().from(volunteerTrainingCompletions).where(and(
      eq(volunteerTrainingCompletions.tenantId, args.tenantId),
      eq(volunteerTrainingCompletions.trainingVersionId, version.id),
      eq(volunteerTrainingCompletions.identityKey, args.identityKey),
      eq(volunteerTrainingCompletions.renewalCycle, renewalCycle),
    )).limit(1);
    return existing;
}

export async function reconcileTrainingIdentity(args: {
  tenantId: string; userId?: string | null; contactId?: string | null; applicationId?: string | null;
}) {
  if (!args.userId && !args.contactId && !args.applicationId) return;
  await db.transaction(async tx => {
    await reconcileTrainingIdentityWithExecutor(tx, args);
  });
}

export async function reconcileTrainingIdentityWithExecutor(tx: any, args: {
  tenantId: string; userId?: string | null; contactId?: string | null; applicationId?: string | null;
}) {
    const lockIdentity = args.contactId || args.applicationId || args.userId;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`volunteer-training-reconcile:${args.tenantId}:${lockIdentity}`}, 0))`);
    const applicationIds = args.applicationId ? [args.applicationId] : [];
    const matches = [
      ...(args.userId ? [eq(volunteerTrainingCompletions.userId, args.userId), eq(volunteerTrainingCompletions.identityKey, `user:${args.userId}`)] : []),
      ...(args.contactId ? [eq(volunteerTrainingCompletions.contactId, args.contactId), eq(volunteerTrainingCompletions.identityKey, `contact:${args.contactId}`)] : []),
      ...(applicationIds.length ? [
        inArray(volunteerTrainingCompletions.volunteerApplicationId, applicationIds),
        inArray(volunteerTrainingCompletions.identityKey, applicationIds.map(id => `application:${id}`)),
      ] : []),
    ];
    if (!matches.length) return;
    const candidates = await tx.select({
      userId: volunteerTrainingCompletions.userId,
      contactId: volunteerTrainingCompletions.contactId,
      applicationId: volunteerTrainingCompletions.volunteerApplicationId,
    }).from(volunteerTrainingCompletions).where(and(
      eq(volunteerTrainingCompletions.tenantId, args.tenantId),
      or(...matches),
    ));
    for (const candidate of candidates) assertCompatibleTrainingIdentity(candidate, args);
    await tx.update(volunteerTrainingCompletions).set({
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.contactId ? { contactId: args.contactId } : {}),
      ...(args.applicationId ? { volunteerApplicationId: args.applicationId } : {}),
    }).where(and(
      eq(volunteerTrainingCompletions.tenantId, args.tenantId),
      or(...matches),
    ));
}

export async function getApplicationEstablishedIdentity(tenantId: string, applicationId: string, executor: any = db) {
  const [application] = await executor.select({
    id: volunteerApplications.id,
    userId: volunteerApplications.userId,
    contactId: volunteerApplications.contactId,
  }).from(volunteerApplications).where(and(
    eq(volunteerApplications.tenantId, tenantId),
    eq(volunteerApplications.id, applicationId),
  )).limit(1);
  if (!application) throw new Error("Volunteer application was not found");
  const completions = await executor.select({
    userId: volunteerTrainingCompletions.userId,
    contactId: volunteerTrainingCompletions.contactId,
    volunteerApplicationId: volunteerTrainingCompletions.volunteerApplicationId,
  }).from(volunteerTrainingCompletions).where(and(
    eq(volunteerTrainingCompletions.tenantId, tenantId),
    eq(volunteerTrainingCompletions.volunteerApplicationId, applicationId),
  ));
  return resolveApplicationCompletionOwners(application, completions);
}

export async function linkAndReconcileApplicationIdentity(args: {
  tenantId: string; applicationId: string; contactId: string; userId?: string | null;
}) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`volunteer-application-person:${args.tenantId}:${args.applicationId}`}, 0))`);
    await tx.execute(sql`SELECT id FROM volunteer_applications WHERE tenant_id = ${args.tenantId} AND id = ${args.applicationId} FOR UPDATE`);
    const [application] = await tx.select({
      id: volunteerApplications.id,
      userId: volunteerApplications.userId,
      contactId: volunteerApplications.contactId,
    }).from(volunteerApplications).where(and(
      eq(volunteerApplications.tenantId, args.tenantId),
      eq(volunteerApplications.id, args.applicationId),
    )).limit(1);
    if (!application) throw new Error("Volunteer application was not found");
    const completions = await tx.select({
      userId: volunteerTrainingCompletions.userId,
      contactId: volunteerTrainingCompletions.contactId,
      volunteerApplicationId: volunteerTrainingCompletions.volunteerApplicationId,
    }).from(volunteerTrainingCompletions).where(and(
      eq(volunteerTrainingCompletions.tenantId, args.tenantId),
      eq(volunteerTrainingCompletions.volunteerApplicationId, args.applicationId),
    ));
    const established = resolveApplicationCompletionOwners(application, completions);
    const proposedContact = await tx.select({ id: contacts.id, userId: contacts.userId })
      .from(contacts).where(and(eq(contacts.tenantId, args.tenantId), eq(contacts.id, args.contactId))).limit(1);
    if (!proposedContact[0]) throw new Error("Proposed contact is not owned by this tenant");
    const proposedUserId = established.userId || args.userId || proposedContact[0].userId || undefined;
    const resolved = assertActivationIdentityDisposition(established, {
      contactId: args.contactId,
      userId: proposedUserId,
    });
    if (resolved.userId) {
      const [ownedUser] = await tx.select({ id: users.id }).from(users).where(and(
        eq(users.tenantId, args.tenantId), eq(users.id, resolved.userId),
      )).limit(1);
      if (!ownedUser) throw new Error("Proposed user is not owned by this tenant");
    }
    assertResolvedContactUserPair(proposedContact[0], resolved.contactId, resolved.userId);
    if (resolved.userId && !proposedContact[0].userId) {
      const [linkedContact] = await tx.update(contacts).set({
        userId: resolved.userId,
        updatedAt: new Date(),
      }).where(and(
        eq(contacts.tenantId, args.tenantId),
        eq(contacts.id, args.contactId),
        isNull(contacts.userId),
      )).returning({ id: contacts.id });
      if (!linkedContact) throw new Error("Contact ownership changed during activation");
    }
    await tx.update(volunteerApplications).set({
      contactId: resolved.contactId,
      userId: resolved.userId || null,
      updatedAt: new Date(),
    }).where(and(eq(volunteerApplications.tenantId, args.tenantId), eq(volunteerApplications.id, args.applicationId)));
    await tx.update(volunteerTrainingCompletions).set({
      contactId: resolved.contactId,
      ...(resolved.userId ? { userId: resolved.userId } : {}),
    }).where(and(
      eq(volunteerTrainingCompletions.tenantId, args.tenantId),
      eq(volunteerTrainingCompletions.volunteerApplicationId, args.applicationId),
    ));
    if (resolved.userId) {
      await tx.update(volunteerTrainingAccessSessions).set({ revokedAt: new Date() }).where(and(
        eq(volunteerTrainingAccessSessions.tenantId, args.tenantId),
        eq(volunteerTrainingAccessSessions.volunteerApplicationId, args.applicationId),
        isNull(volunteerTrainingAccessSessions.revokedAt),
      ));
    }
    return resolved;
  });
}

export function assertCompatibleTrainingIdentity(
  existing: { userId?: string | null; contactId?: string | null; applicationId?: string | null },
  requested: { userId?: string | null; contactId?: string | null; applicationId?: string | null },
): void {
  const conflicts =
    (!!existing.userId && !!requested.userId && existing.userId !== requested.userId) ||
    (!!existing.contactId && !!requested.contactId && existing.contactId !== requested.contactId) ||
    (!!existing.applicationId && !!requested.applicationId && existing.applicationId !== requested.applicationId);
  if (conflicts) throw new Error("Training identity reconciliation conflicts with existing ownership");
}

export function assertPreviousCompletionOwnership(
  previousMatches: Array<{
    userId?: string | null;
    contactId?: string | null;
    volunteerApplicationId?: string | null;
  }>,
  requested: { userId?: string | null; contactId?: string | null; applicationId?: string | null },
): void {
  for (const candidate of previousMatches) {
    assertCompatibleTrainingIdentity({
      userId: candidate.userId,
      contactId: candidate.contactId,
      applicationId: candidate.volunteerApplicationId,
    }, requested);
  }
}

export async function getTrainingHistory(
  tenantId: string,
  identityKeys: string[],
  owner?: TrainingOwnerContext,
) {
  if (!identityKeys.length) return [];
  return db.select({
    id: volunteerTrainingCompletions.id,
    tutorialId: volunteerTrainingCompletions.tutorialId,
    completionType: volunteerTrainingCompletions.completionType,
    attestedAt: volunteerTrainingCompletions.attestedAt,
    renewalDueAt: volunteerTrainingCompletions.renewalDueAt,
    overrideReason: volunteerTrainingCompletions.overrideReason,
    requirementVersion: volunteerTrainingCompletions.requirementVersion,
    title: volunteerTrainingVersions.titleSnapshot,
  }).from(volunteerTrainingCompletions)
    .innerJoin(volunteerTrainingVersions, eq(volunteerTrainingCompletions.trainingVersionId, volunteerTrainingVersions.id))
    .where(and(
      eq(volunteerTrainingCompletions.tenantId, tenantId),
      inArray(volunteerTrainingCompletions.identityKey, identityKeys),
      ...ownerConditions(owner),
    )).orderBy(sql`${volunteerTrainingCompletions.attestedAt} desc`);
}