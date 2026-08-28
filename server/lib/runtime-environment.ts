type RuntimeEnvironment = {
  NODE_ENV?: string;
  REPLIT_DEPLOYMENT?: string;
};

export function isProductionRuntime(
  env: RuntimeEnvironment = process.env,
): boolean {
  return env.NODE_ENV === 'production' || env.REPLIT_DEPLOYMENT === '1';
}