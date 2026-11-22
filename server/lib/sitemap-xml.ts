const escapeXml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));

/** Omit lastmod unless the caller has a genuine content modification date. */
export function createSitemapWriter() {
  const seen = new Set<string>();
  return (loc: string, changefreq?: string, priority?: string): string => {
    const url = new URL(loc);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
      throw new Error('Invalid sitemap URL');
    }
    const key = url.href.replace(/\/$/, '');
    if (seen.has(key)) return '';
    seen.add(key);
    return `  <url>\n    <loc>${escapeXml(url.href)}</loc>\n${changefreq ? `    <changefreq>${escapeXml(changefreq)}</changefreq>\n` : ''}${priority ? `    <priority>${escapeXml(priority)}</priority>\n` : ''}  </url>\n`;
  };
}
