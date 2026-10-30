export const isCatSpecies = (species?: string | null) => /^(cat|cats|feline)$/i.test(species?.trim() || "");
export const isCanineCombination = (name?: string | null) => /\b(dhpp|dhlpp|da2pp|da2p|dapp|dappv|dappl)\b/i.test(name || "");
export function assertCatVaccineCompatible(species: string | null | undefined, name: string) {
  if (isCatSpecies(species) && isCanineCombination(name)) {
    throw Object.assign(new Error("DHPP and other canine combination vaccines cannot be assigned to cats. Select the appropriate feline vaccine instead."), { status: 400 });
  }
}
