import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { tenants } from "../shared/schema";
import { DEFAULT_VENDING_MENU, verifiedVendingSession } from "../shared/rescue-vend";
import { findVendingMenuVersion, getVendingMenu, saveVendingMenu } from "../server/services/rescue-vend-menu";
import { collectStripeEconomicsReport } from "../server/lib/stripe-economics-report";
import { vendingResultsCsv } from "../shared/rescue-vend-report-csv";
import Papa from "papaparse";
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
    menu.machineStyle = "photorealistic";
    menu.shortName = "Test Rescue";
    menu.showInNavigation = true;
    const results = await Promise.all([saveVendingMenu(id, menu), saveVendingMenu(id, menu)]);
    assert.equal(results.filter(Boolean).length, 1, "concurrent stale save rejected");
    const saved = results.find(Boolean)!;
    assert.deepEqual(await getVendingMenu(id), saved);
    assert.deepEqual(await getVendingMenu(other), DEFAULT_VENDING_MENU);
    await assert.rejects(() => getVendingMenu(other, saved.version));
    const next = structuredClone(saved);
    next.items[0].enabled = false;
    next.machineStyle = "classic";
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
    assert.equal(await findVendingMenuVersion(other, saved.version), null);
    const stripe: any = {
      transfers: { list: async () => ({ data: [], has_more: false }) },
      disputes: { list: async () => ({ data: [], has_more: false }) },
      charges: { list: async () => ({ has_more: false, data: [{
        id: "ch_custom_menu", paid: true, captured: true, status: "succeeded", currency: "usd",
        created: Math.floor(Date.now() / 1000), amount: 2468, amount_refunded: 0,
        metadata: { tenantId: id, type: "rescue_vend", vendingCatalogVersion: saved.version,
          vendingItems: '[{"id":"treats","quantity":2}]', economicsVersion: "1",
          iRescueRevenueCents: "49", processingRecoveryCents: "102" },
        refunds: { data: [], has_more: false },
      }] }) },
    };
    const economics = await collectStripeEconomicsReport(stripe, [
      { id, name: "Test rescue", subdomain: "test", accountId: null },
    ], 30, 0, id);
    const report = economics.vendingResults!;
    assert.equal(report.unattributedChargeCount, 0);
    assert.equal(report.items[0].name, "Custom rescue supply");
    assert.equal(report.items[0].quantity, 2);
    const csv = Papa.parse<string[]>(vendingResultsCsv(report), { skipEmptyLines: true }).data;
    assert.equal(csv[2][2], "Custom rescue supply");
    assert.equal(csv[2][3], "2");
    assert.deepEqual(csv[2].slice(5, 11), ["24.68", "0.00", "24.68", "0.49", "1.02", "Unknown"]);

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
    assert.deepEqual(await (await fetch(`${url}/navigation`)).json(), { showInNavigation: true });
    const publicMenu = await (await fetch(`${url}/`)).json();
    assert.equal(publicMenu.version, latest.version);
    assert.ok(!publicMenu.items.some((item: any) => item.id === "treats"));
    assert.equal((await fetch(`${url}/settings`, { method: "PUT", headers: { "test-role": "admin", "content-type": "application/json" }, body: JSON.stringify(menu) })).status, 409);
    assert.equal((await fetch(`${url}/settings`, { method: "PUT", headers: { "test-role": "admin", "content-type": "application/json" }, body: '{"items":[]}' })).status, 400);
    assert.equal((await fetch(`${url}/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogVersion: saved.version, items: [{ id: "toy", quantity: 1 }] }) })).status, 409);
    assert.equal((await fetch(`${url}/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogVersion: latest.version, items: [{ id: "treats", quantity: 1 }] }) })).status, 400);
    const hidden = await fetch(`${url}/settings`, { method: "PUT", headers: { "test-role": "admin", "content-type": "application/json" }, body: JSON.stringify({ ...latest, showInNavigation: false }) });
    assert.equal(hidden.status, 200);
    assert.deepEqual(await (await fetch(`${url}/navigation`)).json(), { showInNavigation: false });
    assert.equal((await getVendingMenu(other)).showInNavigation, false);
  } finally {
    server?.close();
    await db.delete(tenants).where(eq(tenants.id, id));
    await db.delete(tenants).where(eq(tenants.id, other));
    await pool.end();
  }
});
