import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBundledPrice, computeCheckoutPaymentAmounts, findSamePriceRaffleBundle } from '../shared/raffle-pricing';

const raffle = {
  productType: 'raffle',
  status: 'active',
  basePrice: '5.00',
  bundlePricing: [{ quantity: 10, price: '40.00' }],
};

test('8 tickets at $40 explicitly offers 10 at $40 without repricing either selection', () => {
  assert.equal(computeBundledPrice(8, raffle.basePrice, raffle.bundlePricing), 40);
  const offer = findSamePriceRaffleBundle(raffle, 8);
  assert.deepEqual(offer, { quantity: 10, price: '40.00' });
  assert.equal(computeBundledPrice(10, raffle.basePrice, raffle.bundlePricing), 40);
  assert.deepEqual(computeCheckoutPaymentAmounts(40, true), computeCheckoutPaymentAmounts(Number(offer!.price), true));
  assert.equal(findSamePriceRaffleBundle(raffle, 10), null);
});

test('limits, stock, closure, inactive products and variants suppress the offer', () => {
  for (const change of [
    { maxPerOrder: 9 },
    { trackInventory: true, totalInventory: 9 },
    { trackInventory: true, totalInventory: 0 },
    { raffleClosed: true },
    { splitPot: { isDrawn: true } },
    { status: 'draft' },
    { productType: 'physical' },
  ]) assert.equal(findSamePriceRaffleBundle({ ...raffle, ...change }, 8), null);
  assert.equal(findSamePriceRaffleBundle(raffle, 8, { variantId: 'variant' }), null);
  assert.ok(findSamePriceRaffleBundle({ ...raffle, maxPerOrder: 10, trackInventory: true, totalInventory: 10 }, 8));
  assert.ok(findSamePriceRaffleBundle({ ...raffle, trackInventory: false, totalInventory: 0 }, 8));
});

test('existing cart quantities count against limits and inventory without being changed', () => {
  const options = { otherCartQuantity: 2 };
  assert.equal(findSamePriceRaffleBundle({ ...raffle, maxPerOrder: 11 }, 8, options), null);
  assert.equal(findSamePriceRaffleBundle({ ...raffle, trackInventory: true, totalInventory: 11 }, 8, options), null);
  assert.ok(findSamePriceRaffleBundle({ ...raffle, maxPerOrder: 12, trackInventory: true, totalInventory: 12 }, 8, options));
  assert.deepEqual(options, { otherCartQuantity: 2 });
});

test('product-page initial state never offers a bundle when variant selection is required', () => {
  // The product page passes the full product before the buyer selects a variant.
  // Even a zero-adjustment variant is priced per ticket by checkout, not by tier.
  const product = { ...raffle, variants: [{ id: 'required-variant', priceAdjustment: '0.00' }] };
  assert.equal(findSamePriceRaffleBundle(product, 8, { variantId: null }), null);
  assert.equal(findSamePriceRaffleBundle(product, 8, { variantId: 'required-variant' }), null);
  assert.equal(findSamePriceRaffleBundle(product, 8), null);
  assert.ok(findSamePriceRaffleBundle({ ...raffle, variants: [] }, 8, { variantId: null }));
});

test('only exact same-price configured tiers qualify, not cheaper or dearer ones', () => {
  for (const price of ['39.99', '40.01', 'NaN', '-40']) {
    assert.equal(findSamePriceRaffleBundle({ ...raffle, bundlePricing: [{ quantity: 10, price }] }, 8), null);
  }
  assert.equal(findSamePriceRaffleBundle({ ...raffle, bundlePricing: [] }, 8), null);
  assert.equal(findSamePriceRaffleBundle(raffle, 7), null);
  for (const quantity of [0, -1, 8.5, NaN, Infinity]) {
    assert.equal(findSamePriceRaffleBundle(raffle, quantity), null);
  }
});

test('largest eligible same-price tier wins, subject to exact configured pricing', () => {
  const product = { ...raffle, bundlePricing: [{ quantity: 10, price: '40' }, { quantity: 12, price: '40' }] };
  assert.equal(findSamePriceRaffleBundle(product, 8)?.quantity, 12);
  assert.equal(findSamePriceRaffleBundle({ ...product, maxPerOrder: 10 }, 8)?.quantity, 10);
  // Never optimize 10 as three cheaper 3-packs plus one single.
  const tiers = [{ quantity: 3, price: '4' }, { quantity: 10, price: '20' }];
  assert.equal(computeBundledPrice(10, '5', tiers), 20);
  assert.equal(computeBundledPrice(13, '5', tiers), 24);
});
