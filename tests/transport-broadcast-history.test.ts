import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";

test("history reads durable operations by tenant and trip, with bounded pagination", async () => {
  const built = await build({
    entryPoints: ["server/lib/transport-broadcast-history.ts"],
    bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "db", setup(b) {
      b.onResolve({ filter: /^\.\.\/db$/ }, () => ({ path: "db", namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export const pool=globalThis.pool;" }));
    } }],
  });
  let count = 21;
  const pool = { async query(sql: string, args: any[]) {
    assert.match(sql, /FROM transport_sms_operations WHERE tenant_id=\$1 AND transport_id=\$2/);
    assert.match(sql, /ORDER BY created_at DESC, operation_key DESC LIMIT 21 OFFSET \$3/);
    assert.deepEqual(Array.from(args), ["tenant", "trip", 20]);
    return { rows: Array.from({ length: count }, (_, i) => ({
      id: String(i), complete: false, results: [{ number: "2025550101", status: "failed", uncertain: true }],
    })) };
  } };
  const module = { exports: {} as any };
  runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, pool });
  const page = await module.exports.getTransportBroadcastHistory("tenant", "trip", 20);
  assert.equal(page.attempts.length, 20);
  assert.equal(page.nextOffset, 40);
  assert.equal(page.attempts[0].results[0].uncertain, true);
  count = 1;
  assert.equal((await module.exports.getTransportBroadcastHistory("tenant", "trip", 20)).nextOffset, null);
});

test("history and send routes require staff", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.match(routes, /app.get\('\/api\/transports\/:id\/sms-broadcasts', requireTenant, requireAuth, requireRole\('staff'\)/);
  assert.match(routes, /app.post\('\/api\/transports\/:id\/sms-broadcast', requireTenant, requireAuth, requireRole\('staff'\)/);
});
