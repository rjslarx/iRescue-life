import type { PoolClient } from "pg";
import { pool } from "../db";
import { defaultHelpSettings, helpRecipients, type HelpSettings } from "@shared/rescue-help";
import { sendSms } from "../lib/twilio-service";
import { fosterPhone } from "@shared/foster-welcome";
import { getAppBaseUrl } from "../lib/app-base-url";

export async function queueHelpAlerts(client: Pick<PoolClient,"query">, tenantId: string,
  thread: { id: string; status: string; topic: string | null; assignee_id: string | null }, settings: HelpSettings) {
  if (settings.smsAlerts === false) return;
  for (const userId of helpRecipients(settings,thread)) {
    await client.query(`INSERT INTO rescue_help_alerts(thread_id,user_id,tenant_id,event_at,due_at,status)
      VALUES($1,$2,$3,clock_timestamp(),now()+interval '30 seconds','pending')
      ON CONFLICT(thread_id,user_id) DO UPDATE SET event_at=clock_timestamp(),
      due_at=GREATEST(now()+interval '30 seconds',rescue_help_alerts.attempted_at+interval '5 minutes'),
      status='pending'`, [thread.id,userId,tenantId]);
  }
}

let running = false;
export async function dispatchHelpAlerts() {
  if (process.env.REPLIT_DEPLOYMENT !== "1" || running) return;
  running = true;
  try {
    await processHelpAlerts(pool,sendSms,getAppBaseUrl);
  } finally { running = false; }
}

// Dependencies make the delivery path testable without contacting a real phone.
export async function processHelpAlerts(db: Pick<typeof pool,"query"|"connect">, send: typeof sendSms, baseUrl: () => string) {
    const jobs = (await db.query(`SELECT thread_id,user_id FROM rescue_help_alerts
      WHERE status='pending' AND due_at<=now() ORDER BY due_at LIMIT 50`)).rows;
    for (const job of jobs) {
      const client = await db.connect();
      let work: any;
      try {
        await client.query("BEGIN");
        // Same lock order as incoming messages and staff ownership changes.
        const thread = (await client.query("SELECT * FROM rescue_help_threads WHERE id=$1 FOR UPDATE", [job.thread_id])).rows[0];
        const alert = (await client.query(`SELECT *,event_at::text AS version FROM rescue_help_alerts
          WHERE thread_id=$1 AND user_id=$2 AND status='pending' AND due_at<=now() FOR UPDATE`,
          [job.thread_id,job.user_id])).rows[0];
        if (!thread || !alert) { await client.query("COMMIT"); continue; }
        const config = (await client.query(`SELECT h.enabled,h.data,t.name,t.subdomain,t.custom_domain,t.comms_paused
          FROM rescue_help_settings h JOIN tenants t ON t.id=h.tenant_id WHERE h.tenant_id=$1`,[thread.tenant_id])).rows[0];
        const settings = { ...defaultHelpSettings, ...config?.data } as HelpSettings;
        const user = (await client.query(`SELECT phone,sms_opt_out_at FROM users
          WHERE id=$1 AND tenant_id=$2 AND is_active=true`,[job.user_id,thread.tenant_id])).rows[0];
        const phone = fosterPhone(user?.phone);
        if (!config || settings.smsAlerts === false || !helpRecipients(settings,thread).includes(job.user_id) || !phone || user.sms_opt_out_at) {
          await client.query("UPDATE rescue_help_alerts SET status='skipped' WHERE thread_id=$1 AND user_id=$2",[job.thread_id,job.user_id]);
        } else if (!config.enabled || config.comms_paused) {
          await client.query("UPDATE rescue_help_alerts SET due_at=now()+interval '5 minutes' WHERE thread_id=$1 AND user_id=$2",[job.thread_id,job.user_id]);
        } else {
          // Commit the attempt before touching Twilio. An interrupted attempt is never retried.
          await client.query(`UPDATE rescue_help_alerts SET status='sending',attempted_at=now()
            WHERE thread_id=$1 AND user_id=$2`,[job.thread_id,job.user_id]);
          work = { ...alert, phone, config, topic: thread.topic, claimed: !!thread.assignee_id };
        }
        await client.query("COMMIT");
      } catch (err) { await client.query("ROLLBACK"); throw err; }
      finally { client.release(); }
      if (!work) continue;
      const origin = work.config.custom_domain ? `https://${work.config.custom_domain}` : `${baseUrl().replace(/\/$/,"")}/${work.config.subdomain}`;
      const link = `${origin}/dashboard/rescue-inbox?thread=${encodeURIComponent(work.thread_id)}`;
      // No caller details, message text, or screenshots in personal-phone notifications.
      const body = `Rescue Inbox: ${work.claimed ? "A new reply needs your attention." : "A new message needs attention. Open the inbox to view and claim it."} ${link}`;
      let status = "unknown";
      try {
        const result = await send(work.tenant_id,work.phone,body,"other",{publicHelpNumber:true});
        status = result.sid ? "accepted" : result.uncertain ? "unknown" :
          /quiet hours|communications are paused|help line is not active/i.test(result.error || "") ? "pending" : "failed";
      } catch { /* Do not retry an uncertain provider attempt. */ }
      await db.query(`UPDATE rescue_help_alerts SET status=$4,
        due_at=CASE WHEN $4='pending' THEN now()+interval '5 minutes' ELSE due_at END
        WHERE thread_id=$1 AND user_id=$2 AND event_at=$3::timestamptz AND status='sending'`,
        [work.thread_id,work.user_id,work.version,status]);
    }
}
