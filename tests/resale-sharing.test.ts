import { test } from "node:test";
import assert from "node:assert/strict";
import { resaleListingText, resaleListingUrl } from "../shared/resale-sharing";

test("share links preserve tenant paths and contain only the public item ID", () => {
  assert.equal(resaleListingUrl("https://example.org", "", "abc"), "https://example.org/rescue-resale?item=abc");
  assert.equal(resaleListingUrl("https://example.org", "/rescue", "abc"), "https://example.org/rescue/rescue-resale?item=abc");
  const link = new URL(resaleListingUrl("https://example.org?token=secret&order=private", "/rescue", "a&b"));
  assert.deepEqual([...link.searchParams], [["item", "a&b"]]);
});

test("listing copy describes price, pickup and donation proceeds without donor identity", () => {
  const item = { title: "Chair", description: "Wooden chair", askingCents: 2500, zip: "12345", donorPhone: "private phone", donorEmail: "private email" };
  const text = resaleListingText(item, "Happy Pets", "https://example.org/rescue-resale?item=abc");
  assert.match(text, /Chair — \$25\.00/);
  assert.match(text, /Local pickup · ZIP 12345/);
  assert.match(text, /All net proceeds support Happy Pets/);
  assert.doesNotMatch(text, /private phone|private email/);
  assert.match(text, /item=abc$/);
  const split = resaleListingText({ ...item, proceedsMode: "split_50" }, "Happy Pets", "https://example.org");
  assert.match(split, /Half of net proceeds supports Happy Pets; half goes to the contributor/);
  assert.doesNotMatch(split, /All net proceeds/);
});
