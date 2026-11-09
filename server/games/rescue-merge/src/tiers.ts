export interface ShelterAnimalTier {
  tier: number;
  name: string;
  breed: string;
  radius: number;
  points: number;
  borderColor: string;
  imageUrl: string;
}

interface PublicRescuePet {
  id: string | number;
  name: string;
  breed?: string;
  imageUrl?: string;
}

declare global {
  interface Window {
    INITIAL_PETS?: PublicRescuePet[];
    rescueMergeGame?: any;
  }
}

// Tier geometry, scoring, and ring colors are part of the original game rules.
export const DEFAULT_TIERS: ShelterAnimalTier[] = [
  { tier: 1, radius: 22, points: 10, borderColor: '#f87171' },
  { tier: 2, radius: 32, points: 20, borderColor: '#fb923c' },
  { tier: 3, radius: 46, points: 40, borderColor: '#facc15' },
  { tier: 4, radius: 64, points: 80, borderColor: '#4ade80' },
  { tier: 5, radius: 88, points: 160, borderColor: '#38bdf8' },
  { tier: 6, radius: 120, points: 320, borderColor: '#c084fc' }
].map((tier) => ({ ...tier, name: `Bubble ${tier.tier}`, breed: 'Numbered bubble', imageUrl: '' }));

export function resolveAnimalTiers(): ShelterAnimalTier[] {
  const pets = typeof window !== 'undefined' && Array.isArray(window.INITIAL_PETS)
    ? window.INITIAL_PETS.slice(0, 100) : [];
  const seen = new Set<string>();
  const unique = pets.filter((pet) => {
    if (!pet || (typeof pet.id !== 'string' && typeof pet.id !== 'number')) return false;
    const key = String(pet.id);
    if (!key || seen.has(key) || typeof pet.name !== 'string' || !pet.name.trim()) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
  return DEFAULT_TIERS.map((tier, index) => {
    const pet = unique[index];
    if (!pet) return { ...tier };
    let imageUrl = '';
    try {
      const url = new URL(typeof pet.imageUrl === 'string' ? pet.imageUrl : '');
      if (url.protocol === 'https:') imageUrl = url.href;
    } catch { /* Invalid or missing photos use a numbered bubble. */ }
    return {
      ...tier,
      name: pet.name.trim(),
      breed: typeof pet.breed === 'string' ? pet.breed.trim() : '',
      imageUrl
    };
  });
}
