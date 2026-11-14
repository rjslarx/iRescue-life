import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { defaultHelpSettings, helpIsOpen, helpMatch, type HelpSettings } from "@shared/rescue-help";
import { isSmsPhoneSuppressed, smsPhoneKey } from "../lib/sms-suppression";

export async function helpSettings(tenantId: string) {
  const row = (await pool.query("SELECT * FROM rescue_help_settings WHERE tenant_id=$1", [tenantId])).rows[0];
  return { enabled: row?.enabled === true, number: row?.phone || "", settings: { ...defaultHelpSettings, ...row?.data } as HelpSettings };
}
export async function helpCanSend(tenantId: string, phone: string) {
  const t = (await pool.query("SELECT comms_paused FROM tenants WHERE id=$1", [tenantId])).rows[0];
  if (!t || t.comms_paused || await isSmsPhoneSuppressed(tenantId, phone)) return false;
  const opted = (await pool.query("SELECT phone FROM users WHERE tenant_id=$1 AND sms_opt_out_at IS NOT NULL", [tenantId])).rows;
  return !opted.some(u => u.phone && smsPhoneKey(u.phone) === smsPhoneKey(phone));
}
export async function helpInbound(tenantId: string, from: string, sid: string, body: string, recordingSid?: string) {
  const { enabled, settings: s } = await helpSettings(tenantId);
  // Preserve a voicemail already recorded while an admin was disabling service.
  if (!enabled && !recordingSid) return "";
  const canSend = !recordingSid && await helpCanSend(tenantId, from);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const event = await client.query("INSERT INTO rescue_help_events(sid,tenant_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING sid", [sid, tenantId]);
    if (!event.rows.length) { await client.query("COMMIT"); return ""; }
    await client.query(`INSERT INTO rescue_help_threads(id,tenant_id,phone) VALUES($1,$2,$3)
      ON CONFLICT(tenant_id,phone) DO NOTHING`, [randomUUID(), tenantId, from]);
    const thread = (await client.query("SELECT * FROM rescue_help_threads WHERE tenant_id=$1 AND phone=$2 FOR UPDATE", [tenantId, from])).rows[0];
    const before = (await client.query("SELECT count(*)::int n FROM rescue_help_messages WHERE thread_id=$1", [thread.id])).rows[0].n;
    await client.query(`INSERT INTO rescue_help_messages(id,thread_id,kind,body,provider_sid,recording_sid)
      VALUES($1,$2,$3,$4,$5,$6)`, [randomUUID(), thread.id, recordingSid ? "voicemail" : "inbound", body.slice(0,4000), sid, recordingSid || null]);
    const matched = helpMatch(s, body);
    const paused = before > 0 && ["waiting", "human"].includes(thread.status);
    let reply = "", status = thread.status === "resolved" ? "bot" : thread.status;
    let assignee = thread.assignee_id, topic = thread.topic;
    if (recordingSid) { status = "waiting"; }
    else if (!paused || matched.kind === "emergency") {
      if (matched.kind === "answer") {
        reply = matched.topic.answer;
        topic = matched.topic.label;
        assignee = matched.topic.assigneeId;
        status = "bot";
      } else {
        reply = matched.kind === "emergency" ? s.emergency : s.handoff;
        status = "waiting";
        if (!before && matched.kind !== "emergency") reply = `${s.greeting}\n${reply}`;
      }
      if (!helpIsOpen(s)) reply += `\n${s.afterHours}`;
    }
    const count = (await client.query(`SELECT count(*)::int n FROM rescue_help_messages
      WHERE thread_id=$1 AND kind='outbound' AND created_at>now()-interval '1 hour'`, [thread.id])).rows[0].n;
    if (!canSend || count >= 6) reply = "";
    if (reply) {
      reply += "\nReply TEAM for a person. STOP to unsubscribe.";
      await client.query(`INSERT INTO rescue_help_messages(id,thread_id,kind,body,status) VALUES($1,$2,'outbound',$3,'auto_response')`,
        [randomUUID(), thread.id, reply]);
    }
    await client.query("UPDATE rescue_help_threads SET status=$2,topic=$3,assignee_id=$4,updated_at=now() WHERE id=$1", [thread.id,status,topic,assignee]);
    await client.query("COMMIT");
    return reply;
  } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
