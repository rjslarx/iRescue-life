/**
 * Regression tests for the sponsor-match line in donation receipt emails
 * (Task #214 — locked in by Task #217).
 *
 * Branches covered:
 *   (a) donation has no expenseCampaignId           → no match line
 *   (b) matched_amount_cents === 0                  → no match line
 *   (c) named public sponsor                        → "from {name}"
 *   (d) showSponsorPublicly === false               → "from an anonymous donor"
 *   (e) DB error looking up the match pool          → email still sends
 *                                                     without crashing
 *
 * Run via:  scripts/run-tests.sh
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { db } from '../server/db';
import {
  tenants,
  donors,
  donations,
  expenseCampaigns,
  campaignMatchPools,
} from '../shared/schema';
import { eq } from 'drizzle-orm';

import { generateAndEmailReceipt } from '../server/services/donation-receipt-service';
import { EmailService } from '../server/lib/email-service';

const RUN_ID = `t217-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
const SUBDOMAIN = `test-${RUN_ID}`.toLowerCase().slice(0, 30);
const DONOR_EMAIL = `${RUN_ID}@example-donor.test`;

let tenantId: string;
let donorId: string;
let namedPoolCampaignId: string;
let anonPoolCampaignId: string;
let noPoolCampaignId: string; // valid campaign with no pool row
let dbErrorCampaignId: string;

const insertedDonationIds: string[] = [];

interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
}
const sentEmails: CapturedEmail[] = [];

// Save originals so we can restore in `after`.
const origForTenant = (EmailService as any).forTenant;
const origSelect = (db as any).select.bind(db);

// When set, throw the next time `.from(campaignMatchPools)` is called. Used
// to simulate branch (e) — a DB failure looking up the pool — without
// breaking the donation/tenant lookups that run earlier in the same call.
let throwOnPoolLookup = false;

before(async () => {
  // ---- 1. Mock EmailService so we never hit Resend/Gmail in tests. ----
  (EmailService as any).forTenant = async () => ({
    send: async (opts: CapturedEmail) => {
      sentEmails.push(opts);
    },
  });

  // ---- 2. Wrap db.select to optionally fail the pool lookup. ----
  (db as any).select = (...args: any[]) => {
    const builder = origSelect(...args);
    const origFrom = builder.from.bind(builder);
    builder.from = (table: any) => {
      if (throwOnPoolLookup && table === campaignMatchPools) {
        throwOnPoolLookup = false;
        throw new Error('simulated DB failure looking up campaign_match_pools');
      }
      return origFrom(table);
    };
    return builder;
  };

  // ---- 3. Seed shared rows: tenant + donor + two campaigns + two pools. ----
  const [tenant] = await db
    .insert(tenants)
    .values({
      subdomain: SUBDOMAIN,
      name: `Sponsor Match Test Rescue ${RUN_ID}`,
      contactEmail: 'hello@example-rescue.test',
    })
    .returning({ id: tenants.id });
  tenantId = tenant.id;

  const [donor] = await db
    .insert(donors)
    .values({ tenantId, email: DONOR_EMAIL, name: 'Sponsor Match Donor' })
    .returning({ id: donors.id });
  donorId = donor.id;

  const [namedCampaign] = await db
    .insert(expenseCampaigns)
    .values({
      tenantId,
      title: 'Named Sponsor Campaign',
      slug: `named-${RUN_ID}`,
      goalAmountCents: 1_000_000,
    })
    .returning({ id: expenseCampaigns.id });
  namedPoolCampaignId = namedCampaign.id;

  const [anonCampaign] = await db
    .insert(expenseCampaigns)
    .values({
      tenantId,
      title: 'Anonymous Sponsor Campaign',
      slug: `anon-${RUN_ID}`,
      goalAmountCents: 1_000_000,
    })
    .returning({ id: expenseCampaigns.id });
  anonPoolCampaignId = anonCampaign.id;

  const [noPoolCampaign] = await db
    .insert(expenseCampaigns)
    .values({
      tenantId,
      title: 'No Pool Campaign',
      slug: `nopool-${RUN_ID}`,
      goalAmountCents: 1_000_000,
    })
    .returning({ id: expenseCampaigns.id });
  noPoolCampaignId = noPoolCampaign.id;

  const [dbErrorCampaign] = await db
    .insert(expenseCampaigns)
    .values({
      tenantId,
      title: 'DB Error Campaign',
      slug: `dberror-${RUN_ID}`,
      goalAmountCents: 1_000_000,
    })
    .returning({ id: expenseCampaigns.id });
  dbErrorCampaignId = dbErrorCampaign.id;

  await db.insert(campaignMatchPools).values({
    tenantId,
    expenseCampaignId: namedPoolCampaignId,
    publicSponsorName: 'Acme Pet Foods',
    showSponsorPublicly: true,
    internalSponsorName: 'Acme Pet Foods Inc.',
    internalSponsorEmail: 'sponsor@example.test',
    pledgedCapCents: 500_000,
  });

  await db.insert(campaignMatchPools).values({
    tenantId,
    expenseCampaignId: anonPoolCampaignId,
    publicSponsorName: 'Acme Pet Foods', // intentionally set; hidden by flag
    showSponsorPublicly: false,
    internalSponsorName: 'Acme Pet Foods Inc.',
    internalSponsorEmail: 'sponsor@example.test',
    pledgedCapCents: 500_000,
  });

  // We also need a pool row for the DB-error test so that, in the absence of
  // the simulated failure, the code would otherwise hit the match-line
  // branch. The throw happens before the row is read.
  await db.insert(campaignMatchPools).values({
    tenantId,
    expenseCampaignId: dbErrorCampaignId,
    publicSponsorName: 'Acme Pet Foods',
    showSponsorPublicly: true,
    internalSponsorName: 'Acme Pet Foods Inc.',
    internalSponsorEmail: 'sponsor@example.test',
    pledgedCapCents: 500_000,
  });
});

after(async () => {
  try {
    for (const id of insertedDonationIds) {
      await db.delete(donations).where(eq(donations.id, id));
    }
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (cleanupErr) {
    console.warn('[task-217 test] cleanup warning:', cleanupErr);
  } finally {
    (EmailService as any).forTenant = origForTenant;
    (db as any).select = origSelect;
  }
});

async function insertDonation(overrides: Partial<typeof donations.$inferInsert> = {}) {
  const [row] = await db
    .insert(donations)
    .values({
      tenantId,
      donorId,
      donorName: 'Sponsor Match Donor',
      donorEmail: DONOR_EMAIL,
      donationType: 'online',
      amount: 5000,
      paymentMethod: 'stripe',
      source: 'stripe',
      isRecurring: false,
      ...overrides,
    })
    .returning({ id: donations.id });
  insertedDonationIds.push(row.id);
  return row.id;
}

const MATCH_LINE_RE = /Your gift unlocked an additional/;

test('(a) donation with no expenseCampaignId → no match line in receipt email', async () => {
  // Deliberately leave matchedAmountCents > 0 here so this test isolates the
  // "no campaign attached" branch from branch (b). If the receipt code ever
  // regresses to rendering the match line whenever matchedAmountCents > 0
  // (ignoring the missing expenseCampaignId guard), this test will catch it.
  const donationId = await insertDonation({
    expenseCampaignId: null,
    matchedAmountCents: 2500,
  });
  sentEmails.length = 0;

  const result = await generateAndEmailReceipt({ donationId, tenantId });

  assert.equal(result.success, true, result.message);
  assert.equal(sentEmails.length, 1);
  assert.doesNotMatch(sentEmails[0].html, MATCH_LINE_RE);
});

test('(b) matched_amount_cents === 0 → no match line even when a campaign is attached', async () => {
  const donationId = await insertDonation({
    expenseCampaignId: namedPoolCampaignId,
    matchedAmountCents: 0,
  });
  sentEmails.length = 0;

  const result = await generateAndEmailReceipt({ donationId, tenantId });

  assert.equal(result.success, true, result.message);
  assert.equal(sentEmails.length, 1);
  assert.doesNotMatch(sentEmails[0].html, MATCH_LINE_RE);
});

test('(c) named public sponsor → match line reads "from {sponsor name}"', async () => {
  const donationId = await insertDonation({
    expenseCampaignId: namedPoolCampaignId,
    matchedAmountCents: 2500,
  });
  sentEmails.length = 0;

  const result = await generateAndEmailReceipt({ donationId, tenantId });

  assert.equal(result.success, true, result.message);
  assert.equal(sentEmails.length, 1);
  const { html } = sentEmails[0];
  assert.match(html, MATCH_LINE_RE);
  assert.match(html, /\$25\.00/);
  assert.match(html, /from Acme Pet Foods\b/);
  assert.doesNotMatch(html, /anonymous donor/i);
});

test('(d) showSponsorPublicly === false → match line reads "from an anonymous donor"', async () => {
  const donationId = await insertDonation({
    expenseCampaignId: anonPoolCampaignId,
    matchedAmountCents: 1500,
  });
  sentEmails.length = 0;

  const result = await generateAndEmailReceipt({ donationId, tenantId });

  assert.equal(result.success, true, result.message);
  assert.equal(sentEmails.length, 1);
  const { html } = sentEmails[0];
  assert.match(html, MATCH_LINE_RE);
  assert.match(html, /\$15\.00/);
  assert.match(html, /from an anonymous donor/);
  assert.doesNotMatch(html, /from Acme Pet Foods/);
});

test('campaign attached but no pool row exists → no match line, email still sends', async () => {
  // Belt-and-suspenders: covers the "pool row missing" branch alongside the
  // explicit DB-error branch below. The receipt code skips the match line
  // silently when the lookup returns no row.
  const donationId = await insertDonation({
    expenseCampaignId: noPoolCampaignId,
    matchedAmountCents: 1000,
  });
  sentEmails.length = 0;

  const result = await generateAndEmailReceipt({ donationId, tenantId });

  assert.equal(result.success, true, result.message);
  assert.equal(sentEmails.length, 1);
  assert.doesNotMatch(sentEmails[0].html, MATCH_LINE_RE);
});

test('(e) DB error looking up the match pool → receipt email still sends without the match line', async () => {
  const donationId = await insertDonation({
    expenseCampaignId: dbErrorCampaignId,
    matchedAmountCents: 2000,
  });
  sentEmails.length = 0;
  throwOnPoolLookup = true;

  const result = await generateAndEmailReceipt({ donationId, tenantId });

  assert.equal(throwOnPoolLookup, false, 'pool-lookup interceptor should have fired exactly once');
  assert.equal(result.success, true, result.message);
  assert.equal(sentEmails.length, 1);
  assert.doesNotMatch(sentEmails[0].html, MATCH_LINE_RE);
  assert.ok(result.pdfBuffer, 'PDF should still be generated even when the pool lookup fails');
});
