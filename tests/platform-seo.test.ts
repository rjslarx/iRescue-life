import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { isPlatformHost, platformCanonical, isSitemapTenantSlug } from '../shared/platform-seo';
import { createSitemapWriter } from '../server/lib/sitemap-xml';

const read = (file: string) => readFileSync(path.resolve(file), 'utf8');

// Execute the real middleware with only external services replaced; no database writes.
function middleware() {
  const module = { exports: {} as any };
  const code = transformSync(read('server/middleware/og-tags.ts'), {
    loader: 'ts', format: 'cjs',
    define: { 'import.meta.dirname': JSON.stringify(path.resolve('server/middleware')) },
  }).code;
  vm.runInNewContext(code, {
    exports: module.exports, module, process: { env: { NODE_ENV: 'development' } },
    console: { log() {}, error() {} }, URL, Buffer,
    require(name: string) {
      if (name === 'fs') return fs;
      if (name === 'path') return path;
      if (name === 'express') return { Router: () => ({ get() {} }) };
      if (name === '../lib/rescue-phone-html') return { rescuePhoneHtml: (html: string) => html };
      if (name === '@shared/platform-seo') return { isPlatformHost };
      if (name === '../db') return { db: { select() { throw new Error('Unexpected database query'); } } };
      return {};
    },
  });
  return module.exports.injectOGTags;
}

async function request(url: string, host = 'irescue.life', tenant?: any, basePath?: string) {
  let status = 200, html = '', next = false;
  const headers: Record<string, string> = {};
  const res: any = {
    locals: {},
    status(value: number) { status = value; return this; },
    set(key: any, value?: string) {
      if (typeof key === 'string') headers[key] = value!;
      else Object.assign(headers, key);
      return this;
    },
    type() { return this; },
    send(value: string) { html = value; return this; },
    end(value: string) { html = value; return this; },
  };
  await middleware()({
    url, originalUrl: url, path: url.split('?')[0], tenant, basePath, query: {},
    get: (key: string) => key.toLowerCase() === 'host' ? host : 'Mozilla/5.0',
  }, res, () => { next = true; });
  return { status, html, next, headers };
}

test('platform homepage aliases share canonical, including tracking URLs', () => {
  for (const url of ['https://irescue.life/', 'https://irescue.life/platform/?utm_source=test#pricing', 'https://www.irescue.life/platform', 'https://platform.irescue.life/']) {
    assert.equal(platformCanonical(url), 'https://irescue.life/');
  }
  for (const url of ['https://rescue.example/', 'https://demo.irescue.life/', 'https://irescue.life/demo/', 'https://rescue.example/platform']) {
    assert.equal(platformCanonical(url), url);
  }
});

test('both homepage source responses contain platform metadata and crawlable blog content', async () => {
  for (const url of ['/', '/?utm_source=test', '/platform', '/platform/']) {
    const response = await request(url);
    assert.equal(response.status, 200);
    assert.match(response.html, /<title>iRescue.life - Complete Animal Rescue/);
    assert.match(response.html, /rel="canonical" href="https:\/\/irescue.life\/"/);
    assert.match(response.html, /property="og:url" content="https:\/\/irescue.life\/"/);
    assert.match(response.html, /id="server-page-content"/);
    assert.match(response.html, /href="https:\/\/irescue.life\/platform\/blog"/);
    assert.match(response.html, /__vite_plugin_react_preamble_installed__/);
    assert.doesNotMatch(response.html, /Rescue Portal -/);
  }
});

test('tenant roots are not replaced by platform metadata', async () => {
  const tenant = { id: 'test', subdomain: 'rescue', name: 'Test Rescue', customDomain: 'rescue.example', customDomainVerified: true };
  for (const [host, basePath] of [['rescue.example', undefined], ['rescue.irescue.life', undefined], ['irescue.life', '/rescue']]) {
    const response = await request('/', host, tenant, basePath);
    assert.doesNotMatch(response.html, /<title>iRescue.life - Complete/);
    assert.match(response.html, /Test Rescue/);
  }
  assert.equal((await request('/platform', 'rescue.example')).next, true);
});

test('unknown platform pages return 404/noindex, but app routes remain available', async () => {
  for (const url of ['/platform/blog/not-a-real-post', '/platform/no-such-page', '/platform/blog/missing/extra']) {
    const response = await request(url);
    assert.equal(response.status, 404);
    assert.equal(response.headers['X-Robots-Tag'], 'noindex');
    assert.doesNotMatch(response.html, /rel="canonical"/);
  }
  assert.equal((await request('/platform/signup')).next, true);
  assert.equal((await request('/platform/dashboard')).next, true);
  assert.equal((await request('/platform/blog/google-for-nonprofits-for-animal-rescues')).status, 200);
});

test('sitemap excludes pseudo-tenants, deduplicates and does not invent lastmod dates', () => {
  for (const slug of ['platform', 'api', 'resale', 'dashboard', 'login', '../evil', 'UPPER']) assert.equal(isSitemapTenantSlug(slug), false);
  assert.equal(isSitemapTenantSlug('demo'), true);
  const write = createSitemapWriter();
  const xml = write('https://irescue.life/', 'weekly', '1.0') + write('https://irescue.life')
    + write('https://irescue.life/demo/animals');
  assert.equal((xml.match(/<loc>/g) || []).length, 2);
  assert.doesNotMatch(xml, /lastmod/);
  assert.throws(() => write('https://irescue.life/demo?token=secret'));
  assert.match(write('https://irescue.life/a&b'), /a&amp;b/);
  const routes = read('server/routes.ts');
  const sitemap = routes.slice(routes.indexOf("app.get('/sitemap.xml'"), routes.indexOf("app.get('/sitemap.xml'") + 12500);
  assert.match(sitemap, /if \(!isSitemapTenantSlug\(t.subdomain\)\) continue/);
  assert.doesNotMatch(sitemap, /loc: '\/platform'/);
  assert.doesNotMatch(sitemap, /<lastmod>/);
  assert.match(read('client/src/pages/PlatformLandingPage.tsx'), /<Link href="\/platform\/blog"[^>]*data-testid="link-blog"/);
  assert.match(read('client/src/App.tsx'), /if \(isPlatformSubdomain \|\| isRootDomain\) \{\s*return <PlatformLandingPage \/>/);
});

test('actual sitemap handler isolates custom domains and skips reserved tenant records', async () => {
  const source = read('server/routes.ts');
  const start = source.indexOf("app.get('/sitemap.xml'");
  const route = source.slice(start, source.indexOf('\n  });', start) + 6);
  let handler: any;
  const tables = ['tenants', 'customPages', 'shopProducts', 'peerCampaigns', 'expenseCampaigns', 'votingContests', 'donationLinksTable', 'animals'];
  const context: any = {
    app: { get(_path: string, fn: any) { handler = fn; } },
    createSitemapWriter, isSitemapTenantSlug,
    eq() {}, and() {}, or() {}, isNull() {}, ne() {},
    db: { select() { return { from(table: any) { return { where() {
      return Promise.resolve(table.name === 'tenants'
        ? [{ id: 'reserved', subdomain: 'platform' }, { id: 'demo', subdomain: 'demo' }]
        : table.name === 'customPages' ? [{ slug: 'animals' }, { slug: 'our-story' }] : []);
    } }; } }; } },
  };
  for (const name of tables) context[name] = { name };
  vm.runInNewContext(transformSync(route, { loader: 'ts', format: 'cjs' }).code, context);
  async function sitemap(host: string, tenant?: any) {
    let xml = '';
    await handler({ tenant, get: () => host }, {
      setHeader() {}, send(value: string) { xml = value; },
    }, (error: Error) => { throw error; });
    return xml;
  }
  const platform = await sitemap('irescue.life');
  assert.match(platform, /https:\/\/irescue.life\/demo\/our-story/);
  assert.doesNotMatch(platform, /https:\/\/irescue.life\/platform\/(?:animals|donate)/);
  assert.equal((platform.match(/<loc>https:\/\/irescue.life\/demo\/animals<\/loc>/g) || []).length, 1);
  const custom = await sitemap('rescue.example', {
    id: 'demo', subdomain: 'demo', customDomain: 'rescue.example', customDomainVerified: true,
  });
  assert.match(custom, /<loc>https:\/\/rescue.example\/our-story<\/loc>/);
  assert.doesNotMatch(custom, /irescue.life|\/platform|\/demo\//);
  const legacy = await sitemap('demo.irescue.life', { id: 'demo', subdomain: 'demo' });
  assert.match(legacy, /<loc>https:\/\/demo.irescue.life\/our-story<\/loc>/);
});
