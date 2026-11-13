import { z } from "zod";

// Versioned donation menu. Keep this version stable: paid sessions reference it.
export const VENDING_CATALOG_VERSION = "1";
export const VENDING_ITEMS = [
  { code: "A1", id: "treats", name: "Peanut Butter Treats", priceCents: 500, impactNote: "Support training rewards", badgeColor: "#f59e0b", imageUrl: "" },
  { code: "A2", id: "toy", name: "Squeaky Plush Toy", priceCents: 800, impactNote: "Support kennel enrichment", badgeColor: "#ec4899", imageUrl: "" },
  { code: "B1", id: "shampoo", name: "Oatmeal Dog Shampoo", priceCents: 1200, impactNote: "Support comforting intake baths", badgeColor: "#06b6d4", imageUrl: "" },
  { code: "B2", id: "hay", name: "Sanctuary Hay Bale", priceCents: 1500, impactNote: "Support animal feeding and care", badgeColor: "#84cc16", imageUrl: "" },
  { code: "C1", id: "flea", name: "Flea & Tick Chew", priceCents: 1800, impactNote: "Support parasite prevention", badgeColor: "#8b5cf6", imageUrl: "" },
  { code: "C2", id: "microchip", name: "Microchip & ID Tag", priceCents: 2000, impactNote: "Support lost-pet protection", badgeColor: "#3b82f6", imageUrl: "" },
  { code: "D1", id: "heartworm", name: "Heartworm Prevention", priceCents: 2500, impactNote: "Support preventative care", badgeColor: "#ef4444", imageUrl: "" },
  { code: "D2", id: "kibble", name: "Bag of Kibble", priceCents: 3500, impactNote: "Support nourishing meals", badgeColor: "#10b981", imageUrl: "" },
] as const;

export const vendingCheckoutSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(40),
    quantity: z.number().int().min(1).max(10),
  }).strict()).min(1).max(8),
  checkoutKey: z.string().uuid().optional(),
}).strict();

export function vendingCart(input: unknown) {
  const parsed = vendingCheckoutSchema.parse(input);
  const ids = new Set<string>();
  const items = parsed.items.map(({ id, quantity }) => {
    const product = VENDING_ITEMS.find(item => item.id === id);
    if (!product || ids.has(id)) throw new Error("Invalid or duplicate vending item");
    ids.add(id);
    return { ...product, quantity };
  });
  if (items.reduce((sum, item) => sum + item.quantity, 0) > 20) {
    throw new Error("Please select no more than 20 items per donation");
  }
  return {
    items,
    totalCents: items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    checkoutKey: parsed.checkoutKey,
  };
}

export function verifiedVendingSession(session: {
  metadata: Record<string, string> | null;
  mode: string | null;
  currency: string | null;
  amount_total: number | null;
  payment_status: string;
}, tenantId: string) {
  const meta = session.metadata;
  if (meta?.tenantId !== tenantId || meta?.type !== "rescue_vend" ||
      meta?.vendingCatalogVersion !== VENDING_CATALOG_VERSION ||
      session.mode !== "payment" || session.currency !== "usd") {
    throw new Error("Vending donation not found");
  }
  const cart = vendingCart({ items: JSON.parse(meta.vendingItems || "null") });
  if (session.amount_total !== cart.totalCents) throw new Error("Donation total does not match");
  return {
    status: session.payment_status === "paid" ? "paid" as const : "pending" as const,
    items: cart.items,
    totalCents: cart.totalCents,
  };
}
