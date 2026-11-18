import { pool } from "../db";
import type { PoolClient } from "pg";

export async function withHelpThread<T>(tenantId: string, id: string, action: (client: PoolClient, thread: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const thread = (await client.query("SELECT * FROM rescue_help_threads WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[id,tenantId])).rows[0];
    if (!thread) throw Object.assign(new Error("Conversation not found"),{status:404});
    // A crashed send must remain uncertain, but must not lock staff out forever.
    await client.query(`UPDATE rescue_help_messages SET status='unknown'
      WHERE thread_id=$1 AND status='sending' AND created_at<now()-interval '15 minutes'`,[id]);
    const result = await action(client,thread);
    await client.query("COMMIT");
    return result;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}
