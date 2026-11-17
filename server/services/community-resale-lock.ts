import { pool } from "../db";

/** Shared with settlement. Never nest this lock using a different connection. */
export async function withCommunityOrderLock<T>(id: string, fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect(), key = `resale-split:${id}`;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
    return await fn(client);
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]); }
    finally { client.release(); }
  }
}
export function communityReleaseBlocked(order: any) {
  return order.data.issue?.status === "open" || !!order.data.disputed ||
    order.refunded_cents > 0 || (order.data.refunds || []).some((r: any) => !["failed", "canceled"].includes(r.status));
}
