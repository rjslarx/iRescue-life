import test from "node:test";
import assert from "node:assert/strict";
import { contestantUrl } from "../client/src/lib/contestShare";

test("staff links use tenant path on shared platform host", () => {
  (globalThis as any).window = { location: { href: "https://irescue.life/acme/dashboard/fundraising" } };
  assert.equal(
    contestantUrl("photo-contest", "entrant-id", "acme"),
    "https://irescue.life/acme/contest/photo-contest?entrant=entrant-id",
  );
});

test("staff links use root route on tenant subdomains and custom domains", () => {
  (globalThis as any).window = { location: { href: "https://acme.irescue.life/dashboard" } };
  assert.equal(contestantUrl("spring", "123", "acme"), "https://acme.irescue.life/contest/spring?entrant=123");
  (globalThis as any).window = { location: { href: "https://rescue.example/dashboard" } };
  assert.equal(contestantUrl("spring", "123", "acme"), "https://rescue.example/contest/spring?entrant=123");
});

test("public links retain current tenant route and unrelated query parameters", () => {
  (globalThis as any).window = { location: { href: "https://irescue.life/acme/contest/spring?voted=success&source=email&entrant=old#top" } };
  assert.equal(
    contestantUrl("spring", "new", undefined, true),
    "https://irescue.life/acme/contest/spring?source=email&entrant=new",
  );
});