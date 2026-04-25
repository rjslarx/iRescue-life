/**
 * Unit test for sendVipPaymentFailedEmail (Task #48).
 *
 * Validates the three copy paths the renderer must support:
 *   1. First failure (attempt 1, with a next retry date) → standard
 *      "your gift didn't go through" copy + auto-retry note.
 *   2. Mid-dunning reminder (attempt 2, with another retry date) → reminder
 *      heading + acknowledges Stripe will try again.
 *   3. Final attempt (attempt N, no next_payment_attempt) → "last chance"
 *      heading, urgent red styling, no future-retry promise.
 *
 * Also verifies the donor-facing failure reason from Stripe is rendered
 * verbatim (HTML-escaped) when supplied.
 *
 * Run via:  scripts/run-tests.sh tests/vip-payment-failed-email.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub EmailService.forTenant before importing the helper so we can capture
// the rendered subject/html without touching real email infra or DB.
import * as emailServiceModule from '../server/lib/email-service';

type SentEmail = { to: string; subject: string; html: string };
const sent: SentEmail[] = [];

(emailServiceModule.EmailService as any).forTenant = async () => ({
  send: async (msg: SentEmail) => {
    sent.push(msg);
    return { success: true };
  },
});

import { sendVipPaymentFailedEmail } from '../server/services/vip-emails';

const tenant = {
  id: 'tenant-test',
  name: 'Hopeful Hounds Rescue',
  subdomain: 'hopeful',
  customDomain: null,
  orgTaxEin: null,
  orgLegalName: 'Hopeful Hounds Rescue Inc.',
  transparencyVault: null,
  impactLoopEnabled: false,
  contactEmail: null,
} as const;

test('first card failure: standard copy with next retry date', async () => {
  sent.length = 0;
  await sendVipPaymentFailedEmail({
    tenant: tenant as any,
    donorEmail: 'donor@example.com',
    donorName: 'Alex Donor',
    tierName: 'Pack Leader',
    amountCents: 2500,
    currency: 'usd',
    attemptNumber: 1,
    nextRetryAt: new Date('2026-05-01T12:00:00Z'),
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/abc',
    manageUrl: 'https://example.com/donor/giving-history',
  });

  assert.equal(sent.length, 1);
  const [msg] = sent;
  assert.equal(msg.to, 'donor@example.com');
  assert.match(msg.subject, /Action needed/);
  assert.match(msg.subject, /Pack Leader/);
  // Standard heading, not the reminder/final variants.
  assert.match(msg.html, /Your monthly gift didn't go through/);
  assert.doesNotMatch(msg.html, /Last chance/);
  assert.doesNotMatch(msg.html, /Reminder:/);
  // Should advertise the next automatic retry.
  assert.match(msg.html, /We'll automatically try again/);
  // No explicit failure reason supplied → "What the bank told us" line absent.
  assert.doesNotMatch(msg.html, /What the bank told us/);
  // Update CTA + invoice link present.
  assert.match(msg.html, /Update your payment method/);
  assert.match(msg.html, /https:\/\/invoice\.stripe\.com\/i\/abc/);
});

test('mid-dunning reminder: attempt 2 with another retry uses reminder copy', async () => {
  sent.length = 0;
  await sendVipPaymentFailedEmail({
    tenant: tenant as any,
    donorEmail: 'donor@example.com',
    donorName: 'Alex Donor',
    tierName: 'Pack Leader',
    amountCents: 2500,
    currency: 'usd',
    attemptNumber: 2,
    nextRetryAt: new Date('2026-05-08T12:00:00Z'),
    hostedInvoiceUrl: null,
    manageUrl: 'https://example.com/donor/giving-history',
    failureReason: 'Your card has insufficient funds.',
  });

  assert.equal(sent.length, 1);
  const [msg] = sent;
  assert.match(msg.subject, /Reminder:/);
  // Reminder heading and attempt counter both render.
  assert.match(msg.html, /Reminder: your monthly gift still hasn't gone through/);
  assert.match(msg.html, /This is attempt #2/);
  // Failure reason rendered (escaped).
  assert.match(msg.html, /What the bank told us/);
  assert.match(msg.html, /Your card has insufficient funds\./);
  // Still promises another retry — this is not the final attempt.
  assert.match(msg.html, /We'll automatically try again/);
  assert.doesNotMatch(msg.html, /Last chance/);
});

test('final attempt: no next retry → urgent "last chance" copy', async () => {
  sent.length = 0;
  await sendVipPaymentFailedEmail({
    tenant: tenant as any,
    donorEmail: 'donor@example.com',
    donorName: 'Alex Donor',
    tierName: 'Pack Leader',
    amountCents: 2500,
    currency: 'usd',
    attemptNumber: 4,
    nextRetryAt: null,
    hostedInvoiceUrl: null,
    manageUrl: 'https://example.com/donor/giving-history',
    failureReason: 'Your card has expired.',
    isFinalAttempt: true,
  });

  assert.equal(sent.length, 1);
  const [msg] = sent;
  assert.match(msg.subject, /\[Last chance\]/);
  assert.match(msg.html, /Last chance: your Pack Leader subscription is about to be canceled/);
  assert.match(msg.html, /This is attempt #4/);
  assert.match(msg.html, /the final automatic retry before your subscription is canceled/);
  // Final variant must NOT promise another automatic retry.
  assert.doesNotMatch(msg.html, /We&#39;ll automatically try again/);
  // Failure reason rendered.
  assert.match(msg.html, /Your card has expired\./);
  // Urgent red CTA color used (vs. the normal blue in earlier reminders).
  assert.match(msg.html, /background: #dc2626/);
});

test('failure reason is HTML-escaped to prevent injection', async () => {
  sent.length = 0;
  await sendVipPaymentFailedEmail({
    tenant: tenant as any,
    donorEmail: 'donor@example.com',
    donorName: 'Alex Donor',
    tierName: 'Pack Leader',
    amountCents: 2500,
    currency: 'usd',
    attemptNumber: 1,
    nextRetryAt: new Date('2026-05-01T12:00:00Z'),
    hostedInvoiceUrl: null,
    manageUrl: 'https://example.com/donor/giving-history',
    failureReason: '<script>alert(1)</script>',
  });

  assert.equal(sent.length, 1);
  const [msg] = sent;
  // Tag opening must be escaped.
  assert.doesNotMatch(msg.html, /<script>alert\(1\)<\/script>/);
  assert.match(msg.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('missing donor email is a no-op (does not throw)', async () => {
  sent.length = 0;
  await sendVipPaymentFailedEmail({
    tenant: tenant as any,
    donorEmail: '',
    donorName: 'Alex Donor',
    tierName: 'Pack Leader',
    amountCents: 2500,
    currency: 'usd',
    attemptNumber: 1,
    nextRetryAt: null,
    hostedInvoiceUrl: null,
    manageUrl: 'https://example.com/donor/giving-history',
  });
  assert.equal(sent.length, 0);
});
