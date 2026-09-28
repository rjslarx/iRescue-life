import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contestAppearanceSchema, VOTING_CONTEST_THEMES, votingContestEntrantDescriptionRequestSchema, votingContestEntrantRequestSchema, votingContestImageSchema } from "../shared/voting-contest-validation";
import { DEFAULT_VOTING_APPEARANCE, VOTING_THEME_OPTIONS, VOTING_THEME_PRESET_COLORS, votingAppearanceForTheme, votingBackgroundStyle } from "../client/src/lib/votingThemes";

test("contest appearance accepts theme presets and nullable defaults", () => {
  assert.deepEqual(VOTING_CONTEST_THEMES, ["birthday", "confetti", "hearts", "paws", "stars", "halloween", "christmas", "easter", "lsu_tigers", "christmas_sweater", "santa_paws", "valentines", "mardi_gras", "patriotic", "summer", "back_to_school"]);
  assert.deepEqual(contestAppearanceSchema.parse({}), {});
  for (const themeBackground of VOTING_CONTEST_THEMES) {
    assert.deepEqual(contestAppearanceSchema.parse({ themeBackground }), { themeBackground });
  }
  assert.deepEqual(contestAppearanceSchema.parse({ themeBackground: null, primaryColor: "", accentColor: null }),
    { themeBackground: null, primaryColor: null, accentColor: null });
  assert.deepEqual(contestAppearanceSchema.parse({ primaryColor: "#aB12cD", accentColor: "#000000" }),
    { primaryColor: "#aB12cD", accentColor: "#000000" });
});

test("contest appearance rejects invalid colors and unknown themes", () => {
  for (const field of ["primaryColor", "accentColor"]) {
    for (const color of ["red", "#fff", "#12345678", " #123456", "#GG0000", 123]) {
      assert.equal(contestAppearanceSchema.safeParse({ [field]: color }).success, false, `${field}: ${color}`);
    }
  }
  for (const themeBackground of ["", "Halloween", "lsu-tigers", 10]) {
    assert.equal(contestAppearanceSchema.safeParse({ themeBackground }).success, false, String(themeBackground));
  }
});

test("special voting themes have matching presets and distinct patterned backgrounds", () => {
  const motifs: Record<string, string[]> = {
    halloween: ['#b66123', '#55345e'],
    christmas: ['#166534', '#c62828', '#5185ae'],
    easter: ['#d9c6f3', '#ffe1d5', '#e8a0bc'],
    lsu_tigers: ['#461D7C', '#FDD023', 'ellipse'],
  };
  for (const [theme, markers] of Object.entries(motifs)) {
    assert.ok(VOTING_THEME_OPTIONS.some((option) => option.value === theme));
    const preset = VOTING_THEME_PRESET_COLORS[theme];
    assert.ok(preset);
    assert.deepEqual(votingAppearanceForTheme(DEFAULT_VOTING_APPEARANCE, theme), { ...DEFAULT_VOTING_APPEARANCE, ...preset, themeBackground: theme });
    const url = votingBackgroundStyle(theme, preset.primaryColor)?.backgroundImage;
    assert.ok(typeof url === "string" && url.startsWith('url("data:image/svg+xml,'));
    const svg = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
    for (const marker of markers) assert.ok(svg.includes(marker), `${theme}: missing ${marker}`);
  }
  const customized = { ...votingAppearanceForTheme(DEFAULT_VOTING_APPEARANCE, "lsu_tigers"), primaryColor: "#112233" };
  assert.equal(customized.primaryColor, "#112233");
  assert.deepEqual(votingAppearanceForTheme(customized, "none"), { ...customized, themeBackground: null });
  assert.ok(votingBackgroundStyle("paws", "#123456")?.backgroundImage);
  assert.equal(votingBackgroundStyle("unknown", null), undefined);
});

test("contest create and edit validate and persist appearance without changing omitted fields", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const create = routes.split("app.post('/api/voting-contests'")[1]?.split("app.get('/api/voting-contests'")[0];
  const edit = routes.split("app.patch('/api/voting-contests/:id'")[1]?.split("app.delete('/api/voting-contests/:id'")[0];
  assert.ok(create);
  assert.ok(edit);
  for (const field of ["primaryColor", "accentColor", "themeBackground"]) {
    assert.match(create, new RegExp(`${field}: data\\.${field} \\?\\? null`));
    assert.match(edit, new RegExp(`if \\(data\\.${field} !== undefined\\) updateData\\.${field} = data\\.${field}`));
  }
  assert.match(create, /\.merge\(contestAppearanceSchema\)/);
  assert.match(edit, /\.merge\(contestAppearanceSchema\)/);
});

test("entrant accepts the uploaded object path sent by the fundraiser hub", () => {
  const data = { name: "Munchkin", photoUrl: "/objects/tenant-id/uploads/photo.jpeg" };
  assert.deepEqual(votingContestEntrantRequestSchema.parse(data), data);
});

