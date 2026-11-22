// Read-only release check. Supply the verified published origin, never a preview.
import assert from "node:assert/strict";

const origin = new URL(process.argv[2] || "");
assert.equal(origin.protocol, "https:", "Use the verified HTTPS production origin");
assert.equal(origin.pathname, "/", "Supply an origin without a path");
const page = await fetch(new URL("/platform", origin));
assert.equal(page.status, 200);
const html = await page.text();
assert.doesNotMatch(page.headers.get("cache-control") || "", /immutable/i, "HTML must not be immutable");
const assets = [...new Set([...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map(m => m[1]))];
assert.ok(assets.length, "No compiled JS/CSS found; verify this is the released build");
for (const path of assets) {
  for (const encoding of ["br", "gzip", "identity"]) {
    const response = await fetch(new URL(path, origin), { headers: { "Accept-Encoding": encoding } });
    assert.equal(response.status, 200, `${path}: ${encoding} status`);
    const cache = response.headers.get("cache-control") || "";
    assert.match(cache, /max-age=31536000/, `${path}: one-year cache`);
    assert.match(cache, /immutable/, `${path}: immutable cache`);
    assert.match(response.headers.get("vary") || "", /accept-encoding/i);
    assert.equal(response.headers.get("content-encoding"), encoding === "identity" ? null : encoding);
    assert.equal(response.headers.get("set-cookie"), null, "Public assets must not create sessions");
    await response.arrayBuffer();
    console.log(JSON.stringify({ asset: path, encoding, cache, status: response.status }));
  }
}
const missing = await fetch(new URL("/assets/missing-release-check-12345678.js", origin));
assert.equal(missing.status, 404);
assert.doesNotMatch(missing.headers.get("cache-control") || "", /immutable/i);
console.log("Published HTML and initial JS/CSS asset header checks passed.");
