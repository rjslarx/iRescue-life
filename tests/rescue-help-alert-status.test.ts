import { test } from "node:test";
import assert from "node:assert/strict";
import { helpAlertStatus } from "../shared/rescue-help-alert-status";

test("admin alert labels distinguish acceptance, uncertainty, deferrals and skips", () => {
  assert.match(helpAlertStatus("accepted",null),/delivery not confirmed/);
  for (const status of ["sending","unknown"]) assert.match(helpAlertStatus(status,null),/uncertain.*no automatic retry/);
  assert.match(helpAlertStatus("pending","quiet_hours"),/Deferred.*quiet hours/);
  assert.match(helpAlertStatus("pending","communications_paused"),/paused/);
  assert.match(helpAlertStatus("pending","line_inactive"),/inactive/);
  assert.match(helpAlertStatus("pending",null),/Pending/);
  assert.match(helpAlertStatus("skipped","opt_out"),/opt-out/);
  assert.match(helpAlertStatus("skipped","missing_number"),/missing or invalid/);
  assert.match(helpAlertStatus("skipped",null),/reason not recorded/);
  assert.match(helpAlertStatus("failed",null),/Failed/);
  assert.equal(helpAlertStatus("unexpected","private provider content"),"Status unavailable");
});
