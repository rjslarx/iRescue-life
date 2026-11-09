import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTeamGameRouter } from '../server/lib/team-game-router';

test('team games enforce session, tenant, roles, enabled flag and game identity', async () => {
  const app = express();
  app.use(express.json());
  let enabled = true;
  const documents: string[] = [];
  app.use((req, _res, next) => {
    req.tenant = { id: 'rescue-a' } as any;
    if (req.get('x-test-role')) req.user = {
      id: 'person', tenantId: req.get('x-test-tenant') || 'rescue-a',
      roles: req.get('x-test-role')!.split(','), activeRole: 'adopter',
    } as any;
    next();
  });
  app.use('/games', createTeamGameRouter({
    requireAuth: (req, res, next) => req.user ? next() : void res.sendStatus(401),
    enabled: async tenant => { assert.equal(tenant, 'rescue-a'); return enabled; },
    document: async (game, tenant) => { documents.push(`${tenant}:${game}`); return '<p>Game</p>'; },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const request = (action = 'access', role?: string, extra: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}/games/${action}`, {
      method: action === 'access' ? 'GET' : 'POST',
      headers: { ...(role ? { 'x-test-role': role } : {}), 'Content-Type': 'application/json', ...extra },
      body: action === 'access' ? undefined : JSON.stringify({ tenantId: 'attacker-tenant' }),
    });
  try {
    assert.equal((await request()).status, 401);
    for (const role of ['adopter', 'foster', 'platform_admin']) {
      assert.equal((await request('access', role)).status, 403);
      assert.equal((await request('launch', role)).status, 403);
    }
    assert.equal((await request('launch', 'volunteer', { 'x-test-tenant': 'rescue-b' })).status, 403);
    for (const role of ['owner', 'admin', 'board_member', 'staff', 'volunteer', 'foster,volunteer']) {
      const access = await request('access', role);
      assert.equal(access.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await access.json(), { eligible: true });
    }
    assert.equal((await request('launch?gameId=rescue-shuffle', 'volunteer')).status, 200);
    assert.equal((await request('launch?gameId=pasture-run', 'staff')).status, 200);
    assert.deepEqual(documents, ['rescue-a:rescue-shuffle', 'rescue-a:pasture-run']);
    assert.equal((await request('launch?gameId=rescue-triple-match', 'volunteer')).status, 200);
    assert.equal(documents[2], 'rescue-a:rescue-triple-match');
    assert.equal((await request('launch?gameId=rescue-merge', 'volunteer')).status, 200);
    assert.equal(documents[3], 'rescue-a:rescue-merge');
    assert.equal((await request('start?gameId=rescue-shuffle', 'volunteer')).status, 204);
    assert.equal((await request('launch?gameId=unknown', 'staff')).status, 400);
    assert.equal((await request('launch', 'staff', { 'sec-fetch-site': 'cross-site' })).status, 403);
    enabled = false;
    assert.deepEqual(await (await request('access', 'volunteer')).json(), { eligible: false });
    assert.equal((await request('launch', 'volunteer')).status, 403);
    assert.equal((await request('start', 'volunteer')).status, 403);
    assert.equal(documents.length, 4);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
