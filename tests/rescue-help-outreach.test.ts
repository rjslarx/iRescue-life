import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { pool, db } from "../server/db";
import { tenants, users } from "../shared/schema";
import { defaultHelpSettings } from "../shared/rescue-help";
import { outreachPhone, prepareHelpOutreach } from "../server/services/rescue-help-outreach";

test("outreach normalizes US numbers and rejects invalid or foreign destinations", () => {
  assert.equal(outreachPhone("(202) 555-0123"), "+12025550123");
  assert.equal(outreachPhone("+1 202 555 0123"), "+12025550123");
  for (const value of ["", "123", "+442079460000", "+14165550100"]) assert.throws(() => outreachPhone(value));
});

test("outreach is tenant-scoped, safe to retry, and preserves ownership and suppression",
  { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
    const tid=randomUUID(), other=randomUUID(), uid=randomUUID(), second=randomUUID(), outsider=randomUUID();
    try {
      await db.insert(tenants).values([tid,other].map(id=>({id,name:"Outreach test",subdomain:`outreach-${id}`})));
      await db.insert(users).values([uid,second,outsider].map(id=>({
        id,tenantId:tid,email:`${id}@example.test`,fullName:"Outreach test",passwordHash:"not-a-login",roles:["volunteer" as const],
      })));
      const settings={...defaultHelpSettings,phone:"+12025550196",teamIds:[uid,second]};
      await pool.query("INSERT INTO rescue_help_settings(tenant_id,phone,enabled,data) VALUES($1,$2,true,$3)",[tid,settings.phone,settings]);
      const [a,b]=await Promise.all([
        prepareHelpOutreach(tid,uid,"202-555-0123"), prepareHelpOutreach(tid,uid,"+12025550123"),
      ]);
      assert.equal(a.id,b.id);
      assert.equal((await pool.query("SELECT assignee_id FROM rescue_help_threads WHERE id=$1",[a.id])).rows[0].assignee_id,uid);
      await assert.rejects(prepareHelpOutreach(tid,second,a.phone),/assigned to another/);
      await assert.rejects(prepareHelpOutreach(tid,outsider,"2025550124"),/team access/);
      await assert.rejects(prepareHelpOutreach(other,uid,a.phone),/team access/);
      await assert.rejects(prepareHelpOutreach(tid,uid,settings.phone),/rescue’s number/);
      await pool.query("UPDATE users SET phone=$2,sms_opt_out_at=now() WHERE id=$1",[second,"+12025550125"]);
      await assert.rejects(prepareHelpOutreach(tid,uid,"2025550125"),/opted out/);
      await pool.query("UPDATE tenants SET comms_paused=true WHERE id=$1",[tid]);
      await assert.rejects(prepareHelpOutreach(tid,uid,a.phone),/paused/);
      await pool.query("UPDATE tenants SET comms_paused=false WHERE id=$1",[tid]);
      await pool.query("UPDATE rescue_help_settings SET enabled=false WHERE tenant_id=$1",[tid]);
      await assert.rejects(prepareHelpOutreach(tid,uid,a.phone),/not active/);
      assert.equal((await pool.query("SELECT count(*)::int n FROM rescue_help_messages WHERE thread_id=$1",[a.id])).rows[0].n,0);
      assert.equal((await pool.query("SELECT count(*)::int n FROM rescue_help_calls WHERE thread_id=$1",[a.id])).rows[0].n,0);
    } finally {
      await db.delete(tenants).where(inArray(tenants.id,[tid,other]));
      await pool.end();
    }
  });
