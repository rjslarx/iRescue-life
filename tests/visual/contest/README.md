# Contest portrait visual regressions

Run from the repository root:

```sh
npm ci
npm run test:contest-visual
npx tsx --test tests/visual/contest/compare.test.ts
```

The runner uses existing Puppeteer, esbuild, Tailwind, React, and Sharp dependencies.
It starts its own ephemeral, loopback-only fixture server, imports the real
`ContestEntrantPhoto` and `renderVotingSocialImage`, and never starts the application,
reads credentials, queries a database, or changes contest entries. Browser requests
outside the fixture server/data URLs are blocked. Photos are generated locally from
synthetic SVG artwork with edge markers that expose cropping.

## Coverage

Committed full-page PNGs cover every `VOTING_THEME_OPTIONS` entry plus no theme,
at 375px and 1280px, device scale 1. Each page pairs the actual React portrait with
the actual 1200×630 server-generated JPEG, displayed responsively. Seven cases
per page cover tall/wide photos, long spaced and unbroken names, long owners,
empty/null owners, missing photos, and both light and dark custom colors.
New themes automatically require new snapshots; missing baselines fail.
Assertions also check image loading, portrait counts, browser errors, and page overflow.

## Reproducible environment

Use Linux x64 with Chromium 125.0.6422.141 and DejaVu Sans (the current Replit
environment). `CONTEST_CHROMIUM_PATH` can select the executable; otherwise `chromium`
must be on PATH. Fontconfig (`fc-match`) is required. Exact browser version, Sharp
and native renderer versions, and the resolved Arial font's SHA-256 are committed
in `baselines/environment.json`. A different environment fails early rather than
silently comparing incompatible renders. Use `npm ci` to retain locked dependencies.
No remote fonts, images, animation, variable timestamps, or real data are involved.

## Failures and intentional updates

Normal runs **never** create or accept baselines. Any changed pixel or size fails.
`test-results/contest-visual/` contains actual and expected PNGs plus a magenta
pixel diff (dimension changes retain actual/expected only). The small comparator
tests verify that even a one-pixel mutation and equal-area dimension changes fail.

For an intentional design change, in the same environment:

```sh
npm run test:contest-visual:update
npm run test:contest-visual
```

Inspect changed PNGs before committing; do not accept a failing snapshot merely
to make the test pass. Updates are forbidden when `CI` is set. For a deliberate
browser/font upgrade, regenerate and inspect **all** baselines and the environment
manifest together. Remove obsolete theme baselines when deleting a theme.

To inspect the live, isolated fixture manually:

```sh
npx tsx tests/visual/contest/run.ts --serve
# http://localhost:5111/?theme=lsu_tigers
```

This optional preview binds port 5111 on all interfaces for Replit preview access;
stop it with Ctrl-C. It is not registered as an application route or production service.