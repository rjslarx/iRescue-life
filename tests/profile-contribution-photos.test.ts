import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeProfileContributionPhotos } from '../server/lib/profile-contribution-photos';

test('contributed photos append without replacing or reordering the gallery', () => {
  assert.deepEqual(
    mergeProfileContributionPhotos(['primary', 'second'], ['new-a', 'new-b'], 6),
    ['primary', 'second', 'new-a', 'new-b'],
  );
});

test('already-attached and duplicate contributed URLs are idempotent', () => {
  assert.deepEqual(
    mergeProfileContributionPhotos(['primary', 'attached'], ['attached', 'new', 'new'], 6),
    ['primary', 'attached', 'new'],
  );
});

test('an already-attached URL is not treated as a new contributed photo', () => {
  const existing = ['primary', 'attached'];
  const merged = mergeProfileContributionPhotos(existing, ['attached'], 6);
  assert.deepEqual(merged, existing);
  assert.deepEqual(merged.filter((url) => !existing.includes(url)), []);
});

test('gallery capacity is enforced against the latest gallery', () => {
  assert.throws(
    () => mergeProfileContributionPhotos(['1', '2', '3', '4', '5', 'staff-added'], ['contributed'], 6),
    (error: any) => error.status === 409 && /Edit Animal/.test(error.message),
  );
});