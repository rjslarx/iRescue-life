import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('marketing import graph excludes dashboard, game and payment routes', () => {
  const manifest = JSON.parse(fs.readFileSync('dist/public/.vite/manifest.json', 'utf8'));
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    for (const dependency of manifest[key]?.imports || []) visit(dependency);
  }
  visit('index.html');
  visit('src/pages/PlatformLandingPage.tsx');
  for (const key of visited) {
    assert.doesNotMatch(key, /Dashboard|PublicPuzzle|FreeSquares|TeamGames|Checkout|stripe|jspdf|html2canvas|recharts/i);
  }
  let jsBytes = 0;
  for (const key of visited) {
    const chunk = manifest[key];
    if (chunk?.file.endsWith('.js')) jsBytes += fs.statSync(`dist/public/${chunk.file}`).size;
  }
  // Deliberately broad guard: prevent the former 8MB monolith returning.
  assert.ok(jsBytes < 1_000_000, `Marketing JS grew to ${jsBytes} bytes`);
  for (const route of ['Dashboard', 'PublicPuzzlePage', 'ShopCheckoutPage', 'PublicAdoptionCheckoutPage', 'Login']) {
    assert.ok(manifest[`src/pages/${route}.tsx`]?.isDynamicEntry, `${route} must stay separately loadable`);
  }
});
