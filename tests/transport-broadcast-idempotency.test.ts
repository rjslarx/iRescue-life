/**
 * RUN_TRANSPORT_DB_TEST=1 npx tsx --test tests/transport-broadcast-idempotency.test.ts
 * Real PostgreSQL in an isolated schema, production HTTP handler, fake SMS only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import express from 'express';
import pg from 'pg';
import { runTransportBroadcast } from '../server/services/transport-broadcast';
import { transportBroadcastAttempt } from '../client/src/lib/transport-broadcast-key';
import { transportSmsSchemaSql } from '../server/lib/transport-sms-schema';

test('startup and post-merge provisioning create the same operation table', () => {
  assert.equal(transportSmsSchemaSql.trim(), readFileSync('scripts/transport-sms-operations.sql', 'utf8').trim());
});

test('actual broadcast caller uses tenantId and posts a stable key after response loss', async () => {
  const page = readFileSync('client/src/pages/CollaborationHubPage.tsx', 'utf8');
  const dialog = page.slice(page.indexOf('function TransportDetailDialog('));
  assert.match(dialog, /const \{ tenantId \} = useTenant\(\)/);
  assert.match(dialog, /const twilioEnabled = tenantTierData\?\.tenant\?\.twilioEnabled/);
  const mutation = dialog.slice(dialog.indexOf('const broadcastMutation = useMutation('));
  const functionText = mutation.slice(mutation.indexOf('async (message: string)'), mutation.indexOf(',\n    onSuccess:'));
  const compiled = await build({
    stdin: { contents: `module.exports = ${functionText}`, loader: 'ts' },
    write: false, platform: 'node', format: 'cjs',
  });
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const requests: any[] = [];
  const module = { exports: null as any };
  runInNewContext(compiled.outputFiles[0].text, {
    module, localStorage, transportBroadcastAttempt,
    user: { id: 'staff' }, tenantId: 'rescue', transport: { id: 'trip' },
    apiRequest: async (method: string, path: string, body: any) => {
      requests.push({ method, path, body });
      if (requests.length === 1) throw Error('Response lost');
      return { json: async () => ({ complete: true, uncertain: 0, sent: 1 }) };
    },
  });
  await assert.rejects(module.exports('Arriving'), /Response lost/);
  await module.exports('Arriving');
  assert.equal(requests[0].path, '/api/transports/trip/sms-broadcast');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body.operationKey, requests[1].body.operationKey);
  assert.ok(requests[0].body.operationKey);
});

test('caller keeps unresolved keys across reloads, draft edits, and tenant switches', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const first = transportBroadcastAttempt(storage, ['user', 'rescue', 'trip'], 'Hello');
  assert.equal(transportBroadcastAttempt(storage, ['user', 'rescue', 'trip'], 'Hello').operationKey, first.operationKey);
  assert.notEqual(transportBroadcastAttempt(storage, ['user', 'other', 'trip'], 'Hello').operationKey, first.operationKey);
  assert.notEqual(transportBroadcastAttempt(storage, ['user', 'rescue', 'trip'], 'Edited').operationKey, first.operationKey);
  assert.equal(transportBroadcastAttempt(storage, ['user', 'rescue', 'trip'], 'Hello').operationKey, first.operationKey);
  first.finish();
  assert.notEqual(transportBroadcastAttempt(storage, ['user', 'rescue', 'trip'], 'Hello').operationKey, first.operationKey);
  assert.throws(() => transportBroadcastAttempt({
    ...storage, setItem() { throw Error('Storage unavailable'); },
  }, ['new'], 'Message'), /Storage unavailable/);
});

test('concurrent HTTP requests and response-loss retries send once across DB connections',
  { skip: process.env.RUN_TRANSPORT_DB_TEST !== '1', timeout: 60000 }, async () => {
  const schema = `transport_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, max: 5,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  let releaseSend!: () => void;
  let startSend!: () => void;
  const started = new Promise<void>(resolve => { startSend = resolve; });
  const held = new Promise<void>(resolve => { releaseSend = resolve; });
  const sends: string[] = [];
  let subscribers = ['2025550101', '+12025550101', '+12025550102'];
  let hold = true;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(readFileSync('scripts/transport-sms-operations.sql', 'utf8'));
    const routes = readFileSync('server/routes.ts', 'utf8');
    const start = routes.indexOf("  app.post('/api/transports/:id/sms-broadcast'");
    const end = routes.indexOf("\n  /**", start);
    const fixture = {
      pool,
      getTransportSmsSubscribers: async () => subscribers,
      broadcastTransportUpdate: async (_tenant: string, _trip: string, _message: string, numbers: string[]) => {
        sends.push(...numbers);
        startSend();
        if (hold) await held;
        return numbers.map(number => ({ number, status: 'sent', sid: `SM${number}` }));
      },
    };
    const compiled = await build({
      stdin: {
        contents: `import {z} from 'zod';
          const requireTenant=(req,res,next)=>{req.tenant={id:req.headers['x-tenant']||'rescue'};next()};
          const requireAuth=(req,res,next)=>{req.user={id:'staff',name:'Staff'};next()};
          const transportEvents={}; const eq=()=>true,and=()=>true;
          const db={select:()=>({from:()=>({where:()=>({limit:async()=>[{id:'trip'}]})})})};
          export function register(app) {${routes.slice(start, end)}}`,
        resolveDir: process.cwd() + '/server', loader: 'ts',
      },
      bundle: true, platform: 'node', format: 'cjs', write: false,
      plugins: [{
        name: 'fake-sms-only',
        setup(b) {
          b.onResolve({ filter: /^(\.\/(db|lib\/twilio-service)|@shared\/schema)$/ }, args => ({ path: args.path, namespace: 'fake' }));
          b.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({
            contents: args.path === '@shared/schema' ? 'export const transportEvents={};' :
              args.path === './db' ? 'export const pool=globalThis.fixture.pool;' :
              'export const {broadcastTransportUpdate,getTransportSmsSubscribers}=globalThis.fixture;',
          }));
        },
      }],
    });
    const module = { exports: {} as any };
    runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, fixture, console });
    const app = express();
    app.use(express.json());
    module.exports.register(app);
    app.use((error: any, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address() as { port: number };
    const post = async (body: any, tenant = 'rescue', trip = 'trip') => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/transports/${trip}/sms-broadcast`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant': tenant },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    };
    const input = { message: 'Arriving soon', operationKey: randomUUID() };
    assert.equal((await post({ message: 'Missing key' })).status, 400);
    const first = post(input);
    await started;
    const concurrent = await post(input);
    assert.equal(concurrent.status, 202);
    assert.equal(concurrent.body.uncertain, 2);
    assert.equal(sends.length, 1);
    releaseSend();
    hold = false;
    const finished = await first;
    assert.equal(finished.status, 200);
    assert.equal(finished.body.sent, 2);
    // Treat the original response as lost, retry after recipients change.
    subscribers = [];
    assert.deepEqual(await post(input), finished);
    assert.equal(sends.length, 2);
    assert.equal((await post({ ...input, message: 'Changed' })).status, 409);
    subscribers = ['+12025550101'];
    assert.equal((await post(input, 'other-rescue')).body.sent, 1);
    assert.equal((await post(input, 'rescue', 'other-trip')).body.sent, 1);
    assert.equal(sends.length, 4);

    const query = (text: string, values: any[]) => pool.query(text, values);
    const uncertainInput = { tenantId: 'rescue', transportId: 'trip', operationKey: randomUUID(), message: 'Unknown' };
    let attempts = 0;
    const unknown = await runTransportBroadcast(query, uncertainInput, async () => subscribers, async () => {
      attempts++; throw Error('Provider response lost');
    });
    assert.equal(unknown.uncertain, 1);
    const retry = await runTransportBroadcast(query, uncertainInput, async () => [], async () => { throw Error('Must not send'); });
    assert.deepEqual(retry, unknown);
    assert.equal(attempts, 1);

    // Simulate accepted SMS followed by a failed outcome write/process exit.
    const crashInput = { ...uncertainInput, operationKey: randomUUID() };
    await assert.rejects(runTransportBroadcast(async (text, values) => {
      if (text.includes('UPDATE')) throw Error('Database disconnected');
      return query(text, values);
    }, crashInput, async () => subscribers, async number => {
      attempts++; return { number, status: 'sent', sid: 'accepted-before-crash' };
    }), /Database disconnected/);
    const recovered = await runTransportBroadcast(query, crashInput, async () => [], async () => { throw Error('Must not send'); });
    assert.equal(recovered.complete, false);
    assert.equal(recovered.uncertain, 1);
    assert.equal(attempts, 2);

    // Force two independent connections to race the initial INSERT, rather
    // than merely reading a claim already made by another request.
    const connections = await Promise.all([pool.connect(), pool.connect()]);
    let arrivals = 0;
    let releaseRace!: () => void;
    const raceGate = new Promise<void>(resolve => { releaseRace = resolve; });
    const raceInput = { ...uncertainInput, operationKey: randomUUID() };
    let raceSends = 0;
    try {
      await Promise.all(connections.map(connection => runTransportBroadcast(async (text, values) => {
        if (text.includes('INSERT')) {
          arrivals++;
          if (arrivals === 2) releaseRace();
          await raceGate;
        }
        return connection.query(text, values);
      }, raceInput, async () => subscribers, async number => {
        raceSends++;
        return { number, status: 'failed', error: 'Opted out' };
      })));
      assert.equal(arrivals, 2);
      assert.equal(raceSends, 1);
      const failedReplay = await runTransportBroadcast(query, raceInput, async () => [], async () => { throw Error('Must not send'); });
      assert.equal(failedReplay.failed, 1);
      assert.equal(failedReplay.uncertain, 0);
    } finally {
      connections.forEach(connection => connection.release());
    }
  } finally {
    releaseSend?.();
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
