import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // Increased for Neon cold start
  statement_timeout: 60000, // 60 second statement timeout
  allowExitOnIdle: false,
});

pool.on('error', (err) => {
  if (err.message?.includes('terminating connection due to administrator command')) {
    console.warn('[DB] Connection terminated by server (Neon maintenance) - pool will reconnect automatically');
  } else {
    console.error('[DB] Unexpected pool error:', err.message);
  }
});

process.on('uncaughtException', (err) => {
  if (err.message?.includes('terminating connection due to administrator command')) {
    console.warn('[DB] Caught uncaught exception from Neon maintenance disconnect - recovering gracefully');
    return;
  }
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes('terminating connection due to administrator command')) {
    console.warn('[DB] Caught unhandled rejection from Neon maintenance disconnect - recovering gracefully');
    return;
  }
  console.error('[FATAL] Unhandled rejection:', reason);
  process.exit(1);
});

// Pre-warm the connection pool on startup to avoid cold-start delays
(async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Database connection pool pre-warmed');
  } catch (err) {
    console.error('Failed to pre-warm database connection:', err);
  }
})();

export const db = drizzle(pool, { schema });
