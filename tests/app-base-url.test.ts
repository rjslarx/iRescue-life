import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAppBaseUrl } from '../server/lib/app-base-url';

const ORIGINAL_ENV = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  REPLIT_DEPLOYMENT: process.env.REPLIT_DEPLOYMENT,
  REPLIT_DEV_DOMAIN: process.env.REPLIT_DEV_DOMAIN,
};

function restore(name: keyof typeof ORIGINAL_ENV) {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('APP_BASE_URL');
  restore('NODE_ENV');
  restore('REPLIT_DEPLOYMENT');
  restore('REPLIT_DEV_DOMAIN');
});

test('production never uses a Replit development domain for outbound links', () => {
  delete process.env.APP_BASE_URL;
  delete process.env.REPLIT_DEPLOYMENT;
  process.env.NODE_ENV = 'production';
  process.env.REPLIT_DEV_DOMAIN = 'workspace.example.replit.dev';

  assert.equal(getAppBaseUrl(), 'https://irescue.life');
});

test('an explicit public base URL wins and trailing slashes are normalized', () => {
  process.env.APP_BASE_URL = 'https://public.example.org///';
  process.env.NODE_ENV = 'production';
  process.env.REPLIT_DEV_DOMAIN = 'workspace.example.replit.dev';

  assert.equal(getAppBaseUrl(), 'https://public.example.org');
});

test('the development workflow still uses its Replit preview domain', () => {
  delete process.env.APP_BASE_URL;
  delete process.env.REPLIT_DEPLOYMENT;
  process.env.NODE_ENV = 'development';
  process.env.REPLIT_DEV_DOMAIN = 'workspace.example.replit.dev';

  assert.equal(getAppBaseUrl(), 'https://workspace.example.replit.dev');
});