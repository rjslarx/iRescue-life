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

export const vendingMenuItemSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  impactNote: z.string().trim().min(1).max(180),
  priceCents: z.number().int().min(100).max(100000),
  enabled: z.boolean(),
}).strict();
export const vendingMenuSchema = z.object({
  version: z.string().min(1).max(80),
  machineStyle: z.enum(["classic", "photorealistic"]).default("classic"),
  showInNavigation: z.boolean().default(false),
  shortName: z.string().trim().max(60).refine(value => !value || value.split(/\s+/).length <= 2, "Use one or two words").default(""),
  items: z.array(vendingMenuItemSchema).length(VENDING_ITEMS.length),
}).strict().refine(({ items }) =>
  new Set(items.map(i => i.id)).size === VENDING_ITEMS.length &&
  items.every(i => VENDING_ITEMS.some(base => base.id === i.id)),
  "Keep exactly one entry for each vending slot");
export type VendingMenu = z.infer<typeof vendingMenuSchema>;
export const DEFAULT_VENDING_MENU: VendingMenu = {
  version: VENDING_CATALOG_VERSION,
  machineStyle: "classic",
  showInNavigation: false,
  shortName: "",
  items: VENDING_ITEMS.map(item => ({
    id: item.id, name: item.name, impactNote: item.impactNote,
    priceCents: item.priceCents, enabled: true,
  })),
};
/** Short display branding only; legal rescue identity stays unchanged elsewhere. */
export function vendingMachineTitle(rescueName: string, shortName = "") {
  const name = shortName.trim() || rescueName.trim()
    .split(/\s+(?:animal|rescue|shelter|sanctuary|humane|foundation)\b/i)[0]
    .split(/\s+/).slice(0, /['’]s$/i.test(rescueName.trim().split(/\s+/)[0]) ? 1 : 2).join(" ");
  return name ? `${name} Rescue Vend` : "Rescue Vend";
}
export function vendingMenuItems(menu: VendingMenu) {
  return VENDING_ITEMS.map(base => ({ ...base, ...menu.items.find(i => i.id === base.id)! }));
}

export const vendingCheckoutSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(40),
    quantity: z.number().int().min(1).max(10),
  }).strict()).min(1).max(8),
  checkoutKey: z.string().uuid().optional(),
  catalogVersion: z.string().min(1).max(80).optional(),
}).strict();

export function vendingCart(input: unknown, menu: VendingMenu = DEFAULT_VENDING_MENU) {
  const parsed = vendingCheckoutSchema.parse(input);
  const ids = new Set<string>();
  const items = parsed.items.map(({ id, quantity }) => {
    const product = vendingMenuItems(menu).find(item => item.id === id && item.enabled);
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
}, tenantId: string, menu: VendingMenu = DEFAULT_VENDING_MENU) {
  const meta = session.metadata;
  if (meta?.tenantId !== tenantId || meta?.type !== "rescue_vend" ||
      meta?.vendingCatalogVersion !== menu.version ||
      session.mode !== "payment" || session.currency !== "usd") {
    throw new Error("Vending donation not found");
  }
  const cart = vendingCart({ items: JSON.parse(meta.vendingItems || "null") }, menu);
  if (session.amount_total !== cart.totalCents) throw new Error("Donation total does not match");
  return {
    status: session.payment_status === "paid" ? "paid" as const : "pending" as const,
    items: cart.items,
    totalCents: cart.totalCents,
  };
}
