import test from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableColumns } from "drizzle-orm";
import { fundraiserOrders } from "../shared/schema";
import { createFundraiserOrderReader, createFundraiserOrdersHandler, type FundraiserOrderReader } from "../server/routes/fundraiserOrders";
import type { TestContext } from "node:test";
import type { AddressInfo } from "node:net";

const EVENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fixtureReader() {
  const events = [
    { id: EVENT_A, tenantId: "rescue-a" },
    { id: EVENT_B, tenantId: "rescue-b" },
  ];
  const orders = [
    { id: "later", eventId: EVENT_A, paymentStatus: "paid", createdAt: 2, customerEmail: "later@example.test" },
    { id: "foreign", eventId: EVENT_B, paymentStatus: "paid", createdAt: 1, customerEmail: "private@example.test" },
    { id: "pending", eventId: EVENT_A, paymentStatus: "pending", createdAt: 0 },
    { id: "earlier", eventId: EVENT_A, paymentStatus: "paid", createdAt: 1, customerEmail: "earlier@example.test" },
    { id: "refunded", eventId: EVENT_A, paymentStatus: "refunded", createdAt: 3 },
  ];
  // Exercise the real query builder; replace only the PostgreSQL transport.
  // Assert the SQL contract before interpreting its parameters for fixtures.
  const db = drizzle({
    async query(query: { text: string }, params: unknown[]) {
      assert.match(query.text, /where \("fundraiser_orders"\."event_id" = \$1 and "fundraiser_orders"\."payment_status" = \$2 and "fundraiser_orders"\."event_id" in \(select "id" from "fundraiser_events" where "fundraiser_events"\."tenant_id" = \$3\)\) order by "fundraiser_orders"\."created_at"$/);
      assert.equal(params[1], "paid");
      const rows = orders.filter(order =>
        order.eventId === params[0] && order.paymentStatus === params[1] &&
        events.some(event => event.id === order.eventId && event.tenantId === params[2])
      ).sort((a, b) => a.createdAt - b.createdAt);
      return { rows: rows.map(row => Object.keys(getTableColumns(fundraiserOrders)).map(key =>
        key === "createdAt" ? new Date(row.createdAt).toISOString() : (row as any)[key] ?? null
      ).concat(row.id === "earlier" ? "sent" : null)) };
    },
  } as any);
  return createFundraiserOrderReader(db);
}

const eventA = EVENT_A;
const eventB = EVENT_B;
async function server(t: TestContext, reader: FundraiserOrderReader = fixtureReader()) {
  const app = express();
  app.use(express.json());
  // Supply resolved context only; authentication/permission coverage is separate.
  app.use((req, _res, next) => {
    req.tenant = { id: req.get("x-test-tenant") || "rescue-a" } as any;
    // A test-only seam retains non-HTTP query shapes from the original suite.
    if (req.body && Object.hasOwn(req.body, "eventId")) req.query.eventId = req.body.eventId;
    next();
  });
  const handler = createFundraiserOrdersHandler(reader);
  app.get("/api/fundraiser-orders", handler);
  app.post("/api/fundraiser-orders", handler);
  app.use(((error, _req, res, _next) => {
    t.diagnostic(error.message);
    res.status(500).json({ error: "Internal server error" });
  }) as ErrorRequestHandler);
  const listener = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => listener.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) =>
    listener.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/api/fundraiser-orders`;
  const raw = async (query: string, tenantId = "rescue-a", body?: unknown) => {
    const response = await fetch(`${url}?${query}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-test-tenant": tenantId, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify({ eventId: body }),
    });
    return { status: response.status, payload: await response.json() as any };
  };
  const request = (eventId?: unknown, tenantId = "rescue-a") =>
    typeof eventId === "string" || eventId === undefined
      ? raw(eventId === undefined ? "" : `eventId=${encodeURIComponent(eventId)}`, tenantId)
      : raw("", tenantId, eventId);
  return Object.assign(request, { raw });
}

