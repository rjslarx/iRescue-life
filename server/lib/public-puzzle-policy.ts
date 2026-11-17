import { z } from 'zod';

const localDateTime = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(`${value}:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}, 'Use a valid local date and time.').nullable().optional();

// Deliberately narrow exception to the private Rescue Pack game pilot.
export const publicPuzzleTenant = (subdomain?: string) => subdomain === 'haseyas';
export const publicPuzzleSettingsSchema = z.object({
  enabled: z.boolean(),
  startsAt: localDateTime,
  endsAt: localDateTime,
  facebookPostUrl: z.string().trim().max(2048).refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port
        && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname)
        && url.pathname !== '/' && !/^\/(?:l\.php|flx|sharer|dialog)(?:\/|$)/i.test(url.pathname);
    } catch { return false; }
  }, 'Use an HTTPS Facebook post link, or leave this blank.'),
}).strict().refine(value => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt,
  'Closing time must be after opening time.');
export type PublicPuzzleSettings = z.infer<typeof publicPuzzleSettingsSchema>;
export const publicPuzzleKey = (tenantId: string) => `public_puzzle:${tenantId}:config`;

export function puzzleTimezone(value?: string | null): string {
  for (const candidate of [value, process.env.DEFAULT_TENANT_TIMEZONE, 'America/Chicago']) {
    if (!candidate) continue;
    try { new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(); return candidate; } catch { /* Try safe default. */ }
  }
  return 'America/Chicago';
}

/** Reject skipped/repeated DST wall times rather than silently shifting a deadline. */
export function puzzleInstant(local: string, timezone: string): number {
  const wall = Date.parse(`${local}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const localMillis = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  };
  const matches = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3600000;
    const candidate = wall - (localMillis(sample) - sample);
    if (localMillis(candidate) === wall) matches.add(candidate);
  }
  if (matches.size !== 1) throw new Error('Choose a time outside the skipped or repeated hour when daylight saving time changes.');
  return Array.from(matches)[0];
}

export function puzzleSchedule(config: PublicPuzzleSettings, timezone: string) {
  const startsAt = config.startsAt ? puzzleInstant(config.startsAt, timezone) : null;
  const endsAt = config.endsAt ? puzzleInstant(config.endsAt, timezone) : null;
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) throw new Error('Closing time must be after opening time.');
  return { startsAt, endsAt };
}

export function puzzleAvailability(config: PublicPuzzleSettings, timezone: string, now = Date.now()) {
  let schedule: ReturnType<typeof puzzleSchedule>;
  try { schedule = puzzleSchedule(config, timezone); }
  catch { return { available: false, availability: 'closed' as const, availabilityMessage: 'The puzzle schedule needs to be updated by the rescue.', nextChangeAt: null }; }
  const { startsAt, endsAt } = schedule;
  const availability = !config.enabled ? 'paused' : startsAt !== null && now < startsAt ? 'upcoming' : endsAt !== null && now >= endsAt ? 'closed' : 'open';
  const next = availability === 'upcoming' ? startsAt : availability === 'open' ? endsAt : null;
  const label = (value: number) => new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, dateStyle: 'medium', timeStyle: 'short',
  }).format(value) + ` (${timezone})`;
  return {
    available: availability === 'open', availability,
    availabilityMessage: availability === 'paused' ? 'The public puzzle is paused. Please check back later.'
      : availability === 'upcoming' ? `The puzzle opens ${label(startsAt!)}.`
      : availability === 'closed' ? `The puzzle closed ${label(endsAt!)}.`
      : endsAt !== null ? `The puzzle closes ${label(endsAt)}.` : 'The puzzle is open.',
    nextChangeAt: next === null ? null : new Date(next).toISOString(),
  };
}

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
