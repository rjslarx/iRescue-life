/**
 * Curated list of rescues featured on the public platform landing page.
 *
 * This is the single source of truth for the "Rescues on our platform"
 * showcase. To add, remove, or reorder a featured rescue, edit this array.
 * Order here is the display order on the landing page.
 *
 * Each entry only needs a display name and the rescue's canonical site domain
 * (no protocol). The public endpoint best-effort enriches each entry with the
 * matching tenant's logo (by `customDomain`/`customDomainAliases`) when a
 * tenant row exists for that domain — but a tenant row is NOT required for a
 * rescue to appear here.
 */
export interface FeaturedRescue {
  /** Display name shown on the tile. */
  name: string;
  /** Canonical site domain, no protocol or trailing slash (e.g. "haseyas.org"). */
  domain: string;
}

export const FEATURED_RESCUES: FeaturedRescue[] = [
  { name: "Haseya's New Beginning Animal Rescue", domain: "haseyas.org" },
  { name: "Southern Pets Animal Rescue", domain: "southernpetsanimalrescue.com" },
  { name: "Unwanted Feline Organization", domain: "unwantedfeline.org" },
];
