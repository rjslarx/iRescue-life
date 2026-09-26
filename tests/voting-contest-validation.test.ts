import assert from "node:assert/strict";
import test from "node:test";
import { votingContestEntrantRequestSchema, votingContestImageSchema } from "../shared/voting-contest-validation";

test("entrant accepts the uploaded object path sent by the fundraiser hub", () => {
  const data = { name: "Munchkin", photoUrl: "/objects/tenant-id/uploads/photo.jpeg" };
  assert.deepEqual(votingContestEntrantRequestSchema.parse(data), data);
});

test("entrant supports optional photos and HTTP/HTTPS images", () => {
  for (const photoUrl of [undefined, "", "https://example.org/photo.jpg", "http://example.org/photo.jpg"]) {
    assert.equal(votingContestEntrantRequestSchema.safeParse({ name: "Munchkin", photoUrl }).success, true);
  }
});

test("entrant rejects blank names and invalid or unsafe image references", () => {
  assert.equal(votingContestEntrantRequestSchema.safeParse({ name: "   " }).success, false);
  for (const value of ["not a url", "//example.org/photo.jpg", "javascript:alert(1)", "data:image/png;base64,abc", "/objects/../secret", "/objects/", "/objects/\\evil"]) {
    assert.equal(votingContestImageSchema.safeParse(value).success, false, value);
  }
});