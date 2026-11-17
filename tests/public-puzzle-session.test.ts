import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as puzzleProgress from '../client/src/lib/puzzle-progress';

test('active public sessions close on manual pause and scheduled boundary', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test/haseyas/puzzle', pretendToBeVisual: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage });
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let id = 0;
  dom.window.setTimeout = ((callback: () => void, delay: number) => { timers.set(++id, { callback, delay }); return id; }) as any;
  dom.window.clearTimeout = (key: number) => { timers.delete(key); };
  dom.window.setInterval = (() => ++id) as any;
  dom.window.clearInterval = () => {};
  let config = {
    enabled: true, available: true, availability: 'open', availabilityMessage: 'Open',
    facebookPostUrl: '', rescueName: 'Haseyas', timezone: 'America/Chicago',
    serverNow: Date.parse('2026-11-18T00:00Z'), nextChangeAt: '2026-11-18T01:00:00Z',
  };
  const bundle = await build({
    entryPoints: ['client/src/pages/PublicPuzzlePage.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'boundaries', setup(b) {
      b.onResolve({ filter: /^@\// }, args => ({ path: args.path, external: true }));
    } }],
  });
  const nativeRequire = createRequire(import.meta.url);
  const exports: any = {};
  const module = { exports };
  const req = (name: string) => {
    if (name.endsWith('.css')) return {};
    if (name === '@/lib/puzzle-progress') return puzzleProgress;
    if (name === '@/contexts/TenantContext') return { useTenant: () => ({ basePath: '/haseyas', tenantId: 'haseyas-id' }) };
    if (name === '@/hooks/useSEO') return { useSEO() {} };
    if (name === '@/hooks/use-public-puzzle') return { publicPuzzleRequest: async (action: string) => action === 'launch' ? { ...config, html: '<p>Puzzle</p>', pet: null } : { ...config } };
    if (name === '@/components/vip/public-puzzle-export') return { puzzleTime: () => '', renderPuzzleImage: () => new Promise(() => {}) };
    if (name === '@/components/ui/button') return { Button: ({ children, asChild, variant, ...props }: any) => asChild ? children : React.createElement('button', props, children) };
    if (name === '@/components/ui/skeleton') return { Skeleton: () => null };
    return nativeRequire(name);
  };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(req, module, exports);
  const root = createRoot(document.getElementById('root')!);
  const start = async () => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Start your puzzle'));
    assert.ok(button);
    await act(async () => button.click());
    assert.ok(document.querySelector('iframe'));
  };
  try {
    await act(async () => root.render(React.createElement(module.exports.default)));
    await start();
    localStorage.setItem(puzzleProgress.PUZZLE_SAVE_KEY, 'old progress');
    config = { ...config, enabled: false, available: false, availability: 'paused', availabilityMessage: 'Paused' };
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.equal(document.querySelector('iframe'), null);
    assert.equal(localStorage.getItem(puzzleProgress.PUZZLE_SAVE_KEY), null);
    assert.match(document.body.textContent!, /Paused/);
    config = { ...config, enabled: true, available: true, availability: 'open' };
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    await start();
    localStorage.setItem(puzzleProgress.PUZZLE_SAVE_KEY, 'old progress');
    const boundary = [...timers.values()].find(t => t.delay === 3600000);
    assert.ok(boundary);
    config = { ...config, available: false, availability: 'closed', availabilityMessage: 'Closed' };
    await act(async () => boundary.callback());
    assert.equal(document.querySelector('iframe'), null);
    assert.equal(localStorage.getItem(puzzleProgress.PUZZLE_SAVE_KEY), null);
    assert.match(document.body.textContent!, /This challenge has closed/);
    assert.equal([...document.querySelectorAll('a')].some(a => a.hasAttribute('download')), false);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
