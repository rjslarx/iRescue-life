import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { rescueMergeDocument } from '../server/lib/rescue-merge-document';

test('merge document safely embeds only supplied pets and pinned engine', async () => {
  const html = await rescueMergeDocument([{ id: 'a', name: '</script>unsafe', breed: '', imageUrl: 'https://example.com/a.jpg' }]);
  assert.match(html, /\\u003c\/script>/);
  assert.doesNotMatch(html, /unsplash|localStorage|src="\.\/app.js"/);
  assert.match(html, /rescue-merge-ready/);
  assert.match(html, /rescue-merge-start/);
  assert.match(html, /integrity="sha384-/);
  assert.match(html, /connect-src 'none'/);
});

test('merge loads cross-origin bubble photos, drops, merges, resets and fits mobile', { timeout: 90000 }, async () => {
  const browser = await puppeteer.launch({
    executablePath: execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url() === 'https://example.com/pet.svg') {
        // Deliberately no Access-Control-Allow-Origin: real rescue photos must
        // work inside the opaque sandbox without CORS or a WebGL upload.
        void request.respond({ status: 200, contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="100"><rect width="150" height="100" fill="orange"/></svg>' });
      } else void request.continue();
    });
    const source = readFileSync('server/config/security.ts', 'utf8');
    const directive = source.match(/scriptSrc:\s*\[([^\]]+)\]/)![1];
    const sources = [...directive.matchAll(/"([^"]+)"/g)].map(m => m[1]).join(' ');
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="script-src ${sources}"><style>body{margin:0}iframe{border:0;width:100%;height:790px}</style><iframe sandbox="allow-scripts"></iframe>`);
    await page.evaluate(html => {
      (window as any).messages = [];
      window.addEventListener('message', e => (window as any).messages.push(e.data?.type));
      document.querySelector('iframe')!.srcdoc = html;
    }, await rescueMergeDocument([{ id: 'real-pet', name: 'Rescue pet', breed: 'Dog', imageUrl: 'https://example.com/pet.svg' }]));
    await page.waitForFunction(() => (window as any).messages.includes('rescue-merge-ready'), { timeout: 40000 });
    const frame = page.frames().find(f => f.parentFrame())!;
    assert.equal(await frame.evaluate(() => { try { return !!parent.document; } catch { return false; } }), false);
    assert.equal(await frame.evaluate(() => (window as any).rescueMergeGame.config.renderType), 1); // Phaser.CANVAS
    assert.equal(await frame.evaluate(() => (window as any).rescueMergeGame.scene.scenes[0].textures.exists('raw_pet_tier_1')), true);
    assert.equal(await frame.evaluate(() => (window as any).rescueMergeGame.scene.scenes[0].textures.exists('pet_tier_1')), true);
    await frame.evaluate(() => {
      const s = (window as any).rescueMergeGame.scene.scenes[0];
      s.lastDropTimeMs = -10000;
      s.attemptDropPet();
    });
    await page.waitForFunction(() => (window as any).messages.includes('rescue-merge-start'));
    // Spawn overlapping equal bubbles: actual Matter collision must merge them.
    await frame.evaluate(() => {
      const s = (window as any).rescueMergeGame.scene.scenes[0];
      s.startNewRound();
      s.spawnPetBody(210, 500, 1, false);
      s.spawnPetBody(212, 500, 1, false);
    });
    await frame.waitForFunction(() => (window as any).rescueMergeGame.scene.scenes[0].score > 0);
    await frame.evaluate(() => (window as any).rescueMergeGame.scene.scenes[0].triggerGameOver());
    assert.equal(await frame.evaluate(() => (window as any).rescueMergeGame.scene.scenes[0].getState().isGameOver), true);
    await frame.click('#restart-btn');
    assert.equal(await frame.evaluate(() => (window as any).rescueMergeGame.scene.scenes[0].score), 0);
    assert.equal(await frame.evaluate(() => (window as any).rescueMergeGame.scene.scenes[0].getState().isGameOver), false);
    await frame.click('#mute-btn');
    assert.equal(await frame.$eval('#mute-btn', el => el.getAttribute('aria-pressed')), 'true');
    for (const width of [390, 1024, 1440]) {
      await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true });
      assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
