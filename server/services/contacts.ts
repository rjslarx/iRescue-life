import { db } from '../db';
import { contacts, insertContactSchema, volunteerApplications, volunteerTrainingCompletions } from '@shared/schema';
import { eq, and, isNull, or, sql } from 'drizzle-orm';

export type ContactSource = 'adoption_application' | 'animal_inquiry' | 'foster_application' | 'direct_foster_agreement' | 'volunteer_application' | 'user' | 'donation' | 'manual' | 'newsletter';
export type ContactRole = 'admin' | 'board_member' | 'staff' | 'foster' | 'volunteer';

export function isHighConfidenceVolunteerApplicationContact(
  application: { applicantName: string; applicantPhone?: string | null },
  contact: { name: string; phone?: string | null; role?: string[] | null; source?: string[] | null },
) {
  const normalizedName = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedPhone = (value?: string | null) => (value || '').replace(/\D/g, '');
  const trustedOrigin = contact.role?.includes('volunteer') ||
    contact.source?.includes('volunteer_application');
  return !!trustedOrigin && (
    (!!normalizedName(application.applicantName) &&
      normalizedName(contact.name) === normalizedName(application.applicantName)) ||
    (!!normalizedPhone(application.applicantPhone) &&
      normalizedPhone(contact.phone) === normalizedPhone(application.applicantPhone))
  );
}

export function decideVolunteerIdentityResolution(
  established: { contactId?: string | null; userId?: string | null },
  allowExistingEmailContactMatch: boolean,
) {
  if (established.contactId || established.userId) {
    return { action: 'use_established' as const, mayLookupEmail: false as const, mayLink: true as const };
  }
  if (!allowExistingEmailContactMatch) {
    return { action: 'identity_review' as const, mayLookupEmail: false as const, mayLink: false as const };
  }
  return { action: 'staff_email_resolution' as const, mayLookupEmail: true as const, mayLink: true as const };
}

export function decideFreshVolunteerContactInsertOutcome(inserted: boolean) {
  return inserted
    ? { link: true as const, requiresStaffVerification: false as const }
    : { link: false as const, requiresStaffVerification: true as const };
}

function volunteerIdentityReviewRequiredError() {
  return Object.assign(new Error('Volunteer identity requires staff verification'), {
    status: 409,
    code: 'VOLUNTEER_IDENTITY_REVIEW_REQUIRED',
  });
}

export const staffContactCreateSchema = insertContactSchema
  .omit({ tenantId: true, userId: true })
  .strict();
export const staffContactUpdateSchema = staffContactCreateSchema.partial().strict();

export function assertContactCanLink(existingUserId: string | null | undefined, requestedUserId: string): void {
  if (existingUserId && existingUserId !== requestedUserId) {
    const error = new Error('Contact email is already owned by another user') as Error & { status?: number; code?: string };
    error.status = 409;
    error.code = 'CONTACT_OWNERSHIP_CONFLICT';
    throw error;
  }
}

export function assertProfileContactEmailAvailable(
  matchingContact: { id: string; userId: string | null } | undefined,
  ownContactIds: string[],
  userId: string,
): void {
  if (!matchingContact) return;
  if (!ownContactIds.includes(matchingContact.id) || (matchingContact.userId && matchingContact.userId !== userId)) {
    const error = new Error('That email address belongs to another contact') as Error & { status?: number; code?: string };
    error.status = 409;
    error.code = 'CONTACT_EMAIL_CONFLICT';
    throw error;
  }
}

/**
 * Upsert a contact - create if doesn't exist, update if exists
 * This ensures contacts are kept up-to-date across all sources
 */
