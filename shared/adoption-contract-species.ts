const SOUTHERN_PETS_TENANT_ID = "87f318e1-ffe9-4cc1-9911-633336446f1f";

/**
 * Southern Pets uses one template for cats and dogs. Remove its canine DHPP
 * deadline only for cats; never invent a feline vaccine or reuse a canine date.
 * Apply before signing, not when re-rendering an already executed agreement.
 */
export function adoptionContractForSpecies(html: string, tenantId: string, species?: string | null): string {
  if (tenantId !== SOUTHERN_PETS_TENANT_ID || !/^(cat|feline)$/i.test(species?.trim() || "")) return html;
  return html.replace(
    /<li\b[^>]*>(?:(?!<\/?li\b)[\s\S])*?<\/li>/gi,
    item => /\bDHPP\b|\{\{dhpp_due_date\}\}/i.test(item) ? "" : item,
  );
}
