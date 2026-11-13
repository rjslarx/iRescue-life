import { VENDING_CATALOG_VERSION, vendingCart } from "./rescue-vend";

export type VendingMoney = {
  grossCents: number;
  refundCents: number;
  netGiftCents: number;
  platformRevenueCents: number | null;
  processingRecoveryCents: number | null;
  rescueProceedsCents: number | null;
};
export type VendingResultItem = VendingMoney & {
  id: string;
  name: string;
  quantity: number | null;
  chargeCount: number;
};
export type VendingResultsReport = {
  days: number;
  generatedAt: string;
  chargeCount: number;
  unattributedChargeCount: number;
  totals: VendingMoney;
  items: VendingResultItem[];
};

const emptyMoney = (): VendingMoney => ({
  grossCents: 0, refundCents: 0, netGiftCents: 0,
  platformRevenueCents: 0, processingRecoveryCents: 0, rescueProceedsCents: 0,
});
const moneyKeys = Object.keys(emptyMoney()) as (keyof VendingMoney)[];

// Largest-remainder allocation keeps every cent, including negative proceeds.
export function allocateVendingCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const magnitude = Math.abs(total);
  const parts = weights.map(weight => Math.floor(magnitude * weight / sum));
  const order = weights.map((weight, index) => ({
    index, fraction: magnitude * weight / sum - parts[index],
  })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const remainder = magnitude - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remainder; i++) parts[order[i].index]++;
  return parts.map(part => total < 0 ? -part : part);
}

export function createVendingResults(days: number) {
  const report: VendingResultsReport = {
    days, generatedAt: new Date().toISOString(), chargeCount: 0,
    unattributedChargeCount: 0, totals: emptyMoney(), items: [],
  };
  const items = new Map<string, VendingResultItem>();
  const seen = new Set<string>();
  return {
    add(chargeId: string, metadata: Record<string, string> | null, money: VendingMoney) {
      if (seen.has(chargeId)) return;
      seen.add(chargeId);
      let selection: { id: string; name: string; quantity: number | null; weight: number }[];
      try {
        if (metadata?.vendingCatalogVersion !== VENDING_CATALOG_VERSION) throw new Error("Unknown catalog");
        const cart = vendingCart({ items: JSON.parse(metadata.vendingItems) });
        if (cart.totalCents !== money.grossCents) throw new Error("Mismatched total");
        selection = cart.items.map(item => ({
          id: item.id, name: item.name, quantity: item.quantity,
          weight: item.priceCents * item.quantity,
        }));
      } catch {
        report.unattributedChargeCount++;
        selection = [{ id: "unattributed", name: "Unattributed supplies", quantity: null, weight: 1 }];
      }
      report.chargeCount++;
      const allocations = Object.fromEntries(moneyKeys.map(key => [
        key, money[key] === null ? selection.map(() => null)
          : allocateVendingCents(money[key]!, selection.map(item => item.weight)),
      ])) as Record<keyof VendingMoney, (number | null)[]>;
      for (const key of moneyKeys) {
        // Unknown amounts must never masquerade as complete totals.
        (report.totals as any)[key] = report.totals[key] === null || money[key] === null
          ? null : report.totals[key]! + money[key]!;
      }
      selection.forEach((selected, index) => {
        const item = items.get(selected.id) || {
          id: selected.id, name: selected.name, quantity: selected.quantity === null ? null : 0,
          chargeCount: 0, ...emptyMoney(),
        };
        item.chargeCount++;
        if (item.quantity !== null) item.quantity += selected.quantity!;
        for (const key of moneyKeys) {
          (item as any)[key] = item[key] === null || allocations[key][index] === null
            ? null : item[key]! + allocations[key][index]!;
        }
        // Derive net per supply from allocated gross/refunds to avoid rounding discrepancies.
        item.netGiftCents = item.grossCents - item.refundCents;
        items.set(item.id, item);
      });
    },
    finish() {
      report.items = Array.from(items.values()).sort((a, b) =>
        b.netGiftCents - a.netGiftCents || a.name.localeCompare(b.name));
      return report;
    },
  };
}

// Strictly match server-authored tenant metadata, not browser events or labels.
export function isTenantVendingCharge(charge: {
  paid?: boolean; captured?: boolean; status?: string; currency?: string; metadata?: Record<string, string> | null;
}, tenantId: string) {
  return charge.paid === true && charge.captured === true && charge.status === "succeeded" &&
    charge.currency === "usd" && charge.metadata?.type === "rescue_vend" &&
    charge.metadata?.tenantId === tenantId;
}
