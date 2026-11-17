import { z } from "zod";
export const communityCategories = ["Home", "Furniture", "Clothing", "Electronics", "Pet supplies", "Other"] as const;
export const facebookContactSchema = z.string().trim().url().max(400).refine(value => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port &&
      ["facebook.com", "www.facebook.com", "m.facebook.com", "m.me"].includes(u.hostname) &&
      u.pathname.length > 1 && !/^\/(?:l\.php|sharer|share\.php|dialog|login|logout|redirect)/i.test(u.pathname) &&
      Array.from(u.searchParams.keys()).every(k => k === "id");
  } catch { return false; }
}, "Use a direct HTTPS Facebook profile, post, or m.me contact link, without tracking or redirect parameters.");
export const communityItemSchema = z.object({
  tenantId: z.string().uuid(),
  donorName: z.string().trim().min(2).max(100),
  facebookContactUrl: facebookContactSchema,
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(15).max(3000),
  category: z.enum(communityCategories),
  zip: z.string().regex(/^\d{5}$/, "Enter a five-digit ZIP code"),
  askingCents: z.number().int().min(100).max(500000),
  photos: z.array(z.string().max(500)).min(1).max(3),
  proceedsMode: z.enum(["donate_all", "split_50"]).default("donate_all"),
  ownership: z.literal(true),
  goodsOnly: z.literal(true),
  splitConsent: z.boolean().default(false),
}).strict().refine(i => i.proceedsMode !== "split_50" || i.splitConsent, "Agree to the net-proceeds split.");
export const partnerSettingsSchema = z.object({
  optedIn: z.boolean(), allowSplit: z.boolean(), splitMinimumCents: z.number().int().min(5000).max(500000),
}).strict();
export const partnerReviewSchema = z.object({
  approved: z.boolean(), nonprofitReviewed: z.boolean(),
  publicName: z.string().trim().min(2).max(150),
  city: z.string().trim().min(2).max(100),
  publicEin: z.string().regex(/^$|^\d{2}-\d{7}$/),
  note: z.string().trim().max(1000),
}).strict().refine(v => !v.approved || v.nonprofitReviewed, "Review the rescue's nonprofit eligibility before approving.");
export function communityPublicItem(row: any) {
  const d = row.data;
  return { id: row.id, tenantId: row.tenant_id, title: d.title, description: d.description,
    category: d.category, zip: d.zip, askingCents: d.askingCents, photos: d.photos,
    proceedsMode: d.proceedsMode, sellerFirstName: d.donorName.split(/\s+/)[0],
    facebookContactUrl: d.facebookContactUrl, status: row.status, version: row.version, createdAt: row.created_at };
}
export function communityCaption(item: any, name: string, url: string, linkFree = false) {
  const proceeds = item.proceedsMode === "split_50"
    ? `Half of net proceeds supports ${name}; half goes to the seller.`
    : `All net proceeds support ${name}.`;
  const payment = linkFree ? "Message me for availability and the secure checkout link."
    : `Arrange pickup and negotiate in Messenger. Pay the agreed price securely here:\n${url}`;
  return `${item.title} — $${(item.askingCents / 100).toFixed(2)}\n\n${item.description}\n\nLocal pickup · ZIP ${item.zip}\n${proceeds} A 5% platform fee and payment processing fees are deducted from the price.\n${payment}\nFacebook posts are updated manually.`;
}
