import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fosterPhone, fosterTopic, fosterWelcomeText } from "../shared/foster-welcome";
import { defaultHelpSettings } from "../shared/rescue-help";
import { deliverPendingFosterWelcomes, type WelcomeDeliveryDeps } from "../server/services/foster-welcome-delivery";
import { fetchHelpImage, helpImageType, MAX_HELP_IMAGE_BYTES } from "../server/services/rescue-help-media";

test("Foster category follows current assignment, without hardcoded people", () => {
  const settings = {...defaultHelpSettings, topics:[{id:"topic",label:" Foster ",keywords:[],answer:"",assigneeId:"current"}]};
  assert.equal(fosterTopic(settings)?.assigneeId,"current");
  settings.topics[0].assigneeId="replacement";
  assert.equal(fosterTopic(settings)?.assigneeId,"replacement");
  assert.equal(fosterTopic(defaultHelpSettings),undefined);
  assert.equal(fosterPhone("(337) 555-0100"),"+13375550100");
  assert.equal(fosterPhone("+1 337 555 0100"),"+13375550100");
  assert.equal(fosterPhone("invalid"),null);
  assert.match(fosterWelcomeText,/screenshot of your Facebook profile/);
  assert.match(fosterWelcomeText,/🐾 Welcome to the Haseya’s Family! ❤️/);
});

function fixture(result: any = {sid:"SMaccepted"}) {
  let claimed=false;
  const statuses: unknown[]=[];
  let sends=0;
  const deps: WelcomeDeliveryDeps = {
    query: async (sql,values) => {
      if(sql.startsWith("SELECT")) { assert.match(sql,/org.subdomain='haseyas'/); return {rows:[{id:"m",tenant_id:"h",phone:"+13375550100",body:"welcome"}]}; }
      if(sql.includes("RETURNING")) { if(claimed) return {rows:[]}; claimed=true; return {rows:[{id:"m"}]}; }
      if(values?.length===3) statuses.push(values[1]);
      if(sql.includes("status='unknown'") && values) statuses.push("unknown");
      return {rows:[]};
    },
    enabled: async()=>true,
    send: async()=>{sends++; if(result instanceof Error) throw result; return result;},
  };
  return {deps,statuses,sends:()=>sends};
}
test("concurrent dispatchers claim once and record accepted, not delivered",async()=>{
  const f=fixture();
  await Promise.all([deliverPendingFosterWelcomes(f.deps),deliverPendingFosterWelcomes(f.deps)]);
  assert.equal(f.sends(),1);
  assert.deepEqual(f.statuses,["accepted"]);
});
test("disabled inbox never sends; quiet hours defer; opt-outs fail; uncertainty never retries",async()=>{
  const off=fixture(); off.deps.enabled=async()=>false;
  await deliverPendingFosterWelcomes(off.deps); assert.equal(off.sends(),0);
  for(const [result,status] of [
    [{error:"SMS blocked: quiet hours"},"welcome_pending"],
    [{error:"Outbound communications are paused for this organization"},"welcome_pending"],
    [{error:"Recipient has opted out of SMS"},"failed"],
    [{uncertain:true,error:"timeout"},"unknown"],
    [new Error("timeout"),"unknown"],
  ] as const) {
    const f=fixture(result); await deliverPendingFosterWelcomes(f.deps);
    assert.deepEqual(f.statuses,[status]);
  }
});
test("approval integration is deployment-only, idempotent, and uses dedicated number",()=>{
  const service=readFileSync("server/services/foster-welcome.ts","utf8");
  assert.match(service,/REPLIT_DEPLOYMENT !== "1"/);
  assert.match(service,/ON CONFLICT\(request_id\) DO NOTHING/);
  assert.match(service,/publicHelpNumber:true,skipOrgPrefix:true/);
  assert.doesNotMatch(service,/bypassQuietHours:true/);
  const inbound=readFileSync("server/services/rescue-help.ts","utf8");
  assert.match(inbound,/thread.foster_welcome/);
  assert.match(inbound,/fosterTopic\(s\)/);
  const route=readFileSync("server/routes/rescueHelp.ts","utf8");
  assert.match(route,/t.tenant_id=\$2 AND m.kind='inbound'/);
  assert.match(route,/mediaCount/);
});
test("image proxy blocks unsupported content, oversized responses and credential leaks", async()=>{
  assert.equal(helpImageType("image/svg+xml"),false);
  assert.equal(helpImageType("image/jpeg"),true);
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response("html",{headers:{"content-type":"text/html"}});
    await assert.rejects(fetchHelpImage("https://api.twilio.com/test","Basic test"));
    globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:"https://attacker.example/test"}});
    await assert.rejects(fetchHelpImage("https://api.twilio.com/test","Basic test"),/redirect/);
    globalThis.fetch=async()=>new Response("big",{headers:{"content-type":"image/png","content-length":String(MAX_HELP_IMAGE_BYTES+1)}});
    await assert.rejects(fetchHelpImage("https://api.twilio.com/test","Basic test"));
    let calls=0;
    globalThis.fetch=async(_url,options)=>{
      if(calls++===0) return new Response(null,{status:302,headers:{location:"https://media.twiliocdn.com/test"}});
      assert.equal(options?.headers,undefined);
      return new Response("image",{headers:{"content-type":"image/png"}});
    };
    assert.equal((await fetchHelpImage("https://api.twilio.com/test","Basic test")).bytes.toString(),"image");
  } finally { globalThis.fetch=original; }
});
