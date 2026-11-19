import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultHelpSettings, helpSettingsSchema, helpIsOpen, helpWeeklyHours } from "../shared/rescue-help";

test("legacy hours are preserved and shorter weekend hours use the rescue timezone", () => {
  const legacy = { ...defaultHelpSettings, openHour: 8, closeHour: 17 };
  assert.deepEqual(helpWeeklyHours(legacy), [null, ...Array.from({length:5},()=>({openHour:8,closeHour:17})), null]);
  const weeklyHours = Array.from({length:7},(_,day)=>({openHour:8,closeHour:[0,5,6].includes(day)?12:17}));
  const s = { ...legacy, weeklyHours };
  assert.equal(helpSettingsSchema.safeParse(s).success,true);
  for (const date of ["2026-11-20","2026-11-21","2026-11-22"]) {
    assert.equal(helpIsOpen(s,new Date(`${date}T13:59:59Z`)),false);
    assert.equal(helpIsOpen(s,new Date(`${date}T14:00:00Z`)),true);
    assert.equal(helpIsOpen(s,new Date(`${date}T17:59:59Z`)),true);
    assert.equal(helpIsOpen(s,new Date(`${date}T18:00:00Z`)),false);
  }
  assert.equal(helpIsOpen(s,new Date("2026-11-19T20:00:00Z")),true);
  // Summer uses CDT rather than CST; the user's browser timezone is irrelevant.
  assert.equal(helpIsOpen(s,new Date("2026-07-17T13:00:00Z")),true);
  assert.equal(helpIsOpen(s,new Date("2026-07-17T17:00:00Z")),false);
});

test("closed days, all-closed weeks, midnight and invalid schedules", () => {
  const closed = {...defaultHelpSettings,weeklyHours:Array(7).fill(null)};
  assert.equal(helpSettingsSchema.safeParse(closed).success,true);
  assert.equal(helpIsOpen(closed,new Date("2026-11-16T16:00:00Z")),false);
  const allDay = {...closed,weeklyHours:[{openHour:0,closeHour:24},...Array(6).fill(null)]};
  assert.equal(helpIsOpen(allDay,new Date("2026-11-23T05:59:59Z")),true);
  assert.equal(helpIsOpen(allDay,new Date("2026-11-23T06:00:00Z")),false);
  for (const hours of [
    [],Array(6).fill(null),Array(8).fill(null),
    [{openHour:12,closeHour:8},...Array(6).fill(null)],
    [{openHour:8,closeHour:8},...Array(6).fill(null)],
    [{openHour:-1,closeHour:12},...Array(6).fill(null)],
    [{openHour:8,closeHour:25},...Array(6).fill(null)],
  ]) assert.equal(helpSettingsSchema.safeParse({...closed,weeklyHours:hours}).success,false);
});
