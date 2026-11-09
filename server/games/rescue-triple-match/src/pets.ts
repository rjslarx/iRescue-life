export interface ShelterPet {
  id: string;
  name: string;
  imageUrl: string;
  accentColor?: string;
  fallbackNumber?: number;
}

declare global {
  interface Window {
    INITIAL_PETS?: ShelterPet[];
  }
}

const DEFAULT_ACCENTS = ['#f59e0b', '#38bdf8', '#a855f7', '#34d399', '#fb7185', '#fbbf24'];

// Explicitly fictional numbered tiles, never sample animals or remote photos.
export const SHELTER_PETS: ShelterPet[] = DEFAULT_ACCENTS.map((accentColor, index) => ({
  id: `fallback-tile-${index + 1}`,
  name: `Tile ${index + 1}`,
  imageUrl: '',
  accentColor,
  fallbackNumber: index + 1
}));

export function resolvePetImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return /^(https?:\/\/|\/(?!\/))/i.test(trimmed) ? trimmed : '';
}

/** Only the server-injected public, available rescue roster may supply real pets. */
export function getActivePetRoster(): ShelterPet[] {
  const roster: ShelterPet[] = [];
  const seen = new Set<string>();
  const injected = typeof window !== 'undefined' && Array.isArray(window.INITIAL_PETS)
    ? window.INITIAL_PETS.slice(0, 100) : [];
  for (const item of injected) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.name !== 'string' || !item.name.trim() || seen.has(item.id)) continue;
    seen.add(item.id);
    roster.push({
      id: item.id,
      name: item.name.trim(),
      imageUrl: typeof item.imageUrl === 'string' ? resolvePetImageUrl(item.imageUrl) : '',
      accentColor: DEFAULT_ACCENTS[roster.length]
    });
    if (roster.length === 6) break;
  }
  for (const fallback of SHELTER_PETS) {
    if (roster.length === 6) break;
    // Keep fallback identities distinct even if a real pet happens to use this ID.
    let id = fallback.id;
    while (seen.has(id)) id = `_${id}`;
    roster.push({ ...fallback, id });
    seen.add(id);
  }
  return roster;
}

export function updatePetNotice(roster: ShelterPet[], failedImages: Set<string>): void {
  const notice = document.getElementById('pet-notice');
  if (!notice) return;
  const fallbackCount = roster.filter((pet) => pet.fallbackNumber !== undefined).length;
  const missingPhotos = roster.some((pet) =>
    pet.fallbackNumber === undefined && (!pet.imageUrl || failedImages.has(pet.id)));
  const messages: string[] = [];
  if (fallbackCount) messages.push(`${fallbackCount} numbered fallback ${fallbackCount === 1 ? 'tile is' : 'tiles are'} used because fewer than 6 rescue pets are available.`);
  if (missingPhotos) messages.push('Unavailable photos use named tiles.');
  notice.textContent = messages.join(' ');
  notice.hidden = messages.length === 0;
}
