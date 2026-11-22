import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as canonicalPolicy from '../shared/platform-seo';
import * as sensitiveRoutes from '../shared/sensitive-routes';

test('mounted app and page effects agree on the final canonical', async () => {
  const app = readFileSync('client/src/App.tsx', 'utf8');
  const globalHook = app.slice(app.indexOf('function useCanonicalUrl()'), app.indexOf('function AppContent()'));
  const pageHook = readFileSync('client/src/hooks/useSEO.ts', 'utf8');
  for (const [url, expected] of [
    ['https://irescue.life/platform', 'https://irescue.life/'],
    ['https://irescue.life/?utm_source=test', 'https://irescue.life/'],
    ['https://rescue.example/', 'https://rescue.example/'],
    ['https://irescue.life/demo/', 'https://irescue.life/demo/'],
    ['https://demo.irescue.life/', 'https://demo.irescue.life/'],
    ['https://rescue.example/volunteer-training/private-token', 'https://rescue.example/volunteer-training'],
  ]) {
    const dom = new JSDOM('<!doctype html><html><head><link rel="canonical" href="https://irescue.life/"></head><body><div id="root"></div></body></html>', { url });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
    const sandbox = {
      window: dom.window, document: dom.window.document,
      useEffect: React.useEffect, ...canonicalPolicy, ...sensitiveRoutes,
      require(name: string) {
        if (name === 'react') return React;
        if (name === '@shared/platform-seo') return canonicalPolicy;
        if (name === '@shared/sensitive-routes') return sensitiveRoutes;
        throw new Error(`Unexpected module: ${name}`);
      },
    };
    const pageModule = { exports: {} as any };
    vm.runInNewContext(transformSync(pageHook, { loader: 'ts', format: 'cjs' }).code, {
      ...sandbox, module: pageModule, exports: pageModule.exports,
    });
    const globalModule = { exports: {} as any };
    vm.runInNewContext(transformSync(`${globalHook}\nmodule.exports = useCanonicalUrl;`, {
      loader: 'ts', format: 'cjs',
    }).code, { ...sandbox, module: globalModule });
    function Page() {
      pageModule.exports.useSEO({ title: 'Page title' });
      return null;
    }
    function AppShell() {
      globalModule.exports();
      return <Page />;
    }
    const root = createRoot(dom.window.document.getElementById('root')!);
    try {
      await act(async () => { root.render(<AppShell />); });
      assert.equal(dom.window.document.querySelector('link[rel="canonical"]')?.getAttribute('href'), expected, url);
      // Exercise the unconditional shell effect again, after the page's initial effect.
      await act(async () => { root.render(<AppShell />); });
      assert.equal(dom.window.document.querySelector('link[rel="canonical"]')?.getAttribute('href'), expected, url);
    } finally {
      await act(async () => { root.unmount(); });
      dom.window.close();
    }
  }
});
