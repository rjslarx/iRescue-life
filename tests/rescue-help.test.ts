import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { db,pool } from "../server/db";
import { tenants,users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { defaultHelpSettings,helpSettingsSchema,helpMatch,helpIsOpen,topicTeam,helpRecipients,canClaimHelp } from "../shared/rescue-help";
import { rescueHelpSchemaSql } from "../server/lib/rescue-help-schema";
import { helpInbound } from "../server/services/rescue-help";
import router,{helpWebhooks} from "../server/routes/rescueHelp";
import { encrypt } from "../server/lib/encryption";
import twilio from "twilio";
import { getAppBaseUrl } from "../server/lib/app-base-url";
import { processHelpAlerts } from "../server/services/rescue-help-alerts";

test("approved FAQ matching never guesses between categories; hours use tenant timezone",()=>{
  const settings={...defaultHelpSettings,topics:[{id:randomUUID(),label:"Adoption",keywords:["adopt"],answer:"Approved adoption answer",assigneeId:null}]};
  assert.equal(helpMatch(settings,"I want to adopt!").kind,"answer");
  assert.equal(helpMatch(settings,"adopted").kind,"handoff");
  assert.equal(helpMatch(settings,"TEAM").kind,"handoff");
  assert.equal(helpMatch(settings,"animal not breathing").kind,"emergency");
  assert.equal(helpMatch({...settings,topics:[...settings.topics,{...settings.topics[0],id:randomUUID()}]},"adopt").kind,"handoff");
  assert.equal(helpIsOpen(settings,new Date("2026-11-16T16:00:00Z")),true);
  assert.equal(helpIsOpen(settings,new Date("2026-11-16T02:00:00Z")),false);
  assert.equal(helpSettingsSchema.safeParse({...settings,timezone:"bad"}).success,false);
});

test("category teams preserve legacy owners and only notify the current claimant",()=>{
  const a=randomUUID(),b=randomUUID(),c=randomUUID();
  const topic={id:randomUUID(),label:"Foster",keywords:["foster"],answer:"Approved",assigneeId:a};
  assert.deepEqual(topicTeam(topic),[a]);
  const s={...defaultHelpSettings,teamIds:[a,b,c],topics:[{...topic,assigneeIds:[a,b]}]};
  assert.equal(helpSettingsSchema.safeParse(s).success,true);
  assert.equal(helpSettingsSchema.safeParse({...s,teamIds:[a]}).success,false);
  assert.deepEqual(helpRecipients(s,{topic:"Foster",status:"waiting"}),[a,b]);
  assert.deepEqual(helpRecipients(s,{topic:"Foster",status:"human",assignee_id:b}),[b]);
  assert.deepEqual(helpRecipients(s,{topic:"Foster",status:"resolved",assignee_id:b}),[]);
  assert.equal(canClaimHelp(s,{topic:"Foster",status:"waiting"},c,false),false);
  assert.equal(canClaimHelp(s,{topic:"Foster",status:"waiting"},c,true),true);
  assert.deepEqual(helpRecipients(s,{topic:"General",status:"waiting"}),[a,b,c]);
});

test("help inbox isolates tenants, pauses bot on handoff, dedupes inbound and verifies signatures", {skip:process.env.RUN_RESALE_DB_TEST!=="1"},async()=>{
  const tid=randomUUID(),other=randomUUID(),uid=randomUUID(),second=randomUUID(),cid=randomUUID();
  const phone="+12025550123",dedicated="+12025550198",sid="AC"+"a".repeat(32),secret="test-only-not-a-real-secret";
  let server:any;
  try{
    await pool.query(rescueHelpSchemaSql);
    await db.insert(tenants).values([{id:tid,name:"Help test",subdomain:`help-${tid}`,twilioEnabled:true,
      twilioPhoneNumber:"+12025550199",twilioAccountSidEncrypted:encrypt(sid),twilioAuthTokenEncrypted:encrypt(secret)},
      {id:other,name:"Other test",subdomain:`help-${other}`}]);
    await db.insert(users).values([uid,second].map((id,i)=>({id,tenantId:tid,email:`${id}@example.test`,fullName:"Test volunteer",phone:`+1202555010${i}`,passwordHash:"test-only",roles:["volunteer" as const]})));
    const settings={...defaultHelpSettings,phone:dedicated,days:[0,1,2,3,4,5,6],openHour:0,closeHour:24,teamIds:[uid],
      topics:[{id:randomUUID(),label:"Adoption",keywords:["adopt"],answer:"Approved adoption answer.",assigneeId:uid}]};
    await pool.query("INSERT INTO rescue_help_settings(tenant_id,phone,enabled,data) VALUES($1,$2,true,$3)",[tid,dedicated,settings]);
    assert.match(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),/Approved adoption answer/);
    const event="SM"+randomUUID().replaceAll("-","");
    assert.match(await helpInbound(tid,phone,event,"TEAM"),/inbox/);
    assert.equal(await helpInbound(tid,phone,event,"TEAM"),"");
    assert.equal(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),"","bot paused while waiting");
    const thread=(await pool.query("SELECT * FROM rescue_help_threads WHERE tenant_id=$1",[tid])).rows[0];
    assert.equal(thread.assignee_id,null,"category assignment must not silently claim a conversation");
    await pool.query("UPDATE rescue_help_threads SET status='resolved' WHERE id=$1",[thread.id]);
    assert.match(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),/Approved/);
    await pool.query("UPDATE tenants SET comms_paused=true WHERE id=$1",[tid]);
    assert.equal(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),"");
    await pool.query("UPDATE tenants SET comms_paused=false WHERE id=$1",[tid]);
    const app=express();app.use(express.urlencoded({extended:false}));app.use(express.json());
    app.use("/api/rescue-help-webhooks",helpWebhooks);
    app.use((req:any,_res,next)=>{
      req.tenant={id:req.get("test-other")?other:tid};
      req.user={id:req.get("test-outsider")?cid:req.get("test-second")?second:uid,tenantId:req.tenant.id,roles:[req.get("test-admin")?"admin":"volunteer"],isActive:true};
      next();
    });app.use("/api/rescue-help",router);
    server=app.listen(0);const url=`http://127.0.0.1:${server.address().port}`;
    const call=(path:string,method="GET",body?:any,headers:any={})=>fetch(url+"/api/rescue-help"+path,{method,headers:{"content-type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal((await call("/threads")).status,200);
    assert.equal((await call("/threads","GET",undefined,{"test-outsider":"1"})).status,403);
    assert.equal((await call(`/threads/${thread.id}`,"GET",undefined,{"test-other":"1","test-admin":"1"})).status,404);
    assert.equal((await call("/settings","PUT",settings)).status,403);
    assert.equal((await call("/settings","PUT",{...settings,phone:"+12025550199"}, {"test-admin":"1"})).status,409);
    assert.equal((await call("/activate","POST",{},{"test-admin":"1"})).status,409,"workspace activation prohibited");
    const requestId=randomUUID();
    assert.equal((await call(`/threads/${thread.id}/messages`,"POST",{kind:"note",body:"Internal only",requestId})).status,200);
    await call(`/threads/${thread.id}/messages`,"POST",{kind:"note",body:"Internal only",requestId});
    assert.equal((await pool.query("SELECT count(*)::int n FROM rescue_help_messages WHERE request_id=$1",[requestId])).rows[0].n,1);
    const payload={To:dedicated,From:"+12025550124",Body:"TEAM",AccountSid:sid,MessageSid:"SM"+randomUUID().replaceAll("-","")};
    assert.equal((await fetch(url+"/api/rescue-help-webhooks/sms",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(payload)})).status,403);
    const signature=twilio.getExpectedTwilioSignature(secret,`${getAppBaseUrl().replace(/\/$/,"")}/api/rescue-help-webhooks/sms`,payload);
    const response=await fetch(url+"/api/rescue-help-webhooks/sms",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","X-Twilio-Signature":signature},body:new URLSearchParams(payload)});
    assert.equal(response.status,200);assert.match(await response.text(),/<Message>/);

    const multi={...settings,teamIds:[uid,second],topics:[{...settings.topics[0],assigneeId:null,assigneeIds:[uid,second]}]};
    assert.equal((await call("/settings","PUT",multi,{"test-admin":"1"})).status,200);
    assert.equal((await call("/settings","PUT",settings,{"test-admin":"1"})).status,409,"stale single-owner editor cannot erase multi-person team");
    const saved=(await call("/settings").then(r=>r.json())).settings;
    assert.deepEqual(saved.topics[0].assigneeIds,[uid,second]);

    await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"TEAM");
    assert.equal((await pool.query("SELECT count(*)::int n FROM rescue_help_alerts WHERE thread_id=$1",[thread.id])).rows[0].n,2);
    const sent:any[]=[];
    const fakeSend:any=async(...args:any[])=>{sent.push(args);return {status:"sent",sid:"SMtest"};};
    const scopedDb:any={
      connect:()=>pool.connect(),
      query:(sql:string,params?:any[])=>sql.startsWith("SELECT thread_id,user_id") ?
        pool.query(sql.replace("ORDER BY due_at","AND tenant_id=$1 ORDER BY due_at"),[tid]) : pool.query(sql,params),
    };
    await pool.query("UPDATE rescue_help_alerts SET due_at=now()-interval '1 minute' WHERE thread_id=$1",[thread.id]);
    await Promise.all([processHelpAlerts(scopedDb,fakeSend,()=> "https://example.test"),processHelpAlerts(scopedDb,fakeSend,()=> "https://example.test")]);
    assert.equal(sent.length,2,"concurrent alert workers send once per category volunteer");
    assert.match(sent[0][2],new RegExp(`thread=${thread.id}`));
    assert.doesNotMatch(sent[0][2],/12025550123|Approved adoption answer/);
    assert.deepEqual(sent[0][4],{publicHelpNumber:true},"quiet hours and suppression are not bypassed");
    await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"another message");
    assert.equal((await pool.query("SELECT bool_and(due_at>now()+interval '4 minutes') AS grouped FROM rescue_help_alerts WHERE thread_id=$1",[thread.id])).rows[0].grouped,true);

    const claims=await Promise.all([
      call(`/threads/${thread.id}/claim`,"POST",{}),
      call(`/threads/${thread.id}/claim`,"POST",{},{"test-second":"1"}),
    ]);
    assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);
    const winner=claims[0].status===200 ? uid : second;
    const winnerHeaders=winner===uid ? {} : {"test-second":"1"};
    const loserHeaders=winner===uid ? {"test-second":"1"} : {};
    assert.equal((await call(`/threads/${thread.id}/messages`,"POST",{kind:"outbound",body:"Do not actually send",requestId:randomUUID()},loserHeaders)).status,403);
    assert.equal((await call(`/threads/${thread.id}/update`,"POST",{assigneeId:null,status:"waiting"},loserHeaders)).status,403);
    await pool.query("UPDATE rescue_help_threads SET foster_welcome=true WHERE id=$1",[thread.id]);
    await helpInbound(tid,phone,"MM"+randomUUID().replaceAll("-",""),"",undefined,1);
    assert.equal((await pool.query("SELECT assignee_id FROM rescue_help_threads WHERE id=$1",[thread.id])).rows[0].assignee_id,winner,"screenshot must preserve claimant");
    await pool.query("UPDATE rescue_help_alerts SET due_at=now()-interval '1 minute' WHERE thread_id=$1",[thread.id]);
    sent.length=0;
    await processHelpAlerts(scopedDb,fakeSend,()=> "https://example.test");
    assert.equal(sent.length,1,"after claiming only the owner receives alerts");
    assert.equal((await call(`/threads/${thread.id}/update`,"POST",{assigneeId:null,status:"waiting"},winnerHeaders)).status,200);
    assert.equal((await pool.query("SELECT assignee_id FROM rescue_help_threads WHERE id=$1",[thread.id])).rows[0].assignee_id,null);

    await pool.query("UPDATE rescue_help_alerts SET due_at=now()-interval '1 minute' WHERE thread_id=$1",[thread.id]);
    sent.length=0;
    await processHelpAlerts(scopedDb,(async()=>({status:"failed",error:"SMS blocked: quiet hours"})) as any,()=> "https://example.test");
    assert.equal((await pool.query("SELECT bool_and(status='pending' AND due_at>now()) AS deferred FROM rescue_help_alerts WHERE thread_id=$1",[thread.id])).rows[0].deferred,true);
    await pool.query("UPDATE rescue_help_alerts SET due_at=now()-interval '1 minute' WHERE thread_id=$1",[thread.id]);
    await pool.query("UPDATE users SET sms_opt_out_at=now() WHERE id=$1",[second]);
    await processHelpAlerts(scopedDb,(async()=>{sent.push(true);return {uncertain:true,error:"timeout"};}) as any,()=> "https://example.test");
    assert.equal(sent.length,1,"opted-out volunteer is not contacted");
    assert.equal((await pool.query("SELECT status FROM rescue_help_alerts WHERE thread_id=$1 AND user_id=$2",[thread.id,uid])).rows[0].status,"unknown");
    sent.length=0;
    await processHelpAlerts(scopedDb,fakeSend,()=> "https://example.test");
    assert.equal(sent.length,0,"uncertain sends are not retried");

    assert.equal((await call("/disable","POST",{},{"test-admin":"1"})).status,200);
    assert.equal(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),"");
  }finally{
    server?.close();
    await db.delete(tenants).where(eq(tenants.id,tid));await db.delete(tenants).where(eq(tenants.id,other));
    await pool.end();
  }
});
