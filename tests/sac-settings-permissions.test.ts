import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { z } from 'zod';

// Execute the actual shared role middleware, without session/database startup.
const auth = readFileSync('server/middleware/auth.ts', 'utf8');
const roleSource = auth.slice(auth.indexOf('export function requireRole('), auth.indexOf('export function requireRoleOrPageAccess('));
const roleModule = { exports: {} as any };
runInNewContext(transformSync(roleSource, { loader: 'ts', format: 'cjs' }).code, {
  module: roleModule, exports: roleModule.exports,
});
const requireRole = roleModule.exports.requireRole;
const source = readFileSync('server/routes/compliance.ts', 'utf8');

function harness() {
  const routes = new Map<string, any[]>();
  const settings: any = { enabled: false, juvenileAgeDays: 120, intakeMapping: { stray: 'stray_at_large' } };
  let saved: any;
  const db: any = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ sacSettings: settings }] }) }) }),
    update: () => ({ set: (value: any) => ({ where: async () => { saved = value.sacSettings; } }) }),
  };
  const router = Object.fromEntries(['get', 'put', 'post', 'delete', 'patch'].map(method => [
    method, (path: string, ...handlers: any[]) => routes.set(`${method} ${path}`, handlers),
  ]));
  const module = { exports: {} };
  const sacSource = source.slice(0, source.lastIndexOf('/**', source.indexOf("router.get('/impact/settings'")));
  runInNewContext(transformSync(sacSource, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, console,
    require: (id: string) => {
      if (id === 'express') return { Router: () => router };
      if (id === '../db') return { db };
      if (id === '../middleware/auth') return { requireRole, requireAuth: (_q: any, _s: any, next: any) => next() };
      if (id === '../middleware/tenant') return { requireTenant: (_q: any, _s: any, next: any) => next() };
      if (id === 'zod') return { z };
      if (id === 'drizzle-orm') return { eq: () => true };
      if (id === '@shared/schema') return {
        tenants: { id: 'id', sacSettings: 'sac_settings' },
        SAC_INTAKE_CATEGORIES: ['stray_at_large'],
        SAC_OUTCOME_CATEGORIES: ['adoption'],
      };
      throw new Error(`Unexpected import ${id}`);
    },
  });
  return {
    saved: () => saved,
    async request(method: string, path: string, role?: string, body: any = { enabled: true }) {
      const req = { user: role ? { activeRole: role, roles: [role] } : undefined, tenant: { id: 'test-tenant' }, body };
      let status = 200;
      let response: any;
      const res = { status: (code: number) => { status = code; return res; }, json: (data: any) => { response = data; return res; } };
      for (const handler of routes.get(`${method} ${path}`)!) {
        let nextCalled = false;
        await handler(req, res, (error?: Error) => { if (error) throw error; nextCalled = true; });
        if (!nextCalled) break;
      }
      return { status, response };
    },
  };
}

for (const role of ['admin', 'owner', 'platform_admin']) {
  test(`${role} can read and save SAC settings without losing mappings`, async () => {
    const app = harness();
    assert.equal((await app.request('get', '/sac/settings', role)).status, 200);
    assert.equal((await app.request('put', '/sac/settings', role)).status, 200);
    assert.equal(app.saved().enabled, true);
    assert.equal(app.saved().juvenileAgeDays, 120);
    assert.equal(app.saved().intakeMapping.stray, 'stray_at_large');
  });
}

test('manager remains read-only; staff and volunteers cannot save', async () => {
  const app = harness();
  assert.equal((await app.request('get', '/sac/settings', 'manager')).status, 200);
  for (const role of ['manager', 'staff', 'volunteer', 'board_member']) {
    assert.equal((await app.request('put', '/sac/settings', role)).status, 403);
  }
  assert.equal(app.saved(), undefined);
});

test('unauthenticated and invalid requests cannot write', async () => {
  const app = harness();
  assert.equal((await app.request('put', '/sac/settings')).status, 401);
  assert.equal((await app.request('put', '/sac/settings', 'admin', { enabled: 'yes' })).status, 400);
  assert.equal(app.saved(), undefined);
});

test('all SAC routes use shared hierarchy checks and tenant/auth guards', () => {
  const registrations = source.split('\n').filter(line => /^router\./.test(line) && line.includes("'/sac/"));
  assert.equal(registrations.length, 6);
  for (const line of registrations) assert.match(line, /requireTenant, requireAuth, requireRole\('admin'/);
});