test("entrant supports optional photos and HTTP/HTTPS images", () => {
  for (const photoUrl of [undefined, "", "https://example.org/photo.jpg", "http://example.org/photo.jpg"]) {
    assert.equal(votingContestEntrantRequestSchema.safeParse({ name: "Munchkin", photoUrl }).success, true);
  }
});

test("entrant rejects blank names and invalid or unsafe image references", () => {
  assert.equal(votingContestEntrantRequestSchema.safeParse({ name: "   " }).success, false);
  for (const value of ["not a url", "//example.org/photo.jpg", "javascript:alert(1)", "data:image/png;base64,abc", "/objects/../secret", "/objects/", "/objects/\\evil"]) {
    assert.equal(votingContestImageSchema.safeParse(value).success, false, value);
  }
});

test("entrant creation accepts an optional description, trims it, and clears whitespace", () => {
  assert.deepEqual(votingContestEntrantRequestSchema.parse({ name: "Munchkin" }), { name: "Munchkin" });
  assert.deepEqual(votingContestEntrantRequestSchema.parse({ name: "Munchkin", description: "  Friendly cat  " }),
    { name: "Munchkin", description: "Friendly cat" });
  assert.equal(votingContestEntrantRequestSchema.parse({ name: "Munchkin", description: " \n " }).description, null);
  assert.equal(votingContestEntrantRequestSchema.parse({ name: "Munchkin", description: null }).description, null);
  assert.equal(votingContestEntrantRequestSchema.safeParse({ name: "Munchkin", description: "a".repeat(501) }).success, false);
  assert.equal(votingContestEntrantRequestSchema.safeParse({ name: "Munchkin", description: `  ${"a".repeat(500)}  ` }).success, true);
});

test("description-only update requires a description and enforces the 500-character limit", () => {
  assert.deepEqual(votingContestEntrantDescriptionRequestSchema.parse({ description: "  Likes treats " }),
    { description: "Likes treats" });
  for (const description of ["", " \n ", null]) {
    assert.deepEqual(votingContestEntrantDescriptionRequestSchema.parse({ description }), { description: null });
  }
  assert.equal(votingContestEntrantDescriptionRequestSchema.safeParse({ description: "x".repeat(500) }).success, true);
  assert.equal(votingContestEntrantDescriptionRequestSchema.safeParse({ description: "x".repeat(501) }).success, false);
  assert.equal(votingContestEntrantDescriptionRequestSchema.safeParse({}).success, false);
  assert.deepEqual(votingContestEntrantDescriptionRequestSchema.parse({ name: "  New pet  ", ownerDisplayName: "  Jane  ", description: "ok" }),
    { name: "New pet", ownerDisplayName: "Jane", description: "ok" });
  assert.equal(votingContestEntrantDescriptionRequestSchema.safeParse({ description: "ok", extra: "changed" }).success, false);
});

test("public owner display name is optional, trimmed, bounded and removable", () => {
  assert.deepEqual(votingContestEntrantRequestSchema.parse({ name: "Pet", ownerDisplayName: "  Taylor  " }),
    { name: "Pet", ownerDisplayName: "Taylor" });
  assert.deepEqual(votingContestEntrantDescriptionRequestSchema.parse({ ownerDisplayName: "  " }), { ownerDisplayName: null });
  assert.equal(votingContestEntrantRequestSchema.safeParse({ name: "Pet", ownerDisplayName: "a".repeat(101) }).success, false);
  assert.equal(votingContestEntrantDescriptionRequestSchema.safeParse({ ownerDisplayName: 4 }).success, false);
});

test("entrant update is role-protected and tenant scoped; list endpoints select the whole entrant", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const update = routes.split("app.patch('/api/voting-contest-entrants/:id'")[1]
    ?.split("app.delete('/api/voting-contest-entrants/:id'")[0];
  assert.ok(update, "description update endpoint exists");
  assert.match(update, /requireTenant, requireAuth, requireRole\('admin', 'owner', 'manager'\)/);
  assert.match(update, /votingContestEntrantDescriptionRequestSchema\.parse\(req\.body\)/);
  assert.match(update, /\.set\(changes\)/);
  assert.match(update, /changes\.ownerDisplayName = ownerDisplayName/);
  assert.match(update, /eq\(votingContestEntrants\.id, req\.params\.id\), eq\(votingContestEntrants\.tenantId, req\.tenant!\.id\)/);
  assert.match(update, /if \(!updated\) return res\.status\(404\)/);
  const create = routes.split("app.post('/api/voting-contests/:id/entrants'")[1]
    ?.split("app.patch('/api/voting-contest-entrants/:id'")[0];
  assert.ok(create);
  assert.match(create, /description: data\.description \?\? null/);
  for (const endpoint of ["app.get('/api/voting-contests/:id'", "app.get('/api/public/voting-contest/:slug'"]) {
    const block = routes.split(endpoint)[1]?.split("res.json(")[0];
    assert.ok(block);
    assert.match(block, /\.select\(\)\s*\.from\(votingContestEntrants\)/);
  }
});