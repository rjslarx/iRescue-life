import { test } from "node:test";
import assert from "node:assert/strict";
import { rescuePhoneHtml } from "../server/lib/rescue-phone-html";
const html='<link rel="manifest" href="/manifest.json" /><meta name="apple-mobile-web-app-title" content="iRescue" />';
test("phone install metadata is available before JavaScript",()=>{
  const custom=rescuePhoneHtml(html,"https://rescue.example/phone");
  assert.match(custom,/href="\/phone.webmanifest"/);
  assert.match(custom,/content="Rescue Phone"/);
  assert.match(rescuePhoneHtml(html,"/haseyas/phone?thread=private"),/href="\/phone.webmanifest\?tenant=haseyas"/);
  assert.doesNotMatch(rescuePhoneHtml(html,"/haseyas/phone?thread=private"),/private/);
});
test("other pages keep their existing manifest",()=>{
  for(const path of ["/","/haseyas","/dashboard/rescue-inbox","/haseyas/animals"])
    assert.equal(rescuePhoneHtml(html,path),html);
});
