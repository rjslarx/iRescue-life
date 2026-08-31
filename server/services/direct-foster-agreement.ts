import { and, eq, sql } from 'drizzle-orm';

import { db } from '../db';
import { contacts, fosterAgreementSessions } from '@shared/schema';

export type ApprovedAdopter = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
};

export async function getApprovedAdopters(tenantId: string): Promise<ApprovedAdopter[]> {
  const approved = await db.execute(sql`
    SELECT DISTINCT ON (c.id) c.id, c.name, c.email, c.phone, c.address
    FROM contacts c
    INNER JOIN adoptions a ON a.tenant_id = c.tenant_id
      AND LOWER(TRIM(a.adopter_email)) = LOWER(TRIM(c.email))
    WHERE c.tenant_id = ${tenantId}
    ORDER BY c.id, a.adoption_date DESC
  `);

  return approved.rows as ApprovedAdopter[];
}

export async function getApprovedAdopter(
  tenantId: string,
  contactId: string,
): Promise<ApprovedAdopter | null> {
  const [contact] = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      address: contacts.address,
    })
    .from(contacts)
    .where(and(
      eq(contacts.id, contactId),
      eq(contacts.tenantId, tenantId),
      sql`EXISTS (
        SELECT 1
        FROM adoptions a
        WHERE a.tenant_id = ${tenantId}
          AND LOWER(TRIM(a.adopter_email)) = LOWER(TRIM(${contacts.email}))
      )`,
    ))
    .limit(1);

  return contact || null;
}

export function resolveDeliveredSendMethod(
  deliveredMethods: Array<'email' | 'sms'>,
): 'email' | 'sms' | 'both' | null {
  const uniqueMethods = new Set(deliveredMethods);
  if (uniqueMethods.has('email') && uniqueMethods.has('sms')) return 'both';
  if (uniqueMethods.has('email')) return 'email';
  if (uniqueMethods.has('sms')) return 'sms';
  return null;
}

export async function createPendingDirectFosterAgreement(params: {
  tenantId: string;
  templateId: number;
  staffInitiatedBy: string | null;
  contact: ApprovedAdopter;
  templateName: string;
  templateHtmlSnapshot: string;
  sendMethod: 'email' | 'sms' | 'both';
  secureTokenHash: string;
  expiresAt: Date;
}) {
  const [session] = await db
    .insert(fosterAgreementSessions)
    .values({
      tenantId: params.tenantId,
      fosterApplicationId: null,
      templateId: params.templateId,
      origin: 'direct',
      staffInitiatedBy: params.staffInitiatedBy,
      directContactId: params.contact.id,
      fosterName: params.contact.name,
      fosterEmail: params.contact.email,
      fosterPhone: params.contact.phone,
      fosterAddress: params.contact.address,
      templateName: params.templateName,
      templateHtmlSnapshot: params.templateHtmlSnapshot,
      sendMethod: params.sendMethod,
      secureTokenHash: params.secureTokenHash,
      expiresAt: params.expiresAt,
      status: 'pending',
    })
    .onConflictDoNothing()
    .returning();

  return session || null;
}