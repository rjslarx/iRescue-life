import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteHelpVoicemail } from "../server/services/rescue-help-voicemail";

const sid = `RE${"a".repeat(32)}`;
function fixture(row: any = { kind: "voicemail", status: "received", recording_sid: sid }) {
  const events: string[] = [];
  const deps = {
    query: async (sql: string, params: string[]) => {
      assert.deepEqual(params, ["message", "tenant"]);
      assert.match(sql, /t.tenant_id=\$2/);
      if (sql.startsWith("SELECT")) { events.push("read"); return { rows: row ? [row] : [] }; }
      events.push("mark");
      assert.match(sql, /recording_sid=NULL,status='deleted'/);
      assert.doesNotMatch(sql, /DELETE FROM/);
      return { rows: [] };
    },
    removeRecording: async (tenant: string, recording: string) => {
      assert.equal(tenant, "tenant"); assert.equal(recording, sid);
      events.push("provider"); return true;
    },
  };
  return { deps, events };
}

test("non-admin cannot read or delete recordings", async () => {
  const { deps, events } = fixture();
  await assert.rejects(deleteHelpVoicemail("tenant", "message", false, deps), { status: 403 });
  assert.deepEqual(events, []);
});
test("missing, other-tenant and non-voicemail messages never reach provider", async () => {
  for (const row of [null, { kind: "inbound", recording_sid: sid }]) {
    const { deps, events } = fixture(row);
    await assert.rejects(deleteHelpVoicemail("tenant", "message", true, deps), { status: 404 });
    assert.deepEqual(events, ["read"]);
  }
});
test("provider removal precedes local tombstone and preserves conversation", async () => {
  const { deps, events } = fixture();
  await deleteHelpVoicemail("tenant", "message", true, deps);
  assert.deepEqual(events, ["read", "provider", "mark"]);
});
test("provider failures never falsely mark voicemail deleted", async () => {
  for (const error of [{ status: 401 }, { status: 500 }, { status: 404 }, new Error("timeout")]) {
    const { deps, events } = fixture();
    deps.removeRecording = async () => { throw error; };
    await assert.rejects(deleteHelpVoicemail("tenant", "message", true, deps), { status: 502 });
    assert.deepEqual(events, ["read"]);
  }
  const { deps, events } = fixture();
  deps.removeRecording = async () => false;
  await assert.rejects(deleteHelpVoicemail("tenant", "message", true, deps), { status: 502 });
  assert.deepEqual(events, ["read"]);
});
test("retries recover after remote deletion but lost local save", async () => {
  const { deps, events } = fixture();
  deps.removeRecording = async () => { throw { status: 404, code: 20404 }; };
  await deleteHelpVoicemail("tenant", "message", true, deps);
  assert.deepEqual(events, ["read", "mark"]);
});
test("already deleted requests are idempotent", async () => {
  const { deps, events } = fixture({ kind: "voicemail", status: "deleted", recording_sid: null });
  await deleteHelpVoicemail("tenant", "message", true, deps);
  assert.deepEqual(events, ["read"]);
});
