import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as operators from "drizzle-orm";
import { fundraiserOrders, fundraiserEvents } from "../shared/schema";
import { transformSync } from "esbuild";
import { z } from "zod";

// Execute the actual route and mutation callbacks with isolated storage/network
// boundaries. No production orders or external services are touched.
const routes = readFileSync("server/routes.ts", "utf8");
const start = routes.indexOf("  app.patch('/api/fundraiser-orders/:id/pickup'");
const route = routes.slice(start, routes.indexOf("\n  });", start) + 6);
const compiled = transformSync(route.replace(
  "await import('@shared/schema')", "schema",
), { loader: "ts" }).code;

function server() {
  const rows = [
    { id: "order", eventId: "event", pickedUp: false },
    { id: "foreign", eventId: "foreign-event", pickedUp: false },
  ];
  const events = [{ id: "event", tenantId: "rescue" }, { id: "foreign-event", tenantId: "other" }];
  type Predicate = (row: any) => boolean;
  const eq = (key: string, value: unknown): Predicate => row => row[key] === value;
  const and = (...predicates: Predicate[]): Predicate => row => predicates.every(p => p(row));
  const inArray = (key: string, values: { id: string }[]): Predicate => row => values.some(v => v.id === row[key]);
  let writes = 0;
  const db = {
    select: () => ({ from: () => ({ where: (p: Predicate) => events.filter(p) }) }),
    update: () => ({ set: (value: { pickedUp: boolean }) => ({
      where: (p: Predicate) => ({ returning: async () => {
        // Yield so simultaneous handlers overlap before their atomic writes.
        await Promise.resolve();
        writes++;
        return rows.filter(p).map(row => { Object.assign(row, value); return { ...row }; });
      } }),
    }) }),
  };
  const request = handlerFor(db,
    { fundraiserOrders: { id: "id", eventId: "eventId" }, fundraiserEvents: { id: "id", tenantId: "tenantId" } },
    { eq, and, inArray });
  return { request, rows, writes: () => writes };
}

function handlerFor(db: unknown, schema: unknown, { eq, and, inArray }: any) {
  let handler: any;
  const tenantGuard = Symbol("tenant");
  const authGuard = Symbol("auth");
  const roleGuard = Symbol("role");
  const app = { patch: (path: string, tenant: unknown, auth: unknown, role: unknown, callback: any) => {
    assert.equal(path, "/api/fundraiser-orders/:id/pickup");
    assert.equal(tenant, tenantGuard);
    assert.equal(auth, authGuard);
    assert.equal(role, roleGuard);
    handler = callback;
  } };
  new Function("app", "requireTenant", "requireAuth", "requireRoleOrPageAccess", "db", "schema", "eq", "and", "inArray", "z", compiled)(
    app, tenantGuard, authGuard, (...args: string[]) => {
      assert.deepEqual(args, ["fundraiser-events", "admin", "owner", "board_member", "staff"]);
      return roleGuard;
    }, db, schema,
    eq, and, inArray, z,
  );
  async function request(body: unknown, id = "order", tenantId = "rescue") {
    let status = 200;
    let payload: any;
    const res = { status: (code: number) => { status = code; return res; }, json: (value: unknown) => { payload = value; } };
    await handler({ body, params: { id }, tenant: { id: tenantId } }, res, (error: unknown) => { throw error; });
    return { status, payload };
  }
  return request;
}

