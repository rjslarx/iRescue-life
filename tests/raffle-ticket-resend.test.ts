/**
 * Tests for the staff "Resend Ticket Email" action (Task #267) and the
 * paid-transition rules it depends on.
 *
 * Route under test: POST /api/shop/admin/orders/:id/resend-ticket-email
 *   - 401 unauthenticated
 *   - 403 role without shop access and no page grant
 *   - 404 order from another tenant
 *   - 400 unpaid order
 *   - 400 paid order with no raffle items
 *   - 400 "Email is not configured" for a valid paid raffle order whose
 *     tenant has exhausted the platform email quota (proves all order
 *     validation passed and the route reached the send stage without
 *     actually sending mail).
 *
 * Payment-state rules (transitionShopOrderToPaid + expireAbandonedShopOrders):
 *   - the expiry sweep cancels stale unpaid orders
 *   - a successful confirmation can still transition a sweep-cancelled order
 *     to paid (cancellation is reversible by payment)
 *   - refunded orders can never be flipped back to paid
 *   - repeat transition of a paid order is a no-op (idempotent)
 *
 * Run via:  scripts/run-tests.sh tests/raffle-ticket-resend.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';

import { db } from '../server/db';
import { tenants, shopProducts, shopOrders, shopOrderItems } from '../shared/schema';
import { eq, inArray } from 'drizzle-orm';

import shopRouter from '../server/routes/shop';
import { transitionShopOrderToPaid } from '../server/lib/shop-order-payment';
import { expireAbandonedShopOrders } from '../server/lib/shop-order-expiry';

const RUN_ID = `t267-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;

let server: http.Server;
let baseUrl: string;
let tenantA: typeof tenants.$inferSelect;
let tenantB: typeof tenants.$inferSelect;
let raffleProductId: string;
let physicalProductId: string;
let paidRaffleOrderId: string;
let pendingRaffleOrderId: string;
let paidPhysicalOrderId: string;
let otherTenantOrderId: string;

const tenantIds: string[] = [];

async function makeTenant(suffix: string, overrides: Partial<typeof tenants.$inferInsert> = {}) {
  const [t] = await db.insert(tenants).values({
    name: `Test Rescue ${RUN_ID}-${suffix}`,
    subdomain: `${RUN_ID}-${suffix}`.toLowerCase().slice(0, 40),
    // Exhaust the platform email quota so EmailService.forTenant() returns
    // null and the happy-path test never sends real mail.
    emailsSentThisMonth: 999999,
    emailQuotaLimit: 1,
    ...overrides,
  } as any).returning();
  tenantIds.push(t.id);
  return t;
}

async function makeOrder(
  tenantId: string,
  paymentStatus: string,
  items: { productType: 'raffle' | 'physical'; productId?: string; tickets?: string[] }[],
  createdAt?: Date
) {
  const [order] = await db.insert(shopOrders).values({
    tenantId,
    orderNumber: `ORD-${RUN_ID}-${crypto.randomBytes(3).toString('hex')}`,
    customerEmail: 'buyer@example.com',
    customerName: 'Test Buyer',
    subtotal: '10.00',
    shippingAmount: '0',
    taxAmount: '0',
    totalAmount: '10.00',
    paymentStatus,
    paymentMethod: 'stripe',
    fulfillmentStatus: 'delivered',
    ...(createdAt ? { createdAt } : {}),
  } as any).returning();

  for (const item of items) {
    await db.insert(shopOrderItems).values({
      orderId: order.id,
      tenantId,
      productId: item.productId ?? physicalProductId,
      productName: item.productType === 'raffle' ? 'Test Raffle' : 'Test Mug',
      productType: item.productType,
      quantity: item.tickets?.length || 1,
      unitPrice: '10.00',
      totalPrice: '10.00',
      raffleTicketNumbers: item.tickets,
    } as any);
  }
  return order;
}

before(async () => {
  tenantA = await makeTenant('a');
  tenantB = await makeTenant('b');

  const [product] = await db.insert(shopProducts).values({
    tenantId: tenantA.id,
    name: `Raffle ${RUN_ID}`,
    slug: `raffle-${RUN_ID}`,
    productType: 'raffle',
    basePrice: '10.00',
    status: 'active',
  } as any).returning();
  raffleProductId = product.id;

  const [mug] = await db.insert(shopProducts).values({
    tenantId: tenantA.id,
    name: `Mug ${RUN_ID}`,
    slug: `mug-${RUN_ID}`,
    productType: 'physical',
    basePrice: '10.00',
    status: 'active',
  } as any).returning();
  physicalProductId = mug.id;

  paidRaffleOrderId = (await makeOrder(tenantA.id, 'paid', [
    { productType: 'raffle', productId: raffleProductId, tickets: ['000001', '000002'] },
  ])).id;
  pendingRaffleOrderId = (await makeOrder(tenantA.id, 'pending', [
    { productType: 'raffle', productId: raffleProductId, tickets: ['000003'] },
  ])).id;
  paidPhysicalOrderId = (await makeOrder(tenantA.id, 'paid', [
    { productType: 'physical' },
  ])).id;
  otherTenantOrderId = (await makeOrder(tenantB.id, 'paid', [
    { productType: 'raffle', tickets: ['000001'] },
  ])).id;

  // Test app: header-driven auth/tenant injection ahead of the real router,
  // so requireTenant/requireAuth/requireRoleOrPageAccess run for real.
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenantA as any;
    const role = req.headers['x-test-role'] as string | undefined;
    if (role) {
      req.user = {
        id: crypto.randomUUID(),
        email: 'staff@example.com',
        fullName: 'Test Staff',
        roles: [role],
        activeRole: role,
        tenantId: tenantA.id,
      } as any;
    }
    next();
  });
  app.use('/api/shop', shopRouter);

  server = app.listen(0);
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  server?.close();
  const orderIds = [paidRaffleOrderId, pendingRaffleOrderId, paidPhysicalOrderId, otherTenantOrderId].filter(Boolean);
  if (orderIds.length) await db.delete(shopOrderItems).where(inArray(shopOrderItems.orderId, orderIds));
  if (tenantIds.length) {
    await db.delete(shopOrders).where(inArray(shopOrders.tenantId, tenantIds));
    await db.delete(shopProducts).where(inArray(shopProducts.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
  }
});

async function resend(orderId: string, role?: string) {
  const res = await fetch(`${baseUrl}/api/shop/admin/orders/${orderId}/resend-ticket-email`, {
    method: 'POST',
    headers: role ? { 'x-test-role': role } : {},
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('unauthenticated request is rejected with 401', async () => {
  const { status } = await resend(paidRaffleOrderId);
  assert.equal(status, 401);
});

test('role without shop access or page grant gets 403', async () => {
  const { status } = await resend(paidRaffleOrderId, 'adopter');
  assert.equal(status, 403);
});

test('order belonging to another tenant is 404 (tenant isolation)', async () => {
  const { status } = await resend(otherTenantOrderId, 'staff');
  assert.equal(status, 404);
});

test('unpaid order is rejected with 400', async () => {
  const { status, body } = await resend(pendingRaffleOrderId, 'staff');
  assert.equal(status, 400);
  assert.match(body.error, /paid orders/i);
});

test('paid order without raffle items is rejected with 400', async () => {
  const { status, body } = await resend(paidPhysicalOrderId, 'staff');
  assert.equal(status, 400);
  assert.match(body.error, /raffle/i);
});

test('valid paid raffle order passes validation and reaches the email stage', async () => {
  // Tenant quota is exhausted, so the route reports email-not-configured —
  // proving every order check passed — without sending real mail.
  const { status, body } = await resend(paidRaffleOrderId, 'staff');
  assert.equal(status, 400);
  assert.match(body.error, /email is not configured/i);
});

test('expiry sweep cancels stale unpaid orders; payment can still reverse it', async () => {
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const staleOrder = await makeOrder(tenantA.id, 'processing', [
    { productType: 'raffle', productId: raffleProductId, tickets: ['000099'] },
  ], old);

  await expireAbandonedShopOrders(24);
  let [row] = await db.select().from(shopOrders).where(eq(shopOrders.id, staleOrder.id));
  assert.equal(row.paymentStatus, 'cancelled');

  // A late-but-successful payment confirmation must transition it to paid.
  const updated = await transitionShopOrderToPaid(staleOrder.id, 'ch_test_late');
  assert.equal(updated.length, 1);
  [row] = await db.select().from(shopOrders).where(eq(shopOrders.id, staleOrder.id));
  assert.equal(row.paymentStatus, 'paid');
  assert.equal(row.stripeChargeId, 'ch_test_late');

  // Repeat confirmation is a no-op (idempotent — no double side effects).
  const again = await transitionShopOrderToPaid(staleOrder.id, 'ch_test_late');
  assert.equal(again.length, 0);

  await db.delete(shopOrderItems).where(eq(shopOrderItems.orderId, staleOrder.id));
  await db.delete(shopOrders).where(eq(shopOrders.id, staleOrder.id));
});

test('refunded orders can never be flipped back to paid', async () => {
  const refunded = await makeOrder(tenantA.id, 'refunded', [
    { productType: 'raffle', productId: raffleProductId, tickets: ['000100'] },
  ]);

  const updated = await transitionShopOrderToPaid(refunded.id, 'ch_test_replay');
  assert.equal(updated.length, 0);
  const [row] = await db.select().from(shopOrders).where(eq(shopOrders.id, refunded.id));
  assert.equal(row.paymentStatus, 'refunded');

  await db.delete(shopOrderItems).where(eq(shopOrderItems.orderId, refunded.id));
  await db.delete(shopOrders).where(eq(shopOrders.id, refunded.id));
});
