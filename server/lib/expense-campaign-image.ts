import sharp from "sharp";

export const CAMPAIGN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Decode and re-encode uploads rather than trusting their extension or MIME type. */
export async function prepareCampaignImage(buffer: Buffer): Promise<Buffer> {
  if (!buffer.length || buffer.length > CAMPAIGN_IMAGE_MAX_BYTES) {
    throw new Error("Choose an image under 5 MB.");
  }
  const image = sharp(buffer, { limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
    throw new Error("Choose a static JPEG, PNG, or WebP image.");
  }
  return image.rotate()
    .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}
