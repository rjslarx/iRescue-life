import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ShufflePet {
  id: string;
  name: string;
  breed: string;
  imageUrl: string;
}

/** Only public photo URLs, never javascript, signed app credentials or local files. */
export function shufflePhotoUrl(value: unknown, base: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  if (!input.startsWith('/') && !input.startsWith('objects/') && !/^https:\/\//i.test(input)) return null;
  try {
    const url = new URL(input.startsWith('objects/') ? `/${input}` : input, base);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function rescueShuffleDocument(pets: ShufflePet[], options: { publicChallenge?: boolean } = {}): Promise<string> {
  const root = path.resolve(process.cwd(), 'server/games/rescue-shuffle');
  const [html, css, script] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'style.css'), 'utf8'),
    readFile(path.join(root, 'app.js'), 'utf8'),
  ]);
  // This data is selected from the public whitelist by the caller. Escaping '<'
  // prevents a stored animal name from terminating the script element.
  const data = JSON.stringify(pets).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  return html
    .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">`)
    .replace('<link rel="stylesheet" href="style.css" />', `<style>${css}</style>`)
    .replace('<script type="module" src="app.js"></script>', `<script>const PUBLIC_CHALLENGE = ${options.publicChallenge === true}; const SHELTER_PETS = ${data};\n${script.replace(/<\/script/gi, '<\\/script')}</script>`);
}
