import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("live checkout rejects outdated quotes before payment side effects across all campaign types", {
  skip: process.env.RUN_RESALE_DB_TEST !== "1",
}, async () => {
  const { pool } = await import("../server/db");
  const tenant = randomUUID(), other = randomUUID(), event = randomUUID(), expense = randomUUID(), peer = randomUUID();
  const slug = `quote-${randomUUID()}`;
  const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  async function post(path: string, body: object, tid = tenant) {
    const res = await fetch(`${origin}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }
  try {
    for (const id of [tenant, other]) {
      await pool.query("INSERT INTO tenants(id,name,subdomain,platform_fee_percent,stripe_enabled) VALUES($1,'Quote test',$2,5,true)", [id, `quote-${id}`]);
    }
    await pool.query("INSERT INTO fundraiser_events(id,tenant_id,title,price_cents,fee_policy) VALUES($1,$2,'Quote test',1000,'optional')", [event, tenant]);
    await pool.query("INSERT INTO expense_campaigns(id,tenant_id,title,slug,goal_amount_cents,fee_policy) VALUES($1,$2,'Quote test',$3,100000,'optional')", [expense, tenant, slug]);
    await pool.query("INSERT INTO peer_campaigns(id,tenant_id,creator_name,creator_email,campaign_title,goal_amount,slug,fee_policy) VALUES($1,$2,'Test','quote@example.test','Quote test',100000,$3,'optional')", [peer, tenant, slug]);
    for (const [path, table, id, quoteBody, checkoutBody] of [
      [`/api/fundraiser-events/${event}`, "fundraiser_events", event, { quantity: 2, coverFees: false }, { quantity: 2, customerName: "Test", customerEmail: "quote@example.test" }],
      [`/api/public/expense-campaigns/${expense}`, "expense_campaigns", expense, { amountCents: 1000, coverFees: false }, { amountCents: 1000 }],
      [`/api/peer-campaigns/${slug}`, "peer_campaigns", peer, { amountCents: 1000, coverFees: false }, { amount: 1000, donorName: "Test" }],
    ] as const) {
      const initial = await post(`${path}/fee-quote`, quoteBody);
      assert.equal(initial.status, 200, JSON.stringify(initial.body));
      assert.equal((await post(`${path}/fee-quote`, quoteBody, other)).status, 404);
      assert.equal((await post(`${path}/checkout`, { ...checkoutBody, quoteVersion: initial.body.quoteVersion }, other)).status, 404);
      const missing = await post(`${path}/checkout`, checkoutBody);
      assert.equal(missing.status, 409);
      await pool.query(`UPDATE ${table} SET fee_policy='required' WHERE id=$1`, [id]);
      if (table === "fundraiser_events") await pool.query("UPDATE fundraiser_events SET price_cents=1500 WHERE id=$1", [id]);
      const changed = await post(`${path}/checkout`, { ...checkoutBody, quoteVersion: initial.body.quoteVersion });
      assert.equal(changed.status, 409, JSON.stringify(changed.body));
      assert.equal(changed.body.code, "FUNDRAISING_QUOTE_CHANGED");
      assert.ok(changed.body.quote.totalCents > initial.body.totalCents);
      assert.equal(changed.body.quote.policy, "required");
      const refreshed = await post(`${path}/fee-quote`, quoteBody);
      assert.equal(refreshed.body.quoteVersion, changed.body.quote.quoteVersion);
      const invalid = table === "fundraiser_events" ? { quantity: 1.5 } : table === "expense_campaigns" ? { amountCents: 100.5 } : { amount: 100.5 };
      const rejected = await post(`${path}/checkout`, { ...checkoutBody, ...invalid, quoteVersion: changed.body.quote.quoteVersion });
      assert.equal(rejected.status, 400);
    }
    assert.equal(Number((await pool.query("SELECT count(*) FROM fundraiser_orders WHERE event_id=$1", [event])).rows[0].count), 0);
    assert.equal(Number((await pool.query("SELECT count(*) FROM peer_campaign_donations WHERE peer_campaign_id=$1", [peer])).rows[0].count), 0);
  } finally {
    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenant, other]]);
    await pool.end();
  }
});
