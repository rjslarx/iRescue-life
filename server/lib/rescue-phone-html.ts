// Safari may choose the install manifest before React effects run.
// Only the phone entry page gets a separate install identity.
export function rescuePhoneHtml(html: string, requestPath: string): string {
  const pathname = new URL(requestPath, "https://local.invalid").pathname;
  const match = pathname.match(/^\/(?:([a-z0-9-]+)\/)?phone\/?$/i);
  if (!match) return html;
  const manifest = `/phone.webmanifest${match[1] ? `?tenant=${encodeURIComponent(match[1])}` : ""}`;
  return html
    .replace(/<link\b[^>]*rel=["']manifest["'][^>]*>/i, `<link rel="manifest" href="${manifest}" />`)
    .replace(/<meta\b[^>]*name=["']apple-mobile-web-app-title["'][^>]*>/i, '<meta name="apple-mobile-web-app-title" content="Rescue Phone" />');
}
