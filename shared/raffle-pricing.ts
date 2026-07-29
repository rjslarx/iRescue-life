export interface BundleTier {
  quantity: number;
  price: string;
}

/**
 * Compute the total price (in dollars) for `quantity` tickets given a
 * per-ticket base price and optional bundle tiers (e.g. 3 for $5, 10 for $20).
 * Uses the tier prices EXACTLY as the rescue configured them: the quantity is
 * decomposed greedily from the largest tier down (10 tickets = the 10-pack
 * price; 13 tickets = 10-pack + 3-pack; leftovers at the single-ticket price).
 * It never re-optimizes across tiers, so the price shown on each bundle card
 * is always the price charged.
 * Shared by the server (authoritative checkout pricing) and the client (display).
 */
export function computeBundledPrice(
  quantity: number,
  basePrice: string | number,
  bundlePricing: BundleTier[] | null | undefined,
): number {
  const baseCents = Math.round(Number(basePrice) * 100);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const tiers = (bundlePricing || [])
    .filter(
      (t) => Number.isInteger(t.quantity) && t.quantity >= 2 && Number.isFinite(Number(t.price)) && Number(t.price) >= 0,
    )
    .sort((a, b) => b.quantity - a.quantity); // largest first
  if (tiers.length === 0) return (baseCents * quantity) / 100;

  let remaining = Math.floor(quantity);
  let totalCents = 0;
  for (const tier of tiers) {
    const count = Math.floor(remaining / tier.quantity);
    if (count > 0) {
      totalCents += count * Math.round(Number(tier.price) * 100);
      remaining -= count * tier.quantity;
    }
  }
  totalCents += remaining * baseCents;
  return totalCents / 100;
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
