import { test } from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import { defaultHelpSettings, helpSettingsSchema, helpVoiceOptions } from "../shared/rescue-help";

test("only free basic voice overrides are accepted", () => {
  for (const voice of ["default", "man", "woman"]) {
    assert.equal(helpSettingsSchema.safeParse({ ...defaultHelpSettings, voice }).success, true);
  }
  for (const voice of ["Polly.Joanna", "alice", "", "<Say>"]) {
    assert.equal(helpSettingsSchema.safeParse({ ...defaultHelpSettings, voice }).success, false);
    assert.deepEqual(helpVoiceOptions(voice), {});
  }
  const { voice, ...legacy } = defaultHelpSettings;
  assert.equal(helpSettingsSchema.safeParse(legacy).success, true);
});

test("TwiML keeps the default unchanged or emits explicit basic US English", () => {
  for (const selection of [undefined, "default", "man", "woman"]) {
    const response = new twilio.twiml.VoiceResponse();
    response.say(helpVoiceOptions(selection), "Hello");
    const xml = response.toString();
    if (selection === "man" || selection === "woman") {
      assert.ok(xml.includes(`voice="${selection}"`));
      assert.ok(xml.includes('language="en-US"'));
    } else {
      assert.ok(xml.includes("<Say>Hello</Say>"));
    }
  }
});
