import { db } from '../db';
import { contacts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export type ContactSource = 'adoption_application' | 'foster_application' | 'volunteer_application' | 'user' | 'donation' | 'manual' | 'newsletter';
export type ContactRole = 'admin' | 'board_member' | 'staff' | 'foster' | 'volunteer';

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
        .where(eq(contacts.id, contact.id))
        .returning();

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
export async function activateVolunteerInDirectory(params: {
  tenantId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  address?: string;
}) {
  const { tenantId, applicantName, applicantEmail, applicantPhone, address } = params;

  try {
    const normalizedEmail = applicantEmail.trim().toLowerCase();

    const contact = await upsertContact({
      tenantId,
      email: normalizedEmail,
      name: applicantName,
      phone: applicantPhone,
      address,
      source: 'volunteer_application',
      role: ['volunteer'],
      tags: ['Active Volunteer'],
    });

    console.log(`[Volunteer Directory Sync] Synced contact ${normalizedEmail} with volunteer role`);
    return contact;
  } catch (error) {
    console.error('[Volunteer Directory Sync] Error activating volunteer in directory:', error);
  }
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
}) {
  const { tenantId, applicantName, applicantEmail, applicantPhone, address } = params;
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
    console.log(`[Foster Directory Sync] Contact upserted for ${normalizedEmail}, id: ${contact?.id}`);
  } catch (contactError) {
    console.error(`[Foster Directory Sync] Failed to upsert contact for ${normalizedEmail}:`, contactError);
  }

  try {
    const existingUsers = await db
      .select({ id: users.id, roles: users.roles, fosterStatus: users.fosterStatus, email: users.email })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        sql`LOWER(TRIM(${users.email})) = ${normalizedEmail}`
      ))
      .limit(1);

    const existingUser = existingUsers[0];

    if (existingUser) {
      const currentRoles = existingUser.roles || [];
      const needsRoleUpdate = !currentRoles.includes('foster');
      const needsStatusUpdate = existingUser.fosterStatus !== 'active';

      if (needsRoleUpdate || needsStatusUpdate) {
        const updatedRoles = needsRoleUpdate
          ? [...currentRoles, 'foster'] as typeof currentRoles
          : currentRoles;

        await db.update(users).set({
          roles: updatedRoles,
          fosterStatus: 'active',
        }).where(eq(users.id, existingUser.id));

        console.log(`[Foster Directory Sync] Updated user ${normalizedEmail} (id: ${existingUser.id}): roles=${JSON.stringify(updatedRoles)}, fosterStatus=active (was: roles=${JSON.stringify(currentRoles)}, fosterStatus=${existingUser.fosterStatus})`);
      } else {
        console.log(`[Foster Directory Sync] User ${normalizedEmail} already has foster role and active status, no update needed`);
      }

      if (contact && (!contact.userId || contact.userId !== existingUser.id)) {
        await db.update(contacts).set({ userId: existingUser.id, updatedAt: new Date() }).where(eq(contacts.id, contact.id));
        console.log(`[Foster Directory Sync] Linked contact ${contact.id} to user ${existingUser.id}`);
      }
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
  }

  return contact;
}

/**
 * Create contact from volunteer application
 */
export async function createContactFromVolunteerApplication(
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
    source: 'volunteer_application',
    tags: ['Volunteer Applicant'],
  });
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
    return upsertContact({
      tenantId,
      email: donorEmail,
      name: donorName,
      source: 'donation',
      tags: ['Donor'],
    });
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
