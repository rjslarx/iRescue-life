import { and, eq, sql } from 'drizzle-orm';
import { animals, tenants } from '@shared/schema';
import type { VipGameId } from '@shared/vip-games';
import { db } from '../db';
import { publicAnimalFilter } from './animals';
import { pastureGameDocument } from '../lib/pasture-game-document';
import { rescueShuffleDocument, shufflePhotoUrl } from '../lib/rescue-shuffle-document';
import { rescueTripleMatchDocument } from '../lib/rescue-triple-match-document';
import { rescueMergeDocument } from '../lib/rescue-merge-document';
import { getAppBaseUrl } from '../lib/app-base-url';

export async function vipGameDocument(gameId: VipGameId, tenantId?: string) {
  if (gameId === 'pasture-run') return pastureGameDocument();
  if (!tenantId) throw new Error('Select a rescue to preview its animal puzzle.');
  const [tenant] = await db.select({ customDomain: tenants.customDomain }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new Error('Rescue not found.');
  const base = tenant.customDomain ? `https://${tenant.customDomain}` : getAppBaseUrl();
  // Exact "available" status, plus the shared public privacy policy (no medical
  // holds/TNR), and only public fields. Never accept a donor-supplied tenant ID.
  const rows = await db.select({
    id: animals.id, name: animals.name, breed: animals.breed, photoUrls: animals.photoUrls,
  }).from(animals).where(and(publicAnimalFilter(tenantId), eq(animals.status, 'available'),
    sql`cardinality(${animals.photoUrls}) > 0`)).orderBy(sql`random()`).limit(100);
  const pets = rows.flatMap(row => {
    const imageUrl = (row.photoUrls || []).map(url => shufflePhotoUrl(url, base)).find(Boolean);
    return imageUrl ? [{ id: row.id, name: row.name, breed: row.breed || '', imageUrl }] : [];
  });
  if (gameId === 'rescue-merge') return rescueMergeDocument(pets);
  return gameId === 'rescue-triple-match' ? rescueTripleMatchDocument(pets) : rescueShuffleDocument(pets);
}
