/**
 * API validation tests for the tenant-level "authorized signature on file"
 * endpoints (Task #240, follow-up Task #242):
 *
 *   PUT    /api/tenant/settings/receipt-signature
 *   DELETE /api/tenant/settings/receipt-signature
 *
 * These routes are extracted into registerReceiptSignatureRoutes() so they can
 * be mounted on a throwaway Express app here. The auth/tenant middleware are
 * stubbed to inject a known tenant + acting user, but requireRole is the REAL
 * implementation so the admin-only gate is genuinely exercised.
 *
 * Coverage:
 *   - invalid / non-image data URL          → 400
 *   - oversized image (> 2MB)               → 400
 *   - metadata-only update, no saved sig    → 400
 *   - metadata-only update, saved sig       → 200, name/title updated, url kept
 *   - valid signature upload                → 200, url stored
 *   - DELETE                                → 200, all three fields cleared
 *   - non-admin acting role                 → 403 (PUT and DELETE)
 *
 * Run via:  scripts/run-tests.sh tests/receipt-signature-api.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import sharp from 'sharp';

import { db } from '../server/db';
import { tenants, donors } from '../shared/schema';
import { eq } from 'drizzle-orm';

import { registerReceiptSignatureRoutes } from '../server/routes/receipt-signature';
import { requireRole } from '../server/middleware/auth';

const RUN_ID = `t242-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
const SUBDOMAIN = `test-${RUN_ID}`.toLowerCase().slice(0, 30);

let tenantId: string;
let server: http.Server;
let baseUrl: string;

// Mutable acting-user role used by the stubbed requireAuth; flipped per test to
// exercise the real requireRole gate.
let actingRole = 'admin';

let VALID_PNG_DATA_URL: string;

before(async () => {
  const validPng = await sharp({
    create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  VALID_PNG_DATA_URL = `data:image/png;base64,${validPng.toString('base64')}`;

  const [tenant] = await db
    .insert(tenants)
    .values({
      subdomain: SUBDOMAIN,
      name: `Receipt Signature API Test Rescue ${RUN_ID}`,
      contactEmail: 'hello@example-rescue.test',
    })
    .returning({ id: tenants.id });
  tenantId = tenant.id;

  const app = express();
  // Generous body limit so the route's own 2MB guard (not the body parser) is
  // what rejects the oversized payload.
  app.use(express.json({ limit: '12mb' }));

  const stubRequireTenant = (req: any, _res: any, next: any) => {
    req.tenant = { id: tenantId };
    next();
  };
  const stubRequireAuth = (req: any, _res: any, next: any) => {
    req.user = {
      id: 'test-user',
      email: 'admin@example-rescue.test',
      fullName: 'Test Admin',
      roles: [actingRole],
      activeRole: actingRole,
      tenantId,
    };
    next();
  };

  registerReceiptSignatureRoutes(app, {
    requireTenant: stubRequireTenant,
    requireAuth: stubRequireAuth,
    requireRole, // real role gate
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  try {
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (cleanupErr) {
    console.warn('[task-242 test] cleanup warning:', cleanupErr);
  } finally {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

beforeEach(async () => {
  actingRole = 'admin';
  // Reset signature state before each test for isolation.
  await db
    .update(tenants)
    .set({ receiptSignatureUrl: null, receiptSignatureName: null, receiptSignatureTitle: null })
    .where(eq(tenants.id, tenantId));
});

async function putSig(body: unknown) {
  const res = await fetch(`${baseUrl}/api/tenant/settings/receipt-signature`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function deleteSig() {
  const res = await fetch(`${baseUrl}/api/tenant/settings/receipt-signature`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function readTenantSig() {
  const [row] = await db
    .select({
      url: tenants.receiptSignatureUrl,
      name: tenants.receiptSignatureName,
      title: tenants.receiptSignatureTitle,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return row;
}

test('rejects a non-image data URL with 400', async () => {
  const { status, json } = await putSig({
    signature: 'data:text/plain;base64,aGVsbG8=',
    name: 'Jane',
    title: 'Director',
  });
  assert.equal(status, 400);
  assert.match(json.error ?? '', /invalid signature image format/i);

  const row = await readTenantSig();
  assert.equal(row.url, null, 'nothing should be persisted on a rejected upload');
});

test('rejects a remote/non-data-URL signature with 400 (SSRF guard)', async () => {
  const { status } = await putSig({ signature: 'https://evil.example.com/sig.png' });
  assert.equal(status, 400);
});

test('rejects an image larger than 2MB with 400', async () => {
  // ~3MB of base64 → ~2.25MB decoded, over the 2MB cap. 'A' is a valid base64 char.
  const oversized = `data:image/png;base64,${'A'.repeat(3_000_000)}`;
  const { status, json } = await putSig({ signature: oversized });
  assert.equal(status, 400);
  assert.match(json.error ?? '', /too large/i);
});

test('metadata-only update with no signature on file is rejected with 400', async () => {
  const { status, json } = await putSig({ name: 'Jane', title: 'Director' });
  assert.equal(status, 400);
  assert.match(json.error ?? '', /draw a signature/i);
});

test('valid signature upload succeeds and stores the object URL', async () => {
  const { status, json } = await putSig({
    signature: VALID_PNG_DATA_URL,
    name: '  Jane Q. Director  ',
    title: '  Executive Director  ',
  });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.success, true);

  const row = await readTenantSig();
  assert.ok(row.url && row.url.includes('/signatures/'), 'a signature object URL should be stored');
  // Name/title are trimmed by the route.
  assert.equal(row.name, 'Jane Q. Director');
  assert.equal(row.title, 'Executive Director');
});

test('metadata-only update with a signature already on file updates name/title and keeps the image', async () => {
  // First seed a real saved signature.
  const seed = await putSig({ signature: VALID_PNG_DATA_URL, name: 'Old Name', title: 'Old Title' });
  assert.equal(seed.status, 200);
  const savedUrl = (await readTenantSig()).url;
  assert.ok(savedUrl);

  // Now update only the metadata (no new signature image).
  const { status, json } = await putSig({ name: 'New Name', title: 'New Title' });
  assert.equal(status, 200, JSON.stringify(json));

  const row = await readTenantSig();
  assert.equal(row.name, 'New Name');
  assert.equal(row.title, 'New Title');
  assert.equal(row.url, savedUrl, 'the existing signature image must be preserved');
});

test('DELETE clears all three signature fields', async () => {
  await putSig({ signature: VALID_PNG_DATA_URL, name: 'Jane', title: 'Director' });
  assert.ok((await readTenantSig()).url, 'precondition: a signature is saved');

  const { status, json } = await deleteSig();
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.success, true);

  const row = await readTenantSig();
  assert.equal(row.url, null);
  assert.equal(row.name, null);
  assert.equal(row.title, null);
});

test('non-admin acting role cannot save or delete the signature (403)', async () => {
  actingRole = 'volunteer';

  const put = await putSig({ signature: VALID_PNG_DATA_URL, name: 'Jane', title: 'Director' });
  assert.equal(put.status, 403, 'volunteer must not be able to save the signature');

  const del = await deleteSig();
  assert.equal(del.status, 403, 'volunteer must not be able to delete the signature');

  const row = await readTenantSig();
  assert.equal(row.url, null, 'nothing should have been persisted by a forbidden request');
});
