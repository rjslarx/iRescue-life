/**
 * Regression tests for the tenant-level "authorized signature on file"
 * feature (Task #240) as it applies to donation-receipt PDF generation
 * (follow-up Task #241).
 *
 * The signature is best-effort decoration: a missing, deleted, or corrupt
 * signature image must NEVER break receipt generation. These tests pin that
 * down by driving the central generator (generateAndEmailReceipt) with the
 * object-storage client stubbed to three states:
 *   (1) a saved, readable signature   → PDF embeds it + prints name/title
 *   (2) the signature object is gone   → PDF still generated, no signature block
 *   (3) the signature bytes are corrupt → PDF still generated, no signature block
 * Plus a baseline:
 *   (4) no signature on file           → original receipt layout, no block
 *
 * Run via:  scripts/run-tests.sh tests/receipt-signature-pdf.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';

import { db } from '../server/db';
import { tenants, donors, donations } from '../shared/schema';
import { eq } from 'drizzle-orm';

import { generateAndEmailReceipt } from '../server/services/donation-receipt-service';
import { EmailService } from '../server/lib/email-service';
import { objectStorageClient } from '../server/objectStorage';

const RUN_ID = `t241-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
const SUBDOMAIN = `test-${RUN_ID}`.toLowerCase().slice(0, 30);
const DONOR_EMAIL = `${RUN_ID}@example-donor.test`;

const SIGNER_NAME = 'Jane Q. Director';
const SIGNER_TITLE = 'Executive Director';
const SIGNATURE_LABEL = 'Authorized Signature';
const SIGNATURE_URL = '/objects/signatures/sig_t241_test.png';

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
const origBucket = (objectStorageClient as any).bucket.bind(objectStorageClient);

// A real, embeddable PNG so pdf-lib's embedPng() succeeds in the happy path.
let VALID_PNG: Buffer;

// Controls what the stubbed object-storage file returns for the signature.
// 'present'  → exists() true, download() returns VALID_PNG
// 'missing'  → exists() false
// 'corrupt'  → exists() true, download() returns non-PNG garbage
type SigState = 'present' | 'missing' | 'corrupt';
let sigState: SigState = 'present';

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
  VALID_PNG = await sharp({
    create: { width: 400, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();

  // Never hit Resend/Gmail; capture the email instead.
  (EmailService as any).forTenant = async () => ({
    send: async (opts: CapturedEmail) => {
      sentEmails.push(opts);
    },
  });

  // Intercept ONLY signature-folder object lookups; defer everything else to
  // the real client so unrelated storage usage keeps working.
  (objectStorageClient as any).bucket = (...args: any[]) => {
    const realBucket = origBucket(...args);
    const origFile = realBucket.file.bind(realBucket);
    realBucket.file = (objectName: string) => {
      if (!objectName.includes('/signatures/') && !objectName.includes('signatures')) {
        return origFile(objectName);
      }
      return {
        async exists() {
          return [sigState !== 'missing'];
        },
        async download() {
          if (sigState === 'corrupt') return [Buffer.from('this is not a png at all')];
          return [VALID_PNG];
        },
      };
    };
    return realBucket;
  };

  const [tenant] = await db
    .insert(tenants)
    .values({
      subdomain: SUBDOMAIN,
      name: `Receipt Signature Test Rescue ${RUN_ID}`,
      contactEmail: 'hello@example-rescue.test',
      ein: '12-3456789',
    })
    .returning({ id: tenants.id });
  tenantId = tenant.id;

  const [donor] = await db
    .insert(donors)
    .values({ tenantId, email: DONOR_EMAIL, name: 'Receipt Signature Donor' })
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
    console.warn('[task-241 test] cleanup warning:', cleanupErr);
  } finally {
    (EmailService as any).forTenant = origForTenant;
    (objectStorageClient as any).bucket = origBucket;
  }
});

beforeEach(() => {
  sentEmails.length = 0;
});

async function setTenantSignature(opts: {
  url: string | null;
  name: string | null;
  title: string | null;
}) {
  await db
    .update(tenants)
    .set({
      receiptSignatureUrl: opts.url,
      receiptSignatureName: opts.name,
      receiptSignatureTitle: opts.title,
    })
    .where(eq(tenants.id, tenantId));
}

async function insertDonation(overrides: Partial<typeof donations.$inferInsert> = {}) {
  const [row] = await db
    .insert(donations)
    .values({
      tenantId,
      donorId,
      donorName: 'Receipt Signature Donor',
      donorEmail: DONOR_EMAIL,
      donationType: 'cash',
      amount: 5000,
      paymentMethod: 'manual',
      source: 'manual',
      isRecurring: false,
      ...overrides,
    })
    .returning({ id: donations.id });
  insertedDonationIds.push(row.id);
  return row.id;
}

async function generateReceiptPdfText(): Promise<string> {
  const donationId = await insertDonation();
  const result = await generateAndEmailReceipt({ donationId, tenantId });
  assert.equal(result.success, true, result.message);
  assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0, 'expected a PDF buffer');
  return extractPdfText(result.pdfBuffer!);
}

test('(1) saved + readable signature → receipt PDF embeds it and prints signer name + title', async () => {
  sigState = 'present';
  await setTenantSignature({ url: SIGNATURE_URL, name: SIGNER_NAME, title: SIGNER_TITLE });

  const pdfText = await generateReceiptPdfText();

  assert.ok(pdfText.includes(SIGNATURE_LABEL), 'PDF should label the authorized-signature block');
  assert.ok(pdfText.includes(SIGNER_NAME), 'PDF should print the signer name');
  assert.ok(pdfText.includes(SIGNER_TITLE), 'PDF should print the signer title');
});

test('(2) signature object missing from storage → receipt still generates, no signature block', async () => {
  sigState = 'missing';
  await setTenantSignature({ url: SIGNATURE_URL, name: SIGNER_NAME, title: SIGNER_TITLE });

  const pdfText = await generateReceiptPdfText();

  // Best-effort: receipt is produced, but the signature block is silently omitted.
  assert.ok(!pdfText.includes(SIGNATURE_LABEL), 'no signature block when the image is missing');
  assert.ok(!pdfText.includes(SIGNER_NAME), 'signer name only renders alongside an embedded image');
});

test('(3) corrupt signature bytes → embedPng fails, receipt still generates without the block', async () => {
  sigState = 'corrupt';
  await setTenantSignature({ url: SIGNATURE_URL, name: SIGNER_NAME, title: SIGNER_TITLE });

  const pdfText = await generateReceiptPdfText();

  assert.ok(!pdfText.includes(SIGNATURE_LABEL), 'no signature block when the image cannot be embedded');
  assert.ok(!pdfText.includes(SIGNER_NAME), 'signer name only renders alongside an embedded image');
});

test('(4) no signature on file → original receipt layout, no signature block', async () => {
  sigState = 'present'; // irrelevant: url is null so download is never attempted
  await setTenantSignature({ url: null, name: null, title: null });

  const pdfText = await generateReceiptPdfText();

  assert.ok(!pdfText.includes(SIGNATURE_LABEL), 'receipts without a saved signature show no block');
});
