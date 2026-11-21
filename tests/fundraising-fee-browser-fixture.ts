import { randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import bcrypt from "bcrypt";
import { pool } from "../server/db";
const file = "/tmp/fundraising-fee-fixture.json";
try {
  if (process.argv[2] === "cleanup") {
    if (existsSync(file)) {
      const { tenantId } = JSON.parse(readFileSync(file, "utf8"));
      await pool.query("DELETE FROM tenants WHERE id=$1", [tenantId]);
      unlinkSync(file);
      console.log("Synthetic fee test tenant removed");
    }
  } else {
    const tenantId = randomUUID(), userId = randomUUID();
    const slug = `fee-preview-${randomUUID().slice(0, 8)}`;
    const email = `${slug}@example.test`;
    const password = randomUUID();
    await pool.query("INSERT INTO tenants(id,name,subdomain,platform_fee_percent,subscription_tier) VALUES($1,'Fee Policy Test Rescue',$2,5,'starter')", [tenantId, slug]);
    await pool.query("INSERT INTO users(id,tenant_id,email,password_hash,full_name,roles,is_active) VALUES($1,$2,$3,$4,'Fee Test Admin',ARRAY['admin'],true)", [userId, tenantId, email, await bcrypt.hash(password, 10)]);
    const eventIds: Record<string, string> = {};
    for (const policy of ["rescue", "optional", "required"]) {
      const id = randomUUID();
      await pool.query("INSERT INTO fundraiser_events(id,tenant_id,title,price_cents,fee_policy) VALUES($1,$2,$3,1000,$4)", [id, tenantId, `Gumbo ${policy}`, policy]);
      eventIds[policy] = id;
      await pool.query("INSERT INTO expense_campaigns(tenant_id,title,slug,goal_amount_cents,fee_policy) VALUES($1,$2,$3,100000,$4)", [tenantId, `Expense ${policy}`, `expense-${policy}`, policy]);
    }
    writeFileSync(file, JSON.stringify({ tenantId, slug, email, password, eventIds }), { mode: 0o600 });
    console.log("Synthetic fee fixture written to /tmp/fundraising-fee-fixture.json. No connected Stripe account or real recipients.");
  }
} finally {
  await pool.end();
}
