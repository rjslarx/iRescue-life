/**
 * Environment Variable Validation
 * 
 * Validates all required environment variables at server startup.
 * Fails fast if critical configuration is missing.
 */

interface RequiredEnvVars {
  // Database
  DATABASE_URL: string;
  
  // Security
  SESSION_SECRET: string;
  ENCRYPTION_KEY: string;
  
  // PostgreSQL Connection
  PGHOST: string;
  PGUSER: string;
  PGDATABASE: string;
  PGPASSWORD: string;
  PGPORT: string;
}

interface OptionalEnvVars {
  // Email Service
  PLATFORM_RESEND_API_KEY?: string;
  RESEND_API_KEY?: string;
  
  // Payment Processors
  STRIPE_SECRET_KEY?: string;
  VITE_STRIPE_PUBLIC_KEY?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  
  // Platform Configuration (Paw Pay / Free vs Hosted)
  IS_HOSTED_PLATFORM?: string;  // Set to 'true' for managed hosting, defaults to 'false' for self-hosted
  STRIPE_CONNECT_PLATFORM_ID?: string;  // Platform's Stripe Connect account ID
  PLATFORM_STRIPE_SECRET_KEY?: string;  // Platform's Stripe secret key for Connect payments
  SKIP_PLATFORM_FEES?: string;  // Set to 'true' ONLY for development - bypasses mandatory fee enforcement
  
  // Object Storage
  DEFAULT_OBJECT_STORAGE_BUCKET_ID?: string;
  PUBLIC_OBJECT_SEARCH_PATHS?: string;
  PRIVATE_OBJECT_DIR?: string;
  
  // Server Config
  PORT?: string;
  NODE_ENV?: string;
  
  // CORS
  ALLOWED_ORIGINS?: string;
}

/**
 * Validate required environment variables
 * Throws an error if any required variable is missing
 */
export function validateEnvironment(): void {
  const requiredVars: (keyof RequiredEnvVars)[] = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'ENCRYPTION_KEY',
    'PGHOST',
    'PGUSER',
    'PGDATABASE',
    'PGPASSWORD',
    'PGPORT',
  ];

  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Check critical optional variables (warn but don't fail)
  if (!process.env.PLATFORM_RESEND_API_KEY && !process.env.RESEND_API_KEY) {
    warnings.push('No email service configured (PLATFORM_RESEND_API_KEY or RESEND_API_KEY). Email functionality will be disabled.');
  }

  if (!process.env.ALLOWED_ORIGINS && process.env.NODE_ENV === 'production') {
    missing.push('ALLOWED_ORIGINS (required in production for CORS security)');
  }

  // Security checks
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    warnings.push('SESSION_SECRET should be at least 32 characters for security.');
  }

  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    warnings.push('ENCRYPTION_KEY should be at least 32 characters for security.');
  }

  // Platform configuration info
  const isHostedPlatform = process.env.IS_HOSTED_PLATFORM === 'true';
  const hasStripeConnect = !!process.env.STRIPE_CONNECT_PLATFORM_ID && !!process.env.PLATFORM_STRIPE_SECRET_KEY;
  const skipPlatformFees = process.env.SKIP_PLATFORM_FEES === 'true';
  
  if (!isHostedPlatform && !hasStripeConnect) {
    if (skipPlatformFees) {
      warnings.push('SKIP_PLATFORM_FEES=true detected. Platform fees will not be collected. This should ONLY be used for development/testing.');
    } else {
      warnings.push('Self-hosted mode: Stripe Connect not configured. Payment processing will be blocked until PLATFORM_STRIPE_SECRET_KEY and STRIPE_CONNECT_PLATFORM_ID are set.');
    }
  }

  // Report results
  if (missing.length > 0) {
    console.error('\n❌ CRITICAL: Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nApplication cannot start without these variables.');
    console.error('Please check your .env file or environment configuration.\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment warnings:');
    warnings.forEach(warning => console.warn(`   - ${warning}`));
    console.warn('');
  }

  console.log('✅ Environment validation passed');
}

/**
 * Get validated environment configuration
 */
export function getEnvConfig() {
  return {
    // Server
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
    
    // Security
    sessionSecret: process.env.SESSION_SECRET!,
    encryptionKey: process.env.ENCRYPTION_KEY!,
    
    // CORS
    allowedOrigins: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : [],
    
    // Database
    databaseUrl: process.env.DATABASE_URL!,
    
    // Platform Configuration (Paw Pay / Free vs Hosted)
    isHostedPlatform: process.env.IS_HOSTED_PLATFORM === 'true',
    stripeConnectPlatformId: process.env.STRIPE_CONNECT_PLATFORM_ID || '',
  };
}
