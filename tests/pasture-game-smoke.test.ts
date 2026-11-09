import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { pastureGameDocument } from '../server/lib/pasture-game-document';
import { withPrivateGamePresentation } from '../client/src/components/vip/private-game-presentation';

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
    // Exercise the production parent's script policy: srcdoc inherits it, even
    // when the document inside the sandbox has its own, more permissive CSP.
    const securitySource = readFileSync('server/config/security.ts', 'utf8');
    const scriptDirective = securitySource.match(/scriptSrc:\s*\[([^\]]+)\]/)?.[1];
    assert.ok(scriptDirective);
    const scriptSources = [...scriptDirective.matchAll(/"([^"]+)"/g)].map(match => match[1]).join(' ');
    await page.setContent(`<meta http-equiv="Content-Security-Policy" content="script-src ${scriptSources}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{border:0;width:100%;height:740px}</style><iframe sandbox="allow-scripts"></iframe>`);
    await page.evaluate(html => {
      (window as any).messages = [];
      window.addEventListener('message', event => (window as any).messages.push(event.data?.type));
      document.querySelector('iframe')!.srcdoc = html;
    }, withPrivateGamePresentation(await pastureGameDocument()));
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
    assert.equal(await frame.$eval('.arcade-marquee', el => getComputedStyle(el).display), 'none');
    assert.equal(await frame.$eval('.arcade-cabinet', el => getComputedStyle(el).borderTopWidth), '0px');
    for (const viewport of [{ width: 1024, height: 1366 }, { width: 1440, height: 900 }]) {
      // Preserve device flags: changing isMobile reloads setContent and detaches
      // the frame rather than exercising a normal responsive resize.
      await page.setViewport({ ...viewport, isMobile: true, hasTouch: true });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.equal(await frame.evaluate(() => {
        const bounds = document.querySelector('canvas')!.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && Math.abs(bounds.width / bounds.height - 540 / 960) < 0.01;
      }), true);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
