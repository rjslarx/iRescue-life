import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import helmet from "helmet";

test("production media directive permits authenticated audio object URLs without external media hosts", () => {
  const source = readFileSync("server/config/security.ts", "utf8");
  const directive = source.match(/mediaSrc:\s*(\[[^\]]*\])/);
  assert.ok(directive, "Production media directive must be explicit");
  const mediaSrc = JSON.parse(directive[1]);
  assert.deepEqual(mediaSrc, ["'self'", "blob:"]);
  const headers: Record<string, string> = {};
  helmet.contentSecurityPolicy({ directives: { mediaSrc } })(
    {} as any,
    { setHeader: (name: string, value: string) => { headers[name] = value; } } as any,
    () => {},
  );
  assert.match(headers["Content-Security-Policy"], /media-src 'self' blob:/);
});
