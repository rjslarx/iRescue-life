import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import express from 'express';
import type { AddressInfo } from 'node:net';

test('preview and revoke send JSON bodies accepted by the same-site request guard', async () => {
  const app = express();
  app.use(express.json());
  const seen: string[] = [];
  app.all('/pilot', (req, res) => {
    if (!req.is('application/json')) return res.status(403).json({ error: 'Same-site JSON request required' });
    assert.deepEqual(req.body, {});
    seen.push(req.method);
    if (req.method === 'DELETE') res.sendStatus(204);
    else res.json({ html: 'private preview' });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/pilot`;
    const module = { exports: {} as any };
    const code = transformSync(readFileSync('client/src/hooks/use-vip-game.ts', 'utf8'), {
      loader: 'ts', format: 'cjs', target: 'es2022',
    }).code;
    vm.runInNewContext(code, { module, exports: module.exports, fetch, AbortSignal,
      require: (name: string) => {
        if (name === '@tanstack/react-query') return {};
        if (name === '@/contexts/AuthContext') return {};
        if (name === '@/contexts/TenantContext') return {};
        if (name === '@/lib/tenantApi') return { getTenantHeaders: () => ({ 'x-tenant-id': 'platform' }) };
        throw new Error(`Unexpected module ${name}`);
      },
    });
    assert.equal((await module.exports.pilotRequest(url, 'POST')).html, 'private preview');
    assert.equal(await module.exports.pilotRequest(url, 'DELETE'), undefined);
    assert.deepEqual(seen, ['POST', 'DELETE']);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
