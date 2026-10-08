import assert from "node:assert/strict";
import { test } from "node:test";
import { canSendHoldHarmless, holdHarmlessActionIds } from "./hold-harmless-access";

test("ungranted volunteers cannot send, regardless of default volunteer page visibility", () => {
  assert.equal(canSendHoldHarmless("volunteer", []), false);
  assert.deepEqual(holdHarmlessActionIds(["send-hold-harmless"], "volunteer", []), []);
});

test("dedicated individual permission adds only sending when tenant favorites hide it", () => {
  const grants = [{ pageId: "send-hold-harmless" }];
  assert.equal(canSendHoldHarmless("volunteer", grants), true);
  assert.deepEqual(holdHarmlessActionIds([], "volunteer", grants), ["send-hold-harmless"]);
  assert.deepEqual(holdHarmlessActionIds(["calendar"], "volunteer", grants), ["calendar", "send-hold-harmless"]);
});

test("revocation removes sending even if tenant favorites include it", () => {
  assert.deepEqual(holdHarmlessActionIds(["calendar", "send-hold-harmless"], "volunteer", []), ["calendar"]);
});

test("existing writers and individual volunteer-management/pipeline grantees remain allowed", () => {
  for (const role of ["platform_admin", "owner", "admin", "board_member", "staff"]) {
    assert.equal(canSendHoldHarmless(role, []), true);
  }
  for (const pageId of ["volunteers", "volunteer-pipeline"]) {
    assert.equal(canSendHoldHarmless("volunteer", [{ pageId }]), true);
  }
});

test("unrelated grants, no authenticated role, and duplicate configured actions are safe", () => {
  assert.equal(canSendHoldHarmless("volunteer", [{ pageId: "calendar" }]), false);
  assert.equal(canSendHoldHarmless(undefined, [{ pageId: "send-hold-harmless" }]), false);
  assert.deepEqual(holdHarmlessActionIds(["send-hold-harmless", "send-hold-harmless"], "staff", []), ["send-hold-harmless"]);
});
