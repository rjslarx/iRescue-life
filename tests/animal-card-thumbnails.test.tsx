/**
 * Regression coverage for AnimalCard's opt-in listing thumbnails.
 *
 * Run via: scripts/run-tests.sh tests/animal-card-thumbnails.test.tsx
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import AnimalCard from '../client/src/components/AnimalCard';

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

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = undefined;
  }
  document.body.replaceChildren();
});

const baseProps = {
  id: 'animal-1',
  name: 'Buddy',
  species: 'Dog',
  breed: 'Terrier',
  age: '2 years',
  photo: '/objects/uploads/buddy.jpg',
};

async function renderCard(props: Partial<Parameters<typeof AnimalCard>[0]> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(createElement(AnimalCard, { ...baseProps, ...props }));
  });

  const image = container.querySelector<HTMLImageElement>('[data-testid="img-animal-buddy"]');
  assert.ok(image, 'animal image should render');
  return image;
}

test('thumbnail mode requests generated object-storage thumbnails and keeps images lazy', async () => {
  const image = await renderCard({ useThumbnails: true });

  assert.equal(image.getAttribute('src'), '/objects/uploads/buddy.jpg-thumb');
  assert.equal(image.getAttribute('loading'), 'lazy');
});

test('a missing generated thumbnail retries the original object-storage photo', async () => {
  const image = await renderCard({ useThumbnails: true });

  await act(async () => {
    image.dispatchEvent(new Event('error', { bubbles: true }));
  });

  assert.equal(image.src, 'https://example.test/objects/uploads/buddy.jpg');
});

test('cards without thumbnail mode leave their supplied source unchanged', async () => {
  const suppliedSource = 'https://images.example.test/full-size-buddy.jpg';
  const image = await renderCard({ photo: suppliedSource });

  assert.equal(image.getAttribute('src'), suppliedSource);
  assert.equal(image.getAttribute('loading'), 'lazy');
});