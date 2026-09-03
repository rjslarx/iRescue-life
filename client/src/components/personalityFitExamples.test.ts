import assert from "node:assert/strict";
import test from "node:test";
import {
  appendUniqueTag,
  insertBadgeExample,
  insertRevealExample,
  type BadgeDraft,
  type RevealDraft,
} from "./personalityFitExamples";

const badgeExample: BadgeDraft = {
  key: "",
  label: "Champion nap buddy",
  explanation: "Settles beside you while you read.",
};
const revealExample: RevealDraft = {
  title: "The fastest way to my heart",
  body: "Sit on the floor and offer a small treat.",
};

test("tag examples append to published tags without creating case-insensitive duplicates", () => {
  assert.equal(appendUniqueTag("Calm companion, Window watcher", "Treat motivated"), "Calm companion, Window watcher, Treat motivated");
  assert.equal(appendUniqueTag("Calm companion, treat MOTIVATED", "Treat motivated"), "Calm companion, treat MOTIVATED");
});

test("badge examples fill only a fully empty row", () => {
  const partial = { key: "", label: "Contributor draft", explanation: "" };
  const empty = { key: "", label: " ", explanation: "" };
  const result = insertBadgeExample([partial, empty], badgeExample);

  assert.deepEqual(result, [partial, badgeExample]);
});

test("badge examples append when published and partial rows have no fully empty row", () => {
  const published = { key: "snuggler", label: "Expert snuggler", explanation: "Loves a quiet couch." };
  const partial = { key: "", label: "", explanation: "Contributor is still writing this." };
  assert.deepEqual(insertBadgeExample([published, partial], badgeExample), [published, partial, badgeExample]);
});

test("reveal examples fill only a fully empty row", () => {
  const partial = { title: "Contributor draft", body: "" };
  const empty = { title: "", body: " " };
  assert.deepEqual(insertRevealExample([partial, empty], revealExample), [partial, revealExample]);
});

test("reveal examples append when published and partial rows have no fully empty row", () => {
  const published = { title: "Bedtime", body: "Curls up under a blanket." };
  const partial = { title: "", body: "Contributor is still writing this." };
  assert.deepEqual(insertRevealExample([published, partial], revealExample), [published, partial, revealExample]);
});