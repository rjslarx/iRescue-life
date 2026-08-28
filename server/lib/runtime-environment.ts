type RuntimeEnvironment = {
  [key: string]: string | undefined;
  NODE_ENV?: string;
  REPLIT_DEPLOYMENT?: string;
};

/**
 * Scheduled delivery is only safe in the published Replit deployment.
 *
 * NODE_ENV alone is intentionally insufficient: a development workspace can
 * run a production build while still sharing live provider credentials and
 * stale data.
 */
export function isProductionRuntime(
  env: RuntimeEnvironment = process.env,
): boolean {
  return env.REPLIT_DEPLOYMENT === '1';
}