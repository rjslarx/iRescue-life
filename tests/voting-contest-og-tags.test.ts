import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isKnownPublicTenantRoute, contestShareEntrantId, contestShareMetadata } from '../server/middleware/og-tags';

const entrantId = 'ec24ec95-f0dc-497d-a836-50acee3c27c7';
const contest = { title: 'Cutest Pet', description: 'Meet the pets', imageUrl: '/objects/contest.jpg' };

test('contest pages are public for every user agent, but unrelated paths are not', () => {
  assert.equal(isKnownPublicTenantRoute('/contest/cutest-pet'), true);
  assert.equal(isKnownPublicTenantRoute('/contest/'), false);
  assert.equal(isKnownPublicTenantRoute('/dashboard/contest/cutest-pet'), false);
});

test('only one valid entrant UUID is eligible for a contestant preview', () => {
  assert.equal(contestShareEntrantId(`/contest/cutest-pet?entrant=${entrantId}&utm_source=fb`), entrantId);
  for (const url of [
    '/contest/cutest-pet?entrant=not-an-id',
    `/contest/cutest-pet?entrant=${entrantId}&entrant=${entrantId}`,
    '/contest/cutest-pet?utm_source=fb',
  ]) assert.equal(contestShareEntrantId(url), null, url);
});

test('contestant share metadata prefers contestant content and falls back to vote CTA and contest image', () => {
  assert.deepEqual(contestShareMetadata(contest, 'Happy Rescue', {
    name: 'Biscuit', description: 'A sunny pup', photoUrl: '/objects/biscuit.jpg',
  }), {
    title: 'Vote for Biscuit | Cutest Pet',
    description: 'A sunny pup',
    imageUrl: '/objects/biscuit.jpg',
  });
  assert.deepEqual(contestShareMetadata(contest, 'Happy Rescue', {
    name: 'Biscuit', description: ' ', photoUrl: null,
  }), {
    title: 'Vote for Biscuit | Cutest Pet',
    description: 'Vote for Biscuit in Cutest Pet! $1 = 1 vote. Support Happy Rescue.',
    imageUrl: '/objects/contest.jpg',
  });
  assert.deepEqual(contestShareMetadata(contest, 'Happy Rescue'), {
    title: 'Cutest Pet | Happy Rescue', description: 'Meet the pets', imageUrl: '/objects/contest.jpg',
  });
});

test('middleware scopes both lookups and only canonicals a resolved entrant', () => {
  const source = readFileSync(new URL('../server/middleware/og-tags.ts', import.meta.url), 'utf8');
  assert.match(source, /eq\(votingContests\.tenantId, tenant\.id\)/);
  assert.match(source, /eq\(votingContests\.isActive, true\)/);
  assert.match(source, /eq\(votingContestEntrants\.tenantId, tenant\.id\)/);
  assert.match(source, /eq\(votingContestEntrants\.contestId, contest\.id\)/);
  assert.match(source, /if \(entrant\) contestCanonicalEntrantId = entrant\.id/);
  assert.match(source, /const canonicalPath = contestMatch[\s\S]*?contestCanonicalEntrantId/);
  assert.match(source, /<meta property="og:url" content="\$\{escapeHtml\(canonicalUrl\)\}"/);
  assert.match(source, /res\.status\(200\)\.set\(\{ 'Content-Type': 'text\/html' \}\)\.end\(html\)/);
});