// Run: scripts/run-tests.sh tests/recent-donations-widget.test.tsx
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { JSDOM } from 'jsdom';
import { RecentDonationsWidget } from '../client/src/components/RecentDonationsWidget';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test',
});
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
});
notifyManager.setScheduler(queueMicrotask);

const queryKey = ['/api/compliance/public/recent-donations'];
const donations = ['Anonymous', 'Alex M.', 'Pat J.'].map((displayName, index) => ({
  id: `${index}`, displayName, amount: 2500, location: null,
  createdAt: '2026-01-01T12:00:00Z',
  // Unexpected private fields must never be used for display.
  email: 'private@example.test', fullName: 'Private Full Name',
}));
let root: Root | undefined;
let client: QueryClient;
let now: number;
let nextId: number;
const timers = new Map<number, { at: number; callback: () => void; interval?: number }>();

beforeEach((t) => {
  now = 0;
  nextId = 0;
  timers.clear();
  const schedule = (callback: () => void, delay = 0, interval?: number) => {
    const id = ++nextId;
    timers.set(id, { at: now + delay, callback, interval });
    return id;
  };
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => schedule(callback, delay));
  t.mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => schedule(callback, delay, delay));
  t.mock.method(globalThis, 'clearTimeout', (id: number) => timers.delete(id));
  t.mock.method(globalThis, 'clearInterval', (id: number) => timers.delete(id));
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  client.clear();
  document.body.replaceChildren();
});

async function advance(ms: number) {
  const end = now + ms;
  while (true) {
    const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!next || next[1].at > end) break;
    const [id, timer] = next;
    now = timer.at;
    if (timer.interval) timer.at += timer.interval;
    else timers.delete(id);
    await act(async () => timer.callback());
  }
  now = end;
}

async function mount() {
  client.setQueryData(queryKey, donations);
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(QueryClientProvider, { client },
    createElement(RecentDonationsWidget, { tenantSubdomain: 'rescue' }))));
}

async function refresh(data: typeof donations) {
  await act(async () => { client.setQueryData(queryKey, data); });
}

async function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  assert.ok(button);
  await act(async () => button.click());
}

const info = () => document.querySelector('[data-testid="text-donation-info"]')?.textContent;
const widget = () => document.querySelector('[data-testid="recent-donations-widget"]');

test('shrinking at the last item clamps both rendered item and subsequent rotation', async () => {
  await mount();
  await click('[aria-label="Go to donation 3"]');
  await refresh(donations.slice(0, 2));
  assert.equal(info(), 'Alex M. donated $25');
  await advance(5000);
  assert.equal(info(), 'Alex M. donated $25');
  await advance(299);
  assert.equal(info(), 'Alex M. donated $25');
  await advance(1);
  assert.equal(info(), 'Anonymous donated $25');
  assert.doesNotMatch(document.body.textContent!, /private@example|Private Full Name/);
  assert.equal(document.querySelector('[data-testid="text-donation-location"]'), null);
});

test('empty refresh during rotation hides safely and later donations recover at index zero', async () => {
  await mount();
  await click('[aria-label="Go to donation 3"]');
  await advance(5000);
  await refresh([]);
  assert.equal(widget(), null);
  assert.equal(timers.size, 0, 'rotation interval and pending transition are cancelled');
  await advance(300);
  await refresh(donations.slice(0, 1));
  assert.equal(info(), 'Anonymous donated $25');
  await advance(10000);
  assert.equal(info(), 'Anonymous donated $25');
});

test('shrinking to one item cancels an in-flight fade and restores opacity', async () => {
  await mount();
  await advance(5000);
  await refresh(donations.slice(0, 1));
  assert.equal(info(), 'Anonymous donated $25');
  assert.ok(document.querySelector('.transition-opacity')?.classList.contains('opacity-100'));
  assert.equal(timers.size, 0);
});

test('dismissal during rotation cancels rotation and preserves the 300ms exit', async () => {
  await mount();
  await advance(5000);
  await click('[data-testid="button-dismiss-widget"]');
  assert.equal(timers.size, 1, 'only dismissal remains scheduled');
  await advance(299);
  assert.ok(widget()?.classList.contains('opacity-0'));
  assert.equal(info(), 'Anonymous donated $25');
  await advance(1);
  assert.equal(widget(), null);
  assert.equal(timers.size, 0);
});

test('early dismissal cannot be undone by the initial show timer', async () => {
  await mount();
  await click('[data-testid="button-dismiss-widget"]');
  assert.equal(timers.size, 1);
  await advance(2000);
  assert.equal(widget(), null);
  assert.equal(timers.size, 0);
});

for (const phase of ['initial', 'rotation', 'dismissal', 'donate'] as const) {
  test(`unmount cancels all timers during ${phase}`, async () => {
    await mount();
    let scrolls = 0;
    const section = document.createElement('div');
    section.id = 'donation-section';
    section.scrollIntoView = () => { scrolls++; };
    document.body.append(section);
    if (phase === 'rotation') await advance(5000);
    if (phase === 'dismissal') await click('[data-testid="button-dismiss-widget"]');
    if (phase === 'donate') await click('[data-testid="button-donate-widget"]');
    await act(async () => root!.unmount());
    root = undefined;
    assert.equal(timers.size, 0);
    await advance(10000);
    assert.equal(scrolls, 0, 'unmounted widgets must not navigate or scroll');
  });
}

test('donate scrolls once after the existing exit delay, even with repeated clicks', async () => {
  await mount();
  let scrolls = 0;
  const section = document.createElement('div');
  section.id = 'donation-section';
  section.scrollIntoView = (options) => {
    assert.deepEqual(options, { behavior: 'smooth' });
    scrolls++;
  };
  document.body.append(section);
  await click('[data-testid="button-donate-widget"]');
  await click('[data-testid="button-donate-widget"]');
  await advance(299);
  assert.equal(scrolls, 0);
  await advance(1);
  assert.equal(scrolls, 1);
  assert.equal(widget(), null);
  assert.equal(timers.size, 0);
});
