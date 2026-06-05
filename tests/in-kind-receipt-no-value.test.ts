/**
 * Regression test: in-kind (non-cash) donation receipts must NEVER print a
 * dollar value for the donated items (IRS compliance — establishing fair
 * market value is the donor's sole responsibility).
 *
 * This pins down the difference between the two receipt branches:
 *   - In-kind  → item description + "No goods or services were provided …"
 *                magic language, but NO dollar amount anywhere (not even the
 *                stored donor-stated value).
 *   - Cash     → the same magic language PLUS its dollar amount.
 *
 * Both the receipt PDF text and the receipt email HTML are asserted.
 *
 * Run via:  scripts/run-tests.sh
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { db } from '../server/db';
import { tenants, donors, donations } from '../shared/schema';
import { eq } from 'drizzle-orm';

import { generateAndEmailReceipt } from '../server/services/donation-receipt-service';
import { EmailService } from '../server/lib/email-service';

const RUN_ID = `t234-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
const SUBDOMAIN = `test-${RUN_ID}`.toLowerCase().slice(0, 30);
const DONOR_EMAIL = `${RUN_ID}@example-donor.test`;

// A distinctive donor-stated value so we can prove it never leaks onto the
// in-kind receipt. $123.45 stored in cents.
const DONOR_STATED_VALUE_CENTS = 12345;
const DONOR_STATED_VALUE_STR = '$123.45';

// The cash companion's amount, used to confirm cash receipts DO show money.
const CASH_AMOUNT_CENTS = 5000;
const CASH_AMOUNT_STR = '$50.00';

const IN_KIND_DESCRIPTION = '5 bags of premium dog kibble and 3 cases of canned food';
const MAGIC_LANGUAGE = 'No goods or services were provided in exchange for this contribution.';
// Matches any currency value like "$0.00", "$123.45" — used to assert the
// in-kind output contains no dollar figure at all.
const ANY_DOLLAR_RE = /\$\s?\d/;

let tenantId: string;
let donorId: string;
const insertedDonationIds: string[] = [];

interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
}
const sentEmails: CapturedEmail[] = [];

const origForTenant = (EmailService as any).forTenant;

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse }: any = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text as string;
  } finally {
    await parser.destroy?.();
  }
}

before(async () => {
  // Mock EmailService so we never hit Resend/Gmail and can capture the body.
  (EmailService as any).forTenant = async () => ({
    send: async (opts: CapturedEmail) => {
      sentEmails.push(opts);
    },
  });

  const [tenant] = await db
    .insert(tenants)
    .values({
      subdomain: SUBDOMAIN,
      name: `In-Kind Receipt Test Rescue ${RUN_ID}`,
      contactEmail: 'hello@example-rescue.test',
      ein: '12-3456789',
    })
    .returning({ id: tenants.id });
  tenantId = tenant.id;

  const [donor] = await db
    .insert(donors)
    .values({ tenantId, email: DONOR_EMAIL, name: 'In-Kind Donor' })
    .returning({ id: donors.id });
  donorId = donor.id;
});

after(async () => {
  try {
    for (const id of insertedDonationIds) {
      await db.delete(donations).where(eq(donations.id, id));
    }
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (cleanupErr) {
    console.warn('[task-234 test] cleanup warning:', cleanupErr);
  } finally {
    (EmailService as any).forTenant = origForTenant;
  }
});

async function insertDonation(overrides: Partial<typeof donations.$inferInsert> = {}) {
  const [row] = await db
    .insert(donations)
    .values({
      tenantId,
      donorId,
      donorName: 'In-Kind Donor',
      donorEmail: DONOR_EMAIL,
      // In-kind receipts require a full mailing address for IRS compliance.
      donorAddress: '123 Shelter Lane',
      donorCity: 'Austin',
      donorState: 'TX',
      donorZip: '78701',
      donationType: 'cash',
      amount: CASH_AMOUNT_CENTS,
      paymentMethod: 'manual',
      source: 'manual',
      isRecurring: false,
      ...overrides,
    })
    .returning({ id: donations.id });
  insertedDonationIds.push(row.id);
  return row.id;
}

// Generates an in-kind receipt and returns both the captured email and the
// extracted PDF text. Self-contained: seeds its own donation and clears the
// shared email buffer so the test never depends on execution order.
async function generateInKindReceipt() {
  const donationId = await insertDonation({
    donationType: 'in_kind_goods',
    amount: 0,
    description: IN_KIND_DESCRIPTION,
    donorStatedValue: DONOR_STATED_VALUE_CENTS,
  });
  sentEmails.length = 0;

  const result = await generateAndEmailReceipt({ donationId, tenantId });
  assert.equal(result.success, true, result.message);
  assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0, 'expected a PDF buffer');
  assert.equal(sentEmails.length, 1, 'exactly one in-kind receipt email should have been sent');

  const pdfText = await extractPdfText(result.pdfBuffer!);
  return { pdfText, html: sentEmails[0].html };
}

test('in-kind receipt PDF shows the item description + magic language but NO dollar value', async () => {
  const { pdfText } = await generateInKindReceipt();

  // Items + magic language must be present.
  assert.match(pdfText, /premium dog kibble/, 'PDF should describe the donated items');
  assert.match(pdfText, /canned food/, 'PDF should describe the donated items');
  assert.ok(
    pdfText.includes(MAGIC_LANGUAGE),
    'PDF must contain the IRS "no goods or services" disclosure statement',
  );

  // The donor-stated value must NOT appear, and in fact NO dollar figure of
  // any kind should be printed on an in-kind receipt.
  assert.ok(
    !pdfText.includes(DONOR_STATED_VALUE_STR),
    `PDF must not print the donor-stated value (${DONOR_STATED_VALUE_STR})`,
  );
  assert.doesNotMatch(
    pdfText,
    ANY_DOLLAR_RE,
    'in-kind receipt PDF must not contain any dollar amount',
  );
});

test('in-kind receipt email body shows the items + magic language but NO dollar value', async () => {
  const { html } = await generateInKindReceipt();

  assert.match(html, /premium dog kibble/, 'email should list the donated items');
  assert.ok(
    html.includes(MAGIC_LANGUAGE),
    'email must contain the IRS "no goods or services" disclosure statement',
  );
  assert.ok(
    !html.includes(DONOR_STATED_VALUE_STR),
    `email must not print the donor-stated value (${DONOR_STATED_VALUE_STR})`,
  );
  assert.doesNotMatch(html, ANY_DOLLAR_RE, 'in-kind receipt email must not contain any dollar amount');
});

test('companion: a cash receipt PDF + email DO include the dollar amount (and the IRS disclosure)', async () => {
  const donationId = await insertDonation({
    donationType: 'cash',
    amount: CASH_AMOUNT_CENTS,
  });
  sentEmails.length = 0;

  const result = await generateAndEmailReceipt({ donationId, tenantId });
  assert.equal(result.success, true, result.message);
  assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0, 'expected a PDF buffer');

  const pdfText = await extractPdfText(result.pdfBuffer!);

  // Same magic language, but this time WITH the dollar amount — this pins down
  // the difference between the two branches.
  assert.ok(
    pdfText.includes(MAGIC_LANGUAGE),
    'cash receipt PDF should also contain the IRS disclosure statement',
  );
  assert.ok(
    pdfText.includes(CASH_AMOUNT_STR),
    `cash receipt PDF should show its dollar amount (${CASH_AMOUNT_STR})`,
  );

  assert.equal(sentEmails.length, 1, 'exactly one cash receipt email should have been sent');
  const { html } = sentEmails[0];
  assert.ok(
    html.includes(MAGIC_LANGUAGE),
    'cash receipt email should also contain the IRS disclosure statement',
  );
  assert.ok(
    html.includes(CASH_AMOUNT_STR),
    `cash receipt email should show its dollar amount (${CASH_AMOUNT_STR})`,
  );
});
