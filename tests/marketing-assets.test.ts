import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { servePublicAssets } from '../server/lib/public-assets';

test('only hashed public assets receive compression and immutable caching', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'public-assets-'));
  const name = 'index-AbCd1234.js';
  const content = 'console.log("public bundle");';
  await Promise.all([
    writeFile(path.join(dir, name), content),
    writeFile(path.join(dir, name + '.br'), brotliCompressSync(content)),
    writeFile(path.join(dir, name + '.gz'), gzipSync(content)),
    writeFile(path.join(dir, 'unhashed.js'), content),
    writeFile(path.join(dir, 'picture-AbCd1234.png'), 'image'),
  ]);
  const app = express();
  servePublicAssets(app, dir);
  app.use((_req, res) => res.set('Cache-Control', 'private, no-store').set('Set-Cookie', 'session=test').send('private response'));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const encoding of ['br', 'gzip', 'identity']) {
      const response = await fetch(`${base}/assets/${name}`, { headers: { 'Accept-Encoding': encoding } });
      assert.equal(await response.text(), content);
      assert.equal(response.headers.get('content-encoding'), encoding === 'identity' ? null : encoding);
      assert.match(response.headers.get('cache-control')!, /public, max-age=31536000, immutable/);
      assert.match(response.headers.get('content-type')!, /javascript/);
      assert.match(response.headers.get('vary')!, /Accept-Encoding/i);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    const head = await fetch(`${base}/assets/${name}`, { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('content-encoding'), 'gzip');
    const image = await fetch(`${base}/assets/picture-AbCd1234.png`);
    assert.equal(image.headers.get('content-encoding'), null);
    assert.equal(await image.text(), 'image');
    for (const url of ['/assets/unhashed.js', '/assets/missing-AbCd1234.js', '/assets/index-AbCd1234.js.br']) {
      const response = await fetch(base + url);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    for (const url of ['/api/me', '/platform', '/manifest.json', '/dashboard']) {
      const response = await fetch(base + url);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('content-encoding'), null);
    }
  } finally {
    server.close();
    await rm(dir, { recursive: true });
  }
});

test('global fonts match UI families and tenant font choices stay system-native', async () => {
  const html = await readFile('client/index.html', 'utf8');
  assert.equal((html.match(/fonts.googleapis.com\/css2/g) || []).length, 1);
  assert.match(html, /family=Inter:/);
  assert.match(html, /family=Outfit:/);
  assert.doesNotMatch(html, /family=Roboto|family=Montserrat|family=Poppins/);
  const home = await readFile('client/src/pages/Home.tsx', 'utf8');
  assert.match(home, /fontFamily: sanitizeFontFamily/);
});
