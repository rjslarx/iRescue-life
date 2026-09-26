import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isKnownPublicTenantRoute, contestShareEntrantId, contestShareMetadata } from '../server/middleware/og-tags';
import sharp from 'sharp';
import { renderVotingSocialImage, votingSocialPhotoPath, votingSocialVersion, type VotingSocialData } from '../server/lib/voting-social-image';
import { votingPatternSvg } from '../shared/voting-theme-patterns';
import { votingBackgroundStyle } from '../client/src/lib/votingThemes';

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

const socialData: VotingSocialData = {
  name: 'Biscuit', contestTitle: 'Cutest Pet', rescueName: 'Happy Rescue',
  photoUrl: '/objects/photo.jpg', themeBackground: 'halloween',
  primaryColor: '#38204a', accentColor: '#e4a33a',
};

test('contestant OG image is absolute and versioned; other OG images retain generic proxy', () => {
  const source = readFileSync(new URL('../server/middleware/og-tags.ts', import.meta.url), 'utf8');
  assert.match(source, /baseUrl}\/api\/public\/voting-contest-entrants\/\$\{entrant\.id\}\/social-image\?v=\$\{votingSocialVersion/);
  assert.match(source, /if \(ogImage\.includes\('\/objects\/'\)\)/);
  assert.notEqual(votingSocialVersion(socialData), votingSocialVersion({ ...socialData, accentColor: '#112233' }));
  assert.notEqual(votingSocialVersion(socialData), votingSocialVersion({ ...socialData, photoUrl: '/objects/other.jpg' }));
});

test('only tenant-owned object paths can be read for social image', () => {
  const tenant = 'ec24ec95-f0dc-497d-a836-50acee3c27c7';
  assert.equal(votingSocialPhotoPath(`/objects/${tenant}/animal-photos/photo.jpg`, tenant), `/objects/${tenant}/animal-photos/photo.jpg`);
  for (const path of ['https://evil.test/a.jpg', '/objects/other/photo.jpg', `/objects/${tenant}/documents/private.jpg`, `/objects/${tenant}/animal-photos/../private.jpg`, `/objects/${tenant}/animal-photos/%2e%2e/private.jpg`, `/objects/${tenant}/animal-photos/file.jpg?x=1`]) {
    assert.equal(votingSocialPhotoPath(path, tenant), null);
  }
  const source = readFileSync(new URL('../server/middleware/og-tags.ts', import.meta.url), 'utf8');
  assert.match(source, /eq\(votingContestEntrants\.tenantId, tenant\.id\)/);
  assert.match(source, /eq\(votingContests\.tenantId, tenant\.id\)/);
  assert.match(source, /eq\(votingContests\.isActive, true\)/);
});

test('all voting patterns use the exact client background SVG', () => {
  for (const theme of ['birthday', 'confetti', 'hearts', 'paws', 'stars', 'halloween', 'christmas', 'easter', 'lsu_tigers']) {
    assert.equal(votingBackgroundStyle(theme, '#123456')?.backgroundImage,
      `url("data:image/svg+xml,${encodeURIComponent(votingPatternSvg(theme, '#123456')!)}")`);
  }
});

test('social cards render 1200x630 JPEG with themed/color variations and contain photos', async () => {
  const photo = await sharp({ create: { width: 150, height: 500, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const image = await renderVotingSocialImage(socialData, photo);
  assert.deepEqual([ (await sharp(image).metadata()).width, (await sharp(image).metadata()).height, (await sharp(image).metadata()).format ], [1200, 630, 'jpeg']);
  const noPhoto = await renderVotingSocialImage(socialData);
  assert.notDeepEqual(image, noPhoto);
  assert.notDeepEqual(noPhoto, await renderVotingSocialImage({ ...socialData, themeBackground: 'christmas' }));
  assert.notDeepEqual(noPhoto, await renderVotingSocialImage({ ...socialData, primaryColor: '#112233' }));
  // The left/right edge remains theme colored even for a landscape source.
  const landscape = await sharp({ create: { width: 800, height: 100, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const rendered = await renderVotingSocialImage(socialData, landscape);
  const { data, info } = await sharp(rendered).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  assert.notDeepEqual(pixel(30, 300), pixel(300, 300));
  assert.notDeepEqual(pixel(900, 300), pixel(300, 300));
});