import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routes = readFileSync("server/routes.ts", "utf8");
const route = routes.slice(
  routes.indexOf("app.post('/api/forgot-password'"),
  routes.indexOf("app.post('/api/reset-password'"),
);

test("tenant password reset trims and matches email without case sensitivity", () => {
  assert.match(route, /email: z\.string\(\)\.trim\(\)\.email\(\)/);
  assert.ok(route.includes("sql`lower(${users.email}) = lower(${email})`"));
  assert.ok(route.includes("eq(users.tenantId, req.tenant!.id)"));
  assert.ok(!route.includes("eq(users.email, email)"));
});

test("ambiguous matches fail closed and email uses the stored recipient", () => {
  assert.ok(route.includes(".limit(2)"));
  assert.ok(route.includes("matches.length !== 1"));
  assert.ok(route.includes("to: user.email"));
  assert.ok(route.includes("if (!sendResult.success)"));
  assert.ok(route.includes("crypto.randomBytes(32)"));
  assert.ok(route.includes("60 * 60 * 1000"));
});
