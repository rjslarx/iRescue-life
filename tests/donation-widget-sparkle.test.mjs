// Build first, then: node --test tests/donation-widget-sparkle.test.mjs
// Isolated compiled-CSS check, not a live donation/navigation test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';

test('widget sparkle preserves layout, pointer access, focus and reduced motion', async () => {
  const css = readdirSync('dist/public/assets').filter(f => f.endsWith('.css'))
    .map(f => readFileSync(`dist/public/assets/${f}`, 'utf8')).join('\n');
  const source = readFileSync('client/src/components/RecentDonationsWidget.tsx', 'utf8');
  assert.match(source, /recent-donations-donate__shimmer" aria-hidden="true"/);
  assert.match(source, /recent-donations-donate__sparkle" aria-hidden="true"/);
  assert.match(source, /onClick=\{handleDonateClick\}/);
  assert.match(source, /onClick=\{handleDismiss\}/);
  const executablePath = process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style><div style="position:fixed;bottom:16px;left:16px;padding:16px">
      <button id="donate" class="relative inline-flex items-center justify-center gap-2 rounded-md text-xs font-medium min-h-8 px-3 border text-primary border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring recent-donations-donate">
      <span class="recent-donations-donate__shimmer" aria-hidden="true"><span class="recent-donations-donate__shimmer-light"></span></span>
      <span class="recent-donations-donate__sparkle" aria-hidden="true"></span>Donate</button></div>`);
    for (const width of [375, 768, 1280]) {
      await page.setViewport({ width, height: 900 });
      const result = await page.evaluate(() => {
        const button = document.querySelector('#donate');
        const rects = [];
        const light = document.querySelector('.recent-donations-donate__shimmer-light');
        const sparkle = document.querySelector('.recent-donations-donate__sparkle');
        const animations = [light, sparkle].map(e => e.getAnimations()[0]);
        for (const ms of [0, 1000, 1564, 4000, 6700]) {
          animations.forEach(a => { a.pause(); a.currentTime = ms; });
          const r = button.getBoundingClientRect();
          rects.push([r.width, r.height, r.x, r.y]);
        }
        const r = button.getBoundingClientRect();
        return {
          rects,
          pauseOpacity: getComputedStyle(sparkle).opacity,
          pointer: [light, sparkle, light.parentElement].map(e => getComputedStyle(e).pointerEvents),
          hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.ok(result.rects.every(r => JSON.stringify(r) === JSON.stringify(result.rects[0])));
      assert.deepEqual(result.pointer, ['none', 'none', 'none']);
      assert.equal(result.hit, true);
      assert.equal(result.overflow, false);
      assert.equal(result.pauseOpacity, '0');
    }
    await page.keyboard.press('Tab');
    assert.equal(await page.$eval('#donate', e => e.matches(':focus-visible') && getComputedStyle(e).boxShadow !== 'none'), true);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const reduced = await page.$$eval('.recent-donations-donate__shimmer-light, .recent-donations-donate__sparkle',
      els => els.map(e => ({ animation: getComputedStyle(e).animationName, opacity: Number(getComputedStyle(e).opacity) })));
    assert.ok(reduced.every(e => e.animation === 'none' && e.opacity > 0));
  } finally {
    await browser.close();
  }
});
