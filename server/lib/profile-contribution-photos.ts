export function mergeProfileContributionPhotos(
  existingPhotos: string[],
  proposedPhotos: string[],
  maximumPhotos: number,
): string[] {
  const additions = Array.from(new Set(proposedPhotos))
    .filter((url) => !existingPhotos.includes(url));
  if (existingPhotos.length + additions.length > maximumPhotos) {
    throw Object.assign(
      new Error(`This gallery can hold ${maximumPhotos} photos. Remove a photo in Edit Animal before approving or submitting these additions.`),
      { status: 409 },
    );
  }
  return [...existingPhotos, ...additions];
}