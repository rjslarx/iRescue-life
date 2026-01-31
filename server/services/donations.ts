import { db } from '../db';
import { donations, expenditures, contacts, type InsertDonation, type InsertExpenditure } from '@shared/schema';
import { eq, and, sum, desc, sql } from 'drizzle-orm';

/**
 * Get all donations for a tenant
 */
export async function getDonationsByTenant(tenantId: string) {
  return db
    .select()
    .from(donations)
    .where(eq(donations.tenantId, tenantId))
    .orderBy(desc(donations.date));
}

/**
 * Get all expenditures for a tenant with grant names
 */
export async function getExpendituresByTenant(tenantId: string) {
  const { grants } = await import('@shared/schema');
  
  return db
    .select({
      id: expenditures.id,
      tenantId: expenditures.tenantId,
      vendor: expenditures.vendor,
      amount: expenditures.amount,
      category: expenditures.category,
      date: expenditures.date,
      notes: expenditures.notes,
      grantId: expenditures.grantId,
      createdAt: expenditures.createdAt,
      grantFunderName: grants.funderName,
      grantProgramName: grants.programName,
    })
    .from(expenditures)
    .leftJoin(grants, eq(expenditures.grantId, grants.id))
    .where(eq(expenditures.tenantId, tenantId))
    .orderBy(desc(expenditures.date));
}

/**
 * Create a new donation
 */
export async function createDonation(tenantId: string, data: Omit<InsertDonation, 'tenantId'>) {
  const [donation] = await db
    .insert(donations)
    .values({
      ...(data as any),
      tenantId,
    })
    .returning();

  // Update or create contact record using new contacts service
  try {
    const { createContactFromDonation } = await import('./contacts');
    await createContactFromDonation(tenantId, data.donorName, data.donorEmail, Number(data.amount) || 0);
  } catch (error) {
    console.error('Failed to create contact from donation:', error);
    // Don't fail the donation if contact creation fails
  }
  
  return donation;
}

/**
 * Create a new expenditure
 */
export async function createExpenditure(tenantId: string, data: Omit<InsertExpenditure, 'tenantId'>) {
  // Security: Validate grantId belongs to this tenant if provided
  if (data.grantId) {
    const { grants } = await import('@shared/schema');
    const [grant] = await db
      .select()
      .from(grants)
      .where(and(
        eq(grants.id, data.grantId),
        eq(grants.tenantId, tenantId)
      ))
      .limit(1);
    
    if (!grant) {
      throw new Error('Grant not found or does not belong to this organization');
    }
  }
  
  const [expenditure] = await db
    .insert(expenditures)
    .values({
      ...(data as any),
      tenantId,
    })
    .returning();
  
  return expenditure;
}

/**
 * Get financial summary for a tenant
 */
export async function getFinancialSummary(tenantId: string) {
  const [donationStats] = await db
    .select({
      total: sum(donations.amount),
      count: sql<number>`count(*)::int`,
    })
    .from(donations)
    .where(eq(donations.tenantId, tenantId));

  const [expenditureStats] = await db
    .select({
      total: sum(expenditures.amount),
      count: sql<number>`count(*)::int`,
    })
    .from(expenditures)
    .where(eq(expenditures.tenantId, tenantId));

  return {
    donations: {
      total: Number(donationStats?.total || 0),
      count: donationStats?.count || 0,
    },
    expenditures: {
      total: Number(expenditureStats?.total || 0),
      count: expenditureStats?.count || 0,
    },
    netBalance: Number(donationStats?.total || 0) - Number(expenditureStats?.total || 0),
  };
}

/**
 * Update contact record from donation
 */
async function updateContactFromDonation(
  tenantId: string,
  name: string,
  email: string,
  amount: number
) {
  const [existingContact] = await db
    .select()
    .from(contacts)
    .where(and(
      eq(contacts.tenantId, tenantId),
      eq(contacts.email, email)
    ))
    .limit(1);

  if (existingContact) {
    // Update existing contact
    await db
      .update(contacts)
      .set({
        totalDonated: existingContact.totalDonated + amount,
        donationCount: existingContact.donationCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existingContact.id));
  } else {
    // Create new contact
    await db
      .insert(contacts)
      .values({
        tenantId,
        name,
        email,
        totalDonated: amount,
        donationCount: 1,
      });
  }
}
