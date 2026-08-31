/**
 * Approved-adopter eligibility and direct foster session regression tests.
 *
 * Run via: scripts/run-tests.sh tests/direct-foster-agreement.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import express from 'express';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../server/db';
import {
  adoptionCheckoutSessions,
  adoptions,
  animals,
  applications,
  contacts,
  fosterAgreementSessions,
  fosterContractTemplates,
  tenants,
  users,
} from '../shared/schema';
import { registerRoutes } from '../server/routes';
import {
  createPendingDirectFosterAgreement,
  getApprovedAdopter,
  getApprovedAdopters,
  resolveDeliveredSendMethod,
} from '../server/services/direct-foster-agreement';
import { activateFosterInDirectory } from '../server/services/contacts';

const runId = `direct-foster-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
const tenantIds: string[] = [];
const animalIds: string[] = [];

let tenantAId: string;
let tenantBId: string;
let approvedContactId: string;
let unapprovedContactId: string;
let templateId: number;

before(async () => {
  const createdTenants = await db
    .insert(tenants)
    .values([
      { name: `Direct Foster A ${runId}`, subdomain: `${runId}-a`.slice(0, 40) },
      { name: `Direct Foster B ${runId}`, subdomain: `${runId}-b`.slice(0, 40) },
    ] as any)
    .returning({ id: tenants.id });
  [tenantAId, tenantBId] = createdTenants.map((tenant) => tenant.id);
  tenantIds.push(tenantAId, tenantBId);

  const [approvedContact, unapprovedContact] = await db
    .insert(contacts)
    .values([
      {
        tenantId: tenantAId,
        name: 'Approved Adopter',
        email: `${runId}-Approved@Example.Test`,
        phone: '+15555550101',
        address: '101 Test Street',
        source: ['adoption_application'],
        role: ['volunteer'],
        tags: ['Approved Adopter', 'VIP'],
      },
      {
        tenantId: tenantAId,
        name: 'Applicant Only',
        email: `${runId}-unapproved@example.test`,
      },
    ] as any)
    .returning({ id: contacts.id });
  approvedContactId = approvedContact.id;
  unapprovedContactId = unapprovedContact.id;

  const createdAnimals = await db
    .insert(animals)
    .values([
      {
        tenantId: tenantAId,
        animalId: `${runId}-1`,
        name: `Adopted One ${runId}`,
        species: 'Dog',
        breed: 'Mixed Breed',
        age: 'Adult',
        status: 'adopted',
      },
      {
        tenantId: tenantAId,
        animalId: `${runId}-2`,
        name: `Adopted Two ${runId}`,
        species: 'Dog',
        breed: 'Mixed Breed',
        age: 'Adult',
        status: 'adopted',
      },
    ] as any)
    .returning({ id: animals.id });
  animalIds.push(...createdAnimals.map((animal) => animal.id));

  await db.insert(adoptions).values(createdAnimals.map((animal, index) => ({
    tenantId: tenantAId,
    animalId: animal.id,
    adopterName: 'Approved Adopter',
    adopterEmail: `${runId}-approved@example.test`,
    adopterPhone: '+15555550101',
    notes: `Eligibility evidence ${index}`,
  })) as any);

  const [template] = await db
    .insert(fosterContractTemplates)
    .values({
      tenantId: tenantAId,
      name: 'Frozen direct foster template',
      htmlTemplate: '<p>{{foster_name}}</p>',
      isActive: true,
      isDefault: true,
    } as any)
    .returning({ id: fosterContractTemplates.id });
  templateId = template.id;
});

after(async () => {
  if (tenantIds.length) {
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
  }
});

test('approved adopter list is deduplicated across multiple completed adoptions', async () => {
  const approved = await getApprovedAdopters(tenantAId);
  assert.equal(approved.length, 1);
  assert.equal(approved[0].id, approvedContactId);
  assert.equal(approved[0].email, `${runId}-Approved@Example.Test`);
});

test('eligibility rejects a non-adopter and a contact from another tenant', async () => {
  assert.equal(await getApprovedAdopter(tenantAId, unapprovedContactId), null);
  assert.equal(await getApprovedAdopter(tenantBId, approvedContactId), null);
  assert.equal((await getApprovedAdopter(tenantAId, approvedContactId))?.id, approvedContactId);
});

test('direct activation preserves the selected adopter contact and merges foster access', async () => {
  await activateFosterInDirectory({
    tenantId: tenantAId,
    applicantName: 'Signer Entered Different Name',
    applicantEmail: `${runId}-approved@example.test`,
    applicantPhone: '+15555559999',
    address: 'Different signer-entered address',
    existingContactId: approvedContactId,
  });

  const matchingContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.tenantId, tenantAId));
  const approvedMatches = matchingContacts.filter(
    (contact) => contact.email.toLowerCase() === `${runId}-approved@example.test`,
  );

  assert.equal(approvedMatches.length, 1);
  assert.equal(approvedMatches[0].id, approvedContactId);
  assert.equal(approvedMatches[0].name, 'Approved Adopter');
  assert.equal(approvedMatches[0].phone, '+15555550101');
  assert.equal(approvedMatches[0].address, '101 Test Street');
  assert.deepEqual(approvedMatches[0].role?.sort(), ['foster', 'volunteer']);
  assert.deepEqual(approvedMatches[0].source.sort(), ['adoption_application', 'direct_foster_agreement']);
  assert.deepEqual(approvedMatches[0].tags?.sort(), ['Active Foster', 'Approved Adopter', 'VIP']);
});

test('direct session can reuse a contact without creating a foster application', async () => {
  const tokenHash = crypto.createHash('sha256').update('test-token').digest('hex');
  const [session] = await db
    .insert(fosterAgreementSessions)
    .values({
      tenantId: tenantAId,
      fosterApplicationId: null,
      templateId,
      origin: 'direct',
      directContactId: approvedContactId,
      fosterName: 'Approved Adopter',
      fosterEmail: `${runId}-Approved@Example.Test`,
      fosterPhone: '+15555550101',
      fosterAddress: '101 Test Street',
      templateName: 'Frozen direct foster template',
      templateHtmlSnapshot: '<p>{{foster_name}}</p>',
      sendMethod: 'both',
      secureTokenHash: tokenHash,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    })
    .returning();

  assert.equal(session.fosterApplicationId, null);
  assert.equal(session.directContactId, approvedContactId);
  assert.equal(session.templateHtmlSnapshot, '<p>{{foster_name}}</p>');

  await db.delete(fosterAgreementSessions).where(eq(fosterAgreementSessions.id, session.id));
});

test('partial and complete deliveries resolve to the channel that actually succeeded', () => {
  assert.equal(resolveDeliveredSendMethod([]), null);
  assert.equal(resolveDeliveredSendMethod(['email']), 'email');
  assert.equal(resolveDeliveredSendMethod(['sms']), 'sms');
  assert.equal(resolveDeliveredSendMethod(['email', 'sms']), 'both');
  assert.equal(resolveDeliveredSendMethod(['sms', 'email', 'sms']), 'both');
});

test('concurrent direct sends create only one active session for an adopter', async () => {
  const contact = await getApprovedAdopter(tenantAId, approvedContactId);
  assert.ok(contact);

  const createWithoutStaff = (suffix: string) => createPendingDirectFosterAgreement({
    tenantId: tenantAId,
    templateId,
    staffInitiatedBy: null,
    contact,
    templateName: 'Frozen direct foster template',
    templateHtmlSnapshot: '<p>{{foster_name}}</p>',
    sendMethod: 'email',
    secureTokenHash: crypto.createHash('sha256').update(`direct-send-${suffix}`).digest('hex'),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  const results = await Promise.all([createWithoutStaff('one'), createWithoutStaff('two')]);
  assert.equal(results.filter(Boolean).length, 1);

  const active = await db
    .select({ id: fosterAgreementSessions.id })
    .from(fosterAgreementSessions)
    .where(and(
      eq(fosterAgreementSessions.tenantId, tenantAId),
      eq(fosterAgreementSessions.directContactId, approvedContactId),
      eq(fosterAgreementSessions.status, 'pending'),
    ));
  assert.equal(active.length, 1);

  await db.delete(fosterAgreementSessions).where(eq(fosterAgreementSessions.id, active[0].id));
});

test('public adoption checkout remains readable after signing while awaiting payment', async () => {
  const [staff] = await db
    .insert(users)
    .values({
      tenantId: tenantAId,
      email: `${runId}-checkout-staff@example.test`,
      passwordHash: 'not-used',
      fullName: 'Checkout Test Staff',
      roles: ['staff'],
    })
    .returning({ id: users.id });
  const [application] = await db
    .insert(applications)
    .values({
      tenantId: tenantAId,
      animalId: animalIds[0],
      applicantName: 'Checkout Adopter',
      applicantEmail: `${runId}-checkout@example.test`,
      applicantPhone: '+15555550199',
      stage: 'approved',
    })
    .returning({ id: applications.id });

  const token = crypto.randomBytes(32).toString('hex');
  const [checkout] = await db
    .insert(adoptionCheckoutSessions)
    .values({
      tenantId: tenantAId,
      applicationId: application.id,
      animalId: animalIds[0],
      staffInitiatedBy: staff.id,
      baseFee: '125.00',
      status: 'awaiting_payment',
      secureTokenHash: await bcrypt.hash(token, 4),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      signatureClaimedAt: new Date(),
      signedAt: new Date(),
      totals: { subtotal: '125.00', fees: '0.00', total: '125.00' },
    })
    .returning({ id: adoptionCheckoutSessions.id });

  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected error' });
  });

  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const response = await fetch(`http://127.0.0.1:${address.port}/api/public/adoption-checkouts/${token}`);
    const body = await response.json() as { session?: { status?: string } };
    assert.equal(response.status, 200);
    assert.equal(body.session?.status, 'awaiting_payment');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.delete(adoptionCheckoutSessions).where(eq(adoptionCheckoutSessions.id, checkout.id));
    await db.delete(applications).where(eq(applications.id, application.id));
    await db.delete(users).where(eq(users.id, staff.id));
  }
});

test('only one concurrent resend can atomically claim a pending token', async () => {
  const oldHash = crypto.createHash('sha256').update('old-link').digest('hex');
  const [session] = await db
    .insert(fosterAgreementSessions)
    .values({
      tenantId: tenantAId,
      fosterApplicationId: null,
      templateId,
      origin: 'direct',
      directContactId: approvedContactId,
      fosterName: 'Approved Adopter',
      fosterEmail: `${runId}-Approved@Example.Test`,
      templateName: 'Frozen direct foster template',
      templateHtmlSnapshot: '<p>{{foster_name}}</p>',
      sendMethod: 'email',
      secureTokenHash: oldHash,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'pending',
    })
    .returning();

  const claims = await Promise.all([
    db.update(fosterAgreementSessions)
      .set({ status: 'resending', updatedAt: new Date() })
      .where(and(
        eq(fosterAgreementSessions.id, session.id),
        eq(fosterAgreementSessions.status, 'pending'),
        eq(fosterAgreementSessions.secureTokenHash, oldHash),
      ))
      .returning({ id: fosterAgreementSessions.id }),
    db.update(fosterAgreementSessions)
      .set({ status: 'resending', updatedAt: new Date() })
      .where(and(
        eq(fosterAgreementSessions.id, session.id),
        eq(fosterAgreementSessions.status, 'pending'),
        eq(fosterAgreementSessions.secureTokenHash, oldHash),
      ))
      .returning({ id: fosterAgreementSessions.id }),
  ]);

  assert.equal(claims[0].length + claims[1].length, 1);
  await db.delete(fosterAgreementSessions).where(eq(fosterAgreementSessions.id, session.id));
});

test('a stale token cannot sign after a resend rotates the session hash', async () => {
  const oldHash = crypto.createHash('sha256').update('revoked-link').digest('hex');
  const newHash = crypto.createHash('sha256').update('current-link').digest('hex');
  const [session] = await db
    .insert(fosterAgreementSessions)
    .values({
      tenantId: tenantAId,
      fosterApplicationId: null,
      templateId,
      origin: 'direct',
      directContactId: approvedContactId,
      fosterName: 'Approved Adopter',
      fosterEmail: `${runId}-Approved@Example.Test`,
      templateName: 'Frozen direct foster template',
      templateHtmlSnapshot: '<p>{{foster_name}}</p>',
      sendMethod: 'email',
      secureTokenHash: oldHash,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'pending',
    })
    .returning();

  await db
    .update(fosterAgreementSessions)
    .set({ secureTokenHash: newHash, updatedAt: new Date() })
    .where(eq(fosterAgreementSessions.id, session.id));

  const staleTransition = await db
    .update(fosterAgreementSessions)
    .set({ status: 'signed', signedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(fosterAgreementSessions.id, session.id),
      eq(fosterAgreementSessions.status, 'pending'),
      eq(fosterAgreementSessions.secureTokenHash, oldHash),
    ))
    .returning({ id: fosterAgreementSessions.id });

  assert.equal(staleTransition.length, 0);
  const [unchanged] = await db
    .select({ status: fosterAgreementSessions.status, secureTokenHash: fosterAgreementSessions.secureTokenHash })
    .from(fosterAgreementSessions)
    .where(eq(fosterAgreementSessions.id, session.id));
  assert.equal(unchanged.status, 'pending');
  assert.equal(unchanged.secureTokenHash, newHash);

  await db.delete(fosterAgreementSessions).where(eq(fosterAgreementSessions.id, session.id));
});