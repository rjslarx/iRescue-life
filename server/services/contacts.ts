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
