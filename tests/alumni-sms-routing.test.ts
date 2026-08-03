/**
 * Tests for adopted-alumni SMS/MMS reply routing (Task #279).
 *
 * When an unmatched inbound SMS arrives at a tenant's Twilio number,
 * handleIncomingSms must:
 *   - log it to the Communications feed (sms_message_logs, unmatched_inbound)
 *   - match the sender against known adopters (adoptions.adopterPhone,
 *     falling back to contacts.phone -> adoptions.adopterEmail)
 *   - on match, save the reply as an unpublished happy_tails row on the
 *     adopted animal
 *   - stay idempotent under concurrent Twilio webhook redeliveries: the
 *     partial unique index on twilio_message_sid (unmatched_inbound) makes
 *     the feed insert the single arbiter, so exactly one log and one
 *     happy-tail row exist per MessageSid.
 *
 * Run via:  scripts/run-tests.sh tests/alumni-sms-routing.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { db } from '../server/db';
import { tenants, animals, adoptions, contacts, happyTails, smsMessageLogs } from '../shared/schema';
import { eq, inArray } from 'drizzle-orm';

import { handleIncomingSms, isAllowedTwilioMediaUrl } from '../server/lib/twilio-service';

const RUN_ID = `t279-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;

// Unique fake Twilio number for this run so tenant resolution is isolated
const TENANT_NUMBER = `+1999${Date.now().toString().slice(-7)}`;
const ADOPTER_PHONE = `+1555${Date.now().toString().slice(-7)}`;
const CONTACT_PHONE = `+1556${Date.now().toString().slice(-7)}`;
const UNKNOWN_PHONE = `+1557${Date.now().toString().slice(-7)}`;

let tenantId: string;
let animalDirectId: string;
let animalContactId: string;

async function makeAnimal(suffix: string) {
  const [a] = await db.insert(animals).values({
    tenantId,
    animalId: `A-${RUN_ID}-${suffix}`,
    name: `Test Dog ${RUN_ID}-${suffix}`,
    species: 'dog',
    breed: 'mix',
    age: '2 years',
    status: 'adopted',
  } as any).returning();
  return a.id;
}

before(async () => {
  const [t] = await db.insert(tenants).values({
    name: `Test Rescue ${RUN_ID}`,
    subdomain: RUN_ID.toLowerCase().slice(0, 40),
    twilioPhoneNumber: TENANT_NUMBER,
    // twilioEnabled stays false -> getTwilioConfig returns null, so no
    // media download is attempted (media persistence needs live creds).
  } as any).returning();
  tenantId = t.id;

  animalDirectId = await makeAnimal('direct');
  animalContactId = await makeAnimal('contact');

  // Adoption matched directly by phone
  await db.insert(adoptions).values({
    tenantId,
    animalId: animalDirectId,
    adopterName: 'Direct Adopter',
    adopterEmail: `direct-${RUN_ID}@example.com`,
    adopterPhone: ADOPTER_PHONE,
  } as any);

  // Adoption matched via contact phone -> adoption email fallback
  await db.insert(adoptions).values({
    tenantId,
    animalId: animalContactId,
    adopterName: 'Contact Adopter',
    adopterEmail: `contact-${RUN_ID}@example.com`,
    adopterPhone: '', // no phone on the adoption record itself
  } as any);
  await db.insert(contacts).values({
    tenantId,
    name: 'Contact Adopter',
    email: `contact-${RUN_ID}@example.com`,
    phone: CONTACT_PHONE,
  } as any);
});

after(async () => {
  await db.delete(happyTails).where(eq(happyTails.tenantId, tenantId));
  await db.delete(smsMessageLogs).where(eq(smsMessageLogs.tenantId, tenantId));
  await db.delete(adoptions).where(eq(adoptions.tenantId, tenantId));
  await db.delete(contacts).where(eq(contacts.tenantId, tenantId));
  await db.delete(animals).where(inArray(animals.id, [animalDirectId, animalContactId]));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
});

function sid(tag: string) {
  return `SM${RUN_ID}-${tag}`;
}

test('reply from a known adopter phone attaches to the adopted animal', async () => {
  const res = await handleIncomingSms(
    ADOPTER_PHONE, TENANT_NUMBER, 'Buddy is thriving!',
    [], { messageSid: sid('direct'), signatureValidated: true },
  );
  assert.equal(res.routedAs, 'alumni_update');

  const tails = await db.select().from(happyTails).where(eq(happyTails.animalId, animalDirectId));
  assert.equal(tails.length, 1);
  assert.equal(tails[0].adopterName, 'Direct Adopter');
  assert.equal(tails[0].isPublished, false);
  assert.match(tails[0].story, /Buddy is thriving!/);

  const logs = await db.select().from(smsMessageLogs).where(eq(smsMessageLogs.twilioMessageSid, sid('direct')));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].messageType, 'unmatched_inbound');
});

test('contact-phone fallback routes to the adoption matched by email', async () => {
  const res = await handleIncomingSms(
    CONTACT_PHONE, TENANT_NUMBER, 'Update via contact match',
    [], { messageSid: sid('contact'), signatureValidated: true },
  );
  assert.equal(res.routedAs, 'alumni_update');

  const tails = await db.select().from(happyTails).where(eq(happyTails.animalId, animalContactId));
  assert.equal(tails.length, 1);
  assert.equal(tails[0].adopterName, 'Contact Adopter');
});

test('concurrent webhook redeliveries produce exactly one log and one happy tail', async () => {
  const messageSid = sid('conc');
  const call = () => handleIncomingSms(
    ADOPTER_PHONE, TENANT_NUMBER, 'Concurrent redelivery update',
    [], { messageSid, signatureValidated: true },
  );
  const results = await Promise.all([call(), call(), call()]);

  const winners = results.filter(r => r.routedAs === 'alumni_update');
  assert.equal(winners.length, 1, 'exactly one delivery should win routing');

  const logs = await db.select().from(smsMessageLogs).where(eq(smsMessageLogs.twilioMessageSid, messageSid));
  assert.equal(logs.length, 1, 'exactly one feed log');

  const tails = (await db.select().from(happyTails).where(eq(happyTails.animalId, animalDirectId)))
    .filter(t => t.story.includes('Concurrent redelivery update'));
  assert.equal(tails.length, 1, 'exactly one happy tail');

  // Sequential redelivery after the fact is also a no-op
  const again = await call();
  assert.notEqual(again.routedAs, 'alumni_update');
  const logsAfter = await db.select().from(smsMessageLogs).where(eq(smsMessageLogs.twilioMessageSid, messageSid));
  assert.equal(logsAfter.length, 1);
});

test('credentials are only sent to canonical Twilio media URLs for this account', () => {
  const sidA = 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const good = `https://api.twilio.com/2010-04-01/Accounts/${sidA}/Messages/MM123/Media/ME456`;
  assert.equal(isAllowedTwilioMediaUrl(good, sidA), true);
  // http downgrade
  assert.equal(isAllowedTwilioMediaUrl(good.replace('https', 'http'), sidA), false);
  // attacker-controlled host
  assert.equal(isAllowedTwilioMediaUrl(`https://evil.example.com/2010-04-01/Accounts/${sidA}/Messages/MM1/Media/ME1`, sidA), false);
  // host suffix trick
  assert.equal(isAllowedTwilioMediaUrl(`https://api.twilio.com.evil.example.com/2010-04-01/Accounts/${sidA}/Messages/MM1/Media/ME1`, sidA), false);
  // someone else's account
  assert.equal(isAllowedTwilioMediaUrl(good, 'ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), false);
  // non-media Twilio path
  assert.equal(isAllowedTwilioMediaUrl(`https://api.twilio.com/2010-04-01/Accounts/${sidA}/Calls/CA1`, sidA), false);
  // garbage
  assert.equal(isAllowedTwilioMediaUrl('not a url', sidA), false);
});

test('a failed routing attempt is retried on webhook redelivery', async () => {
  const messageSid = sid('retry');
  // Simulate a delivery whose post-log routing failed (e.g. media download
  // died after the feed log was claimed): log exists, status 'failed'.
  await db.insert(smsMessageLogs).values({
    tenantId,
    twilioMessageSid: messageSid,
    direction: 'inbound',
    fromNumber: ADOPTER_PHONE,
    toNumber: TENANT_NUMBER,
    body: 'Retry recovery update',
    messageType: 'unmatched_inbound',
    status: 'received',
    alumniRoutingStatus: 'failed',
  } as any);

  // Twilio redelivers the same message — the claim must pick up the failed
  // row and complete routing instead of skipping it forever.
  const res = await handleIncomingSms(
    ADOPTER_PHONE, TENANT_NUMBER, 'Retry recovery update',
    [], { messageSid, signatureValidated: true },
  );
  assert.equal(res.routedAs, 'alumni_update');

  const [log] = await db.select().from(smsMessageLogs).where(eq(smsMessageLogs.twilioMessageSid, messageSid));
  assert.equal(log.alumniRoutingStatus, 'routed');

  const tails = (await db.select().from(happyTails).where(eq(happyTails.animalId, animalDirectId)))
    .filter(t => t.story.includes('Retry recovery update'));
  assert.equal(tails.length, 1);

  // A further redelivery after success is a no-op
  const again = await handleIncomingSms(
    ADOPTER_PHONE, TENANT_NUMBER, 'Retry recovery update',
    [], { messageSid, signatureValidated: true },
  );
  assert.notEqual(again.routedAs, 'alumni_update');
  const tailsAfter = (await db.select().from(happyTails).where(eq(happyTails.animalId, animalDirectId)))
    .filter(t => t.story.includes('Retry recovery update'));
  assert.equal(tailsAfter.length, 1);
});

test('a stale processing claim (crash between claim and completion) is recovered', async () => {
  const messageSid = sid('stale');
  // Simulate a crash: row was claimed 'processing' long ago, no happy tail
  // was written (the tail + status flip commit in one transaction, so a
  // crash mid-processing leaves exactly this state).
  await db.insert(smsMessageLogs).values({
    tenantId,
    twilioMessageSid: messageSid,
    direction: 'inbound',
    fromNumber: ADOPTER_PHONE,
    toNumber: TENANT_NUMBER,
    body: 'Stale claim recovery update',
    messageType: 'unmatched_inbound',
    status: 'received',
    alumniRoutingStatus: 'processing',
    alumniRoutingClaimedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
  } as any);

  const res = await handleIncomingSms(
    ADOPTER_PHONE, TENANT_NUMBER, 'Stale claim recovery update',
    [], { messageSid, signatureValidated: true },
  );
  assert.equal(res.routedAs, 'alumni_update');

  const [log] = await db.select().from(smsMessageLogs).where(eq(smsMessageLogs.twilioMessageSid, messageSid));
  assert.equal(log.alumniRoutingStatus, 'routed');
  const tails = (await db.select().from(happyTails).where(eq(happyTails.animalId, animalDirectId)))
    .filter(t => t.story.includes('Stale claim recovery update'));
  assert.equal(tails.length, 1);
});

test('a fresh processing claim is NOT stolen by a redelivery', async () => {
  const messageSid = sid('fresh');
  await db.insert(smsMessageLogs).values({
    tenantId,
    twilioMessageSid: messageSid,
    direction: 'inbound',
    fromNumber: ADOPTER_PHONE,
    toNumber: TENANT_NUMBER,
    body: 'In-flight update',
    messageType: 'unmatched_inbound',
    status: 'received',
    alumniRoutingStatus: 'processing',
    alumniRoutingClaimedAt: new Date(), // actively being processed
  } as any);

  const res = await handleIncomingSms(
    ADOPTER_PHONE, TENANT_NUMBER, 'In-flight update',
    [], { messageSid, signatureValidated: true },
  );
  assert.notEqual(res.routedAs, 'alumni_update');

  const tails = (await db.select().from(happyTails).where(eq(happyTails.animalId, animalDirectId)))
    .filter(t => t.story.includes('In-flight update'));
  assert.equal(tails.length, 0, 'no duplicate work while the lease is live');
});

test('unknown phone is feed-logged only, no animal record entry', async () => {
  const res = await handleIncomingSms(
    UNKNOWN_PHONE, TENANT_NUMBER, 'Who dis',
    [], { messageSid: sid('unknown'), signatureValidated: true },
  );
  assert.notEqual(res.routedAs, 'alumni_update');

  const logs = await db.select().from(smsMessageLogs).where(eq(smsMessageLogs.twilioMessageSid, sid('unknown')));
  assert.equal(logs.length, 1);

  const allTails = await db.select().from(happyTails).where(eq(happyTails.tenantId, tenantId));
  assert.ok(allTails.every(t => !t.story.includes('Who dis')));
});
