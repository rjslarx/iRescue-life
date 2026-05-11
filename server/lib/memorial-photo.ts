import crypto from "crypto";
import { TenantFileStorage } from "./tenantFileStorage";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
export const MEMORIAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function isValidMemorialMime(mime: string | undefined | null): boolean {
  if (!mime) return false;
  return ALLOWED_MIMES.has(mime.toLowerCase());
}

/**
 * Resize + EXIF-strip an uploaded memorial photo and store it in the
 * tenant's public object-storage bucket. Returns the stored public URL.
 */
export async function processAndStoreMemorialPhoto(
  tenantId: string,
  inputBuffer: Buffer,
  inputMime: string,
): Promise<string> {
  const sharp = (await import("sharp")).default;

  let working = inputBuffer;
  let workingMime = inputMime;
  if (inputMime === "image/heic" || inputMime === "image/heif") {
    try {
      const heicConvert = (await import("heic-convert")).default;
      const converted = await heicConvert({ buffer: inputBuffer, format: "JPEG", quality: 0.9 });
      working = Buffer.from(converted);
      workingMime = "image/jpeg";
    } catch (err) {
      throw new Error("Could not process HEIC image — please upload a JPG or PNG instead");
    }
  }

  // .rotate() honors then strips EXIF orientation. Re-encoding to JPEG with
  // sharp (without `withMetadata`) drops all other EXIF/GPS metadata.
  const processed = await sharp(working)
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const storage = await TenantFileStorage.forTenant(tenantId);
  const fileName = `memorial_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.jpg`;
  const result = await storage.uploadFile({
    tenantId,
    userId: "vip-portal",
    category: "general-docs",
    visibility: "public",
    fileName,
    mimeType: "image/jpeg",
    content: processed,
  });
  if (!result.success || !result.fileUrl) {
    throw new Error(result.error || "Failed to store memorial photo");
  }
  return result.fileUrl;
}
