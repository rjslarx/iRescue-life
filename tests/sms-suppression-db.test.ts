import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import pg from "pg";
import { smsSuppressionSchemaSql } from "../server/lib/sms-suppression-schema";

test("real SQL atomically deduplicates STOP/START without cross-tenant changes", {
  skip: process.env.RUN_SMS_DB_TEST !== "1",
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Temp tables shadow application tables; rollback removes all fixtures.
    await client.query("CREATE TEMP TABLE tenants (id uuid PRIMARY KEY)");
    await client.query(smsSuppressionSchemaSql.replaceAll("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE"));
    const a = randomUUID(), b = randomUUID(), phone = "+12025550101";
    await client.query("INSERT INTO tenants VALUES ($1),($2)", [a, b]);
    const built = await build({
      entryPoints: ["server/lib/sms-suppression.ts"], bundle: true, platform: "node", format: "cjs", write: false,
      plugins: [{ name: "temporary-database", setup(build) {
        build.onResolve({ filter: /^\.\.\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const pool=globalThis.pool;" }));
      } }],
    });
    const module = { exports: {} as any };
    runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, pool: client });
    const { recordVerifiedSmsOptOut: event, isSmsPhoneSuppressed: blocked } = module.exports;
    const stop = `SM${"a".repeat(32)}`, start = `SM${"b".repeat(32)}`;
    await event(a, phone, stop, "STOP");
    assert.equal(await blocked(a, "(202) 555-0101"), true);
    assert.equal(await blocked(b, phone), false);
    await event(a, phone, start, "START");
    await event(a, phone, stop, "STOP");
    assert.equal(await blocked(a, phone), false);
    await event(a, phone, `SM${"c".repeat(32)}`, "STOP");
    await event(a, phone, start, "START");
    assert.equal(await blocked(a, phone), true);
    assert.equal((await client.query("SELECT * FROM sms_opt_out_events")).rowCount, 3);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
