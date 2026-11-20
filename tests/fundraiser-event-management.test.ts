import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNKNOWN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const routes = readFileSync("server/routes.ts", "utf8");
type Method = "patch" | "delete";
type Row = Record<string, any>;
type Predicate = (row: Row) => boolean;

// Execute the actual route registration, replacing only its schema/DB boundaries.
function harness(method: Method) {
  const rows: Row[] = [
    { id: ID, tenantId: "own", title: "Original", isActive: true },
    { id: FOREIGN, tenantId: "other", title: "Foreign", isActive: true },
  ];
  let accesses = 0;
  const schema = { fundraiserEvents: { id: "id", tenantId: "tenantId" } };
  const db = {
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
  return { rows, accesses: () => accesses, request };
}

// Both suites execute the actual handler and verify its authorization guards.
function registerHandler(method: Method, db: any, schema: any, eq: any, and: any) {
  const start = routes.indexOf(`  app.${method}('/api/fundraiser-events/:id'`);
  assert.ok(start >= 0);
  const source = routes.slice(start, routes.indexOf("\n  });", start) + 6);
  const compiled = transformSync(source.replace("await import('@shared/schema')", "schema"), { loader: "ts" }).code;
  let handler: any;
  const guards = [Symbol("tenant"), Symbol("auth"), Symbol("role")];
  const app = { [method]: (path: string, ...args: any[]) => {
    assert.equal(path, "/api/fundraiser-events/:id");
    assert.deepEqual(args.slice(0, -1), guards, "Authorization must precede validation");
    handler = args.at(-1);
  } };
  new Function("app", "requireTenant", "requireAuth", "requireRoleOrPageAccess", "db", "schema", "eq", "and", "z", compiled)(
    app, guards[0], guards[1], (...args: string[]) => {
      assert.deepEqual(args, ["fundraiser-events", "admin", "owner"]);
      return guards[2];
    }, db, schema, eq, and,
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
  const { tenants, fundraiserEvents } = schema;
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
        }
      }
    } finally {
      // Also rolls back failed fixture inserts and failed assertions.
      await client.query("ROLLBACK");
    }
    assert.deepEqual(await readEvents(), [], "Event fixtures must not survive rollback");
    assert.deepEqual(await db.select({ id: tenants.id }).from(tenants)
      .where(inArray(tenants.id, tenantIds)), [], "Tenant fixtures must not survive rollback");
  } finally {
    await client.end();
  }
});
}

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
