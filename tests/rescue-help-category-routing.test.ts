import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultHelpSettings, helpRecipients, helpSettingsSchema, canClaimHelp } from "../shared/rescue-help";
import { effectiveHelpSettings } from "../server/services/rescue-help-settings";

test("dedicated fallback never broadcasts unrelated messages or follows an unrelated claimant", () => {
  const fallback=randomUUID(),foster=randomUUID(),other=randomUUID();
  const s={...defaultHelpSettings,generalAssigneeId:fallback,teamIds:[fallback,foster,other],
    topics:[{id:randomUUID(),label:"Foster",answer:"Approved",keywords:["foster"],assigneeId:foster},
      {id:randomUUID(),label:"General",answer:"Approved",keywords:["general"],assigneeId:other},
      {id:randomUUID(),label:"Hours",answer:"Approved",keywords:["hours"],assigneeId:null}]};
  assert.equal(helpSettingsSchema.safeParse(s).success,true);
  for(const topic of [null,"Unknown","General","Hours"])
    assert.deepEqual(helpRecipients(s,{status:"waiting",topic,assignee_id:other}),[fallback]);
  assert.deepEqual(helpRecipients(s,{status:"waiting",topic:"Foster"}),[foster]);
  assert.deepEqual(helpRecipients(s,{status:"human",topic:"Foster",assignee_id:other}),[foster]);
  assert.deepEqual(helpRecipients(s,{status:"human",topic:"Foster",assignee_id:foster}),[foster]);
  assert.deepEqual(helpRecipients({...s,teamIds:[foster,other]},{status:"waiting",topic:null}),[]);
  assert.deepEqual(helpRecipients({...s,generalAssigneeId:null},{status:"waiting",topic:null}),[]);
  assert.equal(helpSettingsSchema.safeParse({...s,teamIds:[foster,other]}).success,false);
  assert.deepEqual(helpRecipients(s,{status:"resolved",topic:null}),[]);
});

test("Haseya default is tenant-scoped and can be explicitly replaced or disabled",()=>{
  const tenant="3a4c2321-6a54-41a4-acf3-a7f2ffe0c051";
  assert.equal(effectiveHelpSettings(tenant).generalAssigneeId,"f4436db3-eac8-457c-a674-69f4881717ee");
  assert.equal(effectiveHelpSettings(randomUUID()).generalAssigneeId,undefined);
  assert.equal(effectiveHelpSettings(tenant,{generalAssigneeId:null}).generalAssigneeId,null);
  const replacement=randomUUID();
  assert.equal(effectiveHelpSettings(tenant,{generalAssigneeId:replacement}).generalAssigneeId,replacement);
});

test("multiple general recipients share unclaimed work but only the claimant receives follow-ups",()=>{
  const first=randomUUID(),second=randomUUID(),unrelated=randomUUID();
  const s={...defaultHelpSettings,teamIds:[first,second,unrelated],generalAssigneeId:first,
    generalAssigneeIds:[first,second,first],
    topics:[{id:randomUUID(),label:"General",answer:"Hello",keywords:["general"],assigneeId:unrelated},
      {id:randomUUID(),label:"Foster",answer:"Hello",keywords:["foster"],assigneeId:unrelated}]};
  for(const topic of [null,"General","Uncategorized","Unknown"]) {
    const thread={status:"waiting",topic};
    assert.deepEqual(helpRecipients(s,thread),[first,second]);
    assert.equal(canClaimHelp(s,thread,first,false),true);
    assert.equal(canClaimHelp(s,thread,second,false),true);
    assert.equal(canClaimHelp(s,thread,unrelated,false),false);
    assert.deepEqual(helpRecipients(s,{...thread,assignee_id:second}),[second]);
    assert.deepEqual(helpRecipients(s,{...thread,status:"resolved"}),[]);
  }
  assert.deepEqual(helpRecipients(s,{status:"waiting",topic:"Foster"}),[unrelated]);
  assert.deepEqual(helpRecipients({...s,generalAssigneeIds:[]},{status:"waiting"}),[]);
  assert.equal(helpSettingsSchema.safeParse({...s,generalAssigneeIds:[randomUUID()]}).success,false);
});
