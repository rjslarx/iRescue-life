import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import puppeteer from "puppeteer";
import sharp from "sharp";
import { renderVotingSocialImage } from "../../../server/lib/voting-social-image";
import { themes, scenarios, photoSvg } from "./fixtures";
import { comparePng } from "./compare";

const update = process.argv.includes("--update");
assert(!update || !process.env.CI, "Baseline updates are forbidden in CI");
const root = resolve("tests/visual/contest");
const baselines = `${root}/baselines`;
const artifacts = resolve("test-results/contest-visual");
await mkdir(baselines, { recursive: true });
await rm(artifacts, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });
const bundle = await build({
  entryPoints: [`${root}/fixture.tsx`], bundle: true, write: false,
  outdir: artifacts, platform: "browser", jsx: "automatic",
});
const css = await postcss([tailwindcss(), autoprefixer]).process(
  bundle.outputFiles!.find(f => f.path.endsWith(".css"))!.text,
  { from: resolve("client/src/index.css") },
);
const assets = new Map<string, { type: string; body: string | Buffer }>();
assets.set("/fixture.js", { type: "text/javascript", body: bundle.outputFiles!.find(f => f.path.endsWith(".js"))!.text });
assets.set("/fixture.css", { type: "text/css", body: css.css + `
  :root { --font-sans: Arial, sans-serif; }
  body { margin: 0; padding: 16px; background: #fff; }
  main { max-width: 1200px; margin: auto; }
  h1 { font-size: 20px; margin-bottom: 16px; }
  h2 { font-size: 14px; margin: 12px 0; }
  section { margin-bottom: 24px; }
  .fixture-pair { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
  .social { width: 100%; height: auto; }
  @media(min-width: 640px) { .fixture-pair { grid-template-columns: minmax(0, 400px) minmax(0, 1fr); } }
  *, *::before, *::after { animation: none !important; transition: none !important; }
` });
for (const kind of ["portrait", "landscape"]) {
  assets.set(`/photo-${kind}.png`, { type: "image/png", body: await sharp(Buffer.from(photoSvg(kind === "landscape"))).png().toBuffer() });
}
for (const theme of themes) {
  for (const scenario of scenarios) {
    assets.set(`/social/${theme.value}/${scenario.id}.jpg`, {
      type: "image/jpeg",
      body: await renderVotingSocialImage({
        ...scenario, contestTitle: "The Most Wonderful Companion Contest",
        rescueName: "Fixture Animal Rescue", photoUrl: null,
        themeBackground: theme.value === "none" ? null : theme.value,
        primaryColor: "primaryColor" in scenario ? scenario.primaryColor : null,
        accentColor: "accentColor" in scenario ? scenario.accentColor : null,
      }, scenario.photo ? assets.get(`/photo-${scenario.photo}.png`)!.body as Buffer : undefined),
    });
  }
}
const server = createServer((req, res) => {
  const path = new URL(req.url!, "http://fixture").pathname;
  const asset = assets.get(path);
  if (asset) { res.setHeader("Content-Type", asset.type); res.end(asset.body); }
  else if (path === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
  } else { res.statusCode = 404; res.end(); }
});
const serve = process.argv.includes("--serve");
await new Promise<void>(r => server.listen(serve ? 5111 : 0, serve ? "0.0.0.0" : "127.0.0.1", r));
const address = server.address() as { port: number };
if (serve) {
  console.log("Isolated fixture preview on port 5111 /?theme=lsu_tigers (no app or database)");
  await new Promise(() => {});
}
let browser;
try {
  const executablePath = process.env.CONTEST_CHROMIUM_PATH ||
    execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"] });
  const fontPath = execFileSync("fc-match", ["Arial", "-f", "%{file}"], { encoding: "utf8" });
  const environment = {
    browser: await browser.version(), platform: process.platform, arch: process.arch,
    sharp: sharp.versions, font: createHash("sha256").update(await readFile(fontPath)).digest("hex"),
  };
  const manifestPath = `${baselines}/environment.json`;
  if (update) await writeFile(manifestPath, JSON.stringify(environment, null, 2) + "\n");
  else assert.deepEqual(environment, JSON.parse(await readFile(manifestPath, "utf8")),
    "Visual environment changed. Use the documented browser/fonts; do not blindly update baselines.");
  const failures: string[] = [];
  for (const width of [375, 1280]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", req => req.url().startsWith(`http://127.0.0.1:${address.port}/`) || req.url().startsWith("data:") ? req.continue() : req.abort());
    const errors: string[] = [];
    page.on("pageerror", err => errors.push(String(err)));
    for (const theme of themes) {
      const name = `${theme.value}-${width}.png`;
      await page.goto(`http://127.0.0.1:${address.port}/?theme=${theme.value}`, { waitUntil: "networkidle0" });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map(image => image.decode()));
      });
      assert.deepEqual(errors, [], "Fixture browser errors");
      assert.equal(await page.$$eval('[data-testid="contest-portrait"]', els => els.length), scenarios.length);
      assert.equal(await page.$$eval('[data-testid="contest-portrait"] img', els => els.length), scenarios.filter(s => s.photo).length);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow: ${name}`);
      const actual = Buffer.from(await page.screenshot({ fullPage: true }));
      const baselinePath = `${baselines}/${name}`;
      if (update) { await writeFile(baselinePath, actual); console.log(`Updated ${name}`); continue; }
      let expected: Buffer;
      try { expected = await readFile(baselinePath); }
      catch { failures.push(`${name}: missing baseline`); await writeFile(`${artifacts}/${name}`, actual); continue; }
      const comparison = await comparePng(actual, expected);
      if (!comparison.matches) {
        failures.push(name);
        await writeFile(`${artifacts}/${name}`, actual);
        await writeFile(`${artifacts}/${name.replace(".png", "-expected.png")}`, expected);
        if (comparison.diff) {
          await writeFile(`${artifacts}/${name.replace(".png", "-diff.png")}`, comparison.diff);
        }
      }
    }
    await page.close();
  }
  assert.equal(failures.length, 0, `Visual regressions (actual/expected/diff in ${artifacts}):\n${failures.join("\n")}`);
  console.log(`${themes.length * 2} screenshots ${update ? "updated" : "matched"}; ${themes.length * scenarios.length * 2} paired scenarios.`);
} finally {
  await browser?.close();
  await new Promise<void>((r, reject) => server.close(err => err ? reject(err) : r()));
}