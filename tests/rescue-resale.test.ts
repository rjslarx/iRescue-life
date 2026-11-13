import { test } from "node:test";
import assert from "node:assert/strict";
import { resalePhone, resaleMessageAllowed, resaleItemSchema, resaleSettingsSchema, resaleCsvCell } from "../shared/rescue-resale";
import { allowedResaleMessages, blockedResaleMessages } from "./helpers/resale-message-cases";

test("resale phone verification normalizes US numbers and rejects ambiguous inputs", () => {
  assert.equal(resalePhone("(202) 555-0147"), "+12025550147");
  assert.equal(resalePhone("+1 202-555-0147"), "+12025550147");
  assert.throws(() => resalePhone("123"));
});
for (const [label, body] of blockedResaleMessages) {
  test(`resale policy rejects ${label}`, () => assert.equal(resaleMessageAllowed(body), false));
}
for (const [label, body] of allowedResaleMessages) {
  test(`resale policy allows ${label}`, () => assert.equal(resaleMessageAllowed(body), true));
}
test("resale schema rejects invalid prices, no ownership consent, and invalid pickup windows", () => {
  const item = { donorName: "Test donor", donorEmail: "test@example.com", zip: "70501", title: "Wooden chair",
    description: "A sturdy used wooden chair.", category: "Furniture", askingCents: 2500, minCents: 2000,
    photos: ["/objects/test"], fulfillment: ["shelter_meetup"], consent: true, ownership: true };
  assert.ok(resaleItemSchema.safeParse(item).success);
  for (const patch of [{ askingCents: 0 }, { askingCents: 1.5 }, { minCents: 2600 }, { ownership: false },
    { photos: [] }, { fulfillment: ["courier"] }]) assert.equal(resaleItemSchema.safeParse({ ...item, ...patch }).success, false);
  assert.equal(resaleSettingsSchema.safeParse({ pickupOptions: [{ id: "7a047169-cc01-4f21-9817-391a104fd267", label: "Shelter", kind: "shelter_meetup", address: "Approved public place", startsAt: "2027-01-01T12:00:00Z", endsAt: "2027-01-01T11:00:00Z" }] }).success, false);
  assert.equal(resaleCsvCell("=SUM(A1)"), "\"'=SUM(A1)\"");
});
