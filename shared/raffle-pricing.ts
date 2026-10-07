export interface BundleTier {
  quantity: number;
  price: string;
}

/** Suggest only an exact configured tier at the same cent-rounded line price.
 * Other cart lines are left intact and count against product-wide limits.
 */
export function findSamePriceRaffleBundle(
  product: {
    productType: string;
    basePrice: string | number;
    bundlePricing?: BundleTier[] | null;
    status?: string;
    raffleClosed?: boolean;
    splitPot?: { isDrawn?: boolean };
    variants?: readonly unknown[];
    maxPerOrder?: number | null;
    trackInventory?: boolean;
    totalInventory?: number | null;
  },
  quantity: number,
  options: { variantId?: string | null; otherCartQuantity?: number } = {},
): BundleTier | null {
  const other = options.otherCartQuantity ?? 0;
  if (product.productType !== 'raffle' || options.variantId || (product.variants?.length ?? 0) > 0 ||
      (product.status !== undefined && product.status !== 'active') ||
      product.raffleClosed || product.splitPot?.isDrawn ||
      !Number.isSafeInteger(quantity) || quantity < 1 ||
      !Number.isSafeInteger(other) || other < 0) return null;
  const currentCents = Math.round(computeBundledPrice(quantity, product.basePrice, product.bundlePricing) * 100);
  if (!Number.isFinite(currentCents) || currentCents < 0) return null;
  return [...(product.bundlePricing ?? [])]
    .filter(tier => Number.isSafeInteger(tier.quantity) && tier.quantity > quantity &&
      Number.isFinite(Number(tier.price)) && Number(tier.price) >= 0 &&
      (!product.maxPerOrder || tier.quantity + other <= product.maxPerOrder) &&
      (!product.trackInventory || product.totalInventory == null || tier.quantity + other <= product.totalInventory) &&
      Math.round(Number(tier.price) * 100) === currentCents &&
      Math.round(computeBundledPrice(tier.quantity, product.basePrice, product.bundlePricing) * 100) === currentCents)
    .sort((a, b) => b.quantity - a.quantity)[0] ?? null;
}

export interface SplitPotAmounts {
  ticketSalesAmount: string;
  winnerPrizeAmount: string;
  rescueShareAmount: string;
}

export interface CheckoutPaymentAmounts {
  subtotal: number;
  processingFee: number;
  totalAmount: number;
}

/** Calculate shop checkout totals while keeping all math rounded to cents. */
export function computeCheckoutPaymentAmounts(
  subtotal: number,
  buyerCoversCardFee: boolean,
): CheckoutPaymentAmounts {
  const roundedSubtotal = Math.max(0, Math.round(subtotal * 100) / 100);
  const grossTotal = buyerCoversCardFee && roundedSubtotal > 0
    ? Math.round(((roundedSubtotal + 0.30) / (1 - 0.029)) * 100) / 100
    : roundedSubtotal;
  return {
    subtotal: roundedSubtotal,
    processingFee: Math.round((grossTotal - roundedSubtotal) * 100) / 100,
    totalAmount: grossTotal,
  };
}

/**
 * Split paid ticket revenue into equal winner/rescue shares using integer
 * cents. Split-the-pot raffle prices are validated to whole even cents, so a
 * paid sales total can always be divided exactly without fractional pennies.
 */
export function computeSplitPotAmounts(ticketSales: string | number): SplitPotAmounts {
  const salesCents = Math.max(0, Math.round(Number(ticketSales) * 100));
  const halfCents = Math.floor(salesCents / 2);
  return {
    ticketSalesAmount: (salesCents / 100).toFixed(2),
    winnerPrizeAmount: (halfCents / 100).toFixed(2),
    rescueShareAmount: ((salesCents - halfCents) / 100).toFixed(2),
  };
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
