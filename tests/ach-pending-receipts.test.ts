/**
 * Regression test for the ACH-pending donor receipt flow (Task #117).
 *
 * Covers three layers:
 *   1. generateDonationReceipt defers while the matching payment is pending
 *      and succeeds once it clears.
 *   2. GET /api/vip-portal/history flags pending ACH donations and excludes
 *      them from the annual-summary year list.
 *   3. <DonationHistoryRow> actually renders the pending badge + disabled
 *      "Receipt pending" button when isPendingBankTransfer is true, and the
 *      normal "Receipt" button when false.
 *
 * Run via:  scripts/run-tests.sh   (or: npx tsx --test tests/*.test.ts)
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { db } from '../server/db';
import { tenants, donors, donations, payments } from '../shared/schema';
import { eq } from 'drizzle-orm';

import { generateDonationReceipt } from '../server/services/donation-receipt-service';
import vipPortalRouter from '../server/routes/vipPortal';
import { DonationHistoryRow } from '../client/src/components/DonationHistoryRow';

const RUN_ID = `t117-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
const SUBDOMAIN = `test-${RUN_ID}`.toLowerCase().slice(0, 30);
const DONOR_EMAIL = `${RUN_ID}@example-donor.test`;
const SESSION_ID = `cs_test_${RUN_ID}`;

let tenantId: string;
let donorId: string;
let donationId: string;
let paymentId: string;
let server: http.Server;
let baseUrl: string;

// Mirrors signVipToken in server/routes/vipPortal.ts (kept local to avoid
// widening that file's exports just for tests).
function signVipToken(donorIdArg: string, tenantIdArg: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set (>=32 chars) to run this test');
  }
  const exp = Date.now() + 60 * 60 * 1000;
  const payload = `${donorIdArg}.${tenantIdArg}.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

before(async () => {
  // Seed first so the tenant id is available to the request shim.
  const [tenant] = await db
    .insert(tenants)
    .values({
      subdomain: SUBDOMAIN,
      name: `ACH Pending Test Rescue ${RUN_ID}`,
      contactEmail: 'hello@example-rescue.test',
    })
    .returning({ id: tenants.id });
  tenantId = tenant.id;

  const [donor] = await db
    .insert(donors)
    .values({ tenantId, email: DONOR_EMAIL, name: 'ACH Pending Donor' })
    .returning({ id: donors.id });
  donorId = donor.id;

  const [donation] = await db
    .insert(donations)
    .values({
      tenantId,
      donorId,
      donorName: 'ACH Pending Donor',
      donorEmail: DONOR_EMAIL,
      donationType: 'ach',
      amount: 5000,
      paymentMethod: 'stripe_ach',
      stripeCheckoutSessionId: SESSION_ID,
      source: 'stripe',
      isRecurring: false,
    })
    .returning({ id: donations.id });
  donationId = donation.id;

  const [payment] = await db
    .insert(payments)
    .values({
      tenantId,
      donorId,
      amount: 5000,
      currency: 'usd',
      status: 'pending',
      paymentMethod: 'stripe',
      stripeCheckoutSessionId: SESSION_ID,
      isRecurring: false,
    })
    .returning({ id: payments.id });
  paymentId = payment.id;

  // Mount the real vipPortal router with a shim for the tenant context that
  // resolveTenant would normally populate.
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { tenant?: { id: string } }).tenant = { id: tenantId };
    next();
  });
  app.use('/api/vip-portal', vipPortalRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Could not bind test server');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  try {
    if (paymentId) await db.delete(payments).where(eq(payments.id, paymentId));
    if (donationId) await db.delete(donations).where(eq(donations.id, donationId));
    if (donorId) await db.delete(donors).where(eq(donors.id, donorId));
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (cleanupErr) {
    console.warn('[task-117 test] cleanup warning:', cleanupErr);
  }
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('generateDonationReceipt defers while the matching ACH payment is pending', async () => {
  const result = await generateDonationReceipt({ donationId, tenantId });
  assert.equal(result.success, false);
  assert.equal(result.pdfBuffer, undefined);
  assert.match(result.message, /still pending|3-5 business days/i);
});

test('GET /api/vip-portal/history flags the pending ACH donation and hides its year from the annual-summary list', async () => {
  const token = signVipToken(donorId, tenantId);
  const res = await fetch(`${baseUrl}/api/vip-portal/history?token=${encodeURIComponent(token)}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    donations: Array<{
      id: string;
      isPendingBankTransfer: boolean;
      expectedClearDate: string | null;
      receiptNumber: string | null;
    }>;
    availableYears: number[];
  };
  const ours = body.donations.find((d) => d.id === donationId);
  assert.ok(ours);
  assert.equal(ours.isPendingBankTransfer, true);
  assert.ok(ours.expectedClearDate);
  assert.equal(ours.receiptNumber, null);
  assert.equal(body.availableYears.includes(new Date().getFullYear()), false);
});

test('DonationHistoryRow renders the pending badge and a disabled "Receipt pending" button when the ACH transfer is still pending', () => {
  const html = renderToStaticMarkup(
    createElement(DonationHistoryRow, {
      donation: {
        id: 'd-pending',
        date: '2026-04-20T12:00:00Z',
        amount: 5000,
        isRecurring: false,
        isPendingBankTransfer: true,
        expectedClearDate: '2026-04-25T12:00:00Z',
        receiptNumber: null,
      },
      onDownloadReceipt: () => {},
      formatMoney: (c) => `$${((c ?? 0) / 100).toFixed(2)}`,
      formatDateShort: (d) => new Date(d).toISOString().slice(0, 10),
    }),
  );

  assert.match(html, /Pending — clears in 3-5 business days/);
  assert.match(html, /Receipt pending/);
  // The "Receipt pending" button must be disabled and must not also render
  // the normal "Receipt" download button. The attribute order in the
  // rendered <button> isn't guaranteed, so match both attributes anywhere
  // inside the same <button …> opening tag.
  const pendingButtonMatch = html.match(/<button\b([^>]*)data-testid="button-receipt-pending-d-pending"([^>]*)>/);
  assert.ok(pendingButtonMatch, 'expected the pending-receipt button to render');
  const buttonAttrs = `${pendingButtonMatch[1]} ${pendingButtonMatch[2]}`;
  assert.match(buttonAttrs, /\bdisabled\b/, 'pending-receipt button must be disabled');
  assert.doesNotMatch(html, /data-testid="button-download-receipt-d-pending"/);
  // Pending donations also surface the "expected to clear by …" hint.
  assert.match(html, /Bank transfer in flight/);
});

test('DonationHistoryRow renders the normal Receipt button (no pending badge) once the donation has a receipt number', () => {
  const html = renderToStaticMarkup(
    createElement(DonationHistoryRow, {
      donation: {
        id: 'd-cleared',
        date: '2026-04-10T12:00:00Z',
        amount: 5000,
        isRecurring: false,
        isPendingBankTransfer: false,
        expectedClearDate: null,
        receiptNumber: 'TEST-ABC-123',
      },
      onDownloadReceipt: () => {},
      formatMoney: (c) => `$${((c ?? 0) / 100).toFixed(2)}`,
      formatDateShort: (d) => new Date(d).toISOString().slice(0, 10),
    }),
  );

  assert.doesNotMatch(html, /Pending — clears in 3-5 business days/);
  assert.doesNotMatch(html, /Receipt pending/);
  assert.match(html, /data-testid="button-download-receipt-d-cleared"/);
  assert.match(html, /Receipt #TEST-ABC-123/);
});

test('after the payment row flips to succeeded, the receipt issues and the portal stops flagging the donation as pending', async () => {
  await db.update(payments).set({ status: 'succeeded' }).where(eq(payments.id, paymentId));

  const result = await generateDonationReceipt({ donationId, tenantId });
  assert.equal(result.success, true, `expected success, got: ${result.message}`);
  assert.ok(result.receiptNumber);
  assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0);

  const token = signVipToken(donorId, tenantId);
  const res = await fetch(`${baseUrl}/api/vip-portal/history?token=${encodeURIComponent(token)}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    donations: Array<{ id: string; isPendingBankTransfer: boolean; receiptNumber: string | null }>;
    availableYears: number[];
  };
  const ours = body.donations.find((d) => d.id === donationId);
  assert.ok(ours);
  assert.equal(ours.isPendingBankTransfer, false);
  assert.equal(ours.receiptNumber, result.receiptNumber);
  assert.ok(body.availableYears.includes(new Date().getFullYear()));
});
