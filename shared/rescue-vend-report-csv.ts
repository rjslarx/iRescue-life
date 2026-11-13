import type { VendingMoney, VendingResultsReport } from "./rescue-vend-report";

type Cell = string | number | null | { cents: number | null };

function csvCell(value: Cell): string {
  let text: string;
  if (value === null) text = "Unknown";
  else if (typeof value === "object") {
    text = value.cents === null ? "Unknown" : (value.cents / 100).toFixed(2);
  } else if (typeof value === "number") text = String(value);
  else {
    // Quoting alone does not prevent spreadsheet formula execution.
    // Protect strings even when formula markers follow whitespace/control characters.
    text = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value)
      ? `'${value}` : value;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

const moneyCells = (money: VendingMoney): Cell[] => [
  money.grossCents, money.refundCents, money.netGiftCents,
  money.platformRevenueCents, money.processingRecoveryCents, money.rescueProceedsCents,
].map(cents => ({ cents }));

const notes = [
  "The window selects payment dates. Refund status is current, including refunds made after the selected window.",
  "Platform revenue and processing recovery are original assessed amounts, not refund-adjusted.",
  "Actual rescue proceeds reflect transfer reversals, application fee refunds, and dispute restorations.",
  "Supply-level refunds and proceeds for mixed carts are proportionally allocated estimates, not actual supply earmarks or restricted funds.",
  "Unknown means unavailable, not zero. Unknown catalog metadata is retained as Unattributed supplies.",
  "Payment counts per supply overlap for mixed carts; use the total row for distinct payments. Do not add the total row to supply rows.",
].join(" ");

/** Export the already-authorized report without refetching or recalculating economics. */
export function vendingResultsCsv(report: VendingResultsReport): string {
  const metadata: Cell[] = [report.days, report.generatedAt, "USD", report.unattributedChargeCount, notes];
  const rows: Cell[][] = [
    [
      "Row type", "Supply ID", "Supply", "Quantity", "Payments",
      "Gross gifts (USD)", "Refunds (USD)", "Net gifts (USD)",
      "Platform revenue - original assessed (USD)",
      "Processing recovery - original assessed (USD)", "Actual rescue proceeds (USD)",
      "Payment window (last N days)", "Report generated at (UTC)", "Currency",
      "Payments with unattributed supplies", "Report notes",
    ],
    ["Total", "", "All supplies", "", report.chargeCount, ...moneyCells(report.totals), ...metadata],
    ...report.items.map(item => [
      "Supply", item.id, item.quantity === null ? "Unattributed supplies" : item.name,
      item.quantity, item.chargeCount, ...moneyCells(item), ...metadata,
    ]),
  ];
  // BOM preserves Unicode supply names in spreadsheet applications.
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
