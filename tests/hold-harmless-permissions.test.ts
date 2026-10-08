import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const source = readFileSync("server/middleware/auth.ts", "utf8");
const guardSource = source.slice(source.indexOf("export function requireRoleOrPageAccess("), source.indexOf("export function requireProTier(")).replace("export function", "function");
const grants: Array<{ tenantId: string; userId: string; pageId: string }> = [];
const table = { id: "id", tenantId: "tenantId", userId: "userId", pageId: "pageId" };
const db = { select: () => ({ from: () => ({ where: (predicate: (row: any) => boolean) => ({ limit: async () => grants.filter(predicate).slice(0, 1) }) }) }) };
const compiled = transformSync(guardSource, { loader: "ts", format: "cjs" }).code;
const factory = new Function("db", "userPagePermissions", "eq", "inArray", "and", `${compiled};return requireRoleOrPageAccess;`);
const guard = factory(db, table,
  (field: string, value: string) => (row: any) => row[field] === value,
  (field: string, values: string[]) => (row: any) => values.includes(row[field]),
  (...predicates: Array<(row: any) => boolean>) => (row: any) => predicates.every(p => p(row)),
)(["send-hold-harmless", "volunteers", "volunteer-pipeline"], "admin", "staff");
async function request(role = "volunteer", tenantId = "haseyas", userId = "selected") {
  let status = 200;
  let allowed = false;
  const res = { status: (value: number) => { status = value; return res; }, json: () => {} };
  await guard({ user: { id: userId, activeRole: role, roles: [role] }, tenant: { id: tenantId } }, res, () => { allowed = true; });
  return { status, allowed };
}
test("individual grant allows sending, revocation denies, tenant/user boundaries hold", async () => {
  grants.length = 0;
  assert.equal((await request()).status, 403);
  grants.push({ tenantId: "haseyas", userId: "selected", pageId: "send-hold-harmless" });
  assert.equal((await request()).allowed, true);
  assert.equal((await request("volunteer", "other-rescue")).status, 403);
  assert.equal((await request("volunteer", "haseyas", "unselected")).status, 403);
  grants.length = 0;
  assert.equal((await request()).status, 403);
  for (const role of ["admin", "staff", "owner", "board_member"]) assert.equal((await request(role)).allowed, true);
});
test("sending route and catalog use dedicated capability without a default volunteer grant", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.match(routes, /app.post\('\/api\/hold-harmless\/send-adhoc'.*requireRoleOrPageAccess\(\['send-hold-harmless', 'volunteers', 'volunteer-pipeline'\]/);
  const seed = readFileSync("server/services/page-permissions-seeding.ts", "utf8");
  assert.match(seed, /pageId: 'send-hold-harmless',[\s\S]*?allowedRoles: \['admin', 'board_member', 'staff'\]/);
});