// RUN_FUNDRAISER_PICKUP_DB_TEST=1 npx tsx --test tests/fundraiser-pickup.test.ts
// Requires initdb/pg_ctl on PATH. Always creates its own local PostgreSQL cluster:
// no DATABASE_URL, application database, production orders, or network listener.
test("PostgreSQL: overlapping pickup writes return intended states and enforce event ownership", {
  skip: process.env.RUN_FUNDRAISER_PICKUP_DB_TEST !== "1",
  timeout: 30000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "pickup-pg-"));
  const data = join(root, "data");
  const clients: pg.Client[] = [];
  let started = false;
  const run = (program: string, args: string[]) =>
    execFileSync(program, args, { stdio: "pipe", timeout: 15000 });
  try {
    run("initdb", ["-D", data, "-U", "pickup_test", "--auth=trust", "--no-locale"]);
    run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o",
      `-k ${root} -h '' -p 5432 -F`, "-w", "start"]);
    started = true;
    for (let i = 0; i < 2; i++) {
      const connection = new pg.Client({
        host: root, port: 5432, user: "pickup_test", database: "postgres",
        password: "unused-local-trust", connectionTimeoutMillis: 5000,
        options: "-c statement_timeout=8000 -c search_path=pickup_test",
      });
      clients.push(connection);
      await connection.connect();
    }
    const [first, second] = clients;
    const pid = async (c: pg.Client) => (await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const [firstPid, secondPid] = await Promise.all(clients.map(pid));
    assert.notEqual(firstPid, secondPid, "requests must use independent PostgreSQL sessions");
    // Full order projection matches the real Drizzle model used by RETURNING.
    await first.query(`
      CREATE SCHEMA pickup_test;
      CREATE TABLE fundraiser_events (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
      CREATE TABLE fundraiser_orders (
        id uuid PRIMARY KEY, order_number integer NOT NULL UNIQUE,
        event_id uuid NOT NULL REFERENCES fundraiser_events(id),
        customer_name text NOT NULL, customer_email text NOT NULL,
        customer_phone text, quantity integer NOT NULL DEFAULT 1,
        pickup_time text, stripe_session_id text,
        payment_status text NOT NULL DEFAULT 'paid',
        picked_up boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      );
    `);
    const tenant = randomUUID(), foreignTenant = randomUUID();
    const event = randomUUID(), foreignEvent = randomUUID();
    const order = randomUUID(), foreignOrder = randomUUID();
    await first.query("INSERT INTO fundraiser_events VALUES ($1,$2),($3,$4)",
      [event, tenant, foreignEvent, foreignTenant]);
    await first.query(`INSERT INTO fundraiser_orders
      (id,order_number,event_id,customer_name,customer_email) VALUES
      ($1,1001,$2,'Fixture buyer','fixture@example.test'),
      ($3,1002,$4,'Other fixture','other@example.test')`,
    [order, event, foreignOrder, foreignEvent]);
    const requests = clients.map(c => handlerFor(drizzle(c), { fundraiserOrders, fundraiserEvents }, operators));
    const stored = async () => (await first.query("SELECT * FROM fundraiser_orders ORDER BY order_number")).rows;
    const original = await stored();

    // The first handler finishes inside an uncommitted transaction. The second
    // must reach the same row in PostgreSQL and wait before we release the lock.
    // Repeat each state to cover both a transition and an already-matching row.
    for (const pickedUp of [true, true, false, false]) {
      await first.query("BEGIN");
      let pending: ReturnType<typeof requests[number]> | undefined;
      try {
        const a = await requests[0]({ pickedUp }, order, tenant);
        pending = requests[1]({ pickedUp }, order, tenant);
        // Attach immediately so even a SQL error cannot become an unhandled rejection.
        void pending.catch(() => {});
        const deadline = Date.now() + 4000;
        let blocked = false;
        while (Date.now() < deadline) {
          const result = await first.query(
            "SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked", [firstPid, secondPid]);
          if (result.rows[0].blocked) { blocked = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(blocked, "second pickup UPDATE must wait on the first connection's row lock");
        await first.query("COMMIT");
        const b = await pending;
        for (const response of [a, b]) {
          assert.equal(response.status, 200);
          assert.equal(response.payload.order.id, order);
          assert.equal(response.payload.order.eventId, event);
          assert.equal(response.payload.order.pickedUp, pickedUp);
        }
        assert.deepEqual(await stored(), [{ ...original[0], picked_up: pickedUp }, original[1]],
          "only the intended order's pickup state changes");
      } finally {
        await first.query("ROLLBACK");
        await pending?.catch(() => {});
      }
    }

    // Exercise the actual SQL tenant-event subquery in both directions and
    // distinguish neither absent orders nor other rescues' orders to callers.
    for (const request of requests) {
      for (const pickedUp of [true, false]) {
        for (const [id, tenantId] of [
          [foreignOrder, tenant], [order, foreignTenant], [randomUUID(), tenant],
        ]) {
          assert.deepEqual(await request({ pickedUp }, id, tenantId),
            { status: 404, payload: { error: "Order not found" } });
        }
      }
    }
    assert.deepEqual(await stored(), original, "denied requests must not modify either rescue's order");
    // Prove the foreign fixture is a valid order, accessible by its actual owner.
    const owned = await requests[1]({ pickedUp: true }, foreignOrder, foreignTenant);
    assert.equal(owned.status, 200);
    assert.equal(owned.payload.order.id, foreignOrder);
    assert.equal(owned.payload.order.pickedUp, true);
    assert.deepEqual(await stored(), [original[0], { ...original[1], picked_up: true }]);
  } finally {
    try {
      await Promise.all(clients.map(c => c.end()));
    } finally {
      try {
        if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

test("duplicate pickup and undo requests are idempotent", async () => {
  const s = server();
  for (const pickedUp of [true, true, false, false]) {
    const response = await s.request({ pickedUp });
    assert.equal(response.status, 200);
    assert.equal(response.payload.order.pickedUp, pickedUp);
    assert.equal(s.rows[0].pickedUp, pickedUp);
  }
});

test("two volunteers marking the same order picked up cannot reverse it", async () => {
  const s = server();
  const results = await Promise.all([s.request({ pickedUp: true }), s.request({ pickedUp: true })]);
  assert.ok(results.every(r => r.payload.order.pickedUp === true));
  assert.equal(s.rows[0].pickedUp, true);
  // A deliberate undo is still supported, including duplicate concurrent undos.
  await Promise.all([s.request({ pickedUp: false }), s.request({ pickedUp: false })]);
  assert.equal(s.rows[0].pickedUp, false);
});

test("missing or nonboolean state never writes; missing and cross-tenant orders return 404", async () => {
  const s = server();
  for (const body of [undefined, null, {}, { pickedUp: "true" }, { pickedUp: 1 }, { pickedUp: null }]) {
    assert.equal((await s.request(body)).status, 400);
  }
  assert.equal(s.writes(), 0);
  assert.equal((await s.request({ pickedUp: true }, "absent")).status, 404);
  assert.equal((await s.request({ pickedUp: true }, "foreign")).status, 404);
  assert.equal((await s.request({ pickedUp: true }, "order", "other")).status, 404);
  assert.ok(s.rows.every(row => !row.pickedUp));
});

const page = readFileSync("client/src/pages/FundraiserFulfillmentPage.tsx", "utf8");
const mutationStart = page.indexOf("  const pickupMutation = useMutation(");
const mutationSource = page.slice(mutationStart, page.indexOf("\n  });", mutationStart) + 6);
function client() {
  let optimistic: Record<string, boolean> = {};
  let data = { orders: [{ id: "order", pickedUp: false }] };
  const actions: string[] = [];
  const requests: any[] = [];
  const qc = {
    cancelQueries: async () => { actions.push("cancel"); },
    setQueryData: (_: unknown, update: any) => { data = update(data); actions.push("cache"); },
    invalidateQueries: async () => { actions.push("refresh"); },
  };
  const callbacks = new Function("useMutation", "apiRequest", "qc", "eventId", "setOptimisticPickups", "toast",
    transformSync(mutationSource, { loader: "ts" }).code + "\nreturn pickupMutation;")(
    (options: any) => options,
    async (method: string, path: string, body: any) => {
      requests.push({ method, path, body });
      return { json: async () => ({ order: { id: "order", pickedUp: body.pickedUp } }) };
    }, qc, "event", (update: any) => { optimistic = update(optimistic); }, () => actions.push("error"),
  );
  return { callbacks, actions, requests, optimistic: () => optimistic, data: () => data };
}

test("client sends intended state and replaces optimistic state with server response", async () => {
  const c = client();
  const input = { orderId: "order", pickedUp: true };
  await c.callbacks.onMutate(input);
  assert.deepEqual(c.optimistic(), { order: true });
  const result = await c.callbacks.mutationFn(input);
  assert.deepEqual(c.requests, [{ method: "PATCH", path: "/api/fundraiser-orders/order/pickup", body: { pickedUp: true } }]);
  c.callbacks.onSuccess(result);
  await c.callbacks.onSettled(result, null, input);
  assert.deepEqual(c.optimistic(), {});
  assert.equal(c.data().orders[0].pickedUp, true);
  assert.deepEqual(c.actions, ["cancel", "cache", "refresh"]);
  // A later response from another volunteer is no longer masked.
  c.callbacks.onSuccess({ order: { id: "order", pickedUp: false } });
  assert.equal(c.optimistic().order ?? c.data().orders[0].pickedUp, false);
  assert.match(page, /onCheckedChange=\{\(checked\).*[\s\S]*?pickedUp: checked/);
});

test("failure removes the optimistic override and refreshes even after an ambiguous network error", async () => {
  const c = client();
  const input = { orderId: "order", pickedUp: true };
  await c.callbacks.onMutate(input);
  c.callbacks.onError(new Error("network error"));
  await c.callbacks.onSettled(undefined, new Error("network error"), input);
  assert.deepEqual(c.optimistic(), {});
  assert.equal(c.data().orders[0].pickedUp, false);
  assert.deepEqual(c.actions, ["cancel", "error", "refresh"]);
});
