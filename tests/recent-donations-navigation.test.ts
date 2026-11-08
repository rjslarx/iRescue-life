// Run: npx tsx --test tests/recent-donations-navigation.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

function compile(path: string, loader: 'ts' | 'tsx') {
  return transformSync(readFileSync(path, 'utf8'), {
    loader, format: 'cjs', jsx: 'automatic',
  }).code;
}

const widgetCode = compile('client/src/components/RecentDonationsWidget.tsx', 'tsx');
const tenantCode = compile('client/src/lib/tenantApi.ts', 'ts');

test('tenant URL helper recognizes only complete tenant path segments', () => {
  const module = { exports: {} as any };
  runInNewContext(tenantCode, {
    module, exports: module.exports,
    window: { location: new URL('https://irescue.life/don/animals') },
    localStorage: { getItem: () => null },
  });
  const { buildTenantUrl } = module.exports;
  for (const path of ['/don', '/don/', '/don/donate', '/don?tab=gifts', '/don#giving']) {
    assert.equal(buildTenantUrl(path), path, 'already-prefixed paths stay unchanged');
  }
  assert.equal(buildTenantUrl('/donate'), '/don/donate');
  assert.equal(buildTenantUrl('/donations'), '/don/donations');
  assert.equal(buildTenantUrl('/api/donations'), '/don/api/donations');
  assert.equal(buildTenantUrl('donate'), 'donate');
});

function harness(url: string, hasSection: boolean) {
  let currentUrl = new URL(url);
  // Location.href accepts relative paths; URL.href alone does not.
  const location = {
    get hostname() { return currentUrl.hostname; },
    get pathname() { return currentUrl.pathname; },
    get href() { return currentUrl.href; },
    set href(value: string) { currentUrl = new URL(value, currentUrl); },
  };
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const stateChanges: unknown[] = [];
  const scrolls: unknown[] = [];
  const window = { location };
  const module = { exports: {} as any };
  runInNewContext(tenantCode, {
    module, exports: module.exports, window,
    localStorage: { getItem: () => 'unrelated-stored-tenant' },
  });
  const tenantApi = module.exports;
  const widgetModule = { exports: {} as any };
  const jsx = (type: unknown, props: any) => ({ type, props });
  runInNewContext(widgetCode, {
    module: widgetModule, exports: widgetModule.exports, window,
    document: {
      getElementById: (id: string) => {
        assert.equal(id, 'donation-section');
        return hasSection ? { scrollIntoView: (options: any) => scrolls.push(options.behavior) } : null;
      },
    },
    setTimeout: (callback: () => void, delay: number) => timers.push({ callback, delay }),
    require: (name: string) => {
      switch (name) {
        case 'react': return {
          useState: (value: unknown) => [value, (next: unknown) => stateChanges.push(next)],
          useEffect: () => {},
          useCallback: (callback: unknown) => callback,
          useRef: (value: unknown) => ({ current: value }),
        };
        case 'react/jsx-runtime': return { jsx, jsxs: jsx };
        case '@tanstack/react-query': return {
          useQuery: () => ({ data: [{ id: 'gift', displayName: 'Donor', amount: 500, location: null }] }),
        };
        case 'lucide-react': return { X: 'X', MapPin: 'MapPin', Heart: 'Heart' };
        case '@/components/ui/button': return { Button: 'button' };
        case '@/lib/utils': return { cn: () => '' };
        case '@/lib/tenantApi': return tenantApi;
        default: throw new Error(`Unexpected import: ${name}`);
      }
    },
  });
  const tree = widgetModule.exports.RecentDonationsWidget({ tenantSubdomain: 'rescue' });
  function findButton(node: any): any {
    if (!node || typeof node !== 'object') return;
    if (node.props?.['data-testid'] === 'button-donate-widget') return node;
    for (const child of [node.props?.children].flat()) {
      const found = findButton(child);
      if (found) return found;
    }
  }
  const button = findButton(tree);
  assert.ok(button, 'the Donate button is wired to the tested handler');
  button.props.onClick();
   assert.deepEqual(stateChanges, [true, false], 'close and hide immediately');
  assert.equal(location.href, url, 'do not navigate before the animation finishes');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 300, 'preserve dismissal timing');
  timers[0].callback();
   assert.deepEqual(stateChanges, [true, false, true], 'dismiss after the animation');
  return { location, scrolls };
}

for (const [url, destination] of [
  ['https://irescue.life/rescue/animals', 'https://irescue.life/rescue/donate'],
  ['https://preview.replit.dev/rescue', 'https://preview.replit.dev/rescue/donate'],
  ['https://published.replit.app/rescue', 'https://published.replit.app/rescue/donate'],
  ['https://irescue.life/don/animals', 'https://irescue.life/don/donate'],
  ['https://preview.replit.dev/don', 'https://preview.replit.dev/don/donate'],
  ['https://published.replit.app/don', 'https://published.replit.app/don/donate'],
  ['https://irescue.life/dona', 'https://irescue.life/dona/donate'],
  ['https://rescue.example.org/animals', 'https://rescue.example.org/donate'],
  ['https://rescue.example.org/our-story', 'https://rescue.example.org/donate'],
]) {
  test(`missing donation section navigates within the rescue: ${url}`, () => {
    const { location, scrolls } = harness(url, false);
    assert.equal(location.href, destination);
    assert.deepEqual(scrolls, []);
  });

  test(`existing donation section scrolls without leaving the rescue home page: ${url}`, () => {
    const { location, scrolls } = harness(url, true);
    assert.equal(location.href, url);
    assert.deepEqual(scrolls, ['smooth']);
  });
}
