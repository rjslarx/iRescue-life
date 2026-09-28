import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { contestAppearanceSchema } from "../shared/voting-contest-validation";
import { votingBackgroundApplies, votingBackgroundPath } from "../shared/voting-background";
import { renderVotingSocialImage, votingSocialVersion } from "../server/lib/voting-social-image";
import { DEFAULT_VOTING_APPEARANCE, votingAppearanceForTheme } from "../client/src/lib/votingThemes";
import { validateVotingBackground } from "../server/lib/voting-background";

const tenant = "11111111-1111-1111-1111-111111111111";
const path = `/objects/${tenant}/voting-backgrounds/22222222-2222-2222-2222-222222222222`;
test("background persistence fields, reset, and preset preservation", () => {
  const input = { backgroundImageUrl: path, backgroundImageTarget: "frames" as const };
  assert.deepEqual(contestAppearanceSchema.parse(input), input);
  assert.equal(contestAppearanceSchema.parse({ backgroundImageUrl: null }).backgroundImageUrl, null);
  assert.equal(DEFAULT_VOTING_APPEARANCE.backgroundImageUrl, null);
  assert.equal(votingAppearanceForTheme({ ...DEFAULT_VOTING_APPEARANCE, ...input }, "paws").backgroundImageUrl, path);
  assert.equal(contestAppearanceSchema.safeParse({ backgroundImageTarget: "photo" }).success, false);
});
test("only tenant-scoped uploaded backgrounds; no remote, encoded, or traversal URLs", () => {
  assert.equal(votingBackgroundPath(path, tenant), path);
  for (const bad of ["https://example.com/bg.jpg", "http://169.254.169.254/", path + "/../x", path + "?x=1", path.replace("voting-backgrounds", "animal-photos"), path.replace("2222", "%2222")]) {
    assert.equal(contestAppearanceSchema.safeParse({ backgroundImageUrl: bad }).success, false);
    assert.equal(votingBackgroundPath(bad, tenant), null);
  }
  assert.equal(votingBackgroundPath(path, "33333333-3333-3333-3333-333333333333"), null);
});
test("target selection covers only requested surfaces", () => {
  for (const target of ["page", "frames", "both"]) {
    for (const surface of ["page", "frames"] as const) assert.equal(votingBackgroundApplies(target, surface), target === surface || target === "both");
  }
});
test("server validates actual bytes, size, and static raster formats", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const input = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#ff0000" } }).toFormat(format).toBuffer();
    assert.equal((await sharp(await validateVotingBackground(input)).metadata()).format, "jpeg");
  }
  await assert.rejects(validateVotingBackground(Buffer.alloc(5 * 1024 * 1024 + 1)));
  await assert.rejects(validateVotingBackground(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')));
  await assert.rejects(validateVotingBackground(Buffer.from("not an image")));
});
test("writes are role protected and validate ownership; reset persists null", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.match(routes, /app\.post\('\/api\/voting-contests\/background\/upload', requireTenant, requireAuth, requireRole\('admin', 'owner', 'manager'\)/);
  assert.match(routes, /backgroundImageUrl: data\.backgroundImageUrl \?\? null/);
  assert.match(routes, /if \(data\.backgroundImageUrl !== undefined\) updateData\.backgroundImageUrl = data\.backgroundImageUrl/);
  assert.equal((routes.match(/readVotingBackground\(data.backgroundImageUrl, req.tenant!.id\)/g) || []).length, 2);
});
test("social renderer targets and version change", async () => {
  const data = { name: "Pet", ownerDisplayName: null, contestTitle: "Contest", rescueName: "Rescue", photoUrl: null, themeBackground: null, primaryColor: null, accentColor: null, backgroundImageUrl: path };
  const background = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const outputs: Buffer[] = [];
  for (const target of ["page", "frames", "both"]) outputs.push(await renderVotingSocialImage({ ...data, backgroundImageTarget: target }, undefined, background));
  assert.notDeepEqual(outputs[0], outputs[1]);
  assert.notDeepEqual(outputs[1], outputs[2]);
  assert.notEqual(votingSocialVersion(data), votingSocialVersion({ ...data, backgroundImageTarget: "page" }));
});