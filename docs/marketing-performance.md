# Marketing load measurement

## Method

Measured the existing and revised production builds at `/platform` with
`node scripts/measure-marketing.mjs before` and
`node scripts/measure-marketing.mjs after`, respectively. Build with `npm run build`
before running the measurement. The `before` mode omits the new hashed-asset
middleware and must be run against the old build, not the revised build.

Three cold-browser-context runs each, Chromium 125, 390 × 844 mobile viewport,
4× CPU slowdown, 1.6 Mbps download, 750 Kbps upload, 150 ms latency, cache disabled.
The harness serves real compiled files through the production static-serving
code. Revised runs include the new public-asset middleware. Measurements include
response overhead; byte counts are transferred bytes, not estimated minifier sizes.

API responses are fixed anonymous fixtures and external requests (including
Google fonts, analytics, and payment providers) are blocked identically in both
runs. This isolates first-party load changes without contacting customers or
performing writes. It is **not** a complete live-site performance audit, a
Lighthouse score, a payment/sign-in test, or a field Core Web Vitals result.

## Results

| Measurement | Before | After |
| --- | ---: | ---: |
| Initial JavaScript transfer (each run) | 8,337,570 bytes | 191,054 bytes |
| Total same-origin transfer (each run) | 9,465,223 bytes | 1,107,097 bytes |
| Median first contentful paint | 44,996 ms | 1,403 ms |
| Median largest contentful paint | 44,996 ms | 2,648 ms |
| Median sum of long-task time beyond 50 ms | 1,517 ms | 181 ms |

The revised browser selected gzip. Brotli, gzip, and identity responses were
separately verified in the HTTP regression test. Initial JS transfer decreased
97.7%; total transfer decreased 88.3%. The long-task figure is a lab observation,
not Lighthouse TBT or INP. First paint in the revised build can be the route
loading indicator; LCP was observed after the marketing heading appeared.

Individual before LCP values: 45,359 / 44,915 / 44,996 ms.
Individual after LCP values: 2,688 / 2,648 / 2,637 ms.
Full network records are written to ignored `generated-artifacts/marketing/`.
The existing 873,423-byte phone mockup still downloads on mobile and is the
largest remaining first-party resource; it was deliberately unchanged.

## Boundaries and verification

- Route definitions, guards, provider ordering, and tenant resolution were
  retained. Page imports now load on demand, including named-export routes.
- Only hashed public `/assets` files receive one-year immutable caching.
  They are served before session and tenant middleware, without cookies.
  Compression is produced at build time, never applied to private/API responses.
  HTML and unhashed static files revalidate; existing stricter headers survive.
- Missing assets return an uncached 404 rather than SPA HTML.
- Global font requests contain Inter and Outfit only. Existing tenant content
  choices are system fonts and remain unchanged. Resale-specific font CSS now
  arrives with its lazy route.
- Route load failures show a manual reload action rather than a blank screen.
- `npm run build` passed. `npx tsx --test tests/marketing-assets.test.ts` passed.
  `node --test tests/marketing-chunks.test.mjs` passed after the build.
- The mobile development preview rendered successfully after workflow restart.
  No real payment or authenticated session was exercised.
- `npx tsc --noEmit` reports existing project-wide errors (2,334 output lines);
  no diagnostics named the changed App, route boundary, asset middleware, or
  focused test. Do not interpret the successful production build as a clean
  project-wide type check.

Changes are workspace-only until merged and released. Repeat measurement on the
deployed origin after release, with real third parties and APIs, before drawing
conclusions about visitors' actual Core Web Vitals.
