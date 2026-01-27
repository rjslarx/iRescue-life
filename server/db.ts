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
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
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
