import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNKNOWN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const routes = readFileSync("server/routes.ts", "utf8");
type Method = "patch" | "delete";
type Row = Record<string, any>;
type Predicate = (row: Row) => boolean;

// Execute the actual route registration, replacing only its schema/DB boundaries.
function harness(method: Method) {
  const start = routes.indexOf(`  app.${method}('/api/fundraiser-events/:id'`);
  assert.ok(start >= 0);
  const source = routes.slice(start, routes.indexOf("\n  });", start) + 6);
  const compiled = transformSync(source.replace("await import('@shared/schema')", "schema"), { loader: "ts" }).code;
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
  let handler: any;
  const guards = [Symbol("tenant"), Symbol("auth"), Symbol("role")];
  const app = { [method]: (path: string, ...args: any[]) => {
    assert.equal(path, "/api/fundraiser-events/:id");
    assert.deepEqual(args.slice(0, -1), guards, "Authorization must precede validation");
    handler = args.at(-1);
  } };
  new Function("app", "requireTenant", "requireAuth", "requireRoleOrPageAccess", "db", "schema", "eq", "and", compiled)(
    app, guards[0], guards[1], (...args: string[]) => {
      assert.deepEqual(args, ["fundraiser-events", "admin", "owner"]);
      return guards[2];
    }, db, schema,
    (key: string, value: unknown): Predicate => row =>
      key === "id" ? row[key] === String(value).toLowerCase() : row[key] === value,
    (...predicates: Predicate[]): Predicate => row => predicates.every(p => p(row)),
  );
  return {
    rows,
    accesses: () => accesses,
    async request(id: unknown, body: Row = { title: "Updated" }) {
      let status = 200;
      let payload: unknown;
      const res = {
        status(code: number) { status = code; return res; },
        json(value: unknown) { payload = value; return res; },
      };
      await handler({ params: { id }, body, tenant: { id: "own" } }, res,
        (error: unknown) => { throw error; });
      return { status, payload };
    },
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

test("patch retains image display mode validation", async () => {
  const h = harness("patch");
  assert.deepEqual(await h.request(ID, { imageDisplayMode: "invalid" }), {
    status: 400, payload: { error: 'imageDisplayMode must be "hero" or "poster"' },
  });
  assert.equal(h.accesses(), 0);
});
