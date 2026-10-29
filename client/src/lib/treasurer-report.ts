import type { Donation } from "@shared/schema";

const categories: Record<string, { label: string; inKind: boolean }> = {
  cash: { label: "Cash", inKind: false },
  check: { label: "Checks", inKind: false },
  online: { label: "Online", inKind: false },
  ach: { label: "ACH", inKind: false },
  in_kind: { label: "In-kind", inKind: true },
  in_kind_goods: { label: "In-kind goods", inKind: true },
  in_kind_services: { label: "In-kind services", inKind: true },
};

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

function recordedDate(value: Date | string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A donation has an invalid recorded date.");
  return date.toISOString().slice(0, 10);
}

function cents(value: number | null) {
  if (value === null) return 0;
  if (!Number.isSafeInteger(Number(value))) throw new Error("A donation has an invalid monetary amount.");
  return Number(value);
}

export function buildTreasurerReport(donations: Donation[], startDate: string, endDate: string) {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    throw new Error("Choose a valid start and end date. The end date must not precede the start date.");
  }
  const rows = donations.filter(d => {
    const date = recordedDate(d.date);
    return date >= startDate && date <= endDate;
  }).sort((a, b) => recordedDate(a.date).localeCompare(recordedDate(b.date)) || a.id.localeCompare(b.id));
  const groups = new Map<string, { label: string; count: number; amountCents: number; inKind: boolean }>();
  let monetaryTotalCents = 0;
  let inKindCount = 0;
  for (const row of rows) {
    const category = categories[row.donationType] ?? { label: `Other (${row.donationType || "unspecified"})`, inKind: false };
    const group = groups.get(category.label) ?? { ...category, count: 0, amountCents: 0 };
    group.count++;
    if (category.inKind) {
      inKindCount++;
    } else {
      const amount = cents(row.amount);
      group.amountCents += amount;
      monetaryTotalCents += amount;
    }
    groups.set(category.label, group);
  }
  return { rows, groups: [...groups.values()], monetaryTotalCents, inKindCount };
}

// Quote every field and neutralize spreadsheet formulas in donor-supplied text.
function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function treasurerReportCsv(report: ReturnType<typeof buildTreasurerReport>) {
  const headers = [
    "Donation ID", "Donation date", "Donor name", "Donor email", "Donation type",
    "Monetary amount (USD)", "Check number", "Description", "Notes", "Source",
    "Receipt number", "Receipt sent at", "In-kind estimated value (USD, internal only)",
    "Recorded by", "Recorded on (UTC)",
  ];
  const rows = report.rows.map(d => {
    const category = categories[d.donationType];
    return [
      d.id, recordedDate(d.date), d.donorName, d.donorEmail,
      category?.label ?? d.donationType,
      category?.inKind ? "" : (cents(d.amount) / 100).toFixed(2),
      d.checkNumber, d.description, d.message, d.source, d.receiptNumber,
      d.receiptSentAt ? new Date(d.receiptSentAt).toISOString() : "",
      category?.inKind && d.estimatedValue != null ? (cents(d.estimatedValue) / 100).toFixed(2) : "",
      d.recordedByName || "Not recorded",
      d.createdAt ? new Date(d.createdAt).toISOString() : "",
    ];
  });
  return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
