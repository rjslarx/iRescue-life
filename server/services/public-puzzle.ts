import { and, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { animals, tenants, platformSettings } from '@shared/schema';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { publicAnimalFilter } from './animals';
import { ObjectStorageService } from '../objectStorage';
import { getObjectAclPolicy } from '../objectAcl';
import { getAppBaseUrl } from '../lib/app-base-url';
import { rescueShuffleDocument, type ShufflePet } from '../lib/rescue-shuffle-document';
import { createPublicPuzzleRouter } from '../lib/public-puzzle-router';
import { publicPuzzleKey, publicPuzzleSettingsSchema, publicPuzzleTenant, puzzleObjectPath } from '../lib/public-puzzle-policy';

async function read(tenantId: string) {
  const [row] = await db.select({ value: platformSettings.value }).from(platformSettings)
    .where(eq(platformSettings.key, publicPuzzleKey(tenantId))).limit(1);
  const parsed = publicPuzzleSettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { enabled: false, facebookPostUrl: '' };
}

async function launch(tenantId: string) {
  const [tenant] = await db.select({ subdomain: tenants.subdomain, customDomain: tenants.customDomain })
    .from(tenants).where(eq(tenants.id, tenantId));
  if (!publicPuzzleTenant(tenant?.subdomain)) throw new Error('Public puzzle not available.');
  const hosts = [new URL(getAppBaseUrl()).hostname, ...(tenant.customDomain ? [tenant.customDomain] : [])];
  const rows = await db.select({ id: animals.id, name: animals.name, breed: animals.breed, photoUrls: animals.photoUrls })
    .from(animals).where(and(publicAnimalFilter(tenantId), eq(animals.status, 'available'),
      sql`cardinality(${animals.photoUrls}) > 0`)).orderBy(sql`random()`).limit(8);
  const storage = new ObjectStorageService();
  let pet: ShufflePet | null = null;
  for (const row of rows) {
    const objectPath = (row.photoUrls || []).map(url => puzzleObjectPath(url, hosts)).find(Boolean);
    if (!objectPath) continue;
    try {
      const file = await storage.getObjectEntityFile(objectPath);
      const [metadata] = await file.getMetadata();
      const acl = await getObjectAclPolicy(file);
      // Legacy public animal photos have no ACL. Explicitly private or foreign
      // tenant ACLs are never bypassed, even if referenced by a public animal.
      if (acl && (acl.visibility !== 'public' || (acl.tenantId && acl.tenantId !== tenantId))) continue;
      if (Number(metadata.size) > 8 * 1024 * 1024 || Number(metadata.size) <= 0) continue;
      // Bounded read; re-encode raster pixels to remove EXIF, scripts and metadata.
      const [bytes] = await file.download({ start: 0, end: 8 * 1024 * 1024 - 1 });
      const image = sharp(bytes, { limitInputPixels: 25_000_000, animated: false });
      const info = await image.metadata();
      if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(info.format || '')) continue;
      const jpeg = await image.rotate().resize(900, 900, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      // Recheck visibility after storage I/O, before returning the public photo.
      const [stillPublic] = await db.select({ id: animals.id }).from(animals).where(and(
        eq(animals.id, row.id), publicAnimalFilter(tenantId), eq(animals.status, 'available')));
      if (!stillPublic) continue;
      pet = { id: row.id, name: row.name, breed: row.breed || '', imageUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
      break;
    } catch {
      // Never fall back to fetching arbitrary external URLs or private images.
      console.warn('[Public puzzle] Available animal photo could not be prepared.');
    }
  }
  return { pet, html: await rescueShuffleDocument(pet ? [pet] : [], { publicChallenge: true }) };
}

export const publicPuzzleRouter = createPublicPuzzleRouter({
  requireAuth, read, launch,
  save: async (tenantId, value, userId) => {
    await db.insert(platformSettings).values({
      key: publicPuzzleKey(tenantId), value, isPublic: false, category: 'features',
      description: 'Haseya’s public puzzle challenge', updatedBy: userId,
    }).onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: userId, updatedAt: new Date(), isPublic: false } });
  },
});
