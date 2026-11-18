type Query = (sql: string, values?: unknown[]) => Promise<{rows: any[]}>;
export type WelcomeDeliveryDeps = {
  query: Query;
  enabled: (tenantId: string) => Promise<boolean>;
  send: (tenantId: string, phone: string, body: string) => Promise<{sid?: string; uncertain?: boolean; error?: string}>;
};

export async function deliverPendingFosterWelcomes(deps: WelcomeDeliveryDeps) {
  // A worker stopped after claiming may already have sent. Flag for human review, never retry.
  await deps.query(`UPDATE rescue_help_messages SET status='unknown'
    WHERE status='welcome_sending' AND created_at<now()-interval '1 day'`);
  const pending = (await deps.query(`SELECT m.id,m.body,t.tenant_id,t.phone FROM rescue_help_messages m
    JOIN rescue_help_threads t ON t.id=m.thread_id JOIN tenants org ON org.id=t.tenant_id
    WHERE m.status='welcome_pending' AND org.subdomain='haseyas' ORDER BY m.created_at LIMIT 30`)).rows;
  for (const message of pending) {
    if (!await deps.enabled(message.tenant_id)) continue;
    const claimed = await deps.query("UPDATE rescue_help_messages SET status='welcome_sending' WHERE id=$1 AND status='welcome_pending' RETURNING id", [message.id]);
    if (!claimed.rows.length) continue;
    try {
      const result = await deps.send(message.tenant_id,message.phone,message.body);
      const deferred = !result.sid && !result.uncertain && /quiet hours|communications are paused|help line is not active/i.test(result.error || "");
      await deps.query("UPDATE rescue_help_messages SET status=$2,provider_sid=$3 WHERE id=$1",
        [message.id,result.sid ? "accepted" : result.uncertain ? "unknown" : deferred ? "welcome_pending" : "failed",result.sid || null]);
    } catch {
      await deps.query("UPDATE rescue_help_messages SET status='unknown' WHERE id=$1 AND status='welcome_sending'", [message.id]);
    }
  }
}
