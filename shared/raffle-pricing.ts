export interface BundleTier {
  quantity: number;
  price: string;
}

/**
 * Compute the cheapest total price (in dollars) for `quantity` tickets given
 * a per-ticket base price and optional bundle tiers (e.g. 5 for $20, 15 for $50).
 * Uses dynamic programming over cost-in-cents so buyers always get the best
 * combination of bundles + single tickets (e.g. 20 tickets = 15-pack + 5-pack).
 * Shared by the server (authoritative checkout pricing) and the client (display).
 */
export function computeBundledPrice(
  quantity: number,
  basePrice: string | number,
  bundlePricing: BundleTier[] | null | undefined,
): number {
  const baseCents = Math.round(Number(basePrice) * 100);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const tiers = (bundlePricing || []).filter(
    (t) => Number.isInteger(t.quantity) && t.quantity >= 2 && Number.isFinite(Number(t.price)) && Number(t.price) >= 0,
  );
  if (tiers.length === 0) return (baseCents * quantity) / 100;

  const options = [
    { qty: 1, cents: baseCents },
    ...tiers.map((t) => ({ qty: t.quantity, cents: Math.round(Number(t.price) * 100) })),
  ];

  // minCost[q] = cheapest cost in cents to buy AT LEAST... exactly q tickets.
  // Buying more tickets than requested is never necessary for the buyer's own
  // choice (the UI offers exact bundle quantities), so exact-quantity DP is fine.
  const minCost: number[] = new Array(quantity + 1).fill(Infinity);
  minCost[0] = 0;
  for (let q = 1; q <= quantity; q++) {
    for (const opt of options) {
      if (opt.qty <= q && minCost[q - opt.qty] + opt.cents < minCost[q]) {
        minCost[q] = minCost[q - opt.qty] + opt.cents;
      }
    }
  }
  const result = minCost[quantity];
  return (Number.isFinite(result) ? result : baseCents * quantity) / 100;
}

/**
 * Percent saved versus buying `quantity` singles at basePrice. Returns 0 when
 * there is no saving. Used for "Save 20%" badges on bundle options.
 */
export function bundleSavingsPercent(
  quantity: number,
  basePrice: string | number,
  bundlePrice: string | number,
): number {
  const full = Number(basePrice) * quantity;
  const bundled = Number(bundlePrice);
  if (!Number.isFinite(full) || full <= 0 || !Number.isFinite(bundled) || bundled >= full) return 0;
  return Math.round(((full - bundled) / full) * 100);
}
