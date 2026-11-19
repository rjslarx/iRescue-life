import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { pool } from "../db";
import { getTwilioConfigForTenant } from "../lib/twilio-service";
import { getAppBaseUrl } from "../lib/app-base-url";
import { callPolicy, callError } from "./rescue-help-call-policy";
import type { HelpCallsResponse, HelpCallView } from "@shared/rescue-help-calls";
import type { PoolClient } from "pg";

type Config = NonNullable<Awaited<ReturnType<typeof getTwilioConfigForTenant>>>;
export const callWebhookBase = () => `${getAppBaseUrl().replace(/\/$/,"")}/api/rescue-help-webhooks/calls`;
export type CallDeps = {
  config: (tenant: string) => Promise<Config | null>;
  verifyNumber: (config: Config, phone: string) => Promise<boolean>;
  create: (config: Config, options: any) => Promise<{sid:string}>;
  allowCalls: () => boolean;
};
export const realCallDeps: CallDeps = {
  config: getTwilioConfigForTenant,
  verifyNumber: async (config,phone) => {
    const numbers=await twilio(config.accountSid,config.authToken).incomingPhoneNumbers.list({phoneNumber:phone,limit:2});
    return numbers.some(n=>n.phoneNumber===phone && n.capabilities.voice);
  },
  create: (config,options) => twilio(config.accountSid,config.authToken,{autoRetry:false,timeout:15000}).calls.create(options),
  allowCalls: () => process.env.REPLIT_DEPLOYMENT === "1",
};
export const callView = (r:any): HelpCallView => ({
  id:r.id,initiatedBy:r.initiated_by || "Former team member",status:r.status,
  active:r.active,createdAt:new Date(r.created_at).toISOString(),
});
export async function getHelpCalls(tenantId:string,threadId:string,userId:string): Promise<HelpCallsResponse> {
  // Always verify conversation tenancy before history.
  if (!(await pool.query("SELECT id FROM rescue_help_threads WHERE tenant_id=$1 AND id=$2",[tenantId,threadId])).rows.length)
    callError("Conversation not found",404);
  const calls=(await pool.query(`SELECT c.*,u.full_name AS initiated_by FROM rescue_help_calls c
    LEFT JOIN users u ON u.id=c.user_id AND u.tenant_id=c.tenant_id WHERE c.tenant_id=$1 AND c.thread_id=$2
    ORDER BY c.created_at DESC LIMIT 20`,[tenantId,threadId])).rows.map(callView);
  try {
    const policy=await callPolicy(pool,tenantId,threadId,userId);
    return {calls,canCall:!calls.some(c=>c.active),staffPhone:policy.staffPhone,
      reason:calls.some(c=>c.active) ? "A callback is already active or uncertain. Check its status before calling again." : null};
  } catch(e:any) {
    if (!e.status) throw e;
    return {calls,canCall:false,staffPhone:null,reason:e.message};
  }
}
export async function startHelpCall(tenantId:string,threadId:string,userId:string,requestId:string,deps=realCallDeps) {
  if (!deps.allowCalls()) callError("Voice callbacks can be placed only on the published app. No call was made.");
  const config=await deps.config(tenantId);
  if (!config) callError("Twilio is not configured for this rescue.");
  const pre=await callPolicy(pool,tenantId,threadId,userId);
  if (pre.fromPhone===config.phoneNumber || !await deps.verifyNumber(config,pre.fromPhone))
    callError("The dedicated help number must be a voice-capable number owned by this rescue's Twilio account.");
  const client=await pool.connect();
  let attempt:any;
  try {
    await client.query("BEGIN");
    // Serialize tenant-wide rate limits as well as conversation starts.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`help-calls:${tenantId}`]);
    await client.query("SELECT id FROM rescue_help_threads WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[threadId,tenantId]);
    const policy=await callPolicy(client,tenantId,threadId,userId);
    if (policy.fromPhone!==pre.fromPhone || policy.staffPhone!==pre.staffPhone || policy.callerPhone!==pre.callerPhone)
      callError("Phone details changed. Refresh the conversation before calling.");
    const existing=(await client.query("SELECT * FROM rescue_help_calls WHERE tenant_id=$1 AND request_id=$2",[tenantId,requestId])).rows[0];
    if (existing) {
      if (existing.thread_id!==threadId || existing.user_id!==userId) callError("Callback request belongs to another conversation.",409);
      await client.query("COMMIT");
      return {id:existing.id,status:existing.status,duplicate:true};
    }
    if ((await client.query("SELECT id FROM rescue_help_calls WHERE thread_id=$1 AND active=true",[threadId])).rows.length)
      callError("A callback is already active or uncertain. Do not start another.",409);
    const counts=(await client.query(`SELECT count(*)::int total,
      count(*) FILTER(WHERE user_id=$2)::int personal FROM rescue_help_calls
      WHERE tenant_id=$1 AND created_at>now()-interval '1 hour'`,[tenantId,userId])).rows[0];
    if (counts.total>=30 || counts.personal>=6) callError("Callback limit reached. Try again later (6 per person and 30 per rescue per hour).",429);
    attempt=(await client.query(`INSERT INTO rescue_help_calls
      (id,tenant_id,thread_id,user_id,request_id,account_sid,from_phone,staff_phone,caller_phone,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '2 minutes') RETURNING *`,
      [randomUUID(),tenantId,threadId,userId,requestId,config.accountSid,policy.fromPhone,policy.staffPhone,policy.callerPhone])).rows[0];
    await client.query("COMMIT");
  } catch(e) {await client.query("ROLLBACK");throw e;} finally {client.release();}
  // A committed attempt must never be retried after an uncertain network response.
  try {
    const call=await deps.create(config,{
      to:attempt.staff_phone,from:attempt.from_phone,
      url:`${callWebhookBase()}/${attempt.id}/prompt`,method:"POST",
      statusCallback:`${callWebhookBase()}/${attempt.id}/staff-status`,statusCallbackMethod:"POST",
      statusCallbackEvent:["initiated","ringing","answered","completed"],
      timeout:25,timeLimit:1800,record:false,
    });
    await pool.query(`UPDATE rescue_help_calls SET staff_sid=COALESCE(staff_sid,$2),updated_at=now()
      WHERE id=$1 AND (staff_sid IS NULL OR staff_sid=$2)`,[attempt.id,call.sid]);
  } catch(e:any) {
    // Only an explicit provider rejection establishes that creation failed.
    const rejected=Number(e.status)>=400 && Number(e.status)<500;
    await pool.query(`UPDATE rescue_help_calls SET status=$2,active=$3,updated_at=now()
      WHERE id=$1 AND staff_sid IS NULL AND status='starting'`,
      [attempt.id,rejected?"failed":"unknown",!rejected]);
  }
  const current=(await pool.query("SELECT id,status FROM rescue_help_calls WHERE id=$1",[attempt.id])).rows[0];
  return current;
}
export async function lockHelpCall<T>(id:string,action:(client:PoolClient,call:any)=>Promise<T>) {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const row=(await client.query("SELECT * FROM rescue_help_calls WHERE id=$1 FOR UPDATE",[id])).rows[0];
    if (!row) callError("Callback not found",404);
    const result=await action(client,row);
    await client.query("COMMIT");return result;
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