test("staff order lists retain paid-only filtering, flat shape and chronological sorting", async t => {
  const response = await (await server(t))(EVENT_A);
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.orders.map((o: any) => o.id), ["earlier", "later"]);
  assert.equal(response.payload.orders[0].customerEmail, "earlier@example.test");
  assert.equal(response.payload.orders[0].confirmationStatus, "sent");
  assert.equal(response.payload.orders[1].confirmationStatus, "untracked");
});

test("staff cannot read another rescue's customers by supplying its event ID", async t => {
  const request = await server(t);
  assert.deepEqual(await request(EVENT_B), { status: 200, payload: { orders: [] } });
  assert.deepEqual(await request(EVENT_A, "rescue-b"), { status: 200, payload: { orders: [] } });
  assert.deepEqual((await request(EVENT_B, "rescue-b")).payload.orders.map((o: any) => o.id), ["foreign"]);
});

test("unknown events disclose nothing and missing event IDs retain the validation error", async t => {
  const request = await server(t);
  assert.deepEqual(await request(randomUUID()), { status: 200, payload: { orders: [] } });
  assert.deepEqual(await request(randomUUID().toUpperCase()), { status: 200, payload: { orders: [] } });
  assert.deepEqual(await request(), { status: 400, payload: { error: "eventId query param required" } });
  assert.deepEqual(await request(""), { status: 400, payload: { error: "eventId query param required" } });
});

test("malformed UUIDs and non-scalar values return only a safe client error without querying the database", async t => {
  let calls = 0;
  const request = await server(t, { listPaidOrders: async () => { calls++; return []; } });
  for (const value of [
    "not-a-uuid", "123", " ", `${EVENT_A}x`, EVENT_A.slice(0, -1),
    EVENT_A.replace(/a/g, "g"), ` ${EVENT_A}`, `${EVENT_A}\n`,
    `${EVENT_A},${EVENT_B}`, "' OR 1=1 --",
    [EVENT_A, EVENT_B], [EVENT_A, EVENT_A], [EVENT_A], [],
    { id: EVENT_A }, { nested: { id: EVENT_A } }, {}, null, 123,
  ]) {
    assert.deepEqual(await request(value), {
      status: 400, payload: { error: "eventId must be a single valid UUID" },
    });
  }
  assert.equal(calls, 0, "Invalid eventId must not reach the database");
});

test("Express repeated and object-shaped query parameters are rejected before database access", async t => {
  let calls = 0;
  const request = await server(t, { listPaidOrders: async () => { calls++; return []; } });
    for (const query of [
      `eventId=${EVENT_A}&eventId=${EVENT_B}`,
      `eventId=${EVENT_A}&eventId=${EVENT_A}`,
      `eventId[]=${EVENT_A}`, `eventId[id]=${EVENT_A}`,
      `eventId[nested][id]=${EVENT_A}`, "eventId=not-a-uuid",
    ]) {
      const response = await request.raw(query);
      assert.equal(response.status, 400);
      assert.deepEqual(response.payload, { error: "eventId must be a single valid UUID" });
    }
  assert.equal(calls, 0, "Malformed query must not reach the database");
});

// Run against a development/test PostgreSQL database:
// RUN_FUNDRAISER_DB_TEST=1 npx tsx --test tests/fundraiser-order-privacy.test.ts
// Use a dedicated client, not server/db (which starts a global pool/prewarming).
test("PostgreSQL subquery isolates paid fundraiser customers between rescues", {
  skip: process.env.RUN_FUNDRAISER_DB_TEST !== "1",
}, async t => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required when RUN_FUNDRAISER_DB_TEST=1");
  assert.notEqual(process.env.REPLIT_DEPLOYMENT, "1", "Never run fixtures in a deployment");
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { inArray } = await import("drizzle-orm");
  const schema = await import("../shared/schema");
  const { tenants, fundraiserEvents, fundraiserOrders } = schema;
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });
  const rescueIds = [randomUUID(), randomUUID()];
  const eventIds = [randomUUID(), randomUUID()];
  // Explicit negative numbers avoid advancing the non-transactional order sequence.
  const firstOrderNumber = -randomInt(100000, 2000000000);
  const fixtures = eventIds.flatMap((eventId, rescueIndex) =>
    (["paid", "pending", "paid"] as const).map((paymentStatus, index) => ({
      id: randomUUID(),
      orderNumber: firstOrderNumber - rescueIndex * 3 - index,
      eventId,
      customerName: `Fixture customer ${rescueIndex}-${index}`,
      customerEmail: `customer-${rescueIndex}-${index}@example.test`,
      customerPhone: "+12025550100",
      paymentStatus,
      // Deliberately insert the later paid order before the earlier paid order.
      createdAt: new Date(Date.UTC(2026, 0, 3 - index)),
    })),
  );
  try {
    await client.connect();
    const db = drizzle(client);
    await client.query("BEGIN");
    try {
      await db.insert(tenants).values(rescueIds.map(id => ({
        id, name: "Fundraiser privacy fixture", subdomain: `privacy-${id}`,
      })));
      await db.insert(fundraiserEvents).values(eventIds.map((id, index) => ({
        id, tenantId: rescueIds[index], title: "Privacy fixture", priceCents: 1000,
      })));
      await db.insert(fundraiserOrders).values(fixtures);
      const request = await server(t, createFundraiserOrderReader(db));
      for (const [index, tenantId] of rescueIds.entries()) {
        const own = await request(eventIds[index], tenantId);
        assert.equal(own.status, 200);
        const expected = [fixtures[index * 3 + 2], fixtures[index * 3]];
        assert.deepEqual(own.payload.orders.map((order: any) => order.id), expected.map(order => order.id));
        assert.deepEqual(own.payload.orders.map((order: any) => order.customerEmail), expected.map(order => order.customerEmail));
        assert.ok(own.payload.orders.every((order: any) => order.paymentStatus === "paid"));
        assert.deepEqual(await request(eventIds[1 - index], tenantId), {
          status: 200, payload: { orders: [] },
        }, "foreign events must disclose no customer records in either direction");
        assert.deepEqual(await request(randomUUID(), tenantId), { status: 200, payload: { orders: [] } });
        assert.deepEqual(await request(undefined, tenantId), {
          status: 400, payload: { error: "eventId query param required" },
        });
      }
    } finally {
      // Runs on insertion errors and assertion failures too; nothing is committed.
      await client.query("ROLLBACK");
    }
    assert.deepEqual(await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.id, rescueIds)), []);
    assert.deepEqual(await db.select({ id: fundraiserEvents.id }).from(fundraiserEvents).where(inArray(fundraiserEvents.id, eventIds)), []);
    assert.deepEqual(await db.select({ id: fundraiserOrders.id }).from(fundraiserOrders).where(inArray(fundraiserOrders.id, fixtures.map(order => order.id))), []);
  } finally {
    await client.end();
  }
});

for (const query of [
  "",
  "eventId=",
  "eventId=not-a-uuid",
  `eventId=${eventA.slice(0, -1)}`,
  `eventId=%20${eventA}`,
  `eventId=${eventA}&eventId=${eventB}`,
  `eventId=${eventA}&eventId=${eventA}`,
  `eventId[]=${eventA}`,
  `eventId[0]=${eventA}`,
  `eventId[id]=${eventA}`,
  `eventId[nested][id]=${eventA}`,
  `eventId=${eventA}&eventId[id]=${eventB}`,
]) {
  test(`malformed query is rejected without database access: ${query || "(missing)"}`, async t => {
    let calls = 0;
    const request = await server(t, { listPaidOrders: async () => { calls++; return []; } });
    const response = await request.raw(query);
    assert.equal(response.status, 400);
    assert.deepEqual(response.payload, {
      error: query === "" || query === "eventId="
        ? "eventId query param required"
        : "eventId must be a single valid UUID",
    });
    assert.equal(calls, 0);
  });
}
