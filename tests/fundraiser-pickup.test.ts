import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    }, db, { fundraiserOrders: { id: "id", eventId: "eventId" }, fundraiserEvents: { id: "id", tenantId: "tenantId" } },
    eq, and, inArray, z,
  );
  async function request(body: unknown, id = "order", tenantId = "rescue") {
    let status = 200;
    let payload: any;
    const res = { status: (code: number) => { status = code; return res; }, json: (value: unknown) => { payload = value; } };
    await handler({ body, params: { id }, tenant: { id: tenantId } }, res, (error: unknown) => { throw error; });
    return { status, payload };
  }
  return { request, rows, writes: () => writes };
}

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