export async function upsertContact(params: {
  tenantId: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  source: ContactSource;
  userId?: string;
  role?: ContactRole[];
  tags?: string[];
  notes?: string;
}) {
  const { tenantId, email, source, ...otherData } = params;

  try {
    // Check if contact exists
    const existing = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.tenantId, tenantId),
        eq(contacts.email, email)
      ))
      .limit(1);

    if (existing.length > 0) {
      // Contact exists - update it
      const contact = existing[0];
      if (params.userId) assertContactCanLink(contact.userId, params.userId);
      
      // Merge sources (add new source if not already present)
      const updatedSources = contact.source || [];
      if (!updatedSources.includes(source)) {
        updatedSources.push(source);
      }

      // Merge roles if provided
      let updatedRoles = contact.role || [];
      if (params.role && params.role.length > 0) {
        updatedRoles = Array.from(new Set([...updatedRoles, ...params.role]));
      }

      // Update with latest data
      const [updated] = await db
        .update(contacts)
        .set({
          ...otherData,
          source: updatedSources,
          role: updatedRoles.length > 0 ? updatedRoles : null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(contacts.id, contact.id),
          ...(params.userId ? [or(isNull(contacts.userId), eq(contacts.userId, params.userId))] : []),
        ))
        .returning();

      if (!updated && params.userId) {
        throw Object.assign(new Error('Contact email is already owned by another user'), {
          status: 409,
          code: 'CONTACT_OWNERSHIP_CONFLICT',
        });
      }
      return updated;
    } else {
      // Create new contact
      const [created] = await db
        .insert(contacts)
        .values({
          tenantId,
          email,
          source: [source],
          ...otherData,
        } as any)
        .returning();

      return created;
    }
  } catch (error) {
    console.error('Error upserting contact:', error);
    throw error;
  }
}

/**
 * Create contact from adoption application
 */
export async function createContactFromAdoptionApplication(
  tenantId: string,
  applicantName: string,
  applicantEmail: string,
  applicantPhone: string
) {
  return upsertContact({
    tenantId,
    email: applicantEmail,
    name: applicantName,
    phone: applicantPhone,
    source: 'adoption_application',
    tags: ['Adoption Applicant'],
  });
}

/**
 * Create contact from foster application
 */
export async function createContactFromFosterApplication(
  tenantId: string,
  applicantName: string,
  applicantEmail: string,
  applicantPhone: string,
  address?: string
) {
  return upsertContact({
    tenantId,
    email: applicantEmail,
    name: applicantName,
    phone: applicantPhone,
    address,
    source: 'foster_application',
    tags: ['Foster Applicant'],
  });
}

/**
 * Activate volunteer in directory when volunteer application moves to Active Pool.
 * Upserts contact record with 'volunteer' role.
 */
export async function establishVolunteerApplicationIdentity(params: {
  tenantId: string;
  applicationId?: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  address?: string;
  allowExistingEmailContactMatch: boolean;
}) {
  const { tenantId, applicationId, applicantName, applicantEmail, applicantPhone, address } = params;

  try {
    if (!applicationId) throw new Error('Volunteer application identity is required for activation');
    const {
      getApplicationEstablishedIdentity,
      linkAndReconcileApplicationIdentity,
    } = await import('./volunteer-training');
    const established = await getApplicationEstablishedIdentity(tenantId, applicationId);
    const resolution = decideVolunteerIdentityResolution(established, params.allowExistingEmailContactMatch);
    if (resolution.action === 'identity_review') {
      throw volunteerIdentityReviewRequiredError();
    }
    let contact;
    if (established.contactId) {
      [contact] = await db.select().from(contacts).where(and(
        eq(contacts.tenantId, tenantId), eq(contacts.id, established.contactId),
      )).limit(1);
    } else if (established.userId) {
      [contact] = await db.select().from(contacts).where(and(
        eq(contacts.tenantId, tenantId), eq(contacts.userId, established.userId),
      )).limit(1);
    } else {
      const normalizedEmail = applicantEmail.trim().toLowerCase();
      const [emailContact] = await db.select().from(contacts).where(and(
        eq(contacts.tenantId, tenantId),
        sql`lower(trim(${contacts.email})) = ${normalizedEmail}`,
      )).limit(1);
      if (emailContact) {
        const highConfidence = isHighConfidenceVolunteerApplicationContact({
          applicantName,
          applicantPhone,
        }, emailContact);
        if (!highConfidence) throw volunteerIdentityReviewRequiredError();
        contact = emailContact;
      } else {
        try {
          [contact] = await db.insert(contacts).values({
            tenantId,
            email: normalizedEmail,
            name: applicantName,
            phone: applicantPhone,
            address,
            source: ['volunteer_application'],
            role: ['volunteer'],
            tags: ['Volunteer Applicant'],
          }).returning();
        } catch (error: any) {
          if (error?.code === '23505' || error?.cause?.code === '23505') {
            const outcome = decideFreshVolunteerContactInsertOutcome(false);
            if (!outcome.link) throw volunteerIdentityReviewRequiredError();
          }
          throw error;
        }
      }
    }
    if (!contact) throw new Error('Authoritative volunteer contact was not found');

    await linkAndReconcileApplicationIdentity({
        tenantId,
        applicationId,
        contactId: contact.id,
        userId: established.userId || contact.userId,
      });
    return contact;
  } catch (error) {
    console.error('[Volunteer Directory Sync] Error activating volunteer in directory:', error);
    throw error;
  }
}

