import sharp from 'sharp';
import { db } from '../db';
import { subscriptions, tenants } from '@shared/schema';
import { and, eq, count } from 'drizzle-orm';

const W = 1200;
const H = 630;
const FLOOR = 10;

const DEFAULT_BG = '#0B1B3A';
const DEFAULT_ACCENT = '#E8B65A';

interface VipShareImageInput {
  tenantId: string;
}

interface RenderInput {
  rescueName: string;
  sponsorCount: number;
  brandPrimary?: string | null;
  logoBuffer?: Buffer | null;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isValidHex(c: string | null | undefined): c is string {
  return !!c && /^#[0-9a-fA-F]{6}$/.test(c);
}

/**
 * Wrap a title to up to 2 lines with auto-shrink.
 * Returns the lines and font size (px) to use.
 */
function fitTitle(text: string, maxWidth: number): { lines: string[]; fontPx: number } {
  const words = text.trim().split(/\s+/);

  // Approx character widths for a bold ~Inter/Helvetica face. These are
  // tuned ratios of em width to font size at the chosen weight.
  const charEm = 0.58;

  const tryFit = (fontPx: number): string[] | null => {
    const maxChars = Math.floor(maxWidth / (fontPx * charEm));
    if (words.every(w => w.length <= maxChars)) {
      // pack greedily into up to 2 lines
      const lines: string[] = [];
      let current = '';
      for (const w of words) {
        const candidate = current ? `${current} ${w}` : w;
        if (candidate.length <= maxChars) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = w;
          if (lines.length >= 2) return null;
        }
      }
      if (current) lines.push(current);
      return lines.length <= 2 ? lines : null;
    }
    return null;
  };

  for (const px of [104, 96, 88, 80, 72, 64, 58]) {
    const lines = tryFit(px);
    if (lines) return { lines, fontPx: px };
  }

  // Last resort: truncate to fit on 2 lines at smallest size
  const fontPx = 58;
  const maxChars = Math.floor(maxWidth / (fontPx * charEm));
  const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ').slice(0, maxChars);
  const line2Full = words.slice(Math.ceil(words.length / 2)).join(' ');
  const line2 = line2Full.length > maxChars ? line2Full.slice(0, maxChars - 1) + '…' : line2Full;
  return { lines: [line1, line2].filter(Boolean), fontPx };
}

function buildSubtitle(sponsorCount: number): string {
  if (sponsorCount < FLOOR) {
    return 'Be one of our founding monthly sponsors';
  }
  return `Join ${sponsorCount.toLocaleString()} monthly sponsors saving lives every month`;
}

/**
 * Render the VIP Club share card as a 1200x630 PNG using sharp + SVG.
 * Pure synchronous render given the prepared inputs.
 */
async function renderCard(input: RenderInput): Promise<Buffer> {
  const accent = isValidHex(input.brandPrimary || null)
    ? (input.brandPrimary as string)
    : DEFAULT_ACCENT;

  const bg = DEFAULT_BG;
  const titleRaw = `${input.rescueName.trim()} Hero Club`;
  const titleMaxWidth = W - 160; // 80px side padding
  const { lines, fontPx } = fitTitle(titleRaw, titleMaxWidth);

  const subtitle = buildSubtitle(input.sponsorCount);

  // Vertical layout: center the title block, place subtitle below
  const titleLineHeight = Math.round(fontPx * 1.1);
  const titleBlockH = lines.length * titleLineHeight;
  const subtitlePx = 32;
  const gap = 36;
  const totalContentH = titleBlockH + gap + subtitlePx;
  const startY = Math.round((H - totalContentH) / 2) + fontPx; // baseline of first line

  const titleTSpans = lines
    .map((ln, i) => {
      const y = startY + i * titleLineHeight;
      return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="${fontPx}" font-weight="800" fill="#FFFFFF" letter-spacing="-1">${escapeXml(ln)}</text>`;
    })
    .join('\n');

  const subtitleY = startY + (lines.length - 1) * titleLineHeight + gap + subtitlePx;
  const subtitleEl = `<text x="${W / 2}" y="${subtitleY}" text-anchor="middle" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="${subtitlePx}" font-weight="500" fill="rgba(255,255,255,0.92)">${escapeXml(subtitle)}</text>`;

  // Paw cluster decoration in lower right corner
  const paw = (cx: number, cy: number, s: number, rot: number, opacity: number) => `
    <g transform="translate(${cx},${cy}) rotate(${rot}) scale(${s})" opacity="${opacity}">
      <ellipse cx="0" cy="6" rx="11" ry="13" fill="${accent}"/>
      <circle cx="-12" cy="-9" r="6" fill="${accent}"/>
      <circle cx="-4" cy="-15" r="5.5" fill="${accent}"/>
      <circle cx="4" cy="-15" r="5.5" fill="${accent}"/>
      <circle cx="12" cy="-9" r="6" fill="${accent}"/>
    </g>`;

  // Bottom badge: brand mark area
  const badgeY = H - 70;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#050D1F"/>
    </linearGradient>
    <radialGradient id="accentGlow" cx="20%" cy="20%" r="60%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
  <rect width="${W}" height="${H}" fill="url(#accentGlow)"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="${W}" height="8" fill="${accent}"/>

  <!-- Decorative paw cluster (bottom-right) -->
  <g opacity="0.65">
    ${paw(W - 150, H - 180, 1.4, -10, 0.55)}
    ${paw(W - 90, H - 110, 1.0, 18, 0.4)}
    ${paw(W - 220, H - 100, 0.9, 30, 0.32)}
  </g>

  <!-- Eyebrow label -->
  <text x="${W / 2}" y="${Math.round((H - totalContentH) / 2) - 24}" text-anchor="middle"
        font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-size="22" font-weight="700" fill="${accent}" letter-spacing="6">
    MONTHLY DONOR CLUB
  </text>

  <!-- Title (1-2 lines) -->
  ${titleTSpans}

  <!-- Subtitle -->
  ${subtitleEl}

  <!-- Bottom-left brand strip placeholder (logo composited separately) -->
  <text x="${W - 56}" y="${badgeY + 4}" text-anchor="end"
        font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-size="20" font-weight="600" fill="rgba(255,255,255,0.7)">
    Powered by recurring givers
  </text>
</svg>`;

  // Base composition: render SVG to PNG buffer
  let img = sharp(Buffer.from(svg)).png();
  let baseBuf = await img.toBuffer();

  // Composite logo (if provided) into bottom-left
  if (input.logoBuffer) {
    try {
      const logoMax = 88;
      const logoResized = await sharp(input.logoBuffer)
        .resize({
          width: logoMax,
          height: logoMax,
          fit: 'inside',
          withoutEnlargement: false,
        })
        .png()
        .toBuffer();

      const logoMeta = await sharp(logoResized).metadata();
      const logoH = logoMeta.height || logoMax;

      baseBuf = await sharp(baseBuf)
        .composite([
          {
            input: logoResized,
            left: 56,
            top: badgeY - Math.round(logoH / 2) + 4,
          },
        ])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('[VIP-OG] Failed to composite logo, continuing without it:', err);
    }
  }

  return baseBuf;
}

/**
 * Resolve tenant + sponsor count + logo, then render the share image.
 * Counts only `status='active' AND interval='month'` subscriptions.
 */
export async function generateVipClubShareImage(
  options: VipShareImageInput,
): Promise<Buffer> {
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      branding: tenants.branding,
      logoUrl: tenants.logoUrl,
    })
    .from(tenants)
    .where(eq(tenants.id, options.tenantId))
    .limit(1);

  if (!tenant) {
    throw new TenantNotFoundError(options.tenantId);
  }

  const [{ value: sponsorCount }] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.tenantId, tenant.id),
        eq(subscriptions.status, 'active'),
        eq(subscriptions.interval, 'month'),
      ),
    );

  let logoBuffer: Buffer | null = null;
  if (tenant.logoUrl) {
    try {
      logoBuffer = await loadLogoBuffer(tenant.logoUrl);
    } catch (err) {
      console.warn('[VIP-OG] Failed to load tenant logo:', err);
    }
  }

  const brandPrimary =
    (tenant.branding && (tenant.branding as any).primaryColor) || null;

  return renderCard({
    rescueName: tenant.name,
    sponsorCount: Number(sponsorCount) || 0,
    brandPrimary,
    logoBuffer,
  });
}

/**
 * Loads a tenant logo. Only object-storage paths are accepted to avoid
 * server-side request forgery via tenant-controlled URLs. External http(s)
 * URLs are intentionally rejected — uploads go through object storage and
 * land as /objects/... paths.
 */
async function loadLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  if (!logoUrl.startsWith('/objects/')) {
    return null;
  }
  const { ObjectStorageService } = await import('../objectStorage');
  const objectStorage = new ObjectStorageService();
  const file = await objectStorage.getObjectEntityFile(logoUrl);
  const [contents] = await file.download();
  return contents;
}

export class TenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`);
    this.name = 'TenantNotFoundError';
  }
}

// Test-only export for the helpers (used by unit-style verification)
export const __test = { fitTitle, buildSubtitle };
