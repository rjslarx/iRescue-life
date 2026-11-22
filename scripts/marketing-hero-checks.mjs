import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const selector = '[data-testid="image-hero-mockup"]';
const isMockup = url => /dual_phone/i.test(url);

// Functional checks only: CDP throttling and transfer metrics are Chromium-only.
export async function verifyMarketingHero({ origin, label, chromiumPath, engines }) {
  const results = [];
  for (const engine of engines) {
    let browser;
    try {
      const executablePath = process.env[`${engine.toUpperCase()}_PATH`] ||
        (engine === 'chromium' ? chromiumPath : undefined);
      browser = await ({ chromium, firefox, webkit }[engine]).launch({
        executablePath,
        ...(engine === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}),
      });
      for (const scenario of [
        { name: 'cold-mobile', width: 390, dpr: 1 },
        { name: 'cold-below-breakpoint', width: 1023, dpr: 1 },
        { name: 'cold-desktop', width: 1440, dpr: 1 },
        { name: 'cold-retina-desktop', width: 1440, dpr: 2 },
      ]) {
        const context = await browser.newContext({
          viewport: { width: scenario.width, height: 1000 },
          deviceScaleFactor: scenario.dpr,
          serviceWorkers: 'block',
        });
        try {
          // Routing disables HTTP caching. A fresh context also isolates storage.
          // All engines use viewport emulation (Firefox has no isMobile mode).
          await context.route('**/*', route => {
            const url = new URL(route.request().url());
            return url.origin === origin || url.protocol === 'data:'
              ? route.continue() : route.abort();
          });
          const page = await context.newPage();
          const requests = [];
          let navigations = 0;
          page.on('request', request => {
            requests.push({ url: request.url(), type: request.resourceType() });
          });
          page.on('framenavigated', frame => {
            if (frame === page.mainFrame()) navigations++;
          });
          await page.goto(`${origin}/platform`, { waitUntil: 'networkidle' });
          await page.locator('h1').waitFor();
          const assertImage = async width => {
            const visible = width >= 1024;
            const variant = scenario.dpr === 2 ? '1408' : '704';
            await page.waitForFunction(({ selector, visible, variant }) => {
              const img = document.querySelector(selector);
              return img && (img.getBoundingClientRect().width > 0) === visible &&
                img.complete && img.naturalWidth > 0 &&
                (visible ? img.currentSrc.includes(`dual_phone_app_mockup-${variant}`) &&
                  img.currentSrc.endsWith('.webp') : img.currentSrc.startsWith('data:image/svg+xml'));
            }, { selector, visible, variant });
            return page.locator(selector).evaluate(img => ({
              source: img.currentSrc, width: img.getBoundingClientRect().width,
              naturalWidth: img.naturalWidth, loaded: img.complete,
              dpr: window.devicePixelRatio,
            }));
          };
          const initial = await assertImage(scenario.width);
          assert.equal(initial.dpr, scenario.dpr, 'Device density was not applied');
          const initialRequests = requests.filter(r => isMockup(r.url));
          if (scenario.width < 1024) {
            assert.equal(initialRequests.length, 0, 'Hidden mockup requested on cold mobile load');
          } else {
            assert(initialRequests.some(r => r.url === initial.source), 'Desktop artwork was not requested');
            assert(initialRequests.every(r => r.url.endsWith('.webp')), 'Unexpected original artwork download');
          }
          await page.screenshot({ path: `generated-artifacts/marketing/${label}-${engine}-${scenario.name}.png` });
          const documentToken = await page.evaluate(() => {
            window.__heroDocumentToken = crypto.randomUUID();
            return window.__heroDocumentToken;
          });
          const initialNavigations = navigations;
          const steps = [];
          for (const width of [1023, 1024, 390, 1024]) {
            const requestStart = requests.length;
            await page.setViewportSize({ width, height: 1000 });
            const hero = await assertImage(width);
            await page.waitForLoadState('networkidle');
            assert.equal(await page.evaluate(() => window.__heroDocumentToken), documentToken, 'Resize replaced document');
            assert.equal(navigations, initialNavigations, 'Resize navigated');
            const resizeRequests = requests.slice(requestStart).filter(r => isMockup(r.url));
            if (width < 1024) assert.equal(resizeRequests.length, 0, 'Shrinking requested hidden artwork');
            steps.push({ width, hero, requests: resizeRequests });
          }
          results.push({ engine, version: browser.version(), scenario, initial, initialRequests, steps, status: 'passed' });
          console.log(`PASS ${engine}: ${scenario.name}, breakpoint resizing without navigation`);
        } finally {
          await context.close();
        }
      }
    } catch (error) {
      results.push({ engine, status: 'failed', error: error.message });
      // Continue the other engines, but never silently skip a missing browser.
      console.error(`FAIL ${engine}: ${error.message}`);
    } finally {
      await browser?.close();
    }
  }
  await fs.writeFile(`generated-artifacts/marketing/${label}-hero.json`, JSON.stringify({
    conditions: 'Unthrottled functional checks; fresh anonymous contexts; cache disabled; external requests blocked; viewport emulation, not physical devices or shipping Safari',
    results,
  }, null, 2));
  assert(!results.some(result => result.status === 'failed'), 'Hero checks failed; see per-engine report (install Playwright browsers/dependencies if launch failed)');
}