export async function markVolunteerContactActiveWithExecutor(executor: any, tenantId: string, contactId: string) {
  const [contact] = await executor.select().from(contacts).where(and(
    eq(contacts.tenantId, tenantId), eq(contacts.id, contactId),
  )).limit(1);
  if (!contact) throw new Error('Volunteer contact was not found');
  const [activated] = await executor.update(contacts).set({
    source: Array.from(new Set([...(contact.source || []), 'volunteer_application' as const])),
    role: Array.from(new Set([...(contact.role || []), 'volunteer' as const])),
    tags: Array.from(new Set([...(contact.tags || []), 'Active Volunteer'])),
    updatedAt: new Date(),
  }).where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId))).returning();
  return activated;
}

export async function markVolunteerContactActive(tenantId: string, contactId: string) {
  return markVolunteerContactActiveWithExecutor(db, tenantId, contactId);
}

export async function activateVolunteerInDirectory(params: Parameters<typeof establishVolunteerApplicationIdentity>[0]) {
  const contact = await establishVolunteerApplicationIdentity(params);
  return markVolunteerContactActive(params.tenantId, contact.id);
}

export async function applyLockedFosterUserActivation(args: {
  lockedRoles: string[];
  lockedIsActive: boolean;
  complianceGate: () => Promise<void>;
  write: (roles: string[]) => Promise<void>;
}) {
  const roles = args.lockedRoles.includes('foster') ? args.lockedRoles : [...args.lockedRoles, 'foster'];
  if (!args.lockedIsActive && args.lockedRoles.includes('volunteer')) {
    await args.complianceGate();
  }
  await args.write(roles);
  return roles;
}

/**
 * Activate foster in directory when foster application moves to Active Pool.
 * 1. Upserts contact record with 'foster' role
 * 2. Finds or creates user record with 'foster' role and fosterStatus='active'
 * 
 * This ensures the foster appears in:
 * - Contacts directory with foster role
 * - "Find Foster" matching on animal profiles
 * - Foster dropdowns for animal assignment
 */
export async function activateFosterInDirectory(params: {
  tenantId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  address?: string;
  fosterApplicationId?: string;
  existingContactId?: string;
}) {
  const { tenantId, applicantName, applicantEmail, applicantPhone, address, existingContactId } = params;
  const { users } = await import('@shared/schema');
  const { eq, and, sql } = await import('drizzle-orm');

  const normalizedEmail = applicantEmail?.trim().toLowerCase();
  if (!normalizedEmail) {
    console.error('[Foster Directory Sync] Cannot activate foster: no email provided', { applicantName, tenantId });
    return null;
  }

  console.log(`[Foster Directory Sync] Starting activation for ${normalizedEmail} (${applicantName}) in tenant ${tenantId}`);

  let contact = null;
  try {
    if (existingContactId) {
      const [selectedContact] = await db
        .select()
        .from(contacts)
        .where(and(
          eq(contacts.id, existingContactId),
          eq(contacts.tenantId, tenantId),
          sql`LOWER(TRIM(${contacts.email})) = ${normalizedEmail}`,
        ))
        .limit(1);

      if (!selectedContact) {
        throw new Error('Selected direct-agreement contact no longer matches the recipient');
      }

      // A direct agreement authorizes this exact existing contact. Preserve the
      // adopter's master identity and all existing history while merging only
      // the additional foster access markers.
      [contact] = await db
        .update(contacts)
        .set({
          source: sql`CASE
            WHEN COALESCE(${contacts.source}, ARRAY[]::text[]) @> ARRAY['direct_foster_agreement']::text[]
              THEN COALESCE(${contacts.source}, ARRAY[]::text[])
            ELSE array_append(COALESCE(${contacts.source}, ARRAY[]::text[]), 'direct_foster_agreement')
          END`,
          role: sql`CASE
            WHEN COALESCE(${contacts.role}, ARRAY[]::text[]) @> ARRAY['foster']::text[]
              THEN COALESCE(${contacts.role}, ARRAY[]::text[])
            ELSE array_append(COALESCE(${contacts.role}, ARRAY[]::text[]), 'foster')
          END`,
          tags: sql`CASE
            WHEN COALESCE(${contacts.tags}, ARRAY[]::text[]) @> ARRAY['Active Foster']::text[]
              THEN COALESCE(${contacts.tags}, ARRAY[]::text[])
            ELSE array_append(COALESCE(${contacts.tags}, ARRAY[]::text[]), 'Active Foster')
          END`,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.id, existingContactId), eq(contacts.tenantId, tenantId)))
        .returning();
    } else {
      contact = await upsertContact({
        tenantId,
        email: normalizedEmail,
        name: applicantName,
        phone: applicantPhone,
        address,
        source: 'foster_application',
        role: ['foster'],
        tags: ['Active Foster'],
      });
    }
    console.log(`[Foster Directory Sync] Contact upserted for ${normalizedEmail}, id: ${contact?.id}`);
  } catch (contactError) {
    console.error(`[Foster Directory Sync] Failed to upsert contact for ${normalizedEmail}:`, contactError);
  }

  try {
    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        sql`LOWER(TRIM(${users.email})) = ${normalizedEmail}`
      ))
      .limit(1);

    const existingUser = existingUsers[0];

    if (existingUser) {
      await db.transaction(async tx => {
        const {
          acquireVolunteerTrainingActivationPolicyLock,
          ensureUserVolunteerActivationCompliance,
          reconcileTrainingIdentityWithExecutor,
        } = await import('./volunteer-training');
        await acquireVolunteerTrainingActivationPolicyLock(tx, tenantId);
        const [lockedUser] = await tx.select({
          id: users.id,
          roles: users.roles,
          isActive: users.isActive,
        }).from(users).where(and(
          eq(users.tenantId, tenantId), eq(users.id, existingUser.id),
        )).limit(1).for('no key update');
        if (!lockedUser) throw new Error('Existing foster account changed during activation');
        await applyLockedFosterUserActivation({
          lockedRoles: lockedUser.roles || [],
          lockedIsActive: lockedUser.isActive,
          complianceGate: async () => {
            await ensureUserVolunteerActivationCompliance({
              tenantId,
              userId: lockedUser.id,
              actorId: lockedUser.id,
              executor: tx,
            });
          },
          write: async roles => {
            await tx.update(users).set({
              roles: roles as typeof lockedUser.roles,
              fosterStatus: 'active',
              isActive: true,
            }).where(and(eq(users.tenantId, tenantId), eq(users.id, lockedUser.id)));
          },
        });
        if (contact && (!contact.userId || contact.userId !== lockedUser.id)) {
          assertContactCanLink(contact.userId, lockedUser.id);
          const [linkedContact] = await tx.update(contacts)
            .set({ userId: lockedUser.id, updatedAt: new Date() })
            .where(and(eq(contacts.id, contact.id), isNull(contacts.userId)))
            .returning({ id: contacts.id });
          if (!linkedContact) {
            throw Object.assign(new Error('Contact email is already owned by another user'), {
              status: 409, code: 'CONTACT_OWNERSHIP_CONFLICT',
            });
          }
          await reconcileTrainingIdentityWithExecutor(tx, {
            tenantId, contactId: contact.id, userId: lockedUser.id,
          });
        }
      });
    } else {
      console.log(`[Foster Directory Sync] No existing user found for ${normalizedEmail}, sending foster welcome invitation`);

      try {
        const { userInvitations, tenants } = await import('@shared/schema');
        const { isNull, gt } = await import('drizzle-orm');

        const [existingInvitation] = await db
          .select()
          .from(userInvitations)
          .where(and(
            eq(userInvitations.tenantId, tenantId),
            eq(userInvitations.email, normalizedEmail),
            isNull(userInvitations.acceptedAt),
            gt(userInvitations.expiresAt, new Date())
          ))
          .limit(1);

        if (existingInvitation) {
          console.log(`[Foster Directory Sync] Pending invitation already exists for ${normalizedEmail}, skipping`);
        } else {
          const { sendFosterWelcomeEmail } = await import('./invitations');
          const crypto = await import('crypto');

          const [tenant] = await db
            .select({ name: tenants.name, subdomain: tenants.subdomain, customDomain: tenants.customDomain })
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1);

          const tenantName = tenant?.name || 'Our Organization';

          let [inviterUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(
              eq(users.tenantId, tenantId),
              eq(users.isActive, true),
              sql`${users.roles} @> ARRAY['admin']::text[]`
            ))
            .limit(1);

          if (!inviterUser) {
            [inviterUser] = await db
              .select({ id: users.id })
              .from(users)
              .where(and(
                eq(users.tenantId, tenantId),
                eq(users.isActive, true),
                sql`(${users.roles} @> ARRAY['owner']::text[] OR ${users.roles} @> ARRAY['staff']::text[])`
              ))
              .limit(1);
          }

          if (!inviterUser) {
            console.error(`[Foster Directory Sync] No admin/owner/staff user found for tenant ${tenantId}, cannot create invitation`);
            return contact;
          }

          const token = crypto.randomBytes(12).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          const [invitation] = await db
            .insert(userInvitations)
            .values({
              tenantId,
              email: normalizedEmail,
              fullName: applicantName,
              phone: applicantPhone || null,
              roles: ['foster'] as any,
              token,
              invitedBy: inviterUser.id,
              expiresAt,
            })
            .returning();

          console.log(`[Foster Directory Sync] Created invitation for ${normalizedEmail} (id: ${invitation.id})`);

          await sendFosterWelcomeEmail(tenantId, {
            id: invitation.id,
            email: normalizedEmail,
            fullName: applicantName,
            roles: ['foster'],
            token: invitation.token,
          }, tenantName);

          console.log(`[Foster Directory Sync] Sent foster welcome email to ${normalizedEmail}`);
        }
      } catch (inviteError) {
        console.error(`[Foster Directory Sync] Failed to send foster welcome invitation to ${normalizedEmail}:`, inviteError);
      }
    }
  } catch (userError) {
    console.error(`[Foster Directory Sync] CRITICAL: Failed to sync user record for ${normalizedEmail}:`, userError);
    throw userError;
  }

  return contact;
}

/**
 * Create contact from volunteer application
 */
export async function createContactFromVolunteerApplication(
  tenantId: string,
  applicationId: string,
  applicantName: string,
  applicantEmail: string,
  applicantPhone: string,
  address?: string
) {
  const normalizedEmail = applicantEmail.trim().toLowerCase();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`public-volunteer-contact:${tenantId}:${normalizedEmail}`}, 0))`);
    const existing = await tx.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.tenantId, tenantId),
      sql`lower(trim(${contacts.email})) = ${normalizedEmail}`,
    )).limit(1);
    const decision = decidePublicVolunteerContactAssociation(existing.length > 0);
    if (!decision.createAndLink) {
      return { contact: null, linked: false as const, requiresStaffVerification: true as const };
    }

    const [contact] = await tx.insert(contacts).values({
      tenantId,
      email: normalizedEmail,
      name: applicantName,
      phone: applicantPhone,
      address,
      source: ['volunteer_application'],
      tags: ['Volunteer Applicant'],
    }).returning();
    const matching = await tx.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.tenantId, tenantId),
      sql`lower(trim(${contacts.email})) = ${normalizedEmail}`,
    ));
    if (matching.length !== 1 || matching[0].id !== contact.id) {
      await tx.delete(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contact.id)));
      return { contact: null, linked: false as const, requiresStaffVerification: true as const };
    }
    const [linkedApplication] = await tx.update(volunteerApplications).set({
      contactId: contact.id,
      updatedAt: new Date(),
    }).where(and(
      eq(volunteerApplications.tenantId, tenantId),
      eq(volunteerApplications.id, applicationId),
      isNull(volunteerApplications.contactId),
      isNull(volunteerApplications.userId),
    )).returning({ id: volunteerApplications.id });
    if (!linkedApplication) {
      await tx.delete(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contact.id)));
      return { contact: null, linked: false as const, requiresStaffVerification: true as const };
    }
    await tx.update(volunteerTrainingCompletions).set({ contactId: contact.id }).where(and(
      eq(volunteerTrainingCompletions.tenantId, tenantId),
      eq(volunteerTrainingCompletions.volunteerApplicationId, applicationId),
      isNull(volunteerTrainingCompletions.contactId),
      isNull(volunteerTrainingCompletions.userId),
    ));
    return { contact, linked: true as const, requiresStaffVerification: false as const };
  });
}

export function decidePublicVolunteerContactAssociation(existingContactFound: boolean) {
  return existingContactFound
    ? { createAndLink: false as const, requiresStaffVerification: true as const, complianceIdentity: 'application_only' as const }
    : { createAndLink: true as const, requiresStaffVerification: false as const, complianceIdentity: 'fresh_contact' as const };
}

/**
 * Create contact from donation
 */
export async function createContactFromDonation(
  tenantId: string,
  donorName: string,
  donorEmail: string,
  amount: number
) {
  const existing = await db
    .select()
    .from(contacts)
    .where(and(
      eq(contacts.tenantId, tenantId),
      eq(contacts.email, donorEmail)
    ))
    .limit(1);

  if (existing.length > 0) {
    // Update donation totals
    const contact = existing[0];
    const [updated] = await db
      .update(contacts)
      .set({
        totalDonated: (contact.totalDonated || 0) + amount,
        donationCount: (contact.donationCount || 0) + 1,
        lastDonationDate: new Date(),
        updatedAt: new Date(),
        source: contact.source?.includes('donation') 
          ? contact.source 
          : [...(contact.source || []), 'donation'],
      })
      .where(eq(contacts.id, contact.id))
      .returning();

    return updated;
  } else {
    // Create new contact with the first donation already recorded.
    // upsertContact() doesn't accept donation fields, so insert directly
    // to make sure the first donation amount is captured (otherwise the
    // contact would start at 0 and only later donations would increment).
    const [created] = await db
      .insert(contacts)
      .values({
        tenantId,
        email: donorEmail,
        name: donorName,
        source: ['donation'],
        tags: ['Donor'],
        totalDonated: amount,
        donationCount: 1,
        lastDonationDate: new Date(),
      })
      .returning();

    return created;
  }
}

/**
 * Create/update contact from user account (staff, volunteers, etc.)
 * Looks up by userId first to handle email changes correctly
 */
export async function syncContactFromUser(
  userId: string,
  tenantId: string,
  email: string,
  fullName: string,
  roles: ContactRole[]
) {
  try {
    // First, try to find existing contact by userId
    const existingByUserId = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.tenantId, tenantId),
        eq(contacts.userId, userId)
      ))
      .limit(1);

    if (existingByUserId.length > 0) {
      // Contact exists by userId - update it (handles email changes)
      const contact = existingByUserId[0];
      
      // Merge roles
      const updatedRoles = Array.from(new Set([...(contact.role || []), ...roles]));
      
      const [updated] = await db
        .update(contacts)
        .set({
          email,
          name: fullName,
          role: updatedRoles.length > 0 ? updatedRoles : null,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contact.id))
        .returning();

      return updated;
    } else {
      // No existing contact by userId, use upsert by email
      return upsertContact({
        tenantId,
        email,
        name: fullName,
        userId,
        source: 'user',
        role: roles,
        tags: ['Team Member'],
      });
    }
  } catch (error) {
    console.error('Error syncing contact from user:', error);
    throw error;
  }
}

/**
 * Sync all users to contacts (useful for initial migration or periodic sync)
 */
export async function syncAllUsersToContacts(tenantId: string) {
  const { users } = await import('@shared/schema');
  
  const userList = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      email: users.email,
      fullName: users.fullName,
      roles: users.roles,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(
      eq(users.tenantId, tenantId),
      eq(users.isActive, true)
    ));

  const results = [];
  for (const user of userList) {
    try {
      const contact = await syncContactFromUser(
        user.id,
        tenantId,
        user.email,
        user.fullName,
        user.roles.filter(r => r !== 'platform_admin') as ContactRole[]
      );
      results.push(contact);
    } catch (error) {
      console.error(`Failed to sync user ${user.email} to contacts:`, error);
    }
  }

  return results;
}
