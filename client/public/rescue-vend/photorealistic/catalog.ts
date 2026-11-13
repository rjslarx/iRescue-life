import { getFallbackSvgDataUri, type VendingProduct } from '../inventory.js';

export interface RescueSupplyItem {
  id: string;
  code: string;
  brand: string;
  name: string;
  impactNote: string;
  priceCents: number;
  priceDisplay: string;
  imageUrl: string;
}
export interface CartItem extends RescueSupplyItem { quantity: number }
declare global {
  interface Window { RESCUE_VENDING_ITEMS?: RescueSupplyItem[] }
}
export function getActiveSupplyCatalog(): RescueSupplyItem[] {
  return window.RESCUE_VENDING_ITEMS ?? [];
}
export function toSupply(item: Partial<VendingProduct> & Pick<VendingProduct, 'id' | 'code' | 'name' | 'priceCents'>): RescueSupplyItem {
  const product: VendingProduct = {
    ...item, impactNote: item.impactNote ?? '', badgeColor: item.badgeColor ?? '#45a896', imageUrl: '',
  };
  let imageUrl = getFallbackSvgDataUri(product);
  try {
    const supplied = new URL(item.imageUrl || '', window.location.href);
    if (item.imageUrl && (supplied.protocol === 'https:' || supplied.origin === window.location.origin)) imageUrl = supplied.href;
  } catch { /* Use the bundled illustration if an image URL is invalid. */ }
  return {
    id: item.id, code: item.code, name: item.name, brand: 'RESCUE SUPPLY',
    priceCents: item.priceCents, priceDisplay: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: item.priceCents % 100 ? 2 : 0 }).format(item.priceCents / 100),
    impactNote: product.impactNote, imageUrl,
  };
}
