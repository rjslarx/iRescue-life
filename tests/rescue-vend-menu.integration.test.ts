import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { tenants } from "../shared/schema";
import { DEFAULT_VENDING_MENU, verifiedVendingSession } from "../shared/rescue-vend";
import { getVendingMenu, saveVendingMenu } from "../server/services/rescue-vend-menu";
import router from "../server/routes/rescueVend";

test("tenant menu persistence, concurrency, route guards and historical receipts", { skip: process.env.RUN_VEND_DB_TEST !== "1" }, async () => {
  const id = randomUUID();
  const other = randomUUID();
  let server: ReturnType<express.Express["listen"]> | undefined;
  try {
    await db.insert(tenants).values([
      { id, subdomain: `vend-test-${id}`, name: "Vending integration test" },
      { id: other, subdomain: `vend-test-${other}`, name: "Other vending test" },
    ]);
    const menu = structuredClone(DEFAULT_VENDING_MENU);
    menu.items[0].name = "Custom rescue supply";
    menu.items[0].priceCents = 1234;
    const results = await Promise.all([saveVendingMenu(id, menu), saveVendingMenu(id, menu)]);
    assert.equal(results.filter(Boolean).length, 1, "concurrent stale save rejected");
    const saved = results.find(Boolean)!;
    assert.deepEqual(await getVendingMenu(id), saved);
    assert.deepEqual(await getVendingMenu(other), DEFAULT_VENDING_MENU);
    await assert.rejects(() => getVendingMenu(other, saved.version));
    const next = structuredClone(saved);
    next.items[0].enabled = false;
    next.items[0].priceCents = 9999;
    assert.ok(await saveVendingMenu(id, next));
    const old = await getVendingMenu(id, saved.version);
    const receipt = verifiedVendingSession({
      metadata: { tenantId: id, type: "rescue_vend", vendingCatalogVersion: saved.version, vendingItems: '[{"id":"treats","quantity":1}]' },
      mode: "payment", currency: "usd", payment_status: "paid", amount_total: 1234,
    }, id, old);
    assert.equal(receipt.items[0].name, "Custom rescue supply");
    assert.equal(receipt.totalCents, 1234);
    assert.deepEqual(await getVendingMenu(id, "1"), DEFAULT_VENDING_MENU);

    const app = express();
    app.use(express.json(), (req, _res, next) => {
      req.tenant = { id } as any;
      const role = req.header("test-role");
      if (role) req.user = { tenantId: req.header("test-tenant") || id, activeRole: role, roles: [role] } as any;
      next();
    });
    app.use(router);
    server = app.listen(0);
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    for (const method of ["GET", "PUT"]) {
      assert.equal((await fetch(`${url}/settings`, { method })).status, 401);
      assert.equal((await fetch(`${url}/settings`, { method, headers: { "test-role": "staff" } })).status, 403);
      assert.equal((await fetch(`${url}/settings`, { method, headers: { "test-role": "admin", "test-tenant": other } })).status, 403);
    }
    const response = await fetch(`${url}/settings`, { headers: { "test-role": "admin" } });
    assert.equal(response.status, 200);
    const latest = await response.json();
    const publicMenu = await (await fetch(`${url}/`)).json();
    assert.equal(publicMenu.version, latest.version);
    assert.ok(!publicMenu.items.some((item: any) => item.id === "treats"));
    assert.equal((await fetch(`${url}/settings`, { method: "PUT", headers: { "test-role": "admin", "content-type": "application/json" }, body: JSON.stringify(menu) })).status, 409);
    assert.equal((await fetch(`${url}/settings`, { method: "PUT", headers: { "test-role": "admin", "content-type": "application/json" }, body: '{"items":[]}' })).status, 400);
    assert.equal((await fetch(`${url}/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogVersion: saved.version, items: [{ id: "toy", quantity: 1 }] }) })).status, 409);
    assert.equal((await fetch(`${url}/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogVersion: latest.version, items: [{ id: "treats", quantity: 1 }] }) })).status, 400);
  } finally {
    server?.close();
    await db.delete(tenants).where(eq(tenants.id, id));
    await db.delete(tenants).where(eq(tenants.id, other));
    await pool.end();
  }
});
