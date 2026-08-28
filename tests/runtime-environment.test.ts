import assert from 'node:assert/strict';
import test from 'node:test';

import { isProductionRuntime } from '../server/lib/runtime-environment';

test('recognizes published production runtimes', () => {
  assert.equal(isProductionRuntime({ NODE_ENV: 'production' }), true);
  assert.equal(isProductionRuntime({ REPLIT_DEPLOYMENT: '1' }), true);
});

test('rejects development and test runtimes', () => {
  assert.equal(isProductionRuntime({ NODE_ENV: 'development' }), false);
  assert.equal(isProductionRuntime({ NODE_ENV: 'test' }), false);
  assert.equal(isProductionRuntime({}), false);
});