import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { z } from "zod";
import { insertFundraiserEventSchema } from "../shared/schema";
import { randomInt, randomUUID } from "node:crypto";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNKNOWN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const routes = readFileSync("server/routes.ts", "utf8");
type Method = "post" | "patch" | "delete";
type Row = Record<string, any>;
type Predicate = (row: Row) => boolean;

// Execute the actual route registration, replacing only its schema/DB boundaries.
function harness(method: Method) {
  const rows: Row[] = [
    { id: ID, tenantId: "own", title: "Original", isActive: true },
    { id: FOREIGN, tenantId: "other", title: "Foreign", isActive: true },
  ];
  let accesses = 0;
  const schema = {
    fundraiserEvents: { id: "id", tenantId: "tenantId", isActive: "isActive" },
    fundraiserOrders: { id: "id", eventId: "eventId", paymentStatus: "paymentStatus", quantity: "quantity" },
    insertFundraiserEventSchema,
  };
  const db = {
    insert(table: unknown) {
      accesses++;
      assert.equal(table, schema.fundraiserEvents);
      return { values: (data: Row) => ({ returning: async () => {
        const event = { ...data, id: UNKNOWN };
        rows.push(event);
        return [event];
      } }) };
    },
    update(table: unknown) {
      accesses++;
      assert.equal(table, schema.fundraiserEvents);
      return { set: (updates: Row) => ({ where: (predicate: Predicate) => {
        const matched = rows.filter(predicate);
        matched.forEach(row => Object.assign(row, updates));
        return { returning: async () => matched };
      } }) };
    },
  };
  const request = registerHandler(method, db, schema,
    (key: string, value: unknown): Predicate => row =>
      key === "id" ? row[key] === String(value).toLowerCase() : row[key] === value,
    (...predicates: Predicate[]): Predicate => row => predicates.every(p => p(row)),
  );
  return { rows, db, schema, accesses: () => accesses, request };
}

// Run public handlers in full, with a closed import boundary: never load Stripe
// or application configuration (and therefore never use real payment credentials).
function registerPublicHandler(method: "get" | "post", db: any, schema: any, eq: any, and: any, sql: any) {
  const path = `/api/fundraiser-events/:id/${method === "get" ? "public" : "checkout"}`;
  const start = routes.indexOf(`  app.${method}('${path}'`);
  assert.ok(start >= 0);
  const source = routes.slice(start, routes.indexOf("\n  });", start) + 6);
  const compiled = transformSync(source.replaceAll("import(", "loadModule("), { loader: "ts" }).code;
  let handler: any;
  let paymentClients = 0;
  const sessions: Row[] = [];
  const tenantGuard = Symbol("tenant");
  const app = { [method]: (registeredPath: string, ...args: any[]) => {
    assert.equal(registeredPath, path);
    assert.deepEqual(args.slice(0, -1), [tenantGuard]);
    handler = args.at(-1);
  } };
  class FakeStripe {
    constructor() { paymentClients++; }
    checkout = { sessions: { create: async (params: Row) => {
      sessions.push(params);
      return { id: "cs_fixture", url: "https://checkout.example.test/fixture" };
    } } };
  }
  const platform = {
    getPlatformStripeSecretKey: () => "fixture-only",
    calculatePlatformFee: () => 0,
    calculateDestinationChargeEconomics: () => ({ applicationFeeTotalCents: 0 }),
    getDestinationChargeEconomicsMetadata: () => ({}),
    calculateDonorCoversFees: () => { throw new Error("Fee coverage is not part of this fixture"); },
  };
  const loadModule = async (name: string) => {
    if (name === "@shared/schema") return schema;
    if (name === "./config/platform") return platform;
    if (name === "stripe") return { default: FakeStripe };
    throw new Error(`Unexpected handler import: ${name}`);
  };
  new Function("app", "requireTenant", "db", "eq", "and", "sql", "z", "loadModule", "toStripeStatementDescriptor", compiled)(
    app, tenantGuard, db, eq, and, sql, z, loadModule, () => "FIXTURE",
  );
  return {
    sessions,
    paymentClients: () => paymentClients,
    request: async (id: string, tenantId = "own") => {
      let status = 200;
      let payload: any;
      const res = {
        status(code: number) { status = code; return res; },
        json(value: unknown) { payload = value; return res; },
      };
      await handler({
        params: { id },
        body: { customerName: "Fixture Buyer", customerEmail: "buyer@example.test", quantity: 1 },
        tenant: { id: tenantId, name: "Fixture", subdomain: "fixture", stripeConnectedAccountId: "acct_fixture" },
        protocol: "https", get: () => "example.test",
      }, res, (error: unknown) => { throw error; });
      return { status, payload };
    },
  };
}

