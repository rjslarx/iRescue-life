/**
 * Split-the-pot raffle accounting and payout regression tests.
 *
 * Run via: scripts/run-tests.sh tests/split-pot-raffles.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';

import { db } from '../server/db';
import {
  tenants,
  users,
  shopProducts,
  shopOrders,
  shopOrderItems,
  shopRaffleBonusTickets,
  shopRaffleDrawings,
} from '../shared/schema';
import {
  computeBundledPrice,
  computeCheckoutPaymentAmounts,
  computeSplitPotAmounts,
} from '../shared/raffle-pricing';
import {
  refundClosedRafflePayment,
  ShopRaffleClosedError,
  transitionShopOrderToPaid,
} from '../server/lib/shop-order-payment';
import { eq, inArray } from 'drizzle-orm';
import shopRouter from '../server/routes/shop';

const RUN_ID = `splitpot-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
let server: http.Server;
let baseUrl: string;
let tenant: typeof tenants.$inferSelect;
let staffUserId: string;
const productIds: string[] = [];

before(async () => {
  [tenant] = await db.insert(tenants).values({
    name: `Split Pot Test Rescue ${RUN_ID}`,
    subdomain: RUN_ID.toLowerCase().slice(0, 40),
    emailsSentThisMonth: 999999,
    emailQuotaLimit: 1,
  } as any).returning();
  const [staff] = await db.insert(users).values({
    tenantId: tenant.id,
    email: `${RUN_ID}@example.com`,
    passwordHash: 'x',
    fullName: 'Split Pot Test Staff',
    roles: ['admin'],
  } as any).returning();
  staffUserId = staff.id;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenant as any;
    if (req.headers['x-test-role']) {
      req.user = {
        id: staffUserId,
        email: `${RUN_ID}@example.com`,
        fullName: 'Split Pot Test Staff',
        roles: ['admin'],
        activeRole: 'admin',
        tenantId: tenant.id,
      } as any;
    }
    next();
  });
  app.use('/api/shop', shopRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  server?.close();
  if (productIds.length) {
    await db.delete(shopRaffleDrawings).where(inArray(shopRaffleDrawings.productId, productIds));
    await db.delete(shopRaffleBonusTickets).where(inArray(shopRaffleBonusTickets.productId, productIds));
  }
  const orders = await db.select({ id: shopOrders.id }).from(shopOrders).where(eq(shopOrders.tenantId, tenant.id));
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length) await db.delete(shopOrderItems).where(inArray(shopOrderItems.orderId, orderIds));
  await db.delete(shopOrders).where(eq(shopOrders.tenantId, tenant.id));
  await db.delete(shopProducts).where(eq(shopProducts.tenantId, tenant.id));
  await db.delete(tenants).where(eq(tenants.id, tenant.id));
});

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}/api/shop${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-test-role': 'admin',
      ...(options.headers || {}),
    },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function makeSplitPotRaffle(suffix: string) {
  const [product] = await db.insert(shopProducts).values({
    tenantId: tenant.id,
    name: `50/50 ${suffix}`,
    slug: `${RUN_ID}-${suffix}`,
    productType: 'raffle',
    raffleMode: 'split_pot',
    status: 'active',
    basePrice: '10.00',
  }).returning();
  productIds.push(product.id);
  return product;
}

async function makeFixedRaffle(suffix: string) {
  const [product] = await db.insert(shopProducts).values({
    tenantId: tenant.id,
    name: `Fixed ${suffix}`,
    slug: `${RUN_ID}-fixed-${suffix}`,
    productType: 'raffle',
    raffleMode: 'fixed',
    status: 'active',
    basePrice: '10.00',
    rafflePrizeDescription: 'Test prize',
  }).returning();
  productIds.push(product.id);
  return product;
}

async function makeOrder(
  productId: string,
  suffix: string,
  amount: string,
  paymentStatus: 'paid' | 'processing' | 'failed' | 'cancelled' | 'refunded',
  tickets: string[],
) {
  const [order] = await db.insert(shopOrders).values({
    tenantId: tenant.id,
    orderNumber: `ORD-${RUN_ID}-${suffix}`,
    customerEmail: 'buyer@example.com',
    customerName: 'Test Buyer',
    subtotal: amount,
    shippingAmount: '0',
    taxAmount: '0',
    processingFee: '0',
    totalAmount: amount,
    paymentStatus,
    paymentMethod: 'stripe',
    fulfillmentStatus: 'delivered',
  } as any).returning();
  const [item] = await db.insert(shopOrderItems).values({
    orderId: order.id,
    productId,
    tenantId: tenant.id,
    productName: '50/50 Test',
    productType: 'raffle',
    quantity: tickets.length,
    unitPrice: tickets.length ? (Number(amount) / tickets.length).toFixed(2) : '0.00',
    totalPrice: amount,
    raffleTicketNumbers: tickets,
  }).returning();
  return { order, item };
}

test('split-pot math is cent-safe and split-pot checkout charges no buyer fee', () => {
  assert.deepEqual(computeSplitPotAmounts('25.00'), {
    ticketSalesAmount: '25.00',
    winnerPrizeAmount: '12.50',
    rescueShareAmount: '12.50',
  });
  assert.deepEqual(computeCheckoutPaymentAmounts(25, false), {
    subtotal: 25,
    processingFee: 0,
    totalAmount: 25,
  });
  assert.ok(computeCheckoutPaymentAmounts(25, true).processingFee > 0);
  assert.equal(
    computeBundledPrice(7, '10.00', [{ quantity: 3, price: '25.00' }]),
    60,
    'fixed raffle bundle tiers keep exact greedy configured pricing',
  );
});

test('product setup rejects a price that cannot split evenly to the cent', async () => {
  const result = await request('/admin/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Odd Cent 50/50',
      slug: `${RUN_ID}-odd`,
      productType: 'raffle',
      raffleMode: 'split_pot',
      status: 'draft',
      basePrice: '5.99',
    }),
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /divide|divisible/i);

  const invalidGoal = await request('/admin/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Invalid ticket goal',
      slug: `${RUN_ID}-invalid-goal`,
      productType: 'raffle',
      raffleMode: 'fixed',
      status: 'draft',
      basePrice: '5.00',
      raffleTicketGoal: 0,
    }),
  });
  assert.equal(invalidGoal.status, 400);
  assert.match(JSON.stringify(invalidGoal.body), /ticket goal|at least 1/i);
});

test('only paid ticket revenue funds the live pot; bonus tickets add no cash', async () => {
  const product = await makeSplitPotRaffle('paid-only');
  const paid = await makeOrder(product.id, 'paid', '20.00', 'paid', ['000001', '000002']);
  await makeOrder(product.id, 'processing', '40.00', 'processing', ['000003']);
  await makeOrder(product.id, 'refunded', '60.00', 'refunded', ['000004']);
  await makeOrder(product.id, 'failed', '80.00', 'failed', ['000006']);
  await makeOrder(product.id, 'cancelled', '100.00', 'cancelled', ['000007']);
  await db.insert(shopRaffleBonusTickets).values({
    tenantId: tenant.id,
    orderId: paid.order.id,
    orderItemId: paid.item.id,
    productId: product.id,
    actionType: 'share',
    ticketNumbers: ['000005'],
  });

  const publicResult = await request(`/products/${product.slug}`);
  assert.equal(publicResult.status, 200);
  assert.deepEqual(publicResult.body.product.splitPot, {
    ticketSalesAmount: '20.00',
    winnerPrizeAmount: '10.00',
    rescueShareAmount: '10.00',
    isDrawn: false,
    drawnAt: null,
  });
  assert.equal(publicResult.body.product.raffleTicketGoal, 100);
  assert.equal(publicResult.body.product.ticketsSold, 2);

  const publicListResult = await request('/products');
  assert.equal(publicListResult.status, 200);
  const listedRaffle = publicListResult.body.products.find((row: any) => row.id === product.id);
  assert.equal(listedRaffle.raffleTicketGoal, 100);
  assert.equal(listedRaffle.ticketsSold, 2);

  const adminResult = await request('/admin/raffles');
  const raffle = adminResult.body.raffles.find((row: any) => row.id === product.id);
  assert.equal(raffle.ticketsSold, 2);
  assert.equal(raffle.bonusTickets, 1);
  assert.equal(raffle.splitPot.winnerPrizeAmount, '10.00');
});

test('draw snapshots final amounts, order details use the snapshot, and payout marking is concurrency-idempotent', async () => {
  const product = await makeSplitPotRaffle('draw');
  const paidOrder = await makeOrder(product.id, 'draw-paid', '30.00', 'paid', ['000001', '000002', '000003']);

  const draw = await request(`/admin/raffles/${product.id}/draw`, { method: 'POST', body: '{}' });
  assert.equal(draw.status, 200);
  assert.equal(draw.body.drawing.ticketSalesAmount, '30.00');
  assert.equal(draw.body.drawing.winnerPrizeAmount, '15.00');
  assert.equal(draw.body.drawing.rescueShareAmount, '15.00');
  assert.equal(draw.body.drawing.payoutStatus, 'pending');

  const orderResult = await request(`/orders/${paidOrder.order.orderNumber}?t=${paidOrder.order.accessToken}`, {
    headers: {},
  });
  assert.equal(orderResult.status, 200);
  assert.equal(orderResult.body.order.items[0].splitPot.isDrawn, true);
  assert.equal(orderResult.body.order.items[0].splitPot.winnerPrizeAmount, '15.00');

  const [firstPaid, secondPaid] = await Promise.all([
    request(`/admin/raffles/${product.id}/payout/paid`, { method: 'POST', body: '{}' }),
    request(`/admin/raffles/${product.id}/payout/paid`, { method: 'POST', body: '{}' }),
  ]);
  assert.equal(firstPaid.status, 200);
  assert.equal(firstPaid.body.drawing.payoutStatus, 'paid');
  assert.ok(firstPaid.body.drawing.prizePaidAt);
  assert.equal(secondPaid.status, 200);
  assert.equal(secondPaid.body.drawing.prizePaidAt, firstPaid.body.drawing.prizePaidAt);
  assert.equal(secondPaid.body.drawing.prizePaidBy, firstPaid.body.drawing.prizePaidBy);
});

test('checkout refuses new entries after the drawing', async () => {
  const product = await makeSplitPotRaffle('closed');
  await makeOrder(product.id, 'closed-paid', '10.00', 'paid', ['000001']);
  const draw = await request(`/admin/raffles/${product.id}/draw`, { method: 'POST', body: '{}' });
  assert.equal(draw.status, 200);

  // Make the early Stripe-availability gate pass. The transaction must reject
  // the closed raffle before any Stripe client is constructed.
  (tenant as any).stripeEnabled = true;
  (tenant as any).stripeSecretKeyEncrypted = 'test-only-placeholder';
  const checkout = await request('/checkout', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: product.id, quantity: 1 }],
      customerEmail: 'late@example.com',
      customerName: 'Late Buyer',
      paymentMethod: 'stripe',
    }),
  });
  delete (tenant as any).stripeSecretKeyEncrypted;
  (tenant as any).stripeEnabled = false;
  assert.equal(checkout.status, 400);
  assert.match(checkout.body.error, /already been drawn/i);
});

test('payment finalization and drawing serialize so every paid ticket is in the frozen pot', async () => {
  const product = await makeSplitPotRaffle('confirm-draw-race');
  await makeOrder(product.id, 'race-already-paid', '10.00', 'paid', ['000001']);
  const pending = await makeOrder(product.id, 'race-pending', '10.00', 'processing', ['000002']);

  const [transitionResult, drawResult] = await Promise.allSettled([
    transitionShopOrderToPaid(pending.order.id, 'ch_test_race'),
    request(`/admin/raffles/${product.id}/draw`, { method: 'POST', body: '{}' }),
  ]);

  assert.equal(drawResult.status, 'fulfilled');
  assert.equal(drawResult.value.status, 200);
  const [drawing] = await db
    .select()
    .from(shopRaffleDrawings)
    .where(eq(shopRaffleDrawings.productId, product.id));
  const [finalOrder] = await db
    .select({ paymentStatus: shopOrders.paymentStatus })
    .from(shopOrders)
    .where(eq(shopOrders.id, pending.order.id));

  if (transitionResult.status === 'fulfilled' && transitionResult.value.length === 1) {
    assert.equal(finalOrder.paymentStatus, 'paid');
    assert.equal(drawing.ticketSalesAmount, '20.00');
    assert.equal(drawing.winnerPrizeAmount, '10.00');
  } else {
    assert.equal(transitionResult.status, 'rejected');
    assert.ok(transitionResult.reason instanceof ShopRaffleClosedError);
    assert.notEqual(finalOrder.paymentStatus, 'paid');
    assert.equal(drawing.ticketSalesAmount, '10.00');
    assert.equal(drawing.winnerPrizeAmount, '5.00');
  }
});

test('mixed split-pot and regular checkout is rejected while fixed checkout fees remain unchanged', async () => {
  const split = await makeSplitPotRaffle('mixed');
  const [fixed] = await db.insert(shopProducts).values({
    tenantId: tenant.id,
    name: 'Fixed Prize Test',
    slug: `${RUN_ID}-fixed`,
    productType: 'raffle',
    raffleMode: 'fixed',
    status: 'active',
    basePrice: '10.00',
  }).returning();
  productIds.push(fixed.id);

  (tenant as any).stripeEnabled = true;
  (tenant as any).stripeSecretKeyEncrypted = 'test-only-placeholder';
  const checkout = await request('/checkout', {
    method: 'POST',
    body: JSON.stringify({
      items: [
        { productId: split.id, quantity: 1 },
        { productId: fixed.id, quantity: 1 },
      ],
      customerEmail: 'mixed@example.com',
      customerName: 'Mixed Buyer',
      paymentMethod: 'stripe',
    }),
  });
  delete (tenant as any).stripeSecretKeyEncrypted;
  (tenant as any).stripeEnabled = false;

  assert.equal(checkout.status, 400);
  assert.match(checkout.body.error, /purchased separately/i);
  assert.ok(computeCheckoutPaymentAmounts(10, true).processingFee > 0);
});

test('automatic closed-raffle refunds reverse Connect transfers and application fees only when applicable', async () => {
  const product = await makeSplitPotRaffle('refund-options');
  const connectOrder = await makeOrder(product.id, 'refund-connect', '10.00', 'processing', ['000001']);
  const ownKeyOrder = await makeOrder(product.id, 'refund-own-key', '10.00', 'processing', ['000002']);
  const calls: Array<{ params: Record<string, unknown>; options: Record<string, unknown> }> = [];
  const fakeStripe = {
    refunds: {
      create: async (params: Record<string, unknown>, options: Record<string, unknown>) => {
        calls.push({ params, options });
        return { id: `re_test_${calls.length}`, status: 'succeeded' };
      },
    },
  } as any;

  await refundClosedRafflePayment(fakeStripe, connectOrder.order.id, 'pi_connect', {
    reverseTransfer: true,
    refundApplicationFee: true,
  });
  await refundClosedRafflePayment(fakeStripe, ownKeyOrder.order.id, 'pi_own_key');

  assert.deepEqual(calls[0].params, {
    payment_intent: 'pi_connect',
    reverse_transfer: true,
    refund_application_fee: true,
  });
  assert.deepEqual(calls[1].params, { payment_intent: 'pi_own_key' });
  assert.match(String(calls[0].options.idempotencyKey), /shop-raffle-closed/);

  const refunded = await db
    .select({ paymentStatus: shopOrders.paymentStatus })
    .from(shopOrders)
    .where(inArray(shopOrders.id, [connectOrder.order.id, ownKeyOrder.order.id]));
  assert.deepEqual(refunded.map((row) => row.paymentStatus).sort(), ['refunded', 'refunded']);
});

test('raffle mode and pricing cannot change after entries exist or after a draw', async () => {
  const split = await makeSplitPotRaffle('terms-locked-split');
  await makeOrder(split.id, 'terms-split-paid', '10.00', 'paid', ['000001']);

  for (const patch of [
    { raffleMode: 'fixed' },
    { basePrice: '12.00' },
    { bundlePricing: [{ quantity: 3, price: '24.00' }] },
    { productType: 'physical' },
  ]) {
    const result = await request(`/admin/products/${split.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /cannot change after entries/i);
  }

  const statusOnly = await request(`/admin/products/${split.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'paused' }),
  });
  assert.equal(statusOnly.status, 200);

  const goalUpdate = await request(`/admin/products/${split.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ raffleTicketGoal: 250 }),
  });
  assert.equal(goalUpdate.status, 200);
  assert.equal(goalUpdate.body.product.raffleTicketGoal, 250);

  await request(`/admin/products/${split.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'active' }),
  });
  const publicAfterGoalUpdate = await request(`/products/${split.slug}`);
  assert.equal(publicAfterGoalUpdate.status, 200);
  assert.equal(publicAfterGoalUpdate.body.product.raffleTicketGoal, 250);

  const draw = await request(`/admin/raffles/${split.id}/draw`, { method: 'POST', body: '{}' });
  assert.equal(draw.status, 200);
  const afterDraw = await request(`/admin/products/${split.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ raffleMode: 'fixed' }),
  });
  assert.equal(afterDraw.status, 400);

  const fixed = await makeFixedRaffle('terms-locked-fixed');
  await makeOrder(fixed.id, 'terms-fixed-paid', '10.00', 'paid', ['000001']);
  const fixedToSplit = await request(`/admin/products/${fixed.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ raffleMode: 'split_pot' }),
  });
  assert.equal(fixedToSplit.status, 400);
  assert.match(fixedToSplit.body.error, /cannot change after entries/i);

  const empty = await makeSplitPotRaffle('terms-empty');
  const beforeEntries = await request(`/admin/products/${empty.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ raffleMode: 'fixed', basePrice: '12.00' }),
  });
  assert.equal(beforeEntries.status, 200);
  assert.equal(beforeEntries.body.product.raffleMode, 'fixed');
  assert.equal(beforeEntries.body.product.basePrice, '12.00');
});