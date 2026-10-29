import { test } from "node:test";
import assert from "node:assert/strict";
import type { Donation } from "../shared/schema";
import { buildTreasurerReport, treasurerReportCsv } from "../client/src/lib/treasurer-report";

function donation(id: string, overrides: Partial<Donation> = {}): Donation {
  return { id, date: new Date("2026-10-01T00:00:00Z"), donationType: "cash", amount: 1234,
    donorName: "Donor", donorEmail: "", ...overrides } as Donation;
}

test("inclusive recorded dates, deterministic sorting, no input mutation", () => {
  const input = [donation("b", {date: new Date("2026-10-31T23:59:59Z")}), donation("a"), donation("excluded", {date: new Date("2026-11-01")})];
  const report = buildTreasurerReport(input, "2026-10-01", "2026-10-31");
  assert.deepEqual(report.rows.map(d => d.id), ["a", "b"]);
  assert.equal(report.monetaryTotalCents, 2468);
  assert.equal(input[0].id, "b");
});

test("all in-kind variants excluded from monetary totals and grouped separately", () => {
  const report = buildTreasurerReport([
    donation("cash"), donation("check", {donationType: "check", amount: 2000}),
    donation("online", {donationType: "online", amount: 3000}),
    donation("ach", {donationType: "ach", amount: 4000}),
    ...(["in_kind", "in_kind_goods", "in_kind_services"] as const).map(type => donation(type, {donationType: type, amount: 9999, estimatedValue: 5000})),
  ], "2026-10-01", "2026-10-31");
  assert.equal(report.monetaryTotalCents, 10234);
  assert.equal(report.inKindCount, 3);
  assert.equal(report.groups.length, 7);
  assert.ok(report.groups.filter(g => g.inKind).every(g => g.amountCents === 0));
  assert.ok(!treasurerReportCsv(report).includes("99.99"));
  assert.ok(treasurerReportCsv(report).includes("50.00"));
});

test("invalid or reversed ranges fail explicitly; empty ranges export headers only", () => {
  for (const [start, end] of [["", ""], ["2026-02-30", "2026-03-02"], ["2026-11-01", "2026-10-01"]]) {
    assert.throws(() => buildTreasurerReport([], start, end));
  }
  assert.equal(buildTreasurerReport([], "2026-10-01", "2026-10-31").monetaryTotalCents, 0);
});

test("CSV quotes multiline content, preserves check identifiers, and blocks formulas", () => {
  const report = buildTreasurerReport([donation("id", {
    donorName: '=HYPERLINK("bad")', message: 'A, "quote"\nand line',
    donorEmail: " +formula", checkNumber: "00123", donationType: "check",
  })], "2026-10-01", "2026-10-31");
  const csv = treasurerReportCsv(report);
  assert.ok(csv.includes(`"'=HYPERLINK(""bad"")"`));
  assert.ok(csv.includes(`"' +formula"`));
  assert.ok(csv.includes('"A, ""quote""\nand line"'));
  assert.ok(csv.includes('"00123"'));
  assert.ok(csv.includes('"12.34"'));
});
