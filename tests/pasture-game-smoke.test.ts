import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { pastureGameDocument } from '../server/lib/pasture-game-document';

// Isolated game smoke test, not a substitute for signed-in portal verification.
test('Pasture Run boots and replays in an opaque sandbox on mobile', { timeout: 60000 }, async () => {
  const browser = await puppeteer.launch({
    executablePath: execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{border:0;width:100%;height:740px}</style><iframe sandbox="allow-scripts"></iframe>');
    await page.evaluate(html => {
      (window as any).messages = [];
      window.addEventListener('message', event => (window as any).messages.push(event.data?.type));
      document.querySelector('iframe')!.srcdoc = html;
    }, await pastureGameDocument());
    await page.waitForFunction(() => (window as any).messages.includes('pasture-ready'), { timeout: 30000 });
    const frame = page.frames().find(f => f.parentFrame());
    assert.ok(frame);
    assert.equal(await frame.evaluate(() => !!document.querySelector('canvas')), true);
    assert.equal(await frame.evaluate(() => {
      try { return !!window.parent.document; } catch { return false; }
    }), false);
    await frame.evaluate(() => {
      const game = (window as any).pastureRunGame;
      const scene = game.scene.scenes[0];
      scene.startNewRun();
      scene.startNewRun();
    });
    await page.waitForFunction(() => (window as any).messages.filter((m: string) => m === 'pasture-start').length === 2);
    await frame.click('#mute-toggle-btn');
    assert.match(await frame.$eval('#mute-toggle-btn', el => el.textContent || ''), /OFF/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
