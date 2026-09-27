import sharp from "sharp";

/** Exact pixels: the environment manifest prevents accidental cross-renderer comparisons. */
export async function comparePng(actual: Buffer, expected: Buffer) {
  const a = await sharp(actual).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(expected).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return { matches: false, diff: undefined };
  }
  if (a.data.equals(b.data)) return { matches: true, diff: undefined };
  const diff = Buffer.alloc(a.data.length);
  for (let i = 0; i < diff.length; i += 4) {
    const different = !a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4));
    diff[i] = different ? 255 : a.data[i] / 4;
    diff[i + 1] = different ? 0 : a.data[i + 1] / 4;
    diff[i + 2] = different ? 128 : a.data[i + 2] / 4;
    diff[i + 3] = 255;
  }
  return { matches: false, diff: await sharp(diff, { raw: a.info }).png().toBuffer() };
}