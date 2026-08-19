/**
 * Canonical base-URL resolution for links we put in emails, SMS, and webhooks.
 *
 * IMPORTANT: The published (deployed) app can still have REPLIT_DEV_DOMAIN set
 * in its environment, so "REPLIT_DEV_DOMAIN exists" does NOT mean "we're in
 * development". Trusting it unconditionally caused production compliance
 * emails to link adopters to the .replit.dev development workspace.
 *
 * Rule: an explicit public base URL always wins. Otherwise only use the dev
 * domain while NODE_ENV is not production. REPLIT_DEPLOYMENT is retained as
 * an additional production signal, but it is not consistently present in
 * every published runtime.
 */
export function getAppBaseUrl(): string {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const isProduction = process.env.NODE_ENV === 'production'
    || process.env.REPLIT_DEPLOYMENT === '1';
  if (!isProduction && process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return 'https://irescue.life';
}
