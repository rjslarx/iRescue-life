import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db";
import { helpSettings } from "./rescue-help";
import { sendSms } from "../lib/twilio-service";
import { fosterPhone, fosterTopic, fosterWelcomeText } from "@shared/foster-welcome";
import { deliverPendingFosterWelcomes } from "./foster-welcome-delivery";

export function welcomeRequestId(tenant: string, email: string) {
  const hex = createHash("sha256").update(`foster-welcome:${tenant}:${email.trim().toLowerCase()}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

/** Called only by a new activation, never a scan of previously approved fosters. */
export async function queueFosterWelcome(params: {
  tenantId: string; applicantEmail: string; applicantPhone?: string; fosterApplicationId?: string;
}) {
  if (process.env.REPLIT_DEPLOYMENT !== "1") return;
  const tenant = (await pool.query("SELECT subdomain FROM tenants WHERE id=$1", [params.tenantId])).rows[0];
  if (tenant?.subdomain !== "haseyas") return;
  let phone = fosterPhone(params.applicantPhone);
  if (!phone && params.fosterApplicationId) {
    const app = (await pool.query("SELECT applicant_phone FROM foster_applications WHERE id=$1 AND tenant_id=$2",
      [params.fosterApplicationId, params.tenantId])).rows[0];
    phone = fosterPhone(app?.applicant_phone);
  }
  if (!phone) { console.warn("[Foster welcome] No valid phone on approved application", params.fosterApplicationId); return; }
  const { settings } = await helpSettings(params.tenantId);
  const topic = fosterTopic(settings);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const thread = (await client.query(`INSERT INTO rescue_help_threads(id,tenant_id,phone,status,topic,assignee_id,foster_welcome)
      VALUES($1,$2,$3,'waiting',$4,$5,true) ON CONFLICT(tenant_id,phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING id`,
      [randomUUID(),params.tenantId,phone,topic?.label || "Foster",null])).rows[0];
    const inserted = await client.query(`INSERT INTO rescue_help_messages(id,thread_id,kind,body,status,request_id)
      VALUES($1,$2,'outbound',$3,'welcome_pending',$4) ON CONFLICT(request_id) DO NOTHING RETURNING id`,
      [randomUUID(),thread.id,`${fosterWelcomeText}\n\nReply STOP to unsubscribe.`,welcomeRequestId(params.tenantId,params.applicantEmail)]);
    if (inserted.rows.length) await client.query(`UPDATE rescue_help_threads SET foster_welcome=true,status='waiting',
      topic=$2,updated_at=now() WHERE id=$1`, [thread.id,topic?.label || "Foster"]);
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
  await dispatchFosterWelcomes();
}

let running = false;
export async function dispatchFosterWelcomes() {
  if (process.env.REPLIT_DEPLOYMENT !== "1" || running) return;
  running = true;
  try {
    await deliverPendingFosterWelcomes({
      query: (sql,values) => pool.query(sql,values),
      enabled: async tenantId => (await helpSettings(tenantId)).enabled,
      send: (tenantId,phone,body) => sendSms(tenantId,phone,body,"other",{publicHelpNumber:true,skipOrgPrefix:true}),
    });
  } finally { running = false; }
}
