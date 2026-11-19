import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import express from "express";
import twilio from "twilio";
import {pool,db} from "../server/db";
import {tenants,users} from "../shared/schema";
import {eq} from "drizzle-orm";
import {defaultHelpSettings} from "../shared/rescue-help";
import {helpCallRoutes,helpCallWebhooks} from "../server/routes/rescueHelpCalls";
import {callWebhookBase,realCallDeps,type CallDeps} from "../server/services/rescue-help-calls";
import {isUsCallPhone} from "../server/services/rescue-help-call-policy";
import {rescueHelpSchemaSql,rescueHelpCallsSchemaSql} from "../server/lib/rescue-help-schema";

test("callbacks exclude non-US and premium numbers and are disabled in workspace",()=>{
  assert.equal(isUsCallPhone("+12025550100"),true);
  for(const phone of ["private:CA123","+442079460000","+14165550100","+19005550100","+18005550100","+12425550100"])
    assert.equal(isUsCallPhone(phone),false,phone);
  assert.equal(realCallDeps.allowCalls(),false);
});

test("callback journey uses press-1, tenant permissions, durable idempotency and signed callbacks",
  {skip:process.env.RUN_RESALE_DB_TEST!=="1"},async()=>{
  const tid=randomUUID(),other=randomUUID(),uid=randomUUID(),second=randomUUID(),admin=randomUUID();
  const accountSid="AC"+"a".repeat(32),authToken="test-callback-signature-only";
  const from="+12025550197",staff="+12025550100",caller="+12025550123";
  const config={accountSid,authToken,phoneNumber:"+12025550199"};
  const settings={...defaultHelpSettings,phone:from,teamIds:[uid,second]};
  let server:any,mode="ok";
  const created:any[]=[];
  const deps:CallDeps={
    allowCalls:()=>true,config:async()=>config,verifyNumber:async()=>true,
    create:async(_config,options)=>{
      created.push(options);
      if(mode==="timeout") throw new Error("timeout");
      if(mode==="rejected") throw Object.assign(new Error("rejected"),{status:400});
      return {sid:"CA"+randomUUID().replaceAll("-","")};
    },
  };
  try {
    // Exercise an upgrade in an isolated transactional schema, never dropping
    // an actual inbox table or touching existing tenant data.
    const upgrade=await pool.connect();
    try {
      await upgrade.query("BEGIN");
      const schema=`callback_upgrade_${randomUUID().replaceAll("-","")}`;
      await upgrade.query(`CREATE SCHEMA "${schema}"`);
      await upgrade.query(`SET LOCAL search_path TO "${schema}"`);
      await upgrade.query("CREATE TABLE tenants(id uuid PRIMARY KEY); CREATE TABLE users(id uuid PRIMARY KEY)");
      await upgrade.query(rescueHelpSchemaSql.replace(rescueHelpCallsSchemaSql,""));
      assert.equal((await upgrade.query("SELECT to_regclass('rescue_help_calls') AS name")).rows[0].name,null);
      await upgrade.query("INSERT INTO tenants(id) VALUES($1)",[tid]);
      await upgrade.query("INSERT INTO users(id) VALUES($1)",[uid]);
      const oldThread=randomUUID();
      await upgrade.query("INSERT INTO rescue_help_threads(id,tenant_id,phone) VALUES($1,$2,$3)",[oldThread,tid,caller]);
      await upgrade.query(rescueHelpSchemaSql);
      await upgrade.query(rescueHelpSchemaSql);
      assert.equal((await upgrade.query("SELECT count(*)::int n FROM rescue_help_threads")).rows[0].n,1);
      assert.equal((await upgrade.query("SELECT count(*)::int n FROM pg_indexes WHERE schemaname=$1 AND tablename='rescue_help_calls'",[schema])).rows[0].n,4);
      await upgrade.query(`INSERT INTO rescue_help_calls(id,tenant_id,thread_id,user_id,request_id,account_sid,from_phone,staff_phone,caller_phone,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,[randomUUID(),tid,oldThread,uid,randomUUID(),accountSid,from,staff,caller]);
      assert.equal((await upgrade.query("SELECT count(*)::int n FROM rescue_help_calls")).rows[0].n,1);
    } finally {await upgrade.query("ROLLBACK");upgrade.release();}
    // Use exactly the application's existing provisioning path for the test DB.
    await pool.query(rescueHelpSchemaSql);
    await db.insert(tenants).values([{id:tid,name:"Callback test",subdomain:`call-${tid}`},{id:other,name:"Other",subdomain:`call-${other}`}]);
    await db.insert(users).values([uid,second,admin].map((id,i)=>({id,tenantId:tid,email:`${id}@example.test`,
      fullName:`Callback person ${i}`,passwordHash:"not-a-login",phone:i===0?null:`+1202555010${i}`,roles:[i===2?"admin" as const:"volunteer" as const]})));
    await pool.query("INSERT INTO contacts(tenant_id,user_id,name,email,phone) VALUES($1,$2,'Linked callback person',$3,$4)",[tid,uid,`${uid}@example.test`,staff]);
    await pool.query("INSERT INTO rescue_help_settings(tenant_id,phone,enabled,data) VALUES($1,$2,true,$3)",[tid,from,settings]);
    const newThread=async(phone=caller)=>{
      const id=randomUUID();
      await pool.query("INSERT INTO rescue_help_threads(id,tenant_id,phone,assignee_id,status) VALUES($1,$2,$3,$4,'human')",[id,tid,phone,uid]);
      return id;
    };
    let n=30;
    const nextThread=()=>newThread(`+120255501${n++}`);
    const app=express();app.use(express.json());app.use(express.urlencoded({extended:false}));
    app.use("/api/rescue-help-webhooks/calls",helpCallWebhooks(deps));
    app.use((req:any,_res,next)=>{
      req.tenant={id:req.get("other")?other:tid};
      req.user={id:req.get("user")||uid};next();
    });
    app.use("/api/rescue-help",helpCallRoutes(deps));
    server=app.listen(0);const origin=`http://127.0.0.1:${server.address().port}`;
    const request=(thread:string,method="GET",body?:any,headers:any={})=>fetch(`${origin}/api/rescue-help/threads/${thread}/calls`,{
      method,headers:{"content-type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});
    const row=async(id:string)=>(await pool.query("SELECT * FROM rescue_help_calls WHERE id=$1",[id])).rows[0];
    const postHook=async(id:string,event:string,fields:any={},signed=true)=>{
      const attempt=await row(id);
      const payload={AccountSid:accountSid,CallSid:attempt.staff_sid || "CA"+"b".repeat(32),
        From:attempt.from_phone,To:attempt.staff_phone,CallStatus:"in-progress",...fields};
      const path=`/${id}/${event}`;
      const signature=twilio.getExpectedTwilioSignature(authToken,callWebhookBase()+path,payload);
      return fetch(`${origin}/api/rescue-help-webhooks/calls${path}`,{method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded",...(signed?{"X-Twilio-Signature":signature}:{})},
        body:new URLSearchParams(payload)});
    };
    const tid1=await newThread();
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()},{user:second})).status,403);
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()},{other:"1"})).status,404);
    assert.equal((await request(tid1,"POST",{requestId:randomUUID(),to:"+12025550111"})).status,400);
    const preview=await request(tid1).then(r=>r.json());
    assert.equal(preview.staffPhone,staff,"explicitly linked contact number is used");
    const reqId=randomUUID();
    const starts=await Promise.all([request(tid1,"POST",{requestId:reqId}),request(tid1,"POST",{requestId:reqId})]);
    assert.deepEqual(starts.map(r=>r.status),[200,200]);
    const attempt=await starts[0].json();
    assert.equal(created.length,1);
    assert.equal(created[0].from,from);assert.equal(created[0].to,staff);
    assert.equal(created[0].record,false);
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()})).status,409);
    assert.equal((await postHook(attempt.id,"prompt",{},false)).status,403);
    assert.equal((await postHook(attempt.id,"prompt",{AccountSid:"AC"+"d".repeat(32)})).status,403);
    assert.equal((await postHook(attempt.id,"prompt",{CallSid:"CA"+"d".repeat(32)})).status,403);
    const prompt=await postHook(attempt.id,"prompt").then(r=>r.text());
    assert.match(prompt,/<Gather/);assert.match(prompt,/input="dtmf"/);assert.doesNotMatch(prompt,/<Dial/);
    const confirms=await Promise.all([postHook(attempt.id,"confirm",{Digits:"1"}),postHook(attempt.id,"confirm",{Digits:"1"})]);
    const xml=await Promise.all(confirms.map(r=>r.text()));
    assert.equal(xml.filter(s=>s.includes("<Dial")).length,1,"only one confirm may emit Dial");
    assert.match(xml.join(""),new RegExp(`callerId="${from.replace("+","\\+")}"`));
    assert.match(xml.join(""),/record="do-not-record"/);
    const child="CA"+"c".repeat(32);
    assert.equal((await postHook(attempt.id,"caller-status",{CallSid:child,ParentCallSid:(await row(attempt.id)).staff_sid,From:from,To:caller,CallStatus:"ringing"})).status,200);
    assert.equal((await row(attempt.id)).status,"ringing_caller");
    await postHook(attempt.id,"staff-status",{CallStatus:"ringing"});
    assert.equal((await row(attempt.id)).status,"ringing_caller","late staff event must not regress caller state");
    await postHook(attempt.id,"staff-status",{CallStatus:"completed"});
    await postHook(attempt.id,"dial-result",{DialCallSid:child,DialCallStatus:"completed"});
    assert.equal((await row(attempt.id)).status,"completed");
    assert.equal((await row(attempt.id)).active,false);
    await postHook(attempt.id,"caller-status",{CallSid:child,ParentCallSid:(await row(attempt.id)).staff_sid,From:from,To:caller,CallStatus:"ringing"});
    assert.equal((await row(attempt.id)).status,"completed");
    const history=await request(tid1).then(r=>r.json());
    assert.deepEqual(Object.keys(history.calls[0]).sort(),["id","initiatedBy","status","active","createdAt"].sort());

    // A voicemail answering the staff leg never gets connected without a keypress.
    for(const digits of ["","2"]) {
      const thread=await nextThread();
      const a=await request(thread,"POST",{requestId:randomUUID()}).then(r=>r.json());
      await postHook(a.id,"prompt");
      assert.doesNotMatch(await postHook(a.id,"confirm",{Digits:digits}).then(r=>r.text()),/<Dial/);
      assert.equal((await row(a.id)).status,digits?"declined":"no_confirmation");
    }
    const expiredThread=await nextThread();
    const exp=await request(expiredThread,"POST",{requestId:randomUUID()}).then(r=>r.json());
    await pool.query("UPDATE rescue_help_calls SET expires_at=now()-interval '1 second' WHERE id=$1",[exp.id]);
    assert.doesNotMatch(await postHook(exp.id,"prompt").then(r=>r.text()),/<Gather|<Dial/);
    assert.equal((await row(exp.id)).status,"expired");

    const pausedThread=await nextThread();
    const paused=await request(pausedThread,"POST",{requestId:randomUUID()}).then(r=>r.json());
    await postHook(paused.id,"prompt");
    await pool.query("UPDATE tenants SET comms_paused=true WHERE id=$1",[tid]);
    assert.doesNotMatch(await postHook(paused.id,"confirm",{Digits:"1"}).then(r=>r.text()),/<Dial/);
    assert.equal((await row(paused.id)).status,"blocked");
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()})).status,409);
    await pool.query("UPDATE tenants SET comms_paused=false WHERE id=$1",[tid]);
    mode="timeout";
    const timeoutThread=await nextThread();
    const unknown=await request(timeoutThread,"POST",{requestId:randomUUID()}).then(r=>r.json());
    assert.equal(unknown.status,"unknown");
    const count=created.length;
    assert.equal((await request(timeoutThread,"POST",{requestId:randomUUID()})).status,409);
    assert.equal(created.length,count);
    // Six successful attempt reservations exhaust this user's hourly budget.
    assert.equal((await request(await nextThread(),"POST",{requestId:randomUUID()})).status,429);
    mode="rejected";
    const rejected=await request(await nextThread(),"POST",{requestId:randomUUID()},{user:admin}).then(r=>r.json());
    assert.equal(rejected.status,"failed");
    assert.equal((await row(rejected.id)).active,false);
    mode="ok";
    await pool.query("UPDATE users SET sms_opt_out_at=now() WHERE id=$1",[admin]);
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()},{user:admin})).status,409);
    await pool.query("UPDATE users SET sms_opt_out_at=NULL,is_active=false WHERE id=$1",[admin]);
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()},{user:admin})).status,403);
    await pool.query("UPDATE users SET is_active=true WHERE id=$1",[admin]);
    await pool.query("INSERT INTO sms_phone_suppressions(tenant_id,phone_key,suppressed) VALUES($1,$2,true)",[tid,caller.replace("+","")]);
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()},{user:admin})).status,409);
    await pool.query("UPDATE rescue_help_settings SET enabled=false WHERE tenant_id=$1",[tid]);
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()},{user:admin})).status,409);
    await pool.query("UPDATE rescue_help_settings SET enabled=true WHERE tenant_id=$1",[tid]);
    await pool.query("DELETE FROM sms_phone_suppressions WHERE tenant_id=$1",[tid]);
    // Start with a fresh rate window for additional connection-gate checks.
    await pool.query("UPDATE rescue_help_calls SET created_at=now()-interval '2 hours' WHERE tenant_id=$1",[tid]);
    const revokeThread=await nextThread();
    const revoked=await request(revokeThread,"POST",{requestId:randomUUID()}).then(r=>r.json());
    await postHook(revoked.id,"prompt");
    await pool.query("UPDATE rescue_help_threads SET assignee_id=$2 WHERE id=$1",[revokeThread,second]);
    assert.doesNotMatch(await postHook(revoked.id,"confirm",{Digits:"1"}).then(r=>r.text()),/<Dial/);
    assert.equal((await row(revoked.id)).status,"blocked","claim lost before confirmation");
    // An unambiguous contact fallback is required; never guess between profiles.
    await pool.query("INSERT INTO contacts(tenant_id,user_id,name,email,phone) VALUES($1,$2,'Conflicting contact',$3,'+12025550112')",
      [tid,uid,`${randomUUID()}@example.test`]);
    assert.equal((await request(await nextThread(),"POST",{requestId:randomUUID()})).status,409);
    await pool.query("UPDATE users SET phone=$2 WHERE id=$1",[uid,staff]);
    const afterConflict=await request(await nextThread(),"POST",{requestId:randomUUID()}).then(r=>r.json());
    assert.equal(afterConflict.status,"starting","valid account phone overrides contact conflict");
    await postHook(afterConflict.id,"staff-status",{CallStatus:"busy"});
    assert.equal((await row(afterConflict.id)).status,"busy");
    assert.equal((await row(afterConflict.id)).active,false);
    // Tenant-wide limit is independent of the caller's per-person limit.
    await pool.query(`INSERT INTO rescue_help_calls(id,tenant_id,thread_id,user_id,request_id,account_sid,
      from_phone,staff_phone,caller_phone,status,active,expires_at)
      SELECT gen_random_uuid(),$1,$2,$3,gen_random_uuid(),$4,$5,$6,$7,'completed',false,now()
      FROM generate_series(1,30)`,[tid,tid1,second,accountSid,from,staff,caller]);
    assert.equal((await request(tid1,"POST",{requestId:randomUUID()},{user:admin})).status,429);
  } finally {
    server?.close();
    await db.delete(tenants).where(eq(tenants.id,tid));
    await db.delete(tenants).where(eq(tenants.id,other));
    await pool.end();
  }
});
