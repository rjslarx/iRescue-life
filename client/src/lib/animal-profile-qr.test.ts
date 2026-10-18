import assert from "node:assert/strict";
import { test } from "node:test";
import { generateAnimalProfileQr, getAnimalProfileQrFilename, getAnimalProfileUrl } from "./animal-profile-qr";

test("profile URL stays on the current custom domain without a tenant prefix", () => {
  assert.equal(
    getAnimalProfileUrl("", "b62715ad-268f-4c58-a474-18de4fe49bbb", "https://adopt.harborrescue.org"),
    "https://adopt.harborrescue.org/animal/b62715ad-268f-4c58-a474-18de4fe49bbb",
  );
});

test("profile URL retains path tenants and normalizes boundary slashes", () => {
  for (const basePath of ["/harbor", "/harbor/", "harbor"]) {
    assert.equal(
      getAnimalProfileUrl(basePath, "record-uuid", "https://irescue.life/"),
      "https://irescue.life/harbor/animal/record-uuid",
    );
  }
  assert.equal(getAnimalProfileUrl("/", "record-uuid", "https://harbor.irescue.life"), "https://harbor.irescue.life/animal/record-uuid");
});

test("profile URL encodes the UUID argument as one path segment, not a highlight query", () => {
  assert.equal(
    getAnimalProfileUrl("/harbor", "uuid/with ?#&", "https://irescue.life"),
    "https://irescue.life/harbor/animal/uuid%2Fwith%20%3F%23%26",
  );
});

test("download filename is a bounded safe PNG name with the record identifier", () => {
  assert.equal(getAnimalProfileQrFilename("Chloé / Happy?", "record-uuid"), "Chloe-Happy-record-uuid-profile-qr.png");
  assert.equal(getAnimalProfileQrFilename("../", "../"), "animal-profile-profile-qr.png");
  const filename = getAnimalProfileQrFilename("a".repeat(300), "b".repeat(300));
  assert.match(filename, /^[a-zA-Z0-9_-]+\.png$/);
  assert.ok(filename.length < 180);
});

test("QR generation uses the browser origin and produces a 1024px PNG", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://adopt.harborrescue.org" } },
  });
  try {
    assert.equal(getAnimalProfileUrl("/rescue", "record-uuid"), "https://adopt.harborrescue.org/rescue/animal/record-uuid");
    const image = await generateAnimalProfileQr("/rescue", "record-uuid");
    assert.ok(image.startsWith("data:image/png;base64,"));
    const png = Buffer.from(image.split(",")[1], "base64");
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
