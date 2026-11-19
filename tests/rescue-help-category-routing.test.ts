import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultHelpSettings, helpRecipients, helpSettingsSchema } from "../shared/rescue-help";
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
