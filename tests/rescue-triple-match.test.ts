import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { rescueTripleMatchDocument } from '../server/lib/rescue-triple-match-document';

test('triple-match document is private, self-contained and escapes animal metadata', async () => {
  const html = await rescueTripleMatchDocument([{ id: 'test', name: '</script><script>bad()</script>', breed: '', imageUrl: 'https://example.com/pet.jpg' }]);
  assert.ok(html.includes('\\u003c/script>'));
  assert.doesNotMatch(html, /images\.unsplash|<script[^>]+src=|localStorage|fetch\(/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /rescue-triple-match-ready/);
  assert.match(html, /rescue-triple-match-start/);
});

test('triple match initializes in opaque sandbox and handles play, matches, loss, continue and win', { timeout: 60000 }, async () => {
  const browser = await puppeteer.launch({
    executablePath: execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setViewport({ width: 390, height: 844 });
    await page.setContent(`<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'; img-src https: data:"><style>body{margin:0}iframe{border:0;width:100%;height:790px}</style><iframe sandbox="allow-scripts"></iframe>`);
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url() === 'https://example.com/test-pet.svg') {
        void request.respond({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="orange"/></svg>' });
      } else void request.continue();
    });
    const imageUrl = 'https://example.com/test-pet.svg';
    const html = await rescueTripleMatchDocument([{ id: 'pet-one', name: 'Test pet', breed: '', imageUrl }]);
    await page.evaluate(html => {
      (window as any).messages = [];
      window.addEventListener('message', e => (window as any).messages.push(e.data?.type));
      document.querySelector('iframe')!.srcdoc = html;
    }, html);
    await page.waitForFunction(() => (window as any).messages.includes('rescue-triple-match-ready'));
    const frame = page.frames().find(f => f.parentFrame())!;
    await frame.waitForFunction(() => (window as any).rescueTripleMatchGame.petImagesLoaded.has('pet-one'));
    assert.equal(await frame.evaluate(() => { try { return !!parent.document; } catch { return false; } }), false);
    assert.deepEqual(await frame.evaluate(() => {
      const g = (window as any).rescueTripleMatchGame;
      return [g.tiles.length, g.roster.length, new Set(g.roster.map((p: any) => p.id)).size, g.matchesLeft];
    }), [36, 6, 6, 12]);
    // Actual pointer interaction selects an exposed tile.
    const point = await frame.evaluate(() => {
      const g = (window as any).rescueTripleMatchGame;
      const t = [...g.tiles].reverse().find((t: any) => !t.blocked);
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: r.x + t.renderX + t.renderW / 2, y: r.y + t.renderY + t.renderH / 2 };
    });
    await page.mouse.click(point.x, point.y);
    await frame.waitForFunction(() => (window as any).rescueTripleMatchGame.dock.length === 1);
    assert.equal(await page.evaluate(() => (window as any).messages.filter((m: string) => m === 'rescue-triple-match-start').length), 1);
    // Exercise deterministic matching with three same-pet tiles.
    await frame.evaluate(() => {
      const g = (window as any).rescueTripleMatchGame;
      g.startLevel(1);
      const group = g.tiles.filter((t: any) => t.petId === g.tiles[0].petId).slice(0, 3);
      for (const t of group) { t.blocked = false; g.selectBoardTile(t); t.phase = 'dock'; }
      g.resolveDockMatchesAndOutcome();
    });
    await frame.waitForFunction(() => (window as any).rescueTripleMatchGame.matchesLeft === 11 && (window as any).rescueTripleMatchGame.dock.length === 0);
    await frame.evaluate(() => {
      const g = (window as any).rescueTripleMatchGame;
      g.startLevel(1);
      for (let n = 0; n < 7; n++) {
        const pet = g.roster[n % 6];
        const t = g.tiles.find((t: any) => t.petId === pet.id && !t.inDock);
        t.blocked = false; g.selectBoardTile(t); t.phase = 'dock';
      }
      g.resolveDockMatchesAndOutcome();
    });
    await frame.waitForFunction(() => (window as any).rescueTripleMatchGame.status === 'lost');
    await frame.click('#overlay-continue-btn');
    await frame.waitForFunction(() => (window as any).rescueTripleMatchGame.status === 'playing' && (window as any).rescueTripleMatchGame.dock.length === 5);
    await frame.evaluate(() => {
      const g = (window as any).rescueTripleMatchGame;
      g.tiles.forEach((t: any) => { t.phase = 'removed'; t.inDock = false; });
      g.dock = []; g.matchesLeft = 0; g.resolveDockMatchesAndOutcome();
    });
    await frame.waitForFunction(() => (window as any).rescueTripleMatchGame.status === 'won');
    await frame.click('#overlay-action-btn');
    assert.equal(await frame.evaluate(() => (window as any).rescueTripleMatchGame.level), 2);
    await frame.click('#shuffle-btn');
    assert.equal(await frame.evaluate(() => (window as any).rescueTripleMatchGame.shufflesLeft), 0);
    for (const width of [390, 1024, 1440]) {
      await page.setViewport({ width, height: 844 });
      assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
