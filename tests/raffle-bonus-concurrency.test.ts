/**
 * Task #284: prove concurrent bonus-ticket claims and raffle draws can never
 * collide or double-grant.
 *
 * Guarantees under test (all rely on the shop_products FOR UPDATE row lock +
 * partial unique indexes on shop_raffle_bonus_tickets):
 *   - N parallel claim-share requests for one order grant EXACTLY one share
 *     bonus (one 201, rest alreadyClaimed), with a unique ticket number.
 *   - Parallel referrals with distinct emails never exceed the product's
 *     referral cap, and all granted ticket numbers are unique (no collision
 *     with sold tickets either).
 *   - Parallel referrals for the SAME email grant exactly once.
 *   - A bonus grant fired concurrently with the admin draw either lands
 *     before the pool is assembled (and is counted in totalTickets) or is
 *     rejected with "already been drawn". Never a silent post-draw grant.
 *   - Two concurrent draws: exactly one succeeds, exactly one drawn record.
 *   - Wrong access token -> 403; missing/short token -> 400.
 *   - Public order GET never returns accessToken or the unmasked email.
 *
 * Run via:  scripts/run-tests.sh tests/raffle-bonus-concurrency.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';

import { db } from '../server/db';
import {
  tenants,
  shopProducts,
  shopOrders,
  shopOrderItems,
  shopRaffleBonusTickets,
  shopRaffleDrawings,
  users,
} from '../shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

import shopRouter from '../server/routes/shop';

const RUN_ID = `t284-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;

let server: http.Server;
let baseUrl: string;
let tenant: typeof tenants.$inferSelect;
let staffUserId: string;
const tenantIds: string[] = [];
const productIds: string[] = [];

before(async () => {
  const [t] = await db.insert(tenants).values({
    name: `Test Rescue ${RUN_ID}`,
    subdomain: RUN_ID.toLowerCase().slice(0, 40),
    // Exhaust platform email quota so referral invite emails never send.
    emailsSentThisMonth: 999999,
    emailQuotaLimit: 1,
  } as any).returning();
  tenant = t;
  tenantIds.push(t.id);

  // A real user row is required: the draw endpoint records drawnBy with an FK.
  const [staff] = await db.insert(users).values({
    tenantId: t.id,
    email: `staff-${RUN_ID}@example.com`,
    passwordHash: 'x',
    fullName: 'Test Staff',
    roles: ['admin'],
  } as any).returning();
  staffUserId = staff.id;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenant as any;
    const role = req.headers['x-test-role'] as string | undefined;
    if (role) {
      req.user = {
        id: staffUserId,
        email: 'staff@example.com',
        fullName: 'Test Staff',
        roles: [role],
        activeRole: role,
        tenantId: tenant.id,
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
  if (productIds.length) {
    await db.delete(shopRaffleDrawings).where(inArray(shopRaffleDrawings.productId, productIds));
    await db.delete(shopRaffleBonusTickets).where(inArray(shopRaffleBonusTickets.productId, productIds));
  }
  if (tenantIds.length) {
    const orders = await db.select({ id: shopOrders.id }).from(shopOrders)
      .where(inArray(shopOrders.tenantId, tenantIds));
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length) await db.delete(shopOrderItems).where(inArray(shopOrderItems.orderId, orderIds));
    await db.delete(shopOrders).where(inArray(shopOrders.tenantId, tenantIds));
    await db.delete(shopProducts).where(inArray(shopProducts.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
  }
});

async function makeRaffle(suffix: string, maxReferrals = 3) {
  const [product] = await db.insert(shopProducts).values({
    tenantId: tenant.id,
    name: `Raffle ${RUN_ID}-${suffix}`,
    slug: `raffle-${RUN_ID}-${suffix}`,
    productType: 'raffle',
    basePrice: '10.00',
    status: 'active',
    raffleIncentivesEnabled: true,
    raffleMaxReferrals: maxReferrals,
  } as any).returning();
  productIds.push(product.id);
  return product;
}

async function makePaidOrder(productId: string, tickets: string[], suffix: string) {
  const [order] = await db.insert(shopOrders).values({
    tenantId: tenant.id,
    orderNumber: `ORD-${RUN_ID}-${suffix}`,
    customerEmail: 'buyer@example.com',
    customerName: 'Test Buyer',
    customerPhone: '555-0100',
    subtotal: '10.00',
    shippingAmount: '0',
    taxAmount: '0',
    totalAmount: '10.00',
    paymentStatus: 'paid',
    paymentMethod: 'stripe',
    fulfillmentStatus: 'delivered',
  } as any).returning();
  const [item] = await db.insert(shopOrderItems).values({
    orderId: order.id,
    tenantId: tenant.id,
    productId,
    productName: 'Test Raffle',
    productType: 'raffle',
    quantity: tickets.length,
    unitPrice: '10.00',
    totalPrice: '10.00',
    raffleTicketNumbers: tickets,
  } as any).returning();
  return { order, item };
}

type Resp = { status: number; body: any };
async function post(path: string, body: any, role?: string): Promise<Resp> {
  const res = await fetch(`${baseUrl}/api/shop${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function getBonusRows(productId: string) {
  return db.select().from(shopRaffleBonusTickets)
    .where(eq(shopRaffleBonusTickets.productId, productId));
}

test('parallel claim-share requests grant exactly one share bonus', async () => {
  const product = await makeRaffle('share');
  const { order } = await makePaidOrder(product.id, ['000001', '000002'], 'share');

  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      post(`/orders/${order.orderNumber}/claim-share-bonus`, { accessToken: order.accessToken })
    )
  );

  const granted = results.filter((r) => r.status === 201);
  const already = results.filter((r) => r.status === 200 && r.body.alreadyClaimed);
  assert.equal(granted.length, 1, `expected exactly one 201, got ${granted.length}`);
  assert.equal(already.length, 7);

  const rows = await getBonusRows(product.id);
  const shareRows = rows.filter((r) => r.actionType === 'share');
  assert.equal(shareRows.length, 1, 'exactly one share bonus row in DB');
  assert.equal(shareRows[0].ticketNumbers.length, 1);
  // Bonus ticket number must not collide with the sold tickets
  assert.ok(!['000001', '000002'].includes(shareRows[0].ticketNumbers[0]));
});

test('parallel referrals with distinct emails never exceed the cap; ticket numbers unique', async () => {
  const cap = 3;
  const product = await makeRaffle('refer', cap);
  const { order } = await makePaidOrder(product.id, ['000001'], 'refer');

  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      post(`/orders/${order.orderNumber}/refer`, {
        accessToken: order.accessToken,
        friendEmail: `friend${i}-${RUN_ID}@example.com`,
      })
    )
  );

  const granted = results.filter((r) => r.status === 201);
  const capped = results.filter(
    (r) => r.status === 400 && /maximum of \d+ referrals/.test(r.body.error || '')
  );
  assert.equal(granted.length, cap, `expected exactly ${cap} grants, got ${granted.length}`);
  assert.equal(capped.length, 8 - cap);

  const rows = await getBonusRows(product.id);
  assert.equal(rows.length, cap, 'exactly cap referral rows in DB');
  const allNumbers = rows.flatMap((r) => r.ticketNumbers).concat(['000001']);
  assert.equal(new Set(allNumbers).size, allNumbers.length, 'no duplicate ticket numbers');
});

test('parallel referrals for the same email grant exactly once', async () => {
  const product = await makeRaffle('dupemail', 5);
  const { order } = await makePaidOrder(product.id, ['000001'], 'dupemail');

  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      post(`/orders/${order.orderNumber}/refer`, {
        accessToken: order.accessToken,
        friendEmail: `samefriend-${RUN_ID}@example.com`,
      })
    )
  );

  const granted = results.filter((r) => r.status === 201);
  const dupes = results.filter(
    (r) => r.status === 400 && /already referred/.test(r.body.error || '')
  );
  assert.equal(granted.length, 1);
  assert.equal(dupes.length, 5);
  assert.equal((await getBonusRows(product.id)).length, 1);
});

test('bonus grant racing the admin draw either lands in the pool or is rejected', async () => {
  const product = await makeRaffle('race');
  const { order } = await makePaidOrder(product.id, ['000001', '000002'], 'race');

  const [referResult, drawResult] = await Promise.all([
    post(`/orders/${order.orderNumber}/refer`, {
      accessToken: order.accessToken,
      friendEmail: `race-friend-${RUN_ID}@example.com`,
    }),
    post(`/admin/raffles/${product.id}/draw`, {}, 'admin'),
  ]);

  assert.equal(drawResult.status, 200, `draw failed: ${JSON.stringify(drawResult.body)}`);
  assert.ok(drawResult.body.drawing?.winningTicketNumber);

  const bonusRows = await getBonusRows(product.id);
  if (referResult.status === 201) {
    // Grant won the lock: it must be in the DB AND counted in the draw pool.
    assert.equal(bonusRows.length, 1);
    assert.equal(drawResult.body.totalTickets, 2 + 1, 'draw pool must include the bonus ticket');
  } else {
    // Draw won the lock: grant must be rejected explicitly, no row written.
    assert.equal(referResult.status, 400, JSON.stringify(referResult.body));
    assert.match(referResult.body.error || '', /already been drawn/i);
    assert.equal(bonusRows.length, 0, 'no bonus ticket may land after the draw');
    assert.equal(drawResult.body.totalTickets, 2);
  }

  // A grant attempted strictly after the draw is always rejected.
  const late = await post(`/orders/${order.orderNumber}/claim-share-bonus`, {
    accessToken: order.accessToken,
  });
  assert.equal(late.status, 400);
  assert.match(late.body.error || '', /already been drawn/i);
});

test('two concurrent draws: exactly one succeeds, one drawn record', async () => {
  const product = await makeRaffle('dualdraw');
  await makePaidOrder(product.id, ['000001', '000002', '000003'], 'dualdraw');

  const results = await Promise.all([
    post(`/admin/raffles/${product.id}/draw`, {}, 'admin'),
    post(`/admin/raffles/${product.id}/draw`, {}, 'admin'),
  ]);

  const ok = results.filter((r) => r.status === 200);
  const rejected = results.filter(
    (r) => r.status === 400 && /already been drawn/i.test(r.body.error || '')
  );
  assert.equal(ok.length, 1, `expected exactly one successful draw: ${JSON.stringify(results.map(r => r.status))}`);
  assert.equal(rejected.length, 1);

  const drawn = await db.select().from(shopRaffleDrawings).where(and(
    eq(shopRaffleDrawings.productId, product.id),
    eq(shopRaffleDrawings.status, 'drawn')
  ));
  assert.equal(drawn.length, 1, 'exactly one drawn record (partial unique index)');
});

test('wrong or missing access token is rejected; no bonus rows written', async () => {
  const product = await makeRaffle('token');
  const { order } = await makePaidOrder(product.id, ['000001'], 'token');

  const wrongShare = await post(`/orders/${order.orderNumber}/claim-share-bonus`, {
    accessToken: crypto.randomUUID(),
  });
  assert.equal(wrongShare.status, 403);

  const wrongRefer = await post(`/orders/${order.orderNumber}/refer`, {
    accessToken: crypto.randomUUID(),
    friendEmail: `x-${RUN_ID}@example.com`,
  });
  assert.equal(wrongRefer.status, 403);

  const missing = await post(`/orders/${order.orderNumber}/claim-share-bonus`, {});
  assert.equal(missing.status, 400);

  const shortToken = await post(`/orders/${order.orderNumber}/refer`, {
    accessToken: 'short',
    friendEmail: `y-${RUN_ID}@example.com`,
  });
  assert.equal(shortToken.status, 400);

  assert.equal((await getBonusRows(product.id)).length, 0);
});

test('public order GET never leaks accessToken or unmasked email', async () => {
  const product = await makeRaffle('leak');
  const { order } = await makePaidOrder(product.id, ['000001'], 'leak');

  const res = await fetch(`${baseUrl}/api/shop/orders/${order.orderNumber}`);
  assert.equal(res.status, 200);
  const body = await res.json();

  const raw = JSON.stringify(body);
  assert.ok(!raw.includes(order.accessToken), 'accessToken must never appear in the public order payload');
  assert.equal(body.order.accessToken, undefined);
  assert.ok(!raw.includes('buyer@example.com'), 'unmasked email must never appear');
  assert.equal(body.order.customerEmail, 'b***@example.com');
  assert.equal(body.order.customerPhone, null);
});
