export function canAttestOpenedRequirement(
  openedVersion: number | undefined,
  currentVersion: number,
): boolean {
  return openedVersion === currentVersion;
}