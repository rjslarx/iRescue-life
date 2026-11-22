// Production-build lab measurement, not field Core Web Vitals.
// Run after building: node scripts/measure-marketing.mjs <before|after>
import express from 'express';
import puppeteer from 'puppeteer';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const label = process.argv[2] || 'measurement';
const desktop = process.argv.includes('--desktop');
const verifyHero = process.argv.includes('--verify-hero');
await fs.mkdir('generated-artifacts/marketing', { recursive: true });
await build({ entryPoints: ['server/vite.ts'], outfile: 'dist/perf-static.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { serveStatic } = await import('../dist/perf-static.mjs');
const app = express();
if (label !== 'before') {
  await build({ entryPoints: ['server/lib/public-assets.ts'], outfile: 'dist/perf-assets.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  const { servePublicAssets } = await import('../dist/perf-assets.mjs');
  servePublicAssets(app, path.resolve('dist/public/assets'));
}
// Fixed anonymous API responses keep the two runs comparable, without writes,
// sessions, live customer data, or starting background jobs.
app.all('/api/*', (req, res) => {
  if (req.path === '/api/me') return res.status(401).json({ message: 'Not authenticated' });
  res.json([]);
});
serveStatic(app);
const server = app.listen(8099, '127.0.0.1');
const executablePath = process.env.CHROME_PATH ||
  execFileSync('bash', ['-c', 'echo /nix/store/*chromium*/bin/chromium']).toString().trim().split(' ')[0];
const browser = await puppeteer.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const runs = [];
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: desktop ? 1440 : 390, height: desktop ? 1000 : 844, deviceScaleFactor: 1, isMobile: !desktop, hasTouch: !desktop });
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // Exclude third-party variability consistently; same-origin production
    // assets remain real network requests and are counted below.
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith('http://127.0.0.1:8099') || req.url().startsWith('data:')
      ? req.continue() : req.abort());
    const requests = new Map();
    cdp.on('Network.responseReceived', ({ requestId, response, type }) => {
      if (response.url.startsWith('http://127.0.0.1:8099')) requests.set(requestId, { url: response.url, type, bytes: 0, encoding: response.headers['Content-Encoding'] });
    });
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      if (requests.has(requestId)) requests.get(requestId).bytes = encodedDataLength;
    });
    await page.evaluateOnNewDocument(() => {
      window.lab = { lcp: 0, longTaskMs: 0 };
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.lab.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.lab.longTaskMs += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
    });
    await page.goto('http://127.0.0.1:8099/platform', { waitUntil: 'networkidle0', timeout: 180000 });
    await page.waitForSelector('h1', { timeout: 30000 });
    const metrics = await page.evaluate(() => ({
      ...window.lab,
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      title: document.querySelector('h1')?.textContent,
    }));
    const assets = [...requests.values()];
    const hero = await page.$eval('[data-testid="image-hero-mockup"]', img => ({
      visible: img.getBoundingClientRect().width > 0,
      loaded: img.complete && img.naturalWidth > 0,
      source: img.currentSrc,
    }));
    const imageBytes = assets.filter(a => a.type === 'Image').reduce((s, a) => s + a.bytes, 0);
    const mockupRequests = assets.filter(a => a.url.includes('dual_phone'));
    if (verifyHero) {
      if (hero.visible !== desktop || !hero.loaded) throw new Error(`Unexpected hero rendering: ${JSON.stringify(hero)}`);
      if (!desktop && mockupRequests.length) throw new Error('Hidden hero downloaded on mobile');
      if (desktop && !hero.source.endsWith('.webp')) throw new Error('Desktop did not select WebP');
    }
    runs.push({ ...metrics, hero, imageBytes, totalBytes: assets.reduce((s, a) => s + a.bytes, 0), scriptBytes: assets.filter(a => a.type === 'Script').reduce((s, a) => s + a.bytes, 0), assets });
    if (run === 0) {
      await page.screenshot({ path: `generated-artifacts/marketing/${label}.png` });
      if (verifyHero) {
        // Check both sides of the exact Tailwind lg breakpoint, including resize.
        for (const width of [1023, 1024, 390]) {
          // Keep mobile/touch emulation unchanged; toggling it reloads the page.
          await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: !desktop, hasTouch: !desktop });
          await page.waitForFunction(visible => {
            const img = document.querySelector('[data-testid="image-hero-mockup"]');
            return (img.getBoundingClientRect().width > 0) === visible &&
              img.complete && img.naturalWidth > 0 &&
              (!visible || img.currentSrc.endsWith('.webp'));
          }, {}, width >= 1024);
        }
      }
    }
    await context.close();
  }
  const result = { label, conditions: `${desktop ? '1440x1000' : '390x844'}, DPR 1, CPU 4x, 1.6 Mbps down, 150ms latency, cold cache, fixed anonymous API fixtures, external requests blocked`, runs };
  await fs.writeFile(`generated-artifacts/marketing/${label}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ label, runs: runs.map(({ assets, ...metrics }) => metrics) }, null, 2));
} finally {
  await browser.close();
  server.close();
}