const notFound = { status: 404, payload: { error: "Event not found" } };

for (const method of ["get", "post"] as const) {
  test(`public ${method}: soft deletion hides own events, foreign and unknown events stay hidden`, async () => {
    const h = harness("delete");
    h.rows.forEach(row => Object.assign(row, { priceCents: 1000, inventoryCap: null, passFeesToBuyer: false }));
    const orders: Row[] = [];
    let orderReads = 0;
    const eq = (key: string, value: unknown): Predicate => row => row[key] === value;
    const and = (...predicates: Predicate[]): Predicate => row => predicates.every(p => p(row));
    const db = {
      select: () => ({ from: (table: unknown) => ({ where: (predicate: Predicate) => {
        if (table === h.schema.fundraiserEvents) {
          return { limit: async (count: number) => h.rows.filter(predicate).slice(0, count) };
        }
        assert.equal(table, h.schema.fundraiserOrders);
        orderReads++;
        return Promise.resolve([{ soldCount: orders.filter(predicate).reduce((sum, row) => sum + row.quantity, 0) }]);
      } }) }),
      insert: (table: unknown) => {
        assert.equal(table, h.schema.fundraiserOrders);
        return { values: (values: Row) => ({ returning: async () => {
          const order = { id: randomUUID(), ...values };
          orders.push(order);
          return [order];
        } }) };
      },
      update: (table: unknown) => {
        assert.equal(table, h.schema.fundraiserOrders);
        return { set: (values: Row) => ({ where: async (predicate: Predicate) => {
          orders.filter(predicate).forEach(row => Object.assign(row, values));
        } }) };
      },
    };
    const publicRoute = registerPublicHandler(method, db, h.schema, eq, and, () => "sum");
    for (const id of [FOREIGN, UNKNOWN]) {
      assert.deepEqual(await publicRoute.request(id), notFound);
    }
    assert.equal(orders.length, 0);
    assert.equal(orderReads, 0);
    assert.equal(publicRoute.paymentClients(), 0);
    assert.equal(publicRoute.sessions.length, 0);

    const active = await publicRoute.request(ID);
    assert.equal(active.status, 200);
    if (method === "get") {
      assert.deepEqual(active.payload, { event: { ...h.rows[0], soldCount: 0 } });
      assert.equal(orders.length, 0);
    } else {
      assert.deepEqual(active.payload, { url: "https://checkout.example.test/fixture" });
      assert.equal(orders.length, 1);
      assert.equal(orders[0].eventId, ID);
      assert.equal(orders[0].stripeSessionId, "cs_fixture");
      assert.equal(publicRoute.sessions.length, 1);
      assert.equal(publicRoute.sessions[0].metadata.fundraiser_event_id, ID);
    }
    const before = structuredClone(orders);
    const readsBefore = orderReads;
    const clientsBefore = publicRoute.paymentClients();
    const sessionsBefore = publicRoute.sessions.length;
    assert.deepEqual(await h.request(ID), { status: 200, payload: { success: true } });
    assert.equal(h.rows[0].isActive, false);
    assert.equal(h.rows[1].isActive, true);
    for (const id of [ID, FOREIGN, UNKNOWN]) {
      assert.deepEqual(await publicRoute.request(id), notFound);
    }
    assert.deepEqual(orders, before, "Rejected checkouts must not create or update orders");
    assert.equal(orderReads, readsBefore, "Hidden events must not expose order totals");
    assert.equal(publicRoute.paymentClients(), clientsBefore);
    assert.equal(publicRoute.sessions.length, sessionsBefore);
  });
}

// Both suites execute the actual handler and verify its authorization guards.
function registerHandler(method: Method, db: any, schema: any, eq: any, and: any) {
  const path = method === "post" ? "/api/fundraiser-events" : "/api/fundraiser-events/:id";
  const start = routes.indexOf(`  app.${method}('${path}'`);
  assert.ok(start >= 0);
  const source = routes.slice(start, routes.indexOf("\n  });", start) + 6);
  const compiled = transformSync(source.replace("await import('@shared/schema')", "schema"), { loader: "ts" }).code;
  let handler: any;
  const guards = [Symbol("tenant"), Symbol("auth"), Symbol("role")];
  const app = { [method]: (registeredPath: string, ...args: any[]) => {
    assert.equal(registeredPath, path);
    assert.deepEqual(args.slice(0, -1), guards, "Authorization must precede validation");
    handler = args.at(-1);
  } };
  new Function("app", "requireTenant", "requireAuth", "requireRoleOrPageAccess", "db", "schema", "eq", "and", "z", compiled)(
    app, guards[0], guards[1], (...args: string[]) => {
      assert.deepEqual(args, ["fundraiser-events", "admin", "owner"]);
      return guards[2];
    }, db, schema, eq, and, z,
  );
  return async (id: unknown, body: Row = { title: "Updated" }, tenantId = "own") => {
      let status = 200;
      let payload: unknown;
      const res = {
        status(code: number) { status = code; return res; },
        json(value: unknown) { payload = value; return res; },
      };
      await handler({ params: { id }, body, tenant: { id: tenantId } }, res,
        (error: unknown) => { throw error; });
      return { status, payload };
  };
}

for (const method of ["patch", "delete"] as const) {
  test(`${method}: malformed IDs return safe 400 without database access or writes`, async () => {
    const h = harness(method);
    const original = structuredClone(h.rows);
    for (const id of [
      "", "123", "not-a-uuid", " ", ID.slice(0, -1), `${ID}a`,
      ID.replace(/a/g, "g"), ID.replaceAll("-", ""), ` ${ID}`,
      `${ID}\n`, `${ID}\r\n`, `${ID},${FOREIGN}`, "' OR 1=1 --",
      undefined, null, 123, [ID], { id: ID },
    ]) {
      assert.deepEqual(await h.request(id), {
        status: 400,
        payload: { error: "Invalid event ID", message: "The provided event ID is not valid." },
      });
    }
    assert.equal(h.accesses(), 0);
    assert.deepEqual(h.rows, original);
  });

  test(`${method}: valid unknown and foreign IDs preserve existing behavior without changing rows`, async () => {
    const h = harness(method);
    const original = structuredClone(h.rows);
    for (const id of [UNKNOWN, FOREIGN]) {
      assert.deepEqual(await h.request(id), method === "patch"
        ? { status: 404, payload: { error: "Not found" } }
        : { status: 200, payload: { success: true } });
    }
    assert.equal(h.accesses(), 2);
    assert.deepEqual(h.rows, original);
  });

  test(`${method}: normal and uppercase UUIDs retain tenant-scoped edits and soft deletes`, async () => {
    for (const id of [ID, ID.toUpperCase()]) {
      const h = harness(method);
      const foreign = structuredClone(h.rows[1]);
      const response = await h.request(id, { title: "Updated", tenantId: "other", id: FOREIGN });
      assert.equal(response.status, 200);
      assert.equal(h.accesses(), 1);
      assert.deepEqual(h.rows[1], foreign);
      assert.equal(h.rows[0].id, ID);
      assert.equal(h.rows[0].tenantId, "own");
      assert.equal(h.rows.length, 2);
      assert.equal(h.rows[0].title, method === "patch" ? "Updated" : "Original");
      assert.equal(h.rows[0].isActive, method === "patch");
      assert.deepEqual(response.payload, method === "patch" ? { event: h.rows[0] } : { success: true });
    }
  });

}

// Development/test PostgreSQL only; never import server/db or commit fixtures.
// RUN_FUNDRAISER_DB_TEST=1 npx tsx --test tests/fundraiser-event-management.test.ts
test("PostgreSQL fundraiser edits and soft deletes stay tenant-scoped", {
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
  const tenantIds = [randomUUID(), randomUUID()];
  // Guarantee a letter so uppercase inputs always exercise UUID case handling.
  const eventIds = tenantIds.map(() => `a${randomUUID().slice(1)}`);
  const unknownId = `c${randomUUID().slice(1)}`;
  // Customer details live on orders. Explicit numbers leave the sequence untouched.
  const firstOrderNumber = -randomInt(100000, 2000000000);
  const orders = eventIds.flatMap((eventId, index) =>
    (["paid", "pending"] as const).map((paymentStatus, offset) => ({
      id: randomUUID(), eventId, paymentStatus,
      orderNumber: firstOrderNumber - index * 2 - offset,
      customerName: `Management fixture ${index}-${offset}`,
      customerEmail: `management-${index}-${offset}@example.test`,
      customerPhone: "+12025550100",
      quantity: offset + 1, pickupTime: "12:00", pickedUp: offset === 0,
    })),
  );
  try {
    await client.connect();
    const db = drizzle(client);
    const readEvents = () => db.select().from(fundraiserEvents)
      .where(inArray(fundraiserEvents.id, eventIds)).orderBy(fundraiserEvents.id);
    const readOrders = () => db.select().from(fundraiserOrders)
      .where(inArray(fundraiserOrders.eventId, eventIds)).orderBy(fundraiserOrders.id);
    await client.query("BEGIN");
    try {
      await db.insert(tenants).values(tenantIds.map(id => ({
        id, name: "Fundraiser management fixture", subdomain: `management-${id}`,
      })));
      await db.insert(fundraiserEvents).values(eventIds.map((id, index) => ({
        id, tenantId: tenantIds[index], title: "Original", priceCents: 1000, isActive: true,
      })));
      await db.insert(fundraiserOrders).values(orders);
      const originalOrders = await readOrders();
      assert.equal(originalOrders.length, orders.length);
      const patch = registerHandler("patch", db, schema, eq, and);
      const remove = registerHandler("delete", db, schema, eq, and);
      for (const [index, tenantId] of tenantIds.entries()) {
        const ownId = eventIds[index];
        const foreignId = eventIds[1 - index];
        for (const uppercase of [false, true]) {
          const input = (id: string) => uppercase ? id.toUpperCase() : id;
          const before = await readEvents();
          for (const id of [foreignId, unknownId]) {
            assert.deepEqual(await patch(input(id), { title: "Must not change" }, tenantId), {
              status: 404, payload: { error: "Not found" },
            });
            assert.deepEqual(await remove(input(id), {}, tenantId), {
              status: 200, payload: { success: true },
            });
            assert.deepEqual(await readEvents(), before, "Foreign and unknown IDs must not mutate either event");
          }
          const title = `Updated ${index} ${uppercase}`;
          const response = await patch(input(ownId), {
            title, isActive: true, id: foreignId, tenantId: tenantIds[1 - index],
          }, tenantId);
          assert.equal(response.status, 200);
          const afterPatch = await readEvents();
          const own = afterPatch.find(row => row.id === ownId)!;
          assert.deepEqual(own, { ...before.find(row => row.id === ownId), title, isActive: true });
          assert.deepEqual(response.payload, { event: own });
          assert.deepEqual(afterPatch.find(row => row.id === foreignId), before.find(row => row.id === foreignId));

          assert.deepEqual(await remove(input(ownId), {}, tenantId), {
            status: 200, payload: { success: true },
          });
          const afterDelete = await readEvents();
          assert.deepEqual(afterDelete, afterPatch.map(row =>
            row.id === ownId ? { ...row, isActive: false } : row),
          "Soft deletion must retain the row and change only its active flag");
          assert.deepEqual(await readOrders(), originalOrders,
            "Closing an event must preserve every paid and pending order, including all customer and pickup details");
        }
      }
    } finally {
      // Also rolls back failed fixture inserts and failed assertions.
      await client.query("ROLLBACK");
    }
    assert.deepEqual(await readEvents(), [], "Event fixtures must not survive rollback");
    assert.deepEqual(await readOrders(), [], "Order and customer fixtures must not survive rollback");
    assert.deepEqual(await db.select({ id: tenants.id }).from(tenants)
      .where(inArray(tenants.id, tenantIds)), [], "Tenant fixtures must not survive rollback");
  } finally {
    await client.end();
  }
});

// Separate fixtures keep order preservation assertions independent of checkout's
// intentional creation of new pending orders.
test("PostgreSQL fundraiser management and public availability stay active-only and tenant-scoped", {
  skip: process.env.RUN_FUNDRAISER_DB_TEST !== "1",
}, async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required when RUN_FUNDRAISER_DB_TEST=1");
  assert.notEqual(process.env.REPLIT_DEPLOYMENT, "1", "Never run fixtures in a deployment");
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { eq, and, inArray, sql } = await import("drizzle-orm");
  const schema = await import("../shared/schema");
  const { tenants, fundraiserEvents, fundraiserOrders } = schema;
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });
  const tenantIds = [randomUUID(), randomUUID()];
  // Guarantee a letter so uppercase inputs always exercise UUID case handling.
  const eventIds = tenantIds.map(() => `a${randomUUID().slice(1)}`);
  const unknownId = `c${randomUUID().slice(1)}`;
  try {
    await client.connect();
    const db = drizzle(client);
    const readEvents = () => db.select().from(fundraiserEvents)
      .where(inArray(fundraiserEvents.id, eventIds)).orderBy(fundraiserEvents.id);
    const readOrders = () => db.select().from(fundraiserOrders)
      .where(inArray(fundraiserOrders.eventId, eventIds)).orderBy(fundraiserOrders.id);
    await client.query("BEGIN");
    try {
      await db.insert(tenants).values(tenantIds.map(id => ({
        id, name: "Fundraiser management fixture", subdomain: `management-${id}`,
      })));
      await db.insert(fundraiserEvents).values(eventIds.map((id, index) => ({
        id, tenantId: tenantIds[index], title: "Original", priceCents: 1000, isActive: true,
      })));
      const patch = registerHandler("patch", db, schema, eq, and);
      const remove = registerHandler("delete", db, schema, eq, and);
      const detail = registerPublicHandler("get", db, schema, eq, and, sql);
      const checkout = registerPublicHandler("post", db, schema, eq, and, sql);
      const assertHidden = async (ids: string[], tenantId: string) => {
        const before = await readOrders();
        const clientsBefore = checkout.paymentClients();
        const sessionsBefore = checkout.sessions.length;
        for (const id of ids) {
          assert.deepEqual(await detail.request(id, tenantId), notFound);
          assert.deepEqual(await checkout.request(id, tenantId), notFound);
        }
        assert.deepEqual(await readOrders(), before, "Hidden events must not create or update orders");
        assert.equal(checkout.paymentClients(), clientsBefore);
        assert.equal(checkout.sessions.length, sessionsBefore);
      };
      for (const [index, tenantId] of tenantIds.entries()) {
        const ownId = eventIds[index];
        const foreignId = eventIds[1 - index];
        for (const uppercase of [false, true]) {
          const input = (id: string) => uppercase ? id.toUpperCase() : id;
          const before = await readEvents();
          await assertHidden([input(foreignId), input(unknownId)], tenantId);
          for (const id of [foreignId, unknownId]) {
            assert.deepEqual(await patch(input(id), { title: "Must not change" }, tenantId), {
              status: 404, payload: { error: "Not found" },
            });
            assert.deepEqual(await remove(input(id), {}, tenantId), {
              status: 200, payload: { success: true },
            });
            assert.deepEqual(await readEvents(), before, "Foreign and unknown IDs must not mutate either event");
          }
          const title = `Updated ${index} ${uppercase}`;
          const response = await patch(input(ownId), {
            title, isActive: true, id: foreignId, tenantId: tenantIds[1 - index],
          }, tenantId);
          assert.equal(response.status, 200);
          const afterPatch = await readEvents();
          const own = afterPatch.find(row => row.id === ownId)!;
          assert.deepEqual(own, { ...before.find(row => row.id === ownId), title, isActive: true });
          assert.deepEqual(response.payload, { event: own });
          assert.deepEqual(afterPatch.find(row => row.id === foreignId), before.find(row => row.id === foreignId));

          assert.deepEqual(await detail.request(input(ownId), tenantId), {
            status: 200, payload: { event: { ...own, soldCount: 0 } },
          });
          const beforeCheckout = await readOrders();
          const sessionsBefore = checkout.sessions.length;
          assert.deepEqual(await checkout.request(input(ownId), tenantId), {
            status: 200, payload: { url: "https://checkout.example.test/fixture" },
          });
          const afterCheckout = await readOrders();
          assert.equal(afterCheckout.length, beforeCheckout.length + 1);
          const order = afterCheckout.find(row => !beforeCheckout.some(previous => previous.id === row.id))!;
          assert.equal(order.eventId, ownId);
          assert.equal(order.paymentStatus, "pending");
          assert.equal(order.stripeSessionId, "cs_fixture");
          assert.equal(checkout.sessions.length, sessionsBefore + 1);
          assert.equal(checkout.sessions.at(-1)!.metadata.fundraiser_order_id, order.id);

          assert.deepEqual(await remove(input(ownId), {}, tenantId), {
            status: 200, payload: { success: true },
          });
          const afterDelete = await readEvents();
          assert.deepEqual(afterDelete, afterPatch.map(row =>
            row.id === ownId ? { ...row, isActive: false } : row),
          "Soft deletion must retain the row and change only its active flag");
          await assertHidden([input(ownId), input(foreignId), input(unknownId)], tenantId);
        }
      }
    } finally {
      // Also rolls back failed fixture inserts and failed assertions.
      await client.query("ROLLBACK");
    }
    assert.deepEqual(await readEvents(), [], "Event fixtures must not survive rollback");
    assert.deepEqual(await readOrders(), [], "Order fixtures must not survive rollback");
    assert.deepEqual(await db.select({ id: tenants.id }).from(tenants)
      .where(inArray(tenants.id, tenantIds)), [], "Tenant fixtures must not survive rollback");
  } finally {
    await client.end();
  }
});

test("patch rejects invalid bodies before any database writes", async () => {
  const h = harness("patch");
  const original = structuredClone(h.rows);
  const invalidBodies: unknown[] = [
    null, [], "title", 1, true, {}, { tenantId: "other", id: FOREIGN },
  ];
  for (const field of ["priceCents", "inventoryCap"]) {
    for (const value of [-1, 0, 1.5, 2147483648, NaN, Infinity, -Infinity, "100", true, [], {}]) {
      invalidBodies.push({ title: "Must not save", [field]: value });
    }
  }
  invalidBodies.push({ priceCents: null });
  for (const field of ["title", "description", "bodyContent", "imageUrl"]) {
    for (const value of [12, false, [], {}, "bad\0text"]) {
      invalidBodies.push({ title: "Must not save", [field]: value });
    }
  }
  for (const value of [null, "", "   ", "\n\t"]) invalidBodies.push({ title: value });
  for (const field of ["passFeesToBuyer", "isActive"]) {
    for (const value of [null, "false", "true", 0, 1, [], {}]) invalidBodies.push({ [field]: value });
  }
  for (const value of [null, "", false, "invalid", 0, [], {}]) invalidBodies.push({ imageDisplayMode: value });
  for (const value of [null, "Noon", {}, [null], [1], [true], [[]], [{}], [""], [" \n"], ["Noon", "bad\0label"]]) {
    invalidBodies.push({ pickupTimes: value });
  }
  for (const body of invalidBodies) {
    assert.deepEqual(await h.request(ID, body), {
      status: 400,
      payload: {
        error: "Invalid fundraiser event update",
        message: "Provide valid values for at least one editable fundraiser event field.",
      },
    });
  }
  assert.equal(h.accesses(), 0);
  assert.deepEqual(h.rows, original);
});

test("patch accepts each editable field alone without defaults or changes to omitted fields", async () => {
  for (const body of [
    { title: "New title" }, { description: "Details" }, { description: null }, { description: "" },
    { bodyContent: "<p>Details</p>" }, { bodyContent: null }, { bodyContent: "" },
    { imageUrl: "/objects/image.png" }, { imageUrl: null }, { imageUrl: "" },
    { imageDisplayMode: "hero" }, { imageDisplayMode: "poster" },
    { priceCents: 1 }, { priceCents: 2147483647 },
    { inventoryCap: 1 }, { inventoryCap: 2147483647 }, { inventoryCap: null },
    { passFeesToBuyer: false }, { passFeesToBuyer: true },
    { isActive: false }, { isActive: true },
    { pickupTimes: [] }, { pickupTimes: ["Saturday 11 AM – noon", "After the game"] },
  ]) {
    const h = harness("patch");
    const original = structuredClone(h.rows);
    assert.equal((await h.request(ID, body)).status, 200);
    assert.equal(h.accesses(), 1);
    assert.deepEqual(h.rows, [{ ...original[0], ...body }, original[1]]);
  }
});

test("patch supports full editor payloads while ignoring protected and unknown fields", async () => {
  const h = harness("patch");
  const body = {
    title: "BBQ plates", description: null, bodyContent: "<p>Lunch</p>",
    imageUrl: null, imageDisplayMode: "poster", priceCents: 1200,
    passFeesToBuyer: false, inventoryCap: null,
    pickupTimes: ["11:00 AM – 11:30 AM"], isActive: true,
  };
  const original = structuredClone(h.rows);
  assert.equal((await h.request(ID, {
    ...body, id: FOREIGN, tenantId: "other", createdAt: "yesterday", soldCount: 99,
  })).status, 200);
  assert.deepEqual(h.rows, [{ ...original[0], ...body }, original[1]]);
});

test("post rejects invalid creation bodies with safe errors and no inserts", async () => {
  const h = harness("post");
  const original = structuredClone(h.rows);
  const valid = { title: "BBQ plates", priceCents: 1200 };
  const invalid: unknown[] = [
    undefined, null, [], "title", 1, true, {}, { title: "Missing price" }, { priceCents: 1200 },
  ];
  for (const field of ["priceCents", "inventoryCap"]) {
    for (const value of [-1, 0, 1.5, 2147483648, NaN, Infinity, -Infinity, "100", true, [], {}]) {
      invalid.push({ ...valid, [field]: value });
    }
  }
  invalid.push({ ...valid, priceCents: null });
  for (const field of ["title", "description", "bodyContent", "imageUrl"]) {
    for (const value of [12, false, [], {}, "bad\0text"]) invalid.push({ ...valid, [field]: value });
  }
  for (const value of [null, "", "   ", "\n\t"]) invalid.push({ ...valid, title: value });
  for (const field of ["passFeesToBuyer", "isActive"]) {
    for (const value of [null, "false", "true", 0, 1, [], {}]) invalid.push({ ...valid, [field]: value });
  }
  for (const value of [null, "", false, "invalid", 0, [], {}]) invalid.push({ ...valid, imageDisplayMode: value });
  for (const value of [null, "Noon", {}, [null], [1], [true], [[]], [{}], [""], [" \n"], ["Noon", "bad\0label"]]) {
    invalid.push({ ...valid, pickupTimes: value });
  }
  for (const body of invalid) {
    // Explicitly pass undefined to the handler rather than the request helper's default.
    const response = body === undefined
      ? await h.request(undefined, { title: undefined, priceCents: undefined })
      : await h.request(undefined, body as Row);
    assert.deepEqual(response, {
      status: 400,
      payload: {
        error: "Invalid fundraiser event",
        message: "Provide a title, a positive whole-number price, and valid fundraiser event details.",
      },
    });
  }
  assert.equal(h.accesses(), 0);
  assert.deepEqual(h.rows, original);
});

test("post accepts editor payloads and keeps ownership and generated fields server-controlled", async () => {
  for (const imageDisplayMode of ["hero", "poster"]) {
    for (const inventoryCap of [null, 1, 2147483647]) {
      const h = harness("post");
      const original = structuredClone(h.rows);
      const body = {
        title: "BBQ plates", description: null, bodyContent: "<p>Lunch</p>",
        imageUrl: "/objects/poster.png", imageDisplayMode, priceCents: 1200,
        passFeesToBuyer: false, inventoryCap, pickupTimes: ["Saturday noon"], isActive: true,
      };
      const response = await h.request(undefined, {
        ...body, tenantId: "other", id: FOREIGN, createdAt: "yesterday", soldCount: 99,
      });
      const event = { ...body, tenantId: "own", id: UNKNOWN };
      assert.deepEqual(response, { status: 201, payload: { event } });
      assert.equal(h.accesses(), 1);
      assert.deepEqual(h.rows, [...original, event]);
    }
  }
});

test("post preserves omitted database defaults and accepts optional clearing values", async () => {
  for (const body of [
    { title: "Tickets", priceCents: 1 },
    {
      title: "Tickets", priceCents: 2147483647, description: "", bodyContent: null,
      imageUrl: null, pickupTimes: [], inventoryCap: null, isActive: false, passFeesToBuyer: true,
    },
  ]) {
    const h = harness("post");
    const response = await h.request(undefined, body);
    assert.deepEqual(response, { status: 201, payload: { event: { ...body, tenantId: "own", id: UNKNOWN } } });
    assert.equal(h.accesses(), 1);
  }
});
