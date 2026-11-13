import { test } from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { createVendingResults, type VendingResultsReport } from "../shared/rescue-vend-report";
import { vendingResultsCsv } from "../shared/rescue-vend-report-csv";
import { DEFAULT_VENDING_MENU } from "../shared/rescue-vend";

function parse(report: VendingResultsReport) {
  const csv = vendingResultsCsv(report);
  assert.ok(csv.startsWith("\uFEFF"));
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: true });
  assert.deepEqual(parsed.errors, []);
  assert.ok(parsed.data.every(row => row.length === 16));
  return parsed.data;
}

test("exports all windows, report timestamp, totals, supply amounts and accounting notes", () => {
  for (const days of [30, 90, 365]) {
    const builder = createVendingResults(days);
    builder.add("ch_1", {
      vendingCatalogVersion: "1",
      vendingItems: JSON.stringify([{ id: "treats", quantity: 2 }, { id: "toy", quantity: 1 }]),
    }, {
      grossCents: 1800, refundCents: 900, netGiftCents: 900,
      platformRevenueCents: 36, processingRecoveryCents: 82, rescueProceedsCents: -7,
    });
    const report = builder.finish();
    const before = JSON.stringify(report);
    const [header, total, ...items] = parse(report);
    assert.equal(JSON.stringify(report), before);
    assert.match(header[8], /original assessed/);
    assert.match(header[9], /original assessed/);
    assert.deepEqual(total.slice(4, 11), ["1", "18.00", "9.00", "9.00", "0.36", "0.82", "-0.07"]);
    assert.equal(items.length, 2);
    for (const [index, item] of report.items.entries()) {
      assert.equal(items[index][1], item.id);
      assert.equal(items[index][10], (item.rescueProceedsCents! / 100).toFixed(2));
    }
    for (const row of [total, ...items]) {
      assert.equal(row[11], String(days));
      assert.equal(row[12], report.generatedAt);
      assert.equal(row[13], "USD");
      assert.match(row[15], /proportionally allocated estimates/);
      assert.match(row[15], /including refunds made after/);
      assert.match(row[15], /not refund-adjusted/);
    }
  }
});

test("retains unknown money and quantity separately from known zero", () => {
  const builder = createVendingResults(30);
  builder.add("ch_unknown", null, {
    grossCents: 100, refundCents: 0, netGiftCents: 100,
    platformRevenueCents: null, processingRecoveryCents: 0, rescueProceedsCents: null,
  });
  const [, total, item] = parse(builder.finish());
  assert.equal(item[2], "Unattributed supplies");
  assert.equal(item[3], "Unknown");
  for (const row of [total, item]) {
    assert.deepEqual(row.slice(8, 11), ["Unknown", "0.00", "Unknown"]);
    assert.equal(row[14], "1");
  }
  const empty = parse(createVendingResults(90).finish());
  assert.equal(empty.length, 2);
  assert.deepEqual(empty[1].slice(4, 11), ["0", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00"]);
});

test("quotes commas, quotes, newlines and Unicode; neutralizes formula strings", () => {
  for (const name of ['=HYPERLINK("bad")', "+cmd", "-cmd", "@SUM(1)", " \t=1+1", "\ttext", "\rtext", "\ntext"]) {
    const report = createVendingResults(30).finish();
    report.items = [{ ...report.totals, id: name, name, quantity: 1, chargeCount: 1 }];
    const item = parse(report)[2];
    assert.equal(item[1], `'${name}`);
    assert.equal(item[2], `'${name}`);
  }
  const report = createVendingResults(30).finish();
  const name = 'Cozy, "warm"\nblankets 🐾';
  report.items = [{ ...report.totals, id: "blanket", name, quantity: 1, chargeCount: 1 }];
  assert.equal(parse(report)[2][2], name);
});

test("historical menus keep renamed slots separate and invalid versions unattributed", () => {
  const builder = createVendingResults(30);
  const menu = structuredClone(DEFAULT_VENDING_MENU);
  menu.version = "historical-version";
  menu.items[0].name = "Custom treats";
  menu.items[0].priceCents = 1234;
  const metadata = { vendingCatalogVersion: menu.version, vendingItems: '[{"id":"treats","quantity":1}]' };
  const money = { grossCents: 1234, refundCents: 0, netGiftCents: 1234,
    platformRevenueCents: 0, processingRecoveryCents: 0, rescueProceedsCents: 1234 };
  builder.add("custom", metadata, money, menu);
  builder.add("missing", metadata, money, null);
  builder.add("wrong-version", metadata, money, DEFAULT_VENDING_MENU);
  builder.add("bad-total", metadata, { ...money, grossCents: 999 }, menu);
  builder.add("legacy", { ...metadata, vendingCatalogVersion: "1" },
    { ...money, grossCents: 500, netGiftCents: 500, rescueProceedsCents: 500 });
  const report = builder.finish();
  assert.equal(report.unattributedChargeCount, 3);
  assert.equal(report.items.length, 3);
  assert.equal(report.items.find(item => item.id === "treats")?.name, "Peanut Butter Treats");
  const custom = parse(report).find(row => row[2] === "Custom treats")!;
  assert.equal(custom[3], "1");
  assert.equal(custom[5], "12.34");
});
