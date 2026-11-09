import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { rescueShuffleDocument, shufflePhotoUrl } from '../server/lib/rescue-shuffle-document';

test('photo URLs allow public HTTPS paths but reject executable/credential URLs', () => {
  assert.equal(shufflePhotoUrl('/objects/pet.jpg', 'https://rescue.example'), 'https://rescue.example/objects/pet.jpg');
  assert.equal(shufflePhotoUrl('objects/pet.jpg', 'https://rescue.example'), 'https://rescue.example/objects/pet.jpg');
  for (const input of ['javascript:alert(1)', 'data:image/svg+xml,hi', 'file:///etc/passwd', 'http://example.com/a', 'https://user:pass@example.com/a', null]) {
    assert.equal(shufflePhotoUrl(input, 'https://rescue.example'), null);
  }
});

test('puzzle document safely inlines public metadata with no sample pets or external scripts', async () => {
  const html = await rescueShuffleDocument([{ id: 'pet', name: '</script><script>alert(1)</script>', breed: 'Dog', imageUrl: 'https://example.com/photo.jpg' }]);
  assert.ok(html.includes('\\u003c/script>'));
  assert.doesNotMatch(html, /images.unsplash.com|<script src|src="app.js"|href="style.css"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /rescue-shuffle-ready/);
  assert.match(html, /rescue-shuffle-start/);
  const service = await readFile('server/services/vip-game-document.ts', 'utf8');
  assert.match(service, /publicAnimalFilter\(tenantId\)/);
  assert.match(service, /eq\(animals.status, 'available'\)/);
  const routes = await readFile('server/routes/vipGamePilot.ts', 'utf8');
  assert.match(routes, /vipGameDocument\(gameIdSchema.parse\(req.query.gameId\), auth.tenantId\)/);
});

test('puzzle loads, shuffles solvably, moves, wins, changes animals, and handles missing photos', { timeout: 60000 }, async () => {
  const browser = await puppeteer.launch({
    executablePath: execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    const imageUrl = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="orange"/></svg>').toString('base64')}`;
    const pets = [{ id: 'one', name: 'Test dog', breed: 'Dog', imageUrl }, { id: 'two', name: 'Test cat', breed: 'Cat', imageUrl }];
    const mount = async (html: string) => {
      await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="script-src \'self\' \'unsafe-inline\'; img-src https: data:"><style>body{margin:0}iframe{border:0;width:100%;height:790px}</style><iframe sandbox="allow-scripts"></iframe>');
      await page.evaluate(html => {
        (window as any).messages = [];
        window.addEventListener('message', e => (window as any).messages.push(e.data?.type));
        document.querySelector('iframe')!.srcdoc = html;
      }, html);
      await page.waitForFunction(() => (window as any).messages.includes('rescue-shuffle-ready'));
      const frame = page.frames().find(frame => frame.parentFrame())!;
      assert.ok(frame);
      return frame;
    };
    let frame = await mount(await rescueShuffleDocument(pets));
    await frame.waitForFunction(() => (window as any).rescueShuffleGame.imageLoaded);
    assert.equal(await frame.evaluate(() => { try { return !!parent.document; } catch { return false; } }), false);
    assert.equal(await frame.evaluate(() => {
      const g = (window as any).rescueShuffleGame;
      for (let n = 0; n < 40; n++) {
        g.createSolvedBoard(); g.shuffleBoard();
        const values = g.board.filter((v: number) => v !== 0);
        let inversions = 0;
        values.forEach((a: number, i: number) => values.slice(i + 1).forEach((b: number) => { if (a > b) inversions++; }));
        const blankRowFromBottom = 4 - Math.floor(g.board.indexOf(0) / 4);
        if ((inversions + blankRowFromBottom) % 2 !== 1 || g.checkSolved()) return false;
      }
      return true;
    }), true);
    // Set up a near-finished board; exercise a real keyboard move and replay.
    await frame.evaluate(() => {
      const g = (window as any).rescueShuffleGame;
      g.board = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,15]; g.render();
    });
    await frame.focus('#puzzle-canvas');
    await page.keyboard.press('ArrowLeft');
    await frame.waitForSelector('#win-overlay:not(.hidden)');
    assert.match(await frame.$eval('#win-stats', el => el.textContent || ''), /Solved in 1 moves/);
    assert.equal(await page.evaluate(() => (window as any).messages.filter((m: string) => m === 'rescue-shuffle-start').length), 1);
    const oldName = await frame.$eval('#pet-name', el => el.textContent);
    await frame.click('#play-again-btn');
    assert.notEqual(await frame.$eval('#pet-name', el => el.textContent), oldName);
    await frame.waitForFunction(() => (window as any).rescueShuffleGame.imageLoaded);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 1366 }, { width: 1440, height: 900 }]) {
      await page.setViewport({ ...viewport, isMobile: true, hasTouch: true });
      assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    frame = await mount(await rescueShuffleDocument([]));
    assert.match(await frame.$eval('#image-status', el => el.textContent || ''), /No available-animal photos/);
    assert.equal(await frame.$eval('#toggle-numbers-btn', el => (el as HTMLButtonElement).disabled), true);
    assert.equal(await frame.evaluate(() => (window as any).rescueShuffleGame.board.length), 16);
    frame = await mount(await rescueShuffleDocument([{ ...pets[0], imageUrl: 'data:image/png;base64,broken' }]));
    await frame.waitForFunction(() => document.querySelector('#image-status')!.textContent!.includes('could not load'));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
