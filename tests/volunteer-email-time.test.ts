import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVolunteerEmailTimezone, volunteerEmailDate, volunteerEmailTime } from "../server/lib/volunteer-email-time";

test("Haseya's October shifts display Central time rather than UTC server time", () => {
  const timezone = resolveVolunteerEmailTimezone("America/Chicago");
  assert.equal(volunteerEmailTime(new Date("2026-10-19T13:00:00Z"), timezone), "8:00 AM CDT");
  assert.equal(volunteerEmailTime(new Date("2026-10-19T16:00:00Z"), timezone), "11:00 AM CDT");
  assert.equal(volunteerEmailTime(new Date("2026-10-19T21:00:00Z"), timezone), "4:00 PM CDT");
  assert.equal(volunteerEmailTime(new Date("2026-10-19T23:00:00Z"), timezone), "6:00 PM CDT");
});

test("winter shifts use CST, not a fixed UTC offset", () => {
  for (const [utc, expected] of [["14:00", "8:00 AM CST"], ["17:00", "11:00 AM CST"], ["22:00", "4:00 PM CST"]] as const) {
    assert.equal(volunteerEmailTime(new Date(`2026-12-01T${utc}:00Z`), "America/Chicago"), expected);
  }
  assert.equal(volunteerEmailTime(new Date("2026-12-02T00:00:00Z"), "America/Chicago"), "6:00 PM CST");
});

test("email date stays on the tenant's day across UTC midnight", () => {
  assert.equal(volunteerEmailDate(new Date("2026-10-20T01:00:00Z"), "America/Chicago"), "2026-10-19");
  assert.equal(volunteerEmailDate(new Date("2026-12-02T00:00:00Z"), "America/Chicago"), "2026-12-01");
});

test("invalid and missing tenant timezones use a valid fallback", () => {
  assert.equal(resolveVolunteerEmailTimezone("bad/timezone"), resolveVolunteerEmailTimezone(null));
  assert.equal(resolveVolunteerEmailTimezone("America/New_York"), "America/New_York");
});
