import { Router } from "express";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { getTwilioConfigForTenant, sendSms } from "../lib/twilio-service";
import { smsOptOutCommand, recordVerifiedSmsOptOut } from "../lib/sms-suppression";
import { helpSettingsSchema, helpIsOpen, helpVoiceOptions } from "@shared/rescue-help";
import { helpSettings, helpInbound } from "../services/rescue-help";
import { getAppBaseUrl } from "../lib/app-base-url";

const router = Router();
export const helpWebhooks = Router();
const wrap = (fn: any) => async (req: any,res: any,next: any) => {
  try { await fn(req,res,next); } catch(e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({error:e.issues.map(i=>i.message).join("; ")});
    console.warn("[Rescue Inbox] Request failed", e.code || e.status || "unknown");
    res.status(e.status || 503).json({error:e.status ? e.message : "Unable to complete this action. Please try again."});
  }
};
function fail(message:string,status=400):never { throw Object.assign(new Error(message),{status}); }
const admin = (req:any) => req.user?.roles?.some((r:string)=>["owner","admin"].includes(r));
const base = () => `${getAppBaseUrl().replace(/\/$/,"")}/api/rescue-help-webhooks`;
router.use(requireAuth);
router.use(wrap(async(req:any,res:any,next:any) => {
  res.set("Cache-Control","no-store");
  if(req.user.tenantId!==req.tenant.id || req.user.isActive === false) fail("Rescue access denied",403);
  req.help=await helpSettings(req.tenant.id);
  req.helpAllowed=admin(req)||req.help.settings.teamIds.includes(req.user.id);
  next();
}));
router.get("/access",(req:any,res)=>res.json({allowed:req.helpAllowed,admin:admin(req)}));
router.use((req:any,res,next)=>req.helpAllowed?next():res.status(403).json({error:"Ask a rescue admin to add you to the Rescue Inbox team."}));
async function team(tenantId:string, ids?:string[]) {
  return (await pool.query(`SELECT id,full_name AS name FROM users WHERE tenant_id=$1 AND is_active=true
    AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[])) ORDER BY full_name`,[tenantId,ids||null])).rows;
}
router.get("/settings",wrap(async(req:any,res:any)=>{
  res.json({...req.help,admin:admin(req),team:admin(req)?await team(req.tenant.id):[],webhookBase:base()});
}));
router.put("/settings",wrap(async(req:any,res:any)=>{
  if(!admin(req)) fail("Only rescue admins can edit settings",403);
  const s=helpSettingsSchema.parse(req.body);
  // Older open settings forms must not reset a voice they do not know about.
  s.voice ??= req.help.settings.voice || "default";
  if(req.help.enabled && s.phone!==req.help.number) fail("Disable the line before changing its number.",409);
  const selected=await team(req.tenant.id,s.teamIds);
  if(selected.length!==new Set(s.teamIds).size) fail("Select active team members from this rescue.");
  if(s.phone && (await pool.query("SELECT id FROM tenants WHERE twilio_phone_number=$1",[s.phone])).rows.length) fail("Use a separate public-help number, not an operational texting number.");
  await pool.query(`INSERT INTO rescue_help_settings(tenant_id,phone,data) VALUES($1,$2,$3)
    ON CONFLICT(tenant_id) DO UPDATE SET phone=excluded.phone,data=excluded.data`,[req.tenant.id,s.phone||null,s]);
  await pool.query("UPDATE rescue_help_threads SET assignee_id=NULL WHERE tenant_id=$1 AND NOT(assignee_id=ANY($2::uuid[]))",[req.tenant.id,s.teamIds]);
  res.json({ok:true});
}));
router.post("/activate",wrap(async(req:any,res:any)=>{
  if(!admin(req)) fail("Only rescue admins can activate the line",403);
  if(process.env.REPLIT_DEPLOYMENT!=="1") fail("Activation is available only on the published app. No number has been purchased.",409);
  const {settings:s}=req.help;
  if(!s.phone || !s.teamIds.length) fail("Save a dedicated number and at least one inbox volunteer first.");
  const config=await getTwilioConfigForTenant(req.tenant.id);
  if(!config || config.phoneNumber===s.phone) fail("Configure Twilio and choose a separate help number.",409);
  if((await pool.query("SELECT id FROM tenants WHERE twilio_phone_number=$1",[s.phone])).rows.length) fail("This is an operational number.",409);
  const client=twilio(config.accountSid,config.authToken);
  const numbers=await client.incomingPhoneNumbers.list({phoneNumber:s.phone,limit:2});
  const number=numbers.find(n=>n.phoneNumber===s.phone);
  if(!number || !number.capabilities.sms || !number.capabilities.voice) fail("The number must already belong to this Twilio account and support SMS and voice.",409);
  await client.incomingPhoneNumbers(number.sid).update({smsUrl:`${base()}/sms`,smsMethod:"POST",voiceUrl:`${base()}/voice`,voiceMethod:"POST"});
  await pool.query("UPDATE rescue_help_settings SET enabled=true WHERE tenant_id=$1 AND phone=$2",[req.tenant.id,s.phone]);
  res.json({ok:true});
}));
router.post("/disable",wrap(async(req:any,res:any)=>{
  if(!admin(req)) fail("Only rescue admins can disable the line",403);
  await pool.query("UPDATE rescue_help_settings SET enabled=false WHERE tenant_id=$1",[req.tenant.id]);
  res.json({ok:true});
}));
const threadView=(r:any)=>({id:r.id,phone:r.phone,status:r.status,topic:r.topic,assigneeId:r.assignee_id,updatedAt:r.updated_at,preview:r.preview});
router.get("/threads",wrap(async(req:any,res:any)=>{
  const rows=(await pool.query(`SELECT t.*,(SELECT left(body,150) FROM rescue_help_messages m WHERE m.thread_id=t.id ORDER BY created_at DESC LIMIT 1) preview
    FROM rescue_help_threads t WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 300`,[req.tenant.id])).rows;
  res.json({threads:rows.map(threadView),team:await team(req.tenant.id,req.help.settings.teamIds),userId:req.user.id,admin:admin(req)});
}));
async function owned(req:any) {
  const id=z.string().uuid().parse(req.params.id);
  const t=(await pool.query("SELECT * FROM rescue_help_threads WHERE id=$1 AND tenant_id=$2",[id,req.tenant.id])).rows[0];
  if(!t) fail("Conversation not found",404); return t;
}
router.get("/threads/:id",wrap(async(req:any,res:any)=>{
  const t=await owned(req);
  const messages=(await pool.query(`SELECT m.id,m.kind,m.body,m.status,m.created_at AS "createdAt",u.full_name AS "authorName",
    (m.recording_sid IS NOT NULL) AS "hasRecording" FROM rescue_help_messages m LEFT JOIN users u ON u.id=m.author_id
    WHERE thread_id=$1 ORDER BY m.created_at DESC LIMIT 500`,[t.id])).rows.reverse();
  res.json({thread:threadView(t),messages});
}));
router.post("/threads/:id/claim",wrap(async(req:any,res:any)=>{
  const t=await owned(req);
  const r=await pool.query(`UPDATE rescue_help_threads SET assignee_id=$2,status='human',updated_at=now()
    WHERE id=$1 AND (assignee_id IS NULL OR assignee_id=$2) RETURNING id`,[t.id,req.user.id]);
  if(!r.rows.length) fail("Another volunteer has claimed this conversation.",409);
  res.json({ok:true});
}));
router.post("/threads/:id/update",wrap(async(req:any,res:any)=>{
  const t=await owned(req),input=z.object({status:z.enum(["waiting","human","resolved"]).optional(),assigneeId:z.string().uuid().nullable().optional()}).strict().parse(req.body);
  if(!admin(req) && (input.assigneeId!==undefined || t.assignee_id!==req.user.id)) fail("Only the assigned volunteer or an admin can change this conversation.",403);
  if(input.assigneeId && !req.help.settings.teamIds.includes(input.assigneeId)) fail("Choose a member of the inbox team.");
  await pool.query(`UPDATE rescue_help_threads SET status=COALESCE($2,status),assignee_id=CASE WHEN $3 THEN $4 ELSE assignee_id END,updated_at=now()
    WHERE id=$1`,[t.id,input.status||null,input.assigneeId!==undefined,input.assigneeId||null]);
  res.json({ok:true});
}));
router.post("/threads/:id/messages",rateLimit({windowMs:60000,max:20}),wrap(async(req:any,res:any)=>{
  const t=await owned(req),input=z.object({body:z.string().trim().min(1).max(1000),kind:z.enum(["note","outbound"]),requestId:z.string().uuid()}).strict().parse(req.body);
  if(input.kind==="outbound" && !admin(req) && t.assignee_id!==req.user.id) fail("Claim the conversation before replying.",403);
  if(input.kind==="outbound" && !req.help.enabled) fail("The help line is not active.",409);
  if(input.kind==="outbound" && !/^\+\d{8,15}$/.test(t.phone)) fail("This caller withheld their number. SMS replies are unavailable.",409);
  const id=randomUUID();
  const inserted=await pool.query(`INSERT INTO rescue_help_messages(id,thread_id,kind,body,status,request_id,author_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(request_id) DO NOTHING RETURNING id`,
    [id,t.id,input.kind,input.body,input.kind==="note"?"saved":"sending",input.requestId,req.user.id]);
  if(!inserted.rows.length) { res.json({ok:true,duplicate:true}); return; }
  await pool.query("UPDATE rescue_help_threads SET updated_at=now(),status=CASE WHEN $2='outbound' THEN 'human' ELSE status END WHERE id=$1",[t.id,input.kind]);
  if(input.kind==="outbound"){
    // No automatic retry: an uncertain provider response might already be delivered.
    try{
      const result=await sendSms(req.tenant.id,t.phone,input.body,"other",{publicHelpNumber:true,bypassQuietHours:true,sentBy:{id:req.user.id,name:req.user.fullName}});
      await pool.query("UPDATE rescue_help_messages SET status=$2,provider_sid=$3 WHERE id=$1",
        [id,result.sid?"accepted":result.uncertain?"unknown":"failed",result.sid||null]);
      if(result.status!=="sent") fail(result.uncertain?"Delivery is uncertain. Check before sending again.":result.error||"Text was not sent.",502);
    }catch(e:any){
      await pool.query("UPDATE rescue_help_messages SET status='unknown' WHERE id=$1 AND status='sending'",[id]);
      throw e;
    }
  }
  res.json({ok:true});
}));
router.get("/messages/:id/audio",wrap(async(req:any,res:any)=>{
  const row=(await pool.query(`SELECT m.recording_sid FROM rescue_help_messages m JOIN rescue_help_threads t ON t.id=m.thread_id
    WHERE m.id=$1 AND t.tenant_id=$2`,[z.string().uuid().parse(req.params.id),req.tenant.id])).rows[0];
  if(!row?.recording_sid || !/^RE[a-f0-9]{32}$/i.test(row.recording_sid)) fail("Recording not found",404);
  const config=await getTwilioConfigForTenant(req.tenant.id); if(!config) fail("Twilio unavailable",409);
  const recording=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${row.recording_sid}.mp3`,
    {headers:{Authorization:`Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`}});
  if(!recording.ok) fail("Recording is not available.",404);
  res.type("audio/mpeg").send(Buffer.from(await recording.arrayBuffer()));
}));

// Separate webhook path and dedicated-number lookup leave operational SMS untouched.
helpWebhooks.use(wrap(async(req:any,res:any,next:any)=>{
  const to=String(req.body.To||"");
  const callbackTenant=req.path==="/recording" ? z.string().uuid().parse(req.query.tenantId) : null;
  const row=(await pool.query("SELECT tenant_id,phone FROM rescue_help_settings WHERE ($2::uuid IS NOT NULL AND tenant_id=$2) OR ($2::uuid IS NULL AND phone=$1)",[to,callbackTenant])).rows[0];
  if(!row) fail("Unknown help number",403);
  const config=await getTwilioConfigForTenant(row.tenant_id);
  const signature=req.get("X-Twilio-Signature");
  if(!config || !signature || req.body.AccountSid!==config.accountSid ||
    !twilio.validateRequest(config.authToken,signature,`${base()}${req.url}`,req.body)) fail("Invalid webhook signature",403);
  if(callbackTenant){
    const callSid=z.string().regex(/^CA[a-f0-9]{32}$/i).parse(req.body.CallSid);
    const call=await twilio(config.accountSid,config.authToken).calls(callSid).fetch();
    if(call.to!==row.phone || call.accountSid!==config.accountSid) fail("Recording does not belong to this help line",403);
    req.helpCaller=/^\+\d{8,15}$/.test(call.from) ? call.from : `private:${callSid}`;
  }
  req.helpTenant=row.tenant_id; req.help=await helpSettings(row.tenant_id); next();
}));
helpWebhooks.post("/sms",wrap(async(req:any,res:any)=>{
  const response=new twilio.twiml.MessagingResponse();
  const from=z.string().regex(/^\+\d{8,15}$/).parse(req.body.From);
  const sid=z.string().regex(/^SM[a-f0-9]{32}$/i).parse(req.body.MessageSid);
  const command=smsOptOutCommand(req.body.Body,req.body.OptOutType);
  if(command){
    if(command!=="HELP") await recordVerifiedSmsOptOut(req.helpTenant,from,sid,command);
    res.type("text/xml").send(response.toString()); return;
  }
  const media=Number(req.body.NumMedia||0)>0 ? " [Attachment received; please describe it in text.]" : "";
  const reply=await helpInbound(req.helpTenant,from,sid,String(req.body.Body||"")+media);
  if(reply) response.message(reply);
  res.type("text/xml").send(response.toString());
}));
helpWebhooks.post("/voice",wrap(async(req:any,res:any)=>{
  const voice=new twilio.twiml.VoiceResponse();
  const options=helpVoiceOptions(req.help.settings.voice);
  if(!req.help.enabled) { voice.say(options,"This help line is not currently available. Please visit the rescue website."); voice.hangup(); }
  else {
    voice.say(options,`${req.help.settings.greeting} ${helpIsOpen(req.help.settings) ? "" : req.help.settings.afterHours} For the quickest response, please text this number. After the tone you may leave a voicemail. Your message will be recorded and shared with the rescue team. Hang up now if you do not wish to be recorded.`);
    voice.record({maxLength:120,playBeep:true,recordingStatusCallback:`${base()}/recording?tenantId=${req.helpTenant}`,recordingStatusCallbackMethod:"POST",
      action:`${base()}/voice-end`,method:"POST"});
  }
  res.type("text/xml").send(voice.toString());
}));
helpWebhooks.post("/voice-end",(req:any,res)=>{
  const voice=new twilio.twiml.VoiceResponse();voice.say(helpVoiceOptions(req.help.settings.voice),"Thank you. Goodbye.");voice.hangup();res.type("text/xml").send(voice.toString());
});
helpWebhooks.post("/recording",wrap(async(req:any,res:any)=>{
  const sid=z.string().regex(/^RE[a-f0-9]{32}$/i).parse(req.body.RecordingSid);
  if(req.body.RecordingStatus==="completed") await helpInbound(req.helpTenant,req.helpCaller,sid,
    `Voicemail (${Number(req.body.RecordingDuration)||0} seconds).`,sid);
  res.sendStatus(204);
}));
export default router;
