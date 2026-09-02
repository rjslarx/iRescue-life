/**
 * Public animal profile thumbnail performance regression tests.
 *
 * Run via: scripts/run-tests.sh tests/public-animal-profile-thumbnails.test.ts
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const profileSource = readFileSync(
  new URL('../client/src/pages/PublicAnimalProfilePage.tsx', import.meta.url),
  'utf8',
);

function sourceBetween(start: string, end: string): string {
  const startIndex = profileSource.indexOf(start);
  assert.notEqual(startIndex, -1, `Expected profile source to contain ${start}`);

  const endIndex = profileSource.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `Expected profile source to contain ${end} after ${start}`);

  return profileSource.slice(startIndex, endIndex);
}

test('thumbnail strip requests generated object-storage thumbnails lazily', () => {
  const thumbnailStrip = sourceBetween(
    'data-testid="animal-photo-thumbnails"',
    '<CardContent',
  );

  assert.match(thumbnailStrip, /displayPhotoArray\.map\(\(url, index\) =>/);
  assert.match(thumbnailStrip, /src=\{getThumbnailUrl\(url\)\}/);
  assert.match(thumbnailStrip, /loading="lazy"/);
  assert.doesNotMatch(thumbnailStrip, /loading="eager"/);

  const thumbnailHelper = sourceBetween(
    'function getThumbnailUrl',
    'export default function PublicAnimalProfilePage',
  );
  assert.match(thumbnailHelper, /url\.startsWith\('\/objects\/'\)/);
  assert.match(thumbnailHelper, /return `\$\{url\}-thumb`/);
});

test('main image and enlarged viewer keep the selected original photo', () => {
  const mainImage = sourceBetween(
    'data-testid="button-enlarge-animal-photo"',
    '{hasMultiplePhotos && (',
  );
  assert.match(mainImage, /src=\{displayPhotoArray\[currentPhotoIndex\]\}/);
  assert.doesNotMatch(mainImage, /getThumbnailUrl/);

  const enlargedViewer = sourceBetween(
    'data-testid="animal-photo-viewer"',
    '{hasMultiplePhotos && (',
  );
  assert.match(enlargedViewer, /src=\{displayPhotoArray\[currentPhotoIndex\]\}/);
  assert.doesNotMatch(enlargedViewer, /getThumbnailUrl/);
});

test('missing generated thumbnail retries its original before removing the photo', () => {
  const thumbnailStrip = sourceBetween(
    'data-testid="animal-photo-thumbnails"',
    '<CardContent',
  );

  assert.match(thumbnailStrip, /if \(image\.src\.endsWith\('-thumb'\)\) \{/);
  assert.match(thumbnailStrip, /image\.src = url;/);
  assert.match(thumbnailStrip, /handlePhotoError\(url\);/);

  const retryIndex = thumbnailStrip.indexOf('image.src = url;');
  const removalIndex = thumbnailStrip.indexOf('handlePhotoError(url);');
  assert.ok(retryIndex < removalIndex, 'original retry must happen before photo removal');
});