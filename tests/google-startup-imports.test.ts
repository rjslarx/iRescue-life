import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { auth, oauth2 } from "googleapis/build/src/apis/oauth2/index.js";
import { gmail } from "googleapis/build/src/apis/gmail/index.js";
import { calendar } from "googleapis/build/src/apis/calendar/index.js";
import { drive } from "googleapis/build/src/apis/drive/index.js";

test("scoped Google Workspace clients retain the required resources", () => {
  const google = { auth, oauth2, gmail, calendar, drive };
  const client = new google.auth.OAuth2("test-client", "test-secret", "https://example.com/callback");
  assert.equal(typeof google.oauth2({ version: "v2", auth: client }).userinfo.get, "function");
  assert.equal(typeof google.gmail({ version: "v1", auth: client }).users.messages.send, "function");
  assert.equal(typeof google.calendar({ version: "v3", auth: client }).events.insert, "function");
  assert.equal(typeof google.drive({ version: "v3", auth: client }).files.create, "function");
  const require = createRequire(import.meta.url);
  assert.equal(require.cache[require.resolve("googleapis")], undefined);
});

test("startup does not eagerly import the full Google catalog or Ads SDK", () => {
  const workspace = readFileSync(new URL("../server/lib/googleWorkspace.ts", import.meta.url), "utf8");
  const ads = readFileSync(new URL("../server/googleAds.ts", import.meta.url), "utf8");
  assert.doesNotMatch(workspace, /from\s+['"]googleapis['"]/);
  assert.doesNotMatch(ads, /from\s+['"]google-ads-api['"]/);
  assert.match(ads, /await import\('google-ads-api'\)/);
});
