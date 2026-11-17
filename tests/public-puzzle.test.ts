import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createPublicPuzzleRouter } from '../server/lib/public-puzzle-router';
import { publicPuzzleTenant, publicPuzzleSettingsSchema, puzzleObjectPath } from '../server/lib/public-puzzle-policy';
import { rescueShuffleDocument } from '../server/lib/rescue-shuffle-document';

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
