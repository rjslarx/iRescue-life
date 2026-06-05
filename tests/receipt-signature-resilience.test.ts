/**
 * Regression test: the tenant-level authorized signature stamped onto donation
 * receipts (Task #240) is best-effort decoration and must NEVER break receipt
 * generation. This pins down three scenarios:
 *
 *   1. Tenant WITH a saved signature (image + signer name/title) → the PDF is
 *      produced AND the signature block (label + name + title) is stamped on it.
 *   2. Tenant whose signature object is missing/unreadable in object storage
 *      (downloadSignaturePng returns null) → the PDF is still produced, just
 *      WITHOUT the signature block.
 *   3. Tenant with NO signature on file → the original receipt layout (no
 *      signature block at all).
 *
 * The PDF text is asserted in every case.
 *
 * Run via:  scripts/run-tests.sh   (or: npx tsx --test tests/*.test.ts)
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { db } from '../server/db';
import { tenants, donors, donations } from '../shared/schema';
import { eq } from 'drizzle-orm';

import { generateDonationReceipt } from '../server/services/donation-receipt-service';
import { processSignatureImage } from '../server/services/contract-pdf';
import { objectStorageClient } from '../server/objectStorage';

const RUN_ID = `t241-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
const SUBDOMAIN = `test-${RUN_ID}`.toLowerCase().slice(0, 30);
const DONOR_EMAIL = `${RUN_ID}@example-donor.test`;

// Distinctive signer identity so we can prove the signature block is (or is not)
// stamped onto the PDF. The label "Authorized Signature" is a fixed constant
// drawn alongside the image.
const SIGNER_NAME = 'Jane Authorizer';
const SIGNER_TITLE = 'Executive Director';
const SIGNATURE_LABEL = 'Authorized Signature';

const CASH_AMOUNT_CENTS = 5000;
const CASH_AMOUNT_STR = '$50.00';

let tenantId: string;
let donorId: string;
let signatureObjectUrl: string | null = null;
const insertedDonationIds: string[] = [];

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

// Deletes a signature object previously uploaded by processSignatureImage so the
// test leaves nothing behind in object storage. Mirrors the path logic in the
// receipt service / contract-pdf helpers. Never throws.
async function deleteSignatureObject(objectUrl: string): Promise<void> {
  try {
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) return;
    const filename = objectUrl.split('/').pop();
    if (!filename) return;
    const objectPath = `${privateObjectDir}/signatures/${filename}`;
    const pathParts = objectPath.split('/');
    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join('/');
    await objectStorageClient.bucket(bucketName).file(objectName).delete();
  } catch (err) {
    console.warn('[task-241 test] signature cleanup warning:', err);
  }
}

before(async () => {
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
    .values({ tenantId, email: DONOR_EMAIL, name: 'Signature Test Donor' })
    .returning({ id: donors.id });
  donorId = donor.id;
});

after(async () => {
  try {
    for (const id of insertedDonationIds) {
      await db.delete(donations).where(eq(donations.id, id));
    }
    if (signatureObjectUrl) await deleteSignatureObject(signatureObjectUrl);
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (cleanupErr) {
    console.warn('[task-241 test] cleanup warning:', cleanupErr);
  }
});

async function insertCashDonation(): Promise<string> {
  const [row] = await db
    .insert(donations)
    .values({
      tenantId,
      donorId,
      donorName: 'Signature Test Donor',
      donorEmail: DONOR_EMAIL,
      donationType: 'cash',
      amount: CASH_AMOUNT_CENTS,
      paymentMethod: 'manual',
      source: 'manual',
      isRecurring: false,
    })
    .returning({ id: donations.id });
  insertedDonationIds.push(row.id);
  return row.id;
}

// Sets/clears the tenant-level signature fields for the scenario under test.
async function setTenantSignature(opts: {
  url: string | null;
  name: string | null;
  title: string | null;
}): Promise<void> {
  await db
    .update(tenants)
    .set({
      receiptSignatureUrl: opts.url,
      receiptSignatureName: opts.name,
      receiptSignatureTitle: opts.title,
    })
    .where(eq(tenants.id, tenantId));
}

test('tenant WITH a saved signature: receipt PDF is produced AND stamped with the signature block', async () => {
  // Upload a real (transparent) signature PNG to object storage exactly the way
  // the app does, then point the tenant at it.
  const sharp = (await import('sharp')).default;
  const pngBuffer = await sharp({
    create: { width: 240, height: 80, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  const uploaded = await processSignatureImage(dataUri);
  signatureObjectUrl = uploaded.objectUrl;
  assert.match(signatureObjectUrl, /\/signatures\//, 'expected an /objects/signatures/ url');

  await setTenantSignature({ url: signatureObjectUrl, name: SIGNER_NAME, title: SIGNER_TITLE });

  const donationId = await insertCashDonation();
  const result = await generateDonationReceipt({ donationId, tenantId });
  assert.equal(result.success, true, result.message);
  assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0, 'expected a PDF buffer');

  const pdfText = await extractPdfText(result.pdfBuffer!);
  // Core receipt content is intact.
  assert.ok(pdfText.includes(CASH_AMOUNT_STR), 'receipt should still show the donation amount');
  // The signature block was stamped on.
  assert.ok(pdfText.includes(SIGNATURE_LABEL), 'PDF should contain the "Authorized Signature" label');
  assert.match(pdfText, /Authorizer/, 'PDF should contain the signer name');
  assert.match(pdfText, /Executive Director/, 'PDF should contain the signer title');
});

test('signature object missing/unreadable: receipt is STILL produced, just without the signature block', async () => {
  // Point the tenant at a well-formed /objects/signatures/ url whose backing
  // object does not exist — downloadSignaturePng returns null in this case.
  const phantomUrl = `/objects/signatures/sig_does_not_exist_${RUN_ID}.png`;
  await setTenantSignature({ url: phantomUrl, name: SIGNER_NAME, title: SIGNER_TITLE });

  const donationId = await insertCashDonation();
  const result = await generateDonationReceipt({ donationId, tenantId });
  // The whole point: generation must NOT fail just because the signature is gone.
  assert.equal(result.success, true, result.message);
  assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0, 'expected a PDF buffer even with a broken signature');

  const pdfText = await extractPdfText(result.pdfBuffer!);
  // Receipt body is intact...
  assert.ok(pdfText.includes(CASH_AMOUNT_STR), 'receipt should still show the donation amount');
  // ...but the signature block must NOT be present, since the image could not load.
  assert.ok(!pdfText.includes(SIGNATURE_LABEL), 'PDF must NOT contain the signature block when the image is missing');
  assert.doesNotMatch(pdfText, /Authorizer/, 'PDF must not stamp the signer name when the image is missing');
});

test('tenant with NO signature on file: receipt uses the original layout (no signature block)', async () => {
  await setTenantSignature({ url: null, name: null, title: null });

  const donationId = await insertCashDonation();
  const result = await generateDonationReceipt({ donationId, tenantId });
  assert.equal(result.success, true, result.message);
  assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0, 'expected a PDF buffer');

  const pdfText = await extractPdfText(result.pdfBuffer!);
  assert.ok(pdfText.includes(CASH_AMOUNT_STR), 'receipt should still show the donation amount');
  assert.ok(!pdfText.includes(SIGNATURE_LABEL), 'a tenant with no signature must not get a signature block');
});
