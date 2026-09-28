import sharp from "sharp";
import { votingBackgroundPath } from "../../shared/voting-background";
import { ObjectStorageService } from "../objectStorage";
import { ObjectPermission } from "../objectAcl";

export async function validateVotingBackground(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Background must be under 5 MB");
  const image = sharp(buffer, { limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) {
    throw new Error("Upload a static JPEG, PNG, or WebP background");
  }
  return image.rotate().resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
}

export async function readVotingBackground(path: string, tenantId: string): Promise<Buffer> {
  if (!votingBackgroundPath(path, tenantId)) throw new Error("Background must be an upload owned by this rescue");
  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(path);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > 5 * 1024 * 1024 ||
      !await storage.canAccessObjectEntity({ objectFile: file, requestedPermission: ObjectPermission.READ })) {
    throw new Error("Background is unavailable or too large");
  }
  const [buffer] = await file.download();
  return validateVotingBackground(buffer);
}