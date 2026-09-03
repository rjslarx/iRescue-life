export type BadgeDraft = { key: string; label: string; explanation: string };
export type RevealDraft = { title: string; body: string };

export function appendUniqueTag(tags: string, example: string): string {
  const existing = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  if (existing.some((tag) => tag.toLowerCase() === example.toLowerCase())) {
    return existing.join(", ");
  }
  return [...existing, example].join(", ");
}

export function insertBadgeExample(badges: BadgeDraft[], example: BadgeDraft): BadgeDraft[] {
  const emptyIndex = badges.findIndex((badge) => !badge.label.trim() && !badge.explanation.trim());
  if (emptyIndex < 0) return [...badges, { ...example }];
  return badges.map((badge, index) => index === emptyIndex ? { ...example } : badge);
}

export function insertRevealExample(reveals: RevealDraft[], example: RevealDraft): RevealDraft[] {
  const emptyIndex = reveals.findIndex((reveal) => !reveal.title.trim() && !reveal.body.trim());
  if (emptyIndex < 0) return [...reveals, { ...example }];
  return reveals.map((reveal, index) => index === emptyIndex ? { ...example } : reveal);
}