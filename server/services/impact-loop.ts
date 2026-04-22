import crypto from 'crypto';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { animals, donors, type Tenant, type Donor } from '@shared/schema';

export interface ImpactLoopAnimal {
  name: string;
  photoUrl: string;
}

function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

export function signImpactOptOutToken(donorId: string): string | null {
  const secret = getSecret();
  if (!secret) {
    console.warn('[ImpactLoop] SESSION_SECRET missing — opt-out token generation disabled');
    return null;
  }
  const payload = Buffer.from(donorId, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`impact-loop:${donorId}`)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyImpactOptOutToken(token: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  let donorId: string;
  try {
    donorId = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`impact-loop:${donorId}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? donorId : null;
}

/**
 * Returns the tenant's most recently adopted animal that has at least one
 * photo on file. Returns null when no suitable animal exists.
 */
export async function getMostRecentlyAdoptedAnimal(
  tenantId: string,
): Promise<ImpactLoopAnimal | null> {
  try {
    const rows = await db
      .select({
        name: animals.name,
        photoUrls: animals.photoUrls,
        adoptionDate: animals.adoptionDate,
      })
      .from(animals)
      .where(
        and(
          eq(animals.tenantId, tenantId),
          eq(animals.status, 'adopted'),
          isNotNull(animals.adoptionDate),
          sql`array_length(${animals.photoUrls}, 1) >= 1`,
        ),
      )
      .orderBy(desc(animals.adoptionDate))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    const photoUrl = (row.photoUrls || []).find((u) => !!u);
    if (!row.name || !photoUrl) return null;
    return { name: row.name, photoUrl };
  } catch (err) {
    console.warn('[ImpactLoop] Failed to look up recent adoption:', err);
    return null;
  }
}

interface ImpactLoopParams {
  tenant: Pick<Tenant, 'id' | 'name' | 'impactLoopEnabled'>;
  donor: Pick<Donor, 'id' | 'impactLoopOptOut'> | null;
  baseUrl: string;
}

/**
 * Builds the HTML snippet to append to a monthly recurring receipt when the
 * Impact Loop is enabled tenant-wide and the donor hasn't opted out. Returns
 * null when conditions aren't met or no animal is available — callers should
 * degrade gracefully and send the normal receipt.
 */
export async function buildImpactLoopSection(
  params: ImpactLoopParams,
): Promise<string | null> {
  const { tenant, donor, baseUrl } = params;
  if (!tenant?.impactLoopEnabled) return null;
  if (donor?.impactLoopOptOut) return null;

  const animal = await getMostRecentlyAdoptedAnimal(tenant.id);
  if (!animal) return null;

  const safeName = escapeHtml(animal.name);
  const safeTenant = escapeHtml(tenant.name);
  // Email clients cannot resolve relative URLs — prepend baseUrl when needed.
  const absolutePhotoUrl = /^https?:\/\//i.test(animal.photoUrl)
    ? animal.photoUrl
    : `${baseUrl.replace(/\/$/, '')}${animal.photoUrl.startsWith('/') ? '' : '/'}${animal.photoUrl}`;
  const safePhoto = escapeHtml(absolutePhotoUrl);

  let optOutLink = '';
  if (donor?.id) {
    const token = signImpactOptOutToken(donor.id);
    if (token) {
      const url = `${baseUrl.replace(/\/$/, '')}/api/impact-loop/opt-out?token=${encodeURIComponent(token)}`;
      optOutLink = `
  <p style="margin: 8px 0 0 0; font-size: 11px; color: #6b7280; text-align: center;">
    Prefer just the receipt next time? <a href="${escapeHtml(url)}" style="color: #6b7280;">Turn off these updates</a>.
  </p>`;
    }
  }

  return `
<div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin: 20px 0;">
  <h3 style="margin: 0 0 10px 0; color: #111827; font-size: 16px;">Here's who you helped save</h3>
  <p style="margin: 0 0 12px 0; color: #374151;">Thanks to supporters like you, <strong>${safeName}</strong> just found a forever home.</p>
  <div style="text-align: center; margin: 12px 0;">
    <img src="${safePhoto}" alt="${safeName}" style="max-width: 100%; height: auto; max-height: 320px; border-radius: 6px;" />
  </div>
  <p style="margin: 12px 0 0 0; color: #374151;">Your monthly gift makes adoptions like ${safeName}'s possible. Thank you for being part of the ${safeTenant} family.</p>${optOutLink}
</div>
`.trim();
}
