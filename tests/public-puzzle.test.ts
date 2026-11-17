import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createPublicPuzzleRouter } from '../server/lib/public-puzzle-router';
import { publicPuzzleTenant, publicPuzzleSettingsSchema, puzzleObjectPath, puzzleAvailability, puzzleInstant, puzzleTimezone, type PublicPuzzleSettings } from '../server/lib/public-puzzle-policy';
import { rescueShuffleDocument } from '../server/lib/rescue-shuffle-document';

test('local schedule validates dates and DST, with inclusive opening and exclusive closing', () => {
  const config = { enabled: true, facebookPostUrl: '', startsAt: '2026-11-17T18:00', endsAt: '2026-11-17T19:00' };
  const at = (now: string, zone = 'America/Chicago') => puzzleAvailability(config, zone, Date.parse(now));
  assert.equal(at('2026-11-17T23:59:59Z').availability, 'upcoming');
  assert.equal(at('2026-11-18T00:00:00Z').availability, 'open');
  assert.equal(at('2026-11-18T00:59:59Z').available, true);
  assert.equal(at('2026-11-18T01:00:00Z').availability, 'closed');
  assert.equal(at('2026-11-18T00:00:00Z', 'America/Los_Angeles').availability, 'upcoming');
  assert.equal(puzzleInstant('2026-07-01T18:00', 'America/Chicago'), Date.parse('2026-07-01T23:00:00Z'));
  assert.equal(puzzleInstant('2026-01-01T00:00', 'Asia/Kolkata'), Date.parse('2025-12-31T18:30:00Z'));
  for (const local of ['2026-03-08T02:30', '2026-11-01T01:30']) assert.throws(() => puzzleInstant(local, 'America/Chicago'), /daylight saving/);
  for (const local of ['2026-02-30T12:00', '2026-02-01T24:00', 'not-a-date', '2026-11-17T18:00Z']) {
    assert.equal(publicPuzzleSettingsSchema.safeParse({ ...config, startsAt: local }).success, false);
  }
  assert.equal(publicPuzzleSettingsSchema.safeParse({ ...config, endsAt: config.startsAt }).success, false);
  assert.equal(puzzleAvailability({ enabled: true, facebookPostUrl: '' }, 'America/Chicago').available, true);
  assert.equal(puzzleAvailability({ ...config, enabled: false }, 'America/Chicago', Date.parse('2026-11-18T00:30Z')).availability, 'paused');
  assert.equal(puzzleAvailability({ ...config, startsAt: null }, 'America/Chicago', Date.parse('2020-01-01Z')).available, true);
  assert.equal(puzzleAvailability({ ...config, endsAt: null }, 'America/Chicago', Date.parse('2030-01-01Z')).available, true);
  assert.equal(puzzleTimezone('invalid'), puzzleTimezone(null));
});

test('access and launch share schedule and recheck time and edits after photo preparation', async () => {
  let now = Date.parse('2026-11-18T00:00:00Z');
  let config: PublicPuzzleSettings = { enabled: true, facebookPostUrl: '', startsAt: '2026-11-17T18:00', endsAt: '2026-11-17T19:00' };
  let prepare = () => {};
  const app = express();
  app.use(express.json(), (req, _res, next) => {
    req.tenant = { id: 'haseyas-id', subdomain: 'haseyas', name: 'Haseyas' } as any;
    req.user = { id: 'admin', tenantId: 'haseyas-id', roles: ['admin'] } as any;
    next();
  });
  app.use(createPublicPuzzleRouter({
    requireAuth: (_req, _res, next) => next(), timezone: async () => 'America/Chicago',
    read: async () => ({ ...config }), save: async (_id, value) => { config = value; },
    now: () => now, launch: async () => { prepare(); return { html: 'private-until-checked', pet: null }; },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const request = (path: string, body?: unknown) => fetch(`${url}/${path}`, {
    method: path === 'access' ? 'GET' : path === 'settings' ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: path === 'access' ? undefined : JSON.stringify(body ?? {}),
  });
  try {
    now--;
    assert.equal((await (await request('access')).json()).availability, 'upcoming');
    assert.equal((await request('launch')).status, 403);
    assert.equal((await request('launch', { resume: { petId: null, photoVersion: null } })).status, 403);
    now++;
    assert.equal((await request('launch')).status, 200);
    assert.equal((await request('launch', { resume: { petId: null, photoVersion: null } })).status, 200);
    prepare = () => { now = Date.parse('2026-11-18T01:00:00Z'); };
    const closed = await request('launch', { resume: { petId: null, photoVersion: null } });
    assert.equal(closed.status, 403);
    assert.doesNotMatch(await closed.text(), /private-until-checked/);
    assert.equal((await (await request('access')).json()).availability, 'closed');
    now = Date.parse('2026-11-18T00:00:00Z');
    prepare = () => { config.startsAt = '2026-11-17T18:30'; };
    assert.equal((await request('launch')).status, 403);
    assert.equal((await request('settings', { ...config, startsAt: '2026-11-01T01:30' })).status, 400);
    assert.equal((await request('settings', { ...config, startsAt: null, endsAt: null })).status, 200);
    assert.equal((await (await request('access')).json()).available, true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test('public exception and Facebook post settings stay narrowly scoped', () => {
  assert.equal(publicPuzzleTenant('haseyas'), true);
  for (const slug of [undefined, 'southern-pets', 'Haseyas', 'haseyas.attacker']) assert.equal(publicPuzzleTenant(slug), false);
  for (const url of ['', 'https://www.facebook.com/posts/123', 'https://m.facebook.com/story.php?story_fbid=123']) {
    assert.equal(publicPuzzleSettingsSchema.safeParse({ enabled: true, facebookPostUrl: url }).success, true);
  }
  for (const url of ['javascript:alert(1)', 'http://facebook.com/posts/1', 'https://facebook.com.evil.test/posts/1', 'https://evil@facebook.com/posts/1', 'https://facebook.com:444/posts/1', 'https://facebook.com/', 'https://facebook.com/l.php?u=https://evil.test']) {
    assert.equal(publicPuzzleSettingsSchema.safeParse({ enabled: true, facebookPostUrl: url }).success, false, url);
  }
  assert.equal(publicPuzzleSettingsSchema.safeParse({ enabled: true, facebookPostUrl: '', gameId: 'pasture-run' }).success, false);
});

test('photo path resolver never becomes an arbitrary URL proxy', () => {
  const hosts = ['haseyas.org'];
  assert.equal(puzzleObjectPath('/objects/tenant/animal-photos/abc', hosts), '/objects/tenant/animal-photos/abc');
  assert.equal(puzzleObjectPath('https://haseyas.org/objects/tenant/photo.jpg', hosts), '/objects/tenant/photo.jpg');
  for (const url of ['https://evil.test/objects/photo', 'http://127.0.0.1/objects/a', '//evil.test/objects/a', '/objects/../private', '/objects/%2e%2e/private', '/objects/a?token=secret', 'https://haseyas.org/objects/a?token=secret', 'data:image/svg+xml,test', '/objects/a#fragment']) {
    assert.equal(puzzleObjectPath(url, hosts), null, url);
  }
});

test('public launch and settings enforce tenant, roles, pause, no game bypass and no-store', async () => {
  let config = { enabled: false, facebookPostUrl: '' };
  let launchCount = 0;
  let pauseDuringLaunch = false;
  let gamePet: { id: string } | null = null;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = { id: 'haseyas-id', subdomain: req.get('x-slug') || 'haseyas', name: 'Haseyas' } as any;
    if (req.get('x-role')) req.user = { id: 'admin-id', tenantId: req.get('x-user-tenant') || 'haseyas-id', roles: [req.get('x-role')] } as any;
    next();
  });
  app.use(createPublicPuzzleRouter({
    timezone: async () => null,
    requireAuth: (req, res, next) => req.user ? next() : void res.sendStatus(401),
    read: async id => { assert.equal(id, 'haseyas-id'); return { ...config }; },
    save: async (id, value, userId) => {
      assert.equal(id, 'haseyas-id'); assert.equal(userId, 'admin-id'); config = value;
    },
    launch: async id => {
      assert.equal(id, 'haseyas-id'); launchCount++;
      if (pauseDuringLaunch) config.enabled = false;
      return { html: 'puzzle only', pet: gamePet, photoVersion: gamePet ? 'b'.repeat(64) : null };
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const request = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  try {
    assert.equal((await request('access', 'GET', undefined, { 'x-slug': 'southern-pets' })).status, 404);
    const access = await request('access');
    assert.equal(access.headers.get('cache-control'), 'no-store');
    assert.equal((await access.json()).enabled, false);
    assert.equal((await request('launch', 'POST')).status, 403);
    assert.equal((await request('launch', 'POST', { resume: { petId: 'pet', photoVersion: 'a'.repeat(64) } })).status, 403);
    assert.equal(launchCount, 0);
    assert.equal((await request('settings')).status, 401);
    for (const role of ['volunteer', 'staff', 'adopter', 'platform_admin']) {
      assert.equal((await request('settings', 'PUT', { enabled: true, facebookPostUrl: '' }, { 'x-role': role })).status, 403);
    }
    assert.equal((await request('settings', 'PUT', { enabled: true, facebookPostUrl: '' }, { 'x-role': 'admin', 'x-user-tenant': 'other' })).status, 403);
    assert.equal((await request('settings', 'PUT', { enabled: true, facebookPostUrl: '' }, { 'x-role': 'admin', 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await request('settings', 'PUT', { enabled: true, facebookPostUrl: 'https://evil.test' }, { 'x-role': 'owner' })).status, 400);
    assert.equal((await request('settings', 'PUT', { enabled: true, facebookPostUrl: '' }, { 'x-role': 'admin' })).status, 200);
    assert.equal((await request('launch?gameId=pasture-run', 'POST')).status, 400);
    assert.equal((await request('launch', 'POST', { tenantId: 'other' })).status, 400);
    assert.equal((await request('launch', 'POST')).status, 200);
    assert.equal(launchCount, 1);
    assert.equal((await request('launch', 'POST', { resume: { petId: 'pet', photoVersion: 'a'.repeat(64) } })).status, 409);
    assert.equal((await request('launch', 'POST', { resume: { petId: null, photoVersion: null } }, { 'x-slug': 'other' })).status, 404);
    gamePet = { id: 'pet' };
    const changedPhoto = await request('launch', 'POST', { resume: { petId: 'pet', photoVersion: 'a'.repeat(64) } });
    assert.equal(changedPhoto.status, 409);
    assert.equal((await changedPhoto.json()).pet, undefined);
    assert.equal((await request('launch', 'POST', { resume: { petId: 'pet', photoVersion: 'b'.repeat(64) } })).status, 200);
    pauseDuringLaunch = true;
    assert.equal((await request('launch', 'POST')).status, 403);
    assert.equal((await request('launch', 'POST')).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test('engine reports only solved boards, suppresses public overlay, and clears old results on reset', async () => {
  const script = await readFile('server/games/rescue-shuffle/app.js', 'utf8');
  const messages: any[] = [];
  const context = vm.createContext({
    PUBLIC_CHALLENGE: true, SHELTER_PETS: [{ id: 'pet', name: 'Friend', breed: '', imageUrl: null }],
    window: { addEventListener() {}, parent: { postMessage: (message: unknown) => messages.push(message) } },
    clearTimeout() {}, setTimeout() { throw new Error('Public win must not open overlay'); },
  });
  vm.runInContext(`${script};globalThis.Game=RescueShuffleGame`, context);
  const game = Object.create(context.Game.prototype);
  Object.assign(game, {
    board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0],
    isSolved: false, moves: 17, elapsedSeconds: 24, currentPetIndex: 0,
    winTitle: {}, winStats: {}, petSubtitleEl: {}, petNameEl: {}, petBreedEl: {},
    petPreviewEl: { removeAttribute() {} }, winOverlay: { classList: { add() {} } },
    stopTimer() {}, render() {}, updateStatsUI() {}, loadPetImage() {}, shuffleBoard() {},
  });
  game.handleWin(); game.handleWin();
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), { type: 'rescue-shuffle-solved', petId: 'pet', moves: 17, seconds: 24 });
  game.startNewGame(false);
  assert.equal(messages[1].type, 'rescue-shuffle-reset');
  assert.equal(game.isSolved, false);
  game.board = [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
  game.handleWin();
  assert.equal(messages.length, 2);
});

test('public and private documents preserve opaque sandbox CSP and escaped data', async () => {
  const pets = [{ id: 'p', name: '</script><script>bad()', breed: '', imageUrl: 'data:image/jpeg;base64,YQ==' }];
  const publicDoc = await rescueShuffleDocument(pets, { publicChallenge: true });
  const privateDoc = await rescueShuffleDocument(pets);
  assert.match(publicDoc, /PUBLIC_CHALLENGE = true/);
  assert.match(privateDoc, /PUBLIC_CHALLENGE = false/);
  assert.match(publicDoc, /connect-src 'none'/);
  assert.match(publicDoc, /\\u003c\/script>/);
  const service = await readFile('server/services/public-puzzle.ts', 'utf8');
  assert.match(service, /publicAnimalFilter\(tenantId\)/);
  assert.match(service, /eq\(animals.status, 'available'\)/);
  assert.match(service, /acl.visibility !== 'public'/);
  assert.doesNotMatch(service, /\bfetch\(/);
});
