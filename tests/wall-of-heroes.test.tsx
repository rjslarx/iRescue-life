/**
 * Regression tests for the unified Wall of Heroes page (Task #206).
 *
 * The Wall combines memorial-subscription "heroes" with one-time honor-roll
 * tributes into a single page split into two sections:
 *
 *   - "In Loving Memory & Honor"  (tribute tiles)
 *   - "Our Sustaining Heroes"     (hero tiles)
 *
 * with a few subtle filter rules:
 *
 *   - Search hits both sections.
 *   - Tier filter applies to the heroes section AND hides the tribute section
 *     entirely (tributes have no donor tier, so a tier-filtered view should
 *     not show them).
 *   - The "All Heroes" pill total = heroes.length + honorRoll.length, so the
 *     count visitors see matches what's actually on the page.
 *
 * Run via:  scripts/run-tests.sh tests/wall-of-heroes.test.tsx
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  ALL_TIERS_KEY,
  buildHeroTiles,
  buildTributeTiles,
  FeatheredAvatar,
  filterHeroTiles,
  filterTributeTiles,
  isMemorialHero,
  UnifiedTile,
  type Hero,
  type HeroTile,
  type HonorRollEntry,
  type TributeTile,
} from '../client/src/pages/WallOfHeroesPage';

// --- Fixtures --------------------------------------------------------------

const heroAlex: Hero = {
  displayName: 'Alex',
  tierName: 'Pack Leader',
  since: '2024-01-15',
};

const heroDiamond: Hero = {
  displayName: 'Sam',
  tierName: 'Diamond Circle',
  since: '2023-01-15',
};

// Memorial-subscription hero (has memorial photo).
const heroMemorialPhoto: Hero = {
  displayName: 'Jordan',
  tierName: 'Pack Leader',
  since: '2023-06-01',
  memorialPhotoUrl: 'https://example.com/jordan.jpg',
  memorialFrameStyle: 'heart',
  foreverHero: true,
  foreverHeroTenureMonths: 14,
};

// Memorial by name only (regex match).
const heroMemorialByName: Hero = {
  displayName: 'In memory of Buddy',
  tierName: 'Pack Leader',
  since: '2024-03-01',
};

const tributeMemory: HonorRollEntry = {
  tributeName: 'Bella',
  tributeKind: 'memory',
  frameStyle: 'paw',
  photoUrl: null,
  latestDonationDate: '2025-09-01',
  donorCount: 3,
};

const tributeHonor: HonorRollEntry = {
  tributeName: 'Maya',
  tributeKind: 'honor',
  frameStyle: 'heart',
  photoUrl: 'https://example.com/maya.jpg',
  latestDonationDate: '2025-10-15',
  donorCount: 1,
};

// --- isMemorialHero --------------------------------------------------------

test('isMemorialHero: server-side flag wins', () => {
  assert.equal(
    isMemorialHero({ displayName: 'Plain', tierName: null, since: '2024-01-01', isMemorial: true }),
    true,
  );
});

test('isMemorialHero: memorial photo classifies as memorial', () => {
  assert.equal(isMemorialHero(heroMemorialPhoto), true);
});

test('isMemorialHero: name regex matches "In memory of"/"In honor of" variants', () => {
  assert.equal(isMemorialHero(heroMemorialByName), true);
  assert.equal(isMemorialHero({ ...heroMemorialByName, displayName: 'In honor of Lily' }), true);
  assert.equal(
    isMemorialHero({ ...heroMemorialByName, displayName: 'in loving memory of Otis' }),
    true,
  );
});

test('isMemorialHero: regular donor is not memorial', () => {
  assert.equal(isMemorialHero(heroAlex), false);
});

// --- Tile builders ---------------------------------------------------------

test('buildHeroTiles excludes memorial heroes', () => {
  const tiles = buildHeroTiles([heroAlex, heroMemorialPhoto, heroDiamond, heroMemorialByName]);
  assert.equal(tiles.length, 2);
  assert.deepEqual(
    tiles.map((t) => t.name),
    ['Alex', 'Sam'],
  );
});

test('buildTributeTiles merges memorial heroes and honor-roll entries', () => {
  const tiles = buildTributeTiles(
    [heroAlex, heroMemorialPhoto, heroMemorialByName],
    [tributeMemory, tributeHonor],
  );
  // 2 memorial-subscription tiles + 2 honor-roll tiles
  assert.equal(tiles.length, 4);

  // Memorial heroes come first and carry their memorial photo + foreverHero.
  const jordan = tiles.find((t) => t.name === 'Jordan')!;
  assert.equal(jordan.photoUrl, 'https://example.com/jordan.jpg');
  assert.equal(jordan.foreverHero, true);
  assert.equal(jordan.foreverHeroTenureMonths, 14);
  assert.equal(jordan.showTenure, true);
  assert.equal(jordan.donorCount, 1);

  // Honor-roll entries get prefixed phrasing and preserve donorCount.
  const bella = tiles.find((t) => t.name.includes('Bella'))!;
  assert.equal(bella.name, 'In loving memory of Bella');
  assert.equal(bella.donorCount, 3);
  assert.equal(bella.showTenure, false);
  assert.equal(bella.foreverHero, false);

  const maya = tiles.find((t) => t.name.includes('Maya'))!;
  assert.equal(maya.name, 'In honor of Maya');
  assert.equal(maya.photoUrl, 'https://example.com/maya.jpg');
});

// --- Filtering -------------------------------------------------------------

test('search filter narrows BOTH sections by name (case-insensitive substring)', () => {
  const tributeTiles = buildTributeTiles(
    [heroMemorialPhoto, heroMemorialByName],
    [tributeMemory, tributeHonor],
  );
  const heroTiles = buildHeroTiles([heroAlex, heroDiamond]);

  // "MAY" (uppercased to verify case-insensitive) hits "Maya" (tribute only).
  const t = filterTributeTiles(tributeTiles, 'MAY', ALL_TIERS_KEY);
  const h = filterHeroTiles(heroTiles, 'MAY', ALL_TIERS_KEY);
  assert.deepEqual(
    t.map((x) => x.name),
    ['In honor of Maya'],
  );
  assert.deepEqual(h.map((x) => x.name), []);

  // "sam" hits the hero section only — confirms the same search box drives
  // the heroes filter independently of the tribute filter.
  const tSam = filterTributeTiles(tributeTiles, 'sam', ALL_TIERS_KEY);
  const hSam = filterHeroTiles(heroTiles, 'sam', ALL_TIERS_KEY);
  assert.deepEqual(tSam.map((x) => x.name), []);
  assert.deepEqual(
    hSam.map((x) => x.name),
    ['Sam'],
  );

  // No-match search empties both.
  assert.equal(filterTributeTiles(tributeTiles, 'zzz', ALL_TIERS_KEY).length, 0);
  assert.equal(filterHeroTiles(heroTiles, 'zzz', ALL_TIERS_KEY).length, 0);

  // Empty / whitespace search keeps everything.
  assert.equal(filterTributeTiles(tributeTiles, '', ALL_TIERS_KEY).length, tributeTiles.length);
  assert.equal(filterHeroTiles(heroTiles, '   ', ALL_TIERS_KEY).length, heroTiles.length);
});

test('selecting a specific tier hides the tribute section entirely', () => {
  const tributeTiles = buildTributeTiles([heroMemorialPhoto], [tributeMemory, tributeHonor]);
  // Sanity: with the All-Heroes pill, tributes are visible.
  assert.ok(filterTributeTiles(tributeTiles, '', ALL_TIERS_KEY).length > 0);
  // With any specific tier active, the tribute section is empty.
  assert.equal(filterTributeTiles(tributeTiles, '', 'Pack Leader').length, 0);
  assert.equal(filterTributeTiles(tributeTiles, '', 'Diamond Circle').length, 0);
});

test('tier filter narrows the heroes section to that tier only', () => {
  const heroTiles = buildHeroTiles([heroAlex, heroDiamond]);
  const packOnly = filterHeroTiles(heroTiles, '', 'Pack Leader');
  assert.deepEqual(
    packOnly.map((t) => t.name),
    ['Alex'],
  );
  const diamondOnly = filterHeroTiles(heroTiles, '', 'Diamond Circle');
  assert.deepEqual(
    diamondOnly.map((t) => t.name),
    ['Sam'],
  );
});

test('"All Heroes" pill total equals heroes.length + honorRoll.length', () => {
  // Mixed dataset: 3 monthly heroes (1 of which is a memorial subscription)
  // + 2 honor-roll tributes. The pill total reflects the raw counts so the
  // number visitors see matches the visible cards on the page (memorial
  // heroes still render — they just live in the tribute section).
  const heroes = [heroAlex, heroDiamond, heroMemorialPhoto];
  const honorRoll = [tributeMemory, tributeHonor];

  const tributeTiles = buildTributeTiles(heroes, honorRoll);
  const heroTiles = buildHeroTiles(heroes);

  const allTotal = heroes.length + honorRoll.length;
  const visibleCardsOnAllHeroesView =
    filterTributeTiles(tributeTiles, '', ALL_TIERS_KEY).length +
    filterHeroTiles(heroTiles, '', ALL_TIERS_KEY).length;

  assert.equal(allTotal, 5);
  assert.equal(visibleCardsOnAllHeroesView, allTotal);
});

// --- Section-visibility rules ---------------------------------------------

test('tribute section hidden when there are no tributes (no memorials, no honor roll)', () => {
  const tiles = buildTributeTiles([heroAlex, heroDiamond], []);
  assert.equal(tiles.length, 0);
  assert.equal(filterTributeTiles(tiles, '', ALL_TIERS_KEY).length, 0);
});

test('hero section hidden when every hero is a memorial subscription', () => {
  const tiles = buildHeroTiles([heroMemorialPhoto, heroMemorialByName]);
  assert.equal(tiles.length, 0);
  assert.equal(filterHeroTiles(tiles, '', ALL_TIERS_KEY).length, 0);
});

// --- Component rendering --------------------------------------------------

function makeHeroTile(overrides: Partial<HeroTile> = {}): HeroTile {
  return {
    kind: 'hero',
    key: 'hero-test',
    name: 'Sam',
    since: '2023-01-15',
    tierName: 'Diamond Circle',
    foreverHero: false,
    foreverHeroTenureMonths: null,
    index: 0,
    ...overrides,
  };
}

function makeTributeTile(overrides: Partial<TributeTile> = {}): TributeTile {
  return {
    kind: 'tribute',
    key: 'tribute-test',
    name: 'In loving memory of Bella',
    since: '2025-09-01',
    photoUrl: null,
    donorCount: 1,
    tierName: null,
    foreverHero: false,
    foreverHeroTenureMonths: null,
    showTenure: false,
    index: 0,
    ...overrides,
  };
}

test('Forever Hero badge renders on a memorial-subscription tribute tile', () => {
  const tile = makeTributeTile({
    name: 'Jordan',
    photoUrl: 'https://example.com/jordan.jpg',
    showTenure: true,
    foreverHero: true,
    foreverHeroTenureMonths: 14,
    tierName: 'Pack Leader',
    index: 2,
  });
  const html = renderToStaticMarkup(createElement(UnifiedTile, { tile }));
  assert.match(html, /data-testid="badge-forever-hero-tribute-2"/);
  assert.match(html, /Forever Hero/);
});

test('Forever Hero badge renders on a hero tile when foreverHero=true', () => {
  const tile = makeHeroTile({
    foreverHero: true,
    foreverHeroTenureMonths: 18,
    index: 5,
  });
  const html = renderToStaticMarkup(createElement(UnifiedTile, { tile }));
  assert.match(html, /data-testid="badge-forever-hero-5"/);
});

test('hero tiles never render a Forever Hero badge when foreverHero=false', () => {
  const tile = makeHeroTile({ foreverHero: false, index: 0 });
  const html = renderToStaticMarkup(createElement(UnifiedTile, { tile }));
  assert.doesNotMatch(html, /badge-forever-hero/);
});

test('FeatheredAvatar fallback renders when photoUrl is null', () => {
  const html = renderToStaticMarkup(
    createElement(FeatheredAvatar, { photoUrl: null, name: 'Bella' }),
  );
  assert.match(html, /data-testid="feathered-avatar-fallback"/);
  assert.doesNotMatch(html, /data-testid="feathered-avatar"(?!-)/);
  assert.match(html, /aria-label="Tribute for Bella"/);
});

test('FeatheredAvatar renders the photo path when photoUrl is provided', () => {
  const html = renderToStaticMarkup(
    createElement(FeatheredAvatar, { photoUrl: 'https://example.com/x.jpg', name: 'Maya' }),
  );
  assert.match(html, /data-testid="feathered-avatar"/);
  assert.doesNotMatch(html, /data-testid="feathered-avatar-fallback"/);
  assert.match(html, /https:\/\/example\.com\/x\.jpg/);
});

test('UnifiedTile tribute uses the FeatheredAvatar fallback when photoUrl is null', () => {
  const tile = makeTributeTile({ photoUrl: null, index: 7 });
  const html = renderToStaticMarkup(createElement(UnifiedTile, { tile }));
  assert.match(html, /data-testid="card-tribute-7"/);
  assert.match(html, /data-testid="feathered-avatar-fallback"/);
});

test('UnifiedTile tribute renders "Honored by N donors" subline when donorCount > 1', () => {
  const tile = makeTributeTile({ donorCount: 4, index: 3 });
  const html = renderToStaticMarkup(createElement(UnifiedTile, { tile }));
  assert.match(html, /Honored by 4 donors/);
});

test('UnifiedTile tribute omits the donor-count subline when donorCount = 1', () => {
  const tile = makeTributeTile({ donorCount: 1, index: 4 });
  const html = renderToStaticMarkup(createElement(UnifiedTile, { tile }));
  assert.doesNotMatch(html, /Honored by/);
});
