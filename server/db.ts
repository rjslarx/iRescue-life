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
  // Connection pool settings for Neon serverless
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors gracefully to prevent crashes from Neon connection terminations
pool.on('error', (err) => {
  // 57P01 = admin_shutdown (Neon terminates idle connections)
  // 57P02 = crash_shutdown
  // 57P03 = cannot_connect_now
  const isExpectedTermination = err.code === '57P01' || err.code === '57P02' || err.code === '57P03';
  
  if (isExpectedTermination) {
    console.log('[DB] Connection terminated by server (expected for serverless), will reconnect on next query');
  } else {
    console.error('[DB] Unexpected pool error:', err.message, err.code);
  }
  // Pool will automatically create new connections as needed
});

export const db = drizzle(pool, { schema });
