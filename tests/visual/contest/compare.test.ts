import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { comparePng } from "./compare";

const image = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

test("identical decoded pixels pass, regardless of PNG encoding", async () => {
  const original = await image(20, 10, "white");
  const reencoded = await sharp(original).png({ compressionLevel: 0 }).toBuffer();
  assert.equal((await comparePng(original, reencoded)).matches, true);
});

test("a single changed pixel fails and produces a visible diff", async () => {
  const original = await image(20, 10, "white");
  const changed = await sharp(original).composite([{ input: await image(1, 1, "black"), top: 0, left: 0 }]).png().toBuffer();
  const result = await comparePng(changed, original);
  assert.equal(result.matches, false);
  assert(result.diff);
  const pixels = await sharp(result.diff).raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0, 4)], [255, 0, 128, 255]);
});

test("changed dimensions fail even if pixel buffer lengths match", async () => {
  assert.equal((await comparePng(await image(10, 20, "white"), await image(20, 10, "white"))).matches, false);
});