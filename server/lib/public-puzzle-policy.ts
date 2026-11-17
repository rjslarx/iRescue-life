import { z } from 'zod';

// Deliberately narrow exception to the private Rescue Pack game pilot.
export const publicPuzzleTenant = (subdomain?: string) => subdomain === 'haseyas';
export const publicPuzzleSettingsSchema = z.object({
  enabled: z.boolean(),
  facebookPostUrl: z.string().trim().max(2048).refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port
        && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname)
        && url.pathname !== '/' && !/^\/(?:l\.php|flx|sharer|dialog)(?:\/|$)/i.test(url.pathname);
    } catch { return false; }
  }, 'Use an HTTPS Facebook post link, or leave this blank.'),
}).strict();
export type PublicPuzzleSettings = z.infer<typeof publicPuzzleSettingsSchema>;
export const publicPuzzleKey = (tenantId: string) => `public_puzzle:${tenantId}:config`;

/** Only stored public object paths are read, never arbitrary HTTP destinations. */
export function puzzleObjectPath(value: string, allowedHosts: string[]): string | null {
  let pathname = value.startsWith('objects/') ? `/${value}` : value;
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.username || url.password || url.port || url.search || url.hash
        || !allowedHosts.includes(url.hostname)) return null;
      pathname = url.pathname;
    } catch { return null; }
  }
  // No encoded path components, dot segments, queries, or signed credentials.
  if (!/^\/objects\/[a-zA-Z0-9_/-]+(?:\.[a-zA-Z0-9]+)?$/.test(pathname)
    || pathname.includes('..') || pathname.includes('//')) return null;
  return pathname;
}
