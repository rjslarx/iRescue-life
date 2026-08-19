/**
 * Canonical base-URL resolution for links we put in emails, SMS, and webhooks.
 *
 * IMPORTANT: The published (deployed) app can still have REPLIT_DEV_DOMAIN set
 * in its environment, so "REPLIT_DEV_DOMAIN exists" does NOT mean "we're in
 * development". Trusting it unconditionally caused production compliance
 * emails to link adopters to the .replit.dev development workspace.
 *
 * Rule: only use the dev domain when we are NOT a deployment.
 */
export function getAppBaseUrl(): string {
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  if (!isProduction && process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return process.env.APP_BASE_URL || 'https://irescue.life';
}
