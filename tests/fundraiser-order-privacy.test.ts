import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { randomInt, randomUUID } from "node:crypto";

// Execute the registered handler, substituting only database/schema boundaries.
const routes = readFileSync("server/routes.ts", "utf8");
const start = routes.indexOf("  app.get('/api/fundraiser-orders'");
assert.ok(start >= 0);
const source = routes.slice(start, routes.indexOf("\n  });", start) + 6);
const compiled = transformSync(source.replace("await import('@shared/schema')", "schema"), { loader: "ts" }).code;

function server() {
  const events = [
    { id: "event-a", tenantId: "rescue-a" },
    { id: "event-b", tenantId: "rescue-b" },
  ];
  const orders = [
    { id: "later", eventId: "event-a", paymentStatus: "paid", createdAt: 2, customerEmail: "later@example.test" },
    { id: "foreign", eventId: "event-b", paymentStatus: "paid", createdAt: 1, customerEmail: "private@example.test" },
    { id: "pending", eventId: "event-a", paymentStatus: "pending", createdAt: 0 },
    { id: "earlier", eventId: "event-a", paymentStatus: "paid", createdAt: 1, customerEmail: "earlier@example.test" },
    { id: "refunded", eventId: "event-a", paymentStatus: "refunded", createdAt: 3 },
  ];
  const schema = {
    fundraiserOrders: { eventId: "eventId", paymentStatus: "paymentStatus", createdAt: "createdAt" },
    fundraiserEvents: { id: "id", tenantId: "tenantId" },
  };
  type Predicate = (row: any) => boolean;
  const eq = (key: string, value: unknown): Predicate => row => row[key] === value;
  const and = (...predicates: Predicate[]): Predicate => row => predicates.every(p => p(row));
  const inArray = (key: string, values: { id: string }[]): Predicate => row => values.some(v => v.id === row[key]);
  const db = {
    select: () => ({ from: (table: unknown) => ({
      where: (predicate: Predicate) => table === schema.fundraiserEvents
        ? events.filter(predicate)
        : { orderBy: async (key: string) => orders.filter(predicate).sort((a: any, b: any) => a[key] - b[key]) },
    }) }),
  };
  return registerHandler(db, schema, eq, and, inArray);
}

// Both suites execute the same route body and check its registered guards.
function registerHandler(db: any, schema: any, eq: any, and: any, inArray: any) {
  let handler: any;
  const tenantGuard = Symbol("tenant");
  const authGuard = Symbol("auth");
  const roleGuard = Symbol("role");
  const app = { get: (path: string, ...args: any[]) => {
    assert.equal(path, "/api/fundraiser-orders");
    assert.deepEqual(args.slice(0, -1), [tenantGuard, authGuard, roleGuard]);
    handler = args.at(-1);
  } };
  new Function("app", "requireTenant", "requireAuth", "requireRoleOrPageAccess", "db", "schema", "eq", "and", "inArray", compiled)(
    app, tenantGuard, authGuard, (...roles: string[]) => {
      assert.deepEqual(roles, ["fundraiser-events", "admin", "owner", "board_member", "staff"]);
      return roleGuard;
    }, db, schema, eq, and, inArray,
  );
  return async (eventId?: string, tenantId = "rescue-a") => {
    let status = 200;
    let payload: any;
    const res = {
      status: (code: number) => { status = code; return res; },
      json: (value: unknown) => { payload = value; },
    };
    await handler({ query: { eventId }, tenant: { id: tenantId }, user: { roles: ["staff"] } },
      res, (error: unknown) => { throw error; });
    return { status, payload };
  };
}

test("staff order lists retain guards, paid-only filtering, flat shape and chronological sorting", async () => {
  const response = await server()("event-a");
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.orders.map((o: any) => o.id), ["earlier", "later"]);
  assert.equal(response.payload.orders[0].customerEmail, "earlier@example.test");
});

test("staff cannot read another rescue's customers by supplying its event ID", async () => {
  const request = server();
  assert.deepEqual(await request("event-b"), { status: 200, payload: { orders: [] } });
  assert.deepEqual(await request("event-a", "rescue-b"), { status: 200, payload: { orders: [] } });
  assert.deepEqual((await request("event-b", "rescue-b")).payload.orders.map((o: any) => o.id), ["foreign"]);
});

test("unknown events disclose nothing and missing event IDs retain the validation error", async () => {
  const request = server();
  assert.deepEqual(await request("unknown"), { status: 200, payload: { orders: [] } });
  assert.deepEqual(await request(), { status: 400, payload: { error: "eventId query param required" } });
});

// Run against a development/test PostgreSQL database:
// RUN_FUNDRAISER_DB_TEST=1 npx tsx --test tests/fundraiser-order-privacy.test.ts
// Use a dedicated client, not server/db (which starts a global pool/prewarming).
test("PostgreSQL subquery isolates paid fundraiser customers between rescues", {
  skip: process.env.RUN_FUNDRAISER_DB_TEST !== "1",
}, async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required when RUN_FUNDRAISER_DB_TEST=1");
  assert.notEqual(process.env.REPLIT_DEPLOYMENT, "1", "Never run fixtures in a deployment");
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { eq, and, inArray } = await import("drizzle-orm");
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
      const request = registerHandler(db, schema, eq, and, inArray);
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
