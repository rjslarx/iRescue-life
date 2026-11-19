import { Router } from "express";
import { z } from "zod";
import twilio from "twilio";
import { pool } from "../db";
import { callPolicy, callError } from "../services/rescue-help-call-policy";
import { callWebhookBase, getHelpCalls, lockHelpCall, realCallDeps, startHelpCall, type CallDeps } from "../services/rescue-help-calls";
import { helpVoiceOptions } from "@shared/rescue-help";

const wrap=(fn:any)=>async(req:any,res:any)=>{
  res.set("Cache-Control","no-store");
  try {await fn(req,res);}catch(e:any) {
    if(e instanceof z.ZodError) return res.status(400).json({error:"Invalid callback request"});
    // Never log provider messages, URLs, or phone numbers.
    res.status(e.status || 503).json({error:e.status?e.message:"Unable to check callback status. Do not retry an uncertain call."});
  }
};
export function helpCallRoutes(deps:CallDeps=realCallDeps) {
  const router=Router();
  router.get("/threads/:id/calls",wrap(async(req:any,res:any)=>{
    res.json(await getHelpCalls(req.tenant.id,z.string().uuid().parse(req.params.id),req.user.id));
  }));
  router.post("/threads/:id/calls",wrap(async(req:any,res:any)=>{
    const input=z.object({requestId:z.string().uuid()}).strict().parse(req.body);
    res.json(await startHelpCall(req.tenant.id,z.string().uuid().parse(req.params.id),req.user.id,input.requestId,deps));
  }));
  return router;
}
const sid=z.string().regex(/^CA[a-f0-9]{32}$/i);
const terminal=new Set(["busy","no-answer","failed","canceled","completed"]);
const normalized=(status:string)=>status.replaceAll("-","_");

export function helpCallWebhooks(deps:CallDeps=realCallDeps) {
  const router=Router();
  router.post("/:id/:event",wrap(async(req:any,res:any)=>{
    const id=z.string().uuid().parse(req.params.id);
    const event=z.enum(["prompt","confirm","staff-status","caller-status","dial-result"]).parse(req.params.event);
    const lookup=(await pool.query("SELECT tenant_id,account_sid FROM rescue_help_calls WHERE id=$1",[id])).rows[0];
    if(!lookup) callError("Unknown callback",403);
    const config=await deps.config(lookup.tenant_id);
    if(!config || config.accountSid!==lookup.account_sid || req.body.AccountSid!==lookup.account_sid ||
      !twilio.validateRequest(config.authToken,req.get("X-Twilio-Signature") || "",
        `${callWebhookBase()}${req.url}`,req.body)) callError("Invalid webhook signature",403);
    const callSid=sid.parse(req.body.CallSid);
    const xml=await lockHelpCall(id,async(client,call)=>{
      const voice=new twilio.twiml.VoiceResponse();
      const hangup=()=>{voice.hangup();return voice.toString();};
      const update=async(status:string,active=call.active)=>{
        await client.query("UPDATE rescue_help_calls SET status=$2,active=$3,updated_at=now() WHERE id=$1",[id,status,active]);
      };
      if(event==="caller-status") {
        if(!call.confirmed || req.body.ParentCallSid!==call.staff_sid || req.body.From!==call.from_phone ||
          req.body.To!==call.caller_phone || (call.caller_sid && call.caller_sid!==callSid)) callError("Call does not belong to this callback",403);
        await client.query("UPDATE rescue_help_calls SET caller_sid=COALESCE(caller_sid,$2) WHERE id=$1",[id,callSid]);
        const status=String(req.body.CallStatus);
        if(!call.active) {
          if(call.status==="unknown" && terminal.has(status)) await update(normalized(status),false);
          return hangup();
        }
        if(terminal.has(status)) await update(normalized(status),false);
        else if(status==="in-progress") await update("in_progress");
        else if(status==="ringing" && call.status==="connecting") await update("ringing_caller");
        return hangup();
      }
      // Every staff-leg callback is bound to the immutable captured numbers and SID.
      if(req.body.From!==call.from_phone || req.body.To!==call.staff_phone ||
        (call.staff_sid && call.staff_sid!==callSid)) callError("Call does not belong to this callback",403);
      await client.query("UPDATE rescue_help_calls SET staff_sid=COALESCE(staff_sid,$2) WHERE id=$1",[id,callSid]);
      if(event==="dial-result") {
        if(!call.confirmed) return hangup();
        const child=sid.parse(req.body.DialCallSid);
        if(call.caller_sid && call.caller_sid!==child) callError("Unexpected caller leg",403);
        await client.query("UPDATE rescue_help_calls SET caller_sid=COALESCE(caller_sid,$2) WHERE id=$1",[id,child]);
        // A late dial-result can refine an unknown parent completion, never revive it.
        if(call.active || call.status==="unknown") {
          const status=String(req.body.DialCallStatus);
          await update(terminal.has(status)?normalized(status):"unknown",false);
        }
        return hangup();
      }
      if(event==="staff-status") {
        if(!call.active) return hangup();
        const status=String(req.body.CallStatus);
        if(terminal.has(status)) {
          // If the staff leg ended, it can no longer start another caller leg.
          await update(status==="completed" ? (call.confirmed?"unknown":"no_confirmation") : normalized(status),false);
        } else if(status==="ringing" && ["starting","unknown"].includes(call.status)) await update("ringing_staff");
        return hangup();
      }
      if(!call.active) return hangup();
      if(new Date(call.expires_at).getTime()<=Date.now()) {await update("expired",false);return hangup();}
      let policy;
      try {
        policy=await callPolicy(client,call.tenant_id,call.thread_id,call.user_id);
        if(policy.staffPhone!==call.staff_phone || policy.callerPhone!==call.caller_phone ||
          policy.fromPhone!==call.from_phone || config.phoneNumber===call.from_phone) callError("Callback details changed");
      } catch(e:any) {
        if(!e.status) throw e;
        await update("blocked",false);voice.say({voice:"woman",language:"en-US"},"This callback is no longer available.");
        return hangup();
      }
      const options=helpVoiceOptions(policy.settings.voice);
      if(event==="prompt") {
        if(call.prompted || call.confirmed) return hangup();
        await client.query("UPDATE rescue_help_calls SET prompted=true,status='awaiting_confirmation',updated_at=now() WHERE id=$1",[id]);
        const gather=voice.gather({input:["dtmf"],numDigits:1,timeout:10,actionOnEmptyResult:true,
          action:`${callWebhookBase()}/${id}/confirm`,method:"POST"});
        gather.say(options,"This is your rescue inbox callback. Press 1 to connect to the caller. Both call legs incur voice charges. Press any other key or hang up to cancel.");
        voice.hangup();return voice.toString();
      }
      if(!call.prompted || call.confirmed) return hangup();
      if(req.body.Digits!=="1") {
        await update(req.body.Digits?"declined":"no_confirmation",false);return hangup();
      }
      // Commit the single-use connection gate before Twilio receives Dial.
      await client.query("UPDATE rescue_help_calls SET confirmed=true,status='connecting',updated_at=now() WHERE id=$1",[id]);
      voice.dial({callerId:call.from_phone,timeout:25,timeLimit:1800,record:"do-not-record",
        action:`${callWebhookBase()}/${id}/dial-result`,method:"POST"})
        .number({statusCallback:`${callWebhookBase()}/${id}/caller-status`,statusCallbackMethod:"POST",
          statusCallbackEvent:["initiated","ringing","answered","completed"]},call.caller_phone);
      return voice.toString();
    });
    res.type("text/xml").send(xml);
  }));
  return router;
}
