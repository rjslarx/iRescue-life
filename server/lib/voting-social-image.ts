import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { votingPatternSvg, votingFrameTileSvg, votingFrameColors, validVotingColor, contrastText, VOTING_THEME_PRESET_COLORS, VOTING_THEME_SURFACES } from '@shared/voting-theme-patterns';

export type VotingSocialData = {
  name: string;
  ownerDisplayName: string | null;
  contestTitle: string;
  rescueName: string;
  photoUrl: string | null;
  themeBackground: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

export function votingSocialVersion(data: VotingSocialData): string {
  return createHash('sha256').update('portrait-nameplate-v3').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

// Only a tenant's own uploaded object can be read for a public card. In particular,
// never resolve external URLs, legacy unscoped objects, encoded paths or documents.
export function votingSocialPhotoPath(url: string | null, tenantId: string): string | null {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !url) return null;
  const prefix = `/objects/${tenantId}/animal-photos/`;
  if (!url.startsWith(prefix) || !/^\/objects\/[a-zA-Z0-9/_\-.]+$/.test(url) ||
      url.split('/').some(part => part === '.' || part === '..')) return null;
  return url;
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function lines(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let line = '';
  for (const [index, word] of words.entries()) {
    if (line && `${line} ${word}`.length > maxChars) {
      if (result.length === maxLines - 1) {
        line += ` ${words.slice(index).join(' ')}`;
        break;
      }
      result.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) result.push(line);
  return result.slice(0, maxLines).map(s => xml(s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s));
}

export async function renderVotingSocialImage(data: VotingSocialData, photo?: Buffer): Promise<Buffer> {
  const preset = data.themeBackground ? VOTING_THEME_PRESET_COLORS[data.themeBackground] : undefined;
  const primary = validVotingColor(data.primaryColor) || preset?.primaryColor || '#544079';
  const accent = validVotingColor(data.accentColor) || preset?.accentColor || '#edb957';
  const background = VOTING_THEME_SURFACES[data.themeBackground || ''] || '#f7f5fb';
  const pattern = votingPatternSvg(data.themeBackground, primary);
  const frame = votingFrameColors(data.themeBackground, primary, accent);
  const frameSvg = frame && votingFrameTileSvg(data.themeBackground, frame.primary, frame.accent);
  // Pattern is a trusted, internally generated SVG (never interpolated from user input).
  const tile = pattern ? `<pattern id="theme" patternUnits="userSpaceOnUse" width="${Number(pattern.match(/width="(\d+)"/)?.[1]) || 110}" height="${Number(pattern.match(/height="(\d+)"/)?.[1]) || 110}">${pattern.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</pattern>` : '';
  const frameTile = frameSvg ? `<pattern id="portrait-frame" patternUnits="userSpaceOnUse" width="72" height="72">${frameSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</pattern>` : '';
  const name = lines(data.name, 20, 2);
  const caption = lines(data.name, 27, 2);
  const owner = data.ownerDisplayName ? lines(`with ${data.ownerDisplayName}`, 34, 1) : [];
  const title = lines(data.contestTitle, 28, 2);
  const rescue = lines(data.rescueName, 37, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>${tile}${frameTile}</defs>
    <rect width="1200" height="630" fill="${background}"/>
    ${tile ? '<rect width="1200" height="630" fill="url(#theme)" opacity=".25"/>' : ''}
    <rect width="1200" height="14" fill="${primary}"/>
    <rect x="46" y="53" width="568" height="517" rx="25" fill="${frameTile ? 'url(#portrait-frame)' : '#fff'}" stroke="${frameTile ? primary : '#fff'}" stroke-width="5"/>
    <rect x="68" y="75" width="524" height="375" rx="6" fill="${background}"/>
    <rect x="92" y="460" width="476" height="80" rx="14" fill="${frame?.primary || '#ffffff'}" stroke="${frame?.accent || '#dfd9e8'}" stroke-width="3"/>
    ${caption.map((s, i) => `<text x="330" y="${owner.length ? 486 + i * 23 : 493 + i * 24}" text-anchor="middle" font-family="Arial,sans-serif" font-size="21" font-weight="bold" fill="${frame ? contrastText(frame.primary) : '#24202b'}">${s}</text>`).join('')}
    ${owner.map(s => `<text x="330" y="531" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" fill="${frame ? contrastText(frame.primary) : '#24202b'}">${s}</text>`).join('')}
    <rect x="649" y="77" width="504" height="455" rx="24" fill="#fff" fill-opacity=".93"/>
    <rect x="679" y="110" width="108" height="7" rx="3" fill="${accent}"/>
    <text x="679" y="163" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="${primary}">VOTE FOR</text>
    ${name.map((s, i) => `<text x="679" y="${232 + i * 60}" font-family="Arial,sans-serif" font-size="50" font-weight="bold" fill="#24202b">${s}</text>`).join('')}
    ${title.map((s, i) => `<text x="679" y="${365 + i * 37}" font-family="Arial,sans-serif" font-size="29" fill="#3a3444">${s}</text>`).join('')}
    <rect x="679" y="442" width="435" height="64" rx="14" fill="${accent}"/>
    <text x="896" y="483" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="${contrastText(accent)}">VOTE NOW  •  $1 = 1 VOTE</text>
    <rect x="0" y="586" width="1200" height="44" fill="${primary}"/>
    <text x="600" y="615" text-anchor="middle" font-family="Arial,sans-serif" font-size="21" font-weight="bold" fill="${contrastText(primary)}">${rescue[0] || ''}</text>
  </svg>`;
  let image: Buffer | undefined;
  if (photo) {
    try {
      image = await sharp(photo, { limitInputPixels: 40_000_000 }).rotate()
        .resize(524, 375, { fit: 'contain', background }).png().toBuffer();
    } catch {
      // Corrupt/unsupported uploads still produce a branded share image.
    }
  }
  const base = await sharp({ create: { width: 1200, height: 630, channels: 3, background } })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
  // The photo occupies only the inner matte. Caption and decorative border
  // live outside it, so neither can cover an animal's face.
  return (image ? sharp(base).composite([{ input: image, left: 68, top: 75 }]) : sharp(base))
    .jpeg({ quality: 85 }).toBuffer();
}