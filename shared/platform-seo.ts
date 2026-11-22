/** Marketing URL policy only; does not change tenant routing. */
export function isPlatformHost(host: string): boolean {
  const hostname = host.split(':')[0].toLowerCase();
  return ['irescue.life', 'www.irescue.life', 'platform.irescue.life', 'localhost', '127.0.0.1'].includes(hostname)
    || hostname.endsWith('.replit.dev') || hostname.endsWith('.replit.app');
}

export function platformCanonical(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (!isPlatformHost(url.hostname) || (pathname !== '/' && pathname !== '/platform' && !pathname.startsWith('/platform/'))) return value;
  return `https://irescue.life${pathname === '/platform' || pathname === '/' ? '/' : pathname}`;
}

// Reserved application paths must never become sitemap tenant prefixes.
const reserved = new Set(`platform api login signup register logout donate volunteer foster become-a-foster surrender animals animal events happy-tails shop cart checkout order dashboard settings profile applications contacts finances kennels calendar reports help docs assets static public manifest.json sw.js favicon.ico give page f phone medical-fund contract collaboration reset-password forgot-password verify-email unsubscribe volunteer-training contest vip-club wall-of-heroes surgery-day-request matchmaker five-dollar-friday foster-agreement surrender-agreement adoption-agreement squares rescue-vend rescue-resale resale puzzle robots.txt sitemap.xml`.split(' '));
export function isSitemapTenantSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !reserved.has(slug);
}
