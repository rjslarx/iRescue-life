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

// Recoverable disconnects from Neon. The pool transparently re-creates
// clients on the next checkout, so we must NOT crash the process for any
// of these — they're routine for a serverless-style Postgres.
const RECOVERABLE_DB_ERROR_PATTERNS = [
  'terminating connection due to administrator command',
  'Connection terminated unexpectedly',
  'Connection terminated',
  'Client has encountered a connection error and is not queryable',
  'connection is closed',
  'read ECONNRESET',
  'socket hang up',
];

function isRecoverableDbError(message: string | undefined | null): boolean {
  if (!message) return false;
  return RECOVERABLE_DB_ERROR_PATTERNS.some((p) => message.includes(p));
}

pool.on('error', (err) => {
  if (isRecoverableDbError(err.message)) {
    console.warn('[DB] Recoverable pool disconnect - pool will reconnect automatically:', err.message);
  } else {
    console.error('[DB] Unexpected pool error:', err.message);
  }
});

process.on('uncaughtException', (err) => {
  if (isRecoverableDbError(err?.message)) {
    console.warn('[DB] Caught uncaught exception from recoverable DB disconnect - recovering gracefully:', err.message);
    return;
  }
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (isRecoverableDbError(message)) {
    console.warn('[DB] Caught unhandled rejection from recoverable DB disconnect - recovering gracefully:', message);
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
