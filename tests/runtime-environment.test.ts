import assert from 'node:assert/strict';
import test from 'node:test';

import { isProductionRuntime } from '../server/lib/runtime-environment';

test('recognizes only published production runtimes', () => {
  assert.equal(isProductionRuntime({ REPLIT_DEPLOYMENT: '1' }), true);
  assert.equal(
    isProductionRuntime({ NODE_ENV: 'production', REPLIT_DEPLOYMENT: '1' }),
    true,
  );
});

test('rejects development workspaces even when they run a production build', () => {
  assert.equal(isProductionRuntime({ NODE_ENV: 'production' }), false);
  assert.equal(
    isProductionRuntime({ NODE_ENV: 'production', REPLIT_DEPLOYMENT: '0' }),
    false,
  );
  assert.equal(isProductionRuntime({ NODE_ENV: 'development' }), false);
  assert.equal(isProductionRuntime({ NODE_ENV: 'test' }), false);
  assert.equal(isProductionRuntime({}), false);
});