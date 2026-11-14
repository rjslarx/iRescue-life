import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { db,pool } from "../server/db";
import { tenants,users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { defaultHelpSettings,helpSettingsSchema,helpMatch,helpIsOpen } from "../shared/rescue-help";
import { rescueHelpSchemaSql } from "../server/lib/rescue-help-schema";
import { helpInbound } from "../server/services/rescue-help";
import router,{helpWebhooks} from "../server/routes/rescueHelp";
import { encrypt } from "../server/lib/encryption";
import twilio from "twilio";
import { getAppBaseUrl } from "../server/lib/app-base-url";

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

test("help inbox isolates tenants, pauses bot on handoff, dedupes inbound and verifies signatures", {skip:process.env.RUN_RESALE_DB_TEST!=="1"},async()=>{
  const tid=randomUUID(),other=randomUUID(),uid=randomUUID(),cid=randomUUID();
  const phone="+12025550123",dedicated="+12025550198",sid="AC"+"a".repeat(32),secret="test-only-not-a-real-secret";
  let server:any;
  try{
    await pool.query(rescueHelpSchemaSql);
    await db.insert(tenants).values([{id:tid,name:"Help test",subdomain:`help-${tid}`,twilioEnabled:true,
      twilioPhoneNumber:"+12025550199",twilioAccountSidEncrypted:encrypt(sid),twilioAuthTokenEncrypted:encrypt(secret)},
      {id:other,name:"Other test",subdomain:`help-${other}`}]);
    await db.insert(users).values({id:uid,tenantId:tid,email:`${uid}@example.test`,fullName:"Test volunteer",passwordHash:"test-only",roles:["volunteer"]});
    const settings={...defaultHelpSettings,phone:dedicated,days:[0,1,2,3,4,5,6],openHour:0,closeHour:24,teamIds:[uid],
      topics:[{id:randomUUID(),label:"Adoption",keywords:["adopt"],answer:"Approved adoption answer.",assigneeId:uid}]};
    await pool.query("INSERT INTO rescue_help_settings(tenant_id,phone,enabled,data) VALUES($1,$2,true,$3)",[tid,dedicated,settings]);
    assert.match(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),/Approved adoption answer/);
    const event="SM"+randomUUID().replaceAll("-","");
    assert.match(await helpInbound(tid,phone,event,"TEAM"),/inbox/);
    assert.equal(await helpInbound(tid,phone,event,"TEAM"),"");
    assert.equal(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),"","bot paused while waiting");
    const thread=(await pool.query("SELECT * FROM rescue_help_threads WHERE tenant_id=$1",[tid])).rows[0];
    assert.equal(thread.assignee_id,uid);
    await pool.query("UPDATE rescue_help_threads SET status='resolved' WHERE id=$1",[thread.id]);
    assert.match(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),/Approved/);
    await pool.query("UPDATE tenants SET comms_paused=true WHERE id=$1",[tid]);
    assert.equal(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),"");
    await pool.query("UPDATE tenants SET comms_paused=false WHERE id=$1",[tid]);
    const app=express();app.use(express.urlencoded({extended:false}));app.use(express.json());
    app.use("/api/rescue-help-webhooks",helpWebhooks);
    app.use((req:any,_res,next)=>{
      req.tenant={id:req.get("test-other")?other:tid};
      req.user={id:req.get("test-outsider")?cid:uid,tenantId:req.tenant.id,roles:[req.get("test-admin")?"admin":"volunteer"],isActive:true};
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
    assert.equal((await call("/disable","POST",{},{"test-admin":"1"})).status,200);
    assert.equal(await helpInbound(tid,phone,"SM"+randomUUID().replaceAll("-",""),"adopt"),"");
  }finally{
    server?.close();
    await db.delete(tenants).where(eq(tenants.id,tid));await db.delete(tenants).where(eq(tenants.id,other));
    await pool.end();
  }
});
