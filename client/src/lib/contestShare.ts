/**
 * Build a public contestant link without carrying checkout return parameters into a share.
 * On the public page, keep the actual tenant route (including a path-mode prefix).
 */
export function contestantUrl(slug: string, entrantId: string, tenantSubdomain?: string, publicPage = false): string {
  const url = new URL(window.location.href);
  if (!publicPage) {
    const host = url.hostname.toLowerCase();
    const subdomainHost = tenantSubdomain && host === `${tenantSubdomain.toLowerCase()}.irescue.life`;
    const platformHost = host === "localhost" || host === "127.0.0.1" ||
      host === "irescue.life" || host.endsWith(".replit.app") || host.includes("replit.dev");
    const prefix = tenantSubdomain && platformHost && !subdomainHost ? `/${tenantSubdomain}` : "";
    url.pathname = `${prefix}/contest/${encodeURIComponent(slug)}`;
    url.search = "";
  }
  url.searchParams.delete("voted");
  url.searchParams.set("entrant", entrantId);
  url.hash = "";
  return url.href;
}