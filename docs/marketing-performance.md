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

## Responsive hero image follow-up (2026-11-22)

The hero now uses a `<picture>` desktop source matching Tailwind's `lg`
breakpoint (1024px). Below that width, its fallback is an inline empty SVG:
there is no phone-image HTTP request, even though the hidden element remains
in the DOM. At desktop widths the same artwork, aspect ratio, alt text, rounded
corners, and shadow remain. Explicit dimensions reserve the correct aspect ratio.

Two WebP variants (704 × 384 and 1408 × 768) cover the maximum 532 CSS-pixel
display width and high-density screens. They were generated from the existing
PNG using Sharp `resize({ width }).webp({ quality: 85 })`, without metadata.
Their file sizes are 20,254 and 50,500 bytes; transferred sizes include headers.
WebP provides a substantial reduction without needing a second AVIF asset set.
The original PNG is retained as the source artwork, but no longer imported here.

Rebuilt the unchanged page before editing and repeated the same three cold runs
per viewport after editing, using the existing production static middleware in
both sets. Mobile conditions remain those above; desktop uses 1440 × 1000 with
the same network/CPU throttling. Both use DPR 1. These are controlled anonymous
fixtures with external requests blocked, not deployed-site measurements.

| Measurement (identical bytes across all three runs) | Before | After |
| --- | ---: | ---: |
| Mobile image transfer | 873,423 bytes | **0 bytes** |
| Mobile total same-origin transfer | 1,104,397 bytes | 231,233 bytes |
| Desktop image transfer | 873,423 bytes | 20,600 bytes |
| Desktop total same-origin transfer | 1,104,397 bytes | 251,833 bytes |
| Initial JavaScript transfer, both viewports | 188,354 bytes | 188,613 bytes |

Mobile total transfer fell 79.1%; desktop image transfer fell 97.6%.
Median LCP was 2,480 → 2,456 ms on mobile and 6,843 → 2,633 ms on desktop.
The primary mobile improvement is avoiding bytes, not a claimed paint-time gain.
The earlier table above is a separate historical build baseline.

Reproduce (each command uses three fresh browser contexts):

```sh
# Before changing the hero, build and capture:
npm run build
node scripts/measure-marketing.mjs hero-before-mobile
node scripts/measure-marketing.mjs hero-before-desktop --desktop
# After changing the hero, rebuild and capture/assert:
npm run build
node scripts/measure-marketing.mjs hero-after-mobile --verify-hero
node scripts/measure-marketing.mjs hero-after-desktop --desktop --verify-hero
```

`--verify-hero` asserts no mobile mockup request, successful desktop WebP
decoding, and correct visibility across 1023px, 1024px, and 390px resize checks.
Byte totals are captured before those resize checks. Network records and
first-run screenshots are saved under ignored `generated-artifacts/marketing/`.
Production-build mobile and desktop screenshots were visually inspected; the
desktop artwork remains visible and the mobile layout stays image-free.
Development previews also rendered at both sizes after workflow restart.
The production build, marketing asset tests, and chunk isolation test passed.

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

## Real-user collection (separate from acquisition)

`marketing_web_vital` uses the existing hosted analytics tracker and the standard
`web-vitals` library. No additional tracker, cookie, identifier or credential is
created by this instrumentation. Payloads contain only tracker website routing,
a fixed safe URL/title, empty referrer, and these dimensions:

| Property | Meaning |
| --- | --- |
| schema | `v1`, this sampling policy |
| route | Exact allowed marketing path; `/` groups with `/platform` |
| device | Initial viewport: mobile <768px, tablet <1024px, otherwise desktop |
| metric | LCP (ms), CLS (unitless), or INP (ms) |
| value | Final reported value, milliseconds rounded; CLS to four decimals |

Only production builds on `irescue.life`, `www.irescue.life`, and
`platform.irescue.life` collect. Exact allowed routes are `/`, `/platform`,
and `/platform/{pricing,integrations,security,privacy,terms,blog}`.
Signup/forms, login, success pages, arbitrary blog slugs, tenant hosts/paths,
and every other route are excluded. Query strings, fragments, titles, referrers,
DOM entries/attribution, metric IDs, user/tenant IDs and tracker identity defaults
are not forwarded. DNT and Global Privacy Control opt-outs suppress collection.
This does not change existing automatic pageviews or signup funnel tracking;
their privacy policies remain separate. The analytics provider still handles
network metadata and its own session aggregation; these are not anonymous
network requests merely because application payloads contain no user identity.

### Sampling and limitations

- At most one observation per metric per eligible initial document, using the
  library's default finalization/first-background reporting. No sampling throttle.
- Any history push/replace/pop or hash navigation permanently disqualifies
  subsequent measurements for that document, even if the visitor returns.
  Already emitted initial-page LCP remains valid. SPA navigations and back/forward
  cache restores are **not** new samples. This deliberately favors isolation over
  coverage; do not label this a complete site-wide or CrUX-equivalent result.
- Unsupported APIs, blocked/missing trackers, failed sends, background termination,
  and opt-outs cause missing observations, not zero values. INP requires a qualifying
  interaction, so its sample count will differ from LCP and CLS. No queued replay.
- Mobile means viewport group, not a claim about hardware or connection speed.
  No raw user agent, network identifiers or device fingerprint is added.

### Reporting and comparison

Use `docs/marketing-field-query.sql` for a bounded 28-day report, adjusting the
start date to the release date if newer. It pivots properties per event before
counting, and reports **n and p75 separately for each route/device/metric**.
Counts represent observations, not unique visitors. Below 100 observations per
cell, label the result insufficient to draw conclusions; 100 is an internal
reporting convention, not an official Google eligibility threshold. Never pool
mobile and desktop to conceal sparse mobile coverage. Always state dates and
missing groups; do not convert missing INP into a good score.

Reference good thresholds at p75: LCP ≤2,500ms, CLS ≤0.1, INP ≤200ms.
These are metric thresholds, not proof of passing Google's field assessment.
Compare mobile `/platform` LCP directionally to the **2,648ms local median from
three controlled runs** above, explicitly labeling p75 versus median, real
connections/devices versus throttled Chromium, real APIs/third parties versus
fixtures, and different collection periods. The lab report contains no comparable
CLS or INP baseline; long-task time is not INP. Do not compute a field improvement
percentage from the lab before/after figures.

### Release verification and current status

This branch has not been released. No field measurements from this implementation
or deployed-header verification are claimed. A pre-release query cannot establish
post-release performance, and zero observations do not mean zero visitors.

On 2026-11-22, the last-seven-days event-count query returned no
`marketing_web_vital` rows (0 recorded metric observations, not 0 visitors).
The 28-day route/device/metric report also returned no rows. LCP, CLS and INP
therefore have no reportable field percentiles yet. The report query was accepted
by the analytics service.

Workspace verification: all 9 focused performance/acquisition tests passed;
production build passed; mobile `/platform` preview rendered after restart.
The project-wide TypeScript check still produced 2,334 lines of existing errors,
with none naming the changed performance modules or entry point.

After a release containing these changes, obtain the verified published origin
from deployment settings and run:

```sh
node scripts/verify-marketing-release.mjs https://VERIFIED-PUBLISHED-ORIGIN
```

The read-only check requests real HTML and its initial compiled JS/CSS through the
deployment proxy. It asserts one-year immutable asset caching, negotiated br/gzip/
identity, `Vary: Accept-Encoding`, no asset session cookies, non-immutable HTML, and
an uncached missing-asset 404. A proxy that changes negotiation fails explicitly;
investigate rather than substituting local headers. Record release date, execution
date, output, and any CDN/proxy differences here. Then report field sample counts
and p75 after sufficient real traffic; no release was performed from this task fork.
