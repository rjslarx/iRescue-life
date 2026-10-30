import { isCatSpecies, isCanineCombination } from "./vaccine-species";

/**
 * Shared templates can serve cats and dogs. Remove canine combination vaccine
 * deadline only for cats; never invent a feline vaccine or reuse a canine date.
 * Apply before signing, not when re-rendering an already executed agreement.
 */
export function adoptionContractForSpecies(html: string, tenantId: string, species?: string | null): string {
  if (!isCatSpecies(species)) return html;
  return html.replace(
    /<li\b[^>]*>(?:(?!<\/?li\b)[\s\S])*?<\/li>/gi,
    item => isCanineCombination(item) || /\{\{dhpp_due_date\}\}/i.test(item) ? "" : item,
  );
}
