import { test } from "node:test";
import assert from "node:assert/strict";
import { helpRecipientPhone } from "../server/services/rescue-help-recipient-phone";

test("uses the account number first, then an unambiguous linked contact number",()=>{
  assert.equal(helpRecipientPhone("+12025550100",["2025550101"]),"+12025550100");
  assert.equal(helpRecipientPhone(null,["(202) 555-0101"]),"+12025550101");
  assert.equal(helpRecipientPhone("",["2025550101","+12025550101"]),"+12025550101");
  assert.equal(helpRecipientPhone(null,["2025550101","2025550102"]),null);
  assert.equal(helpRecipientPhone(null,[]),null);
  assert.equal(helpRecipientPhone("invalid",["2025550101"]),null);
});
