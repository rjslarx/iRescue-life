import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import express from "express";
import { pool, db } from "../server/db";
import { tenants } from "../shared/schema";
import { eq } from "drizzle-orm";
import { communityResaleSchemaSql } from "../server/lib/community-resale-schema";
import { communityPublicItem, communityItemSchema, partnerReviewSchema, facebookContactSchema } from "../shared/community-resale";
import { stripeService } from "../server/lib/stripe-service";
import { EmailService } from "../server/lib/email-service";
import { hashResale } from "../server/services/rescue-resale";
import { syncCommunityOrder, communityOrderView } from "../server/services/community-resale";
import router from "../server/routes/communityResale";
import { tenantCommunityRouter, platformCommunityRouter } from "../server/routes/communityResaleAdmin";

test("public whitelist and consent do not leak seller identity", () => {
  const data = { tenantId: randomUUID(), donorName: "Example Seller", title: "Wooden chair", description: "A well maintained wooden chair.",
    category: "Furniture", zip: "70501", facebookContactUrl: "https://m.me/example", askingCents: 5000, photos: ["/photo"], ownership: true, goodsOnly: true };
  assert.equal(communityItemSchema.parse(data).proceedsMode, "donate_all");
  assert.equal(communityItemSchema.safeParse({ ...data, proceedsMode: "split_50" }).success, false);
  const item = communityPublicItem({ data, seller_email: "private@example.com", token_hash: "private" });
  assert.equal(item.sellerFirstName, "Example");
  assert.equal(JSON.stringify(item).includes("private"), false);
  assert.equal(item.facebookContactUrl, data.facebookContactUrl);
  for (const url of ["https://facebook.com.evil.test/person", "https://facebook.com/l.php?u=https://evil.test", "javascript:alert(1)", "https://user:pass@facebook.com/person"])
    assert.equal(facebookContactSchema.safeParse(url).success, false);
  assert.equal(partnerReviewSchema.safeParse({ approved: true, nonprofitReviewed: false, publicName: "Rescue", city: "City", publicEin: "", note: "" }).success, false);
});

test("community resale identity, approvals, concurrent checkout, fees, email dedup and recovery", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const tid = randomUUID(), other = randomUUID(), token = randomBytes(32).toString("hex");
  const email = `seller-${tid}@example.com`, image = `/objects/test-${tid}`;
  const originalStripe = stripeService.getPlatformStripeClient, originalEmail = EmailService.forTenant;
  const sessions = new Map<string, any>(); let sends = 0, failMail = false;
  const stripe: any = {
    accounts: { retrieve: async () => ({ charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" } }) },
    checkout: { sessions: {
      create: async (p: any, opts: any) => {
        if (sessions.has(opts.idempotencyKey)) return sessions.get(opts.idempotencyKey);
        const s = { id: `cs_${randomUUID()}`, url: "https://checkout.stripe.com/test", metadata: p.metadata,
          mode: "payment", currency: "usd", amount_total: p.line_items[0].price_data.unit_amount, status: "open", payment_status: "unpaid" };
        sessions.set(opts.idempotencyKey, s); sessions.set(s.id, s); return s;
      },
      retrieve: async (id: string) => sessions.get(id),
      expire: async (id: string) => { sessions.get(id).status = "expired"; },
    } },
    paymentIntents: { retrieve: async (id: string) => {
      const s = [...sessions.values()].find(s => s.payment_intent === id);
      return { status: "succeeded", currency: "usd", amount: s.amount_total, metadata: s.metadata,
         latest_charge: { id: "ch_fake", balance_transaction: { fee: 175 }, amount_refunded: 0, disputed: false } };
    } },
     refunds: { list: () => ({ autoPagingToArray: async () => [] }) },
   };
  stripeService.getPlatformStripeClient = () => stripe;
  EmailService.forTenant = async () => ({ send: async () => { sends++; return { success: !failMail }; } }) as any;
  let server: any;
  try {
    await pool.query(communityResaleSchemaSql);
    await db.insert(tenants).values([{ id: tid, name: "Community test", subdomain: `community-${tid}`, stripeEnabled: true, stripeConnectedAccountId: "acct_fake" },
      { id: other, name: "Other test", subdomain: `community-${other}` }]);
    await pool.query("INSERT INTO community_resale_partners(tenant_id,approved,opted_in,data) VALUES($1,true,true,$2)", [tid, { publicName: "Community test", allowSplit: false }]);
    await pool.query("INSERT INTO community_resale_auth(id,email,code_hash,token_hash,expires_at) VALUES($1,$2,'used',$3,now()+interval '1 day')", [randomUUID(), email, hashResale(token)]);
    await pool.query("INSERT INTO community_resale_images(url,tenant_id,seller_email) VALUES($1,$2,$3)", [image, tid, email]);
    const app = express(); app.use(express.json()); app.use((req: any, _res, next) => {
      Object.defineProperty(req, "ip", { value: `127.0.0.${Math.floor(Math.random() * 200) + 1}` });
      req.tenant = { id: req.get("other") ? other : tid };
      if (req.get("admin")) req.user = { id: tid, tenantId: req.tenant.id, roles: ["admin"], activeRole: "admin" };
      next();
    });
    app.use("/public", router); app.use("/admin", tenantCommunityRouter); app.use("/platform", platformCommunityRouter);
    server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (p: string, method = "GET", body?: any, headers: any = {}) => fetch(base + p, { method,
      headers: { "Content-Type": "application/json", "X-Community-Token": token, ...headers }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await call("/platform/partners")).status, 401);
    assert.equal((await call("/admin")).status, 401);
    const item = { tenantId: tid, donorName: "Example Seller", title: "Wooden test chair", description: "Well maintained wooden chair for local pickup.",
      category: "Furniture", zip: "70501", facebookContactUrl: "https://m.me/example", askingCents: 5000, photos: [image], ownership: true, goodsOnly: true };
    assert.equal((await call("/public/items", "POST", { ...item, photos: ["/not-owned"] })).status, 400);
    assert.equal((await call("/public/items", "POST", { ...item, proceedsMode: "split_50", splitConsent: true })).status, 400);
    const created = await call("/public/items", "POST", item); assert.equal(created.status, 200, await created.clone().text());
    const id = (await created.json()).id;
    assert.equal((await call("/public/items/" + id)).status, 404);
    assert.equal((await call(`/admin/items/${id}/review`, "POST", { status: "active", note: "" }, { admin: "1", other: "1" })).status, 409);
    assert.equal((await call(`/admin/items/${id}/review`, "POST", { status: "active", note: "" }, { admin: "1" })).status, 200);
    const publicItem = (await (await call("/public/items/" + id)).json()).item;
    assert.equal(publicItem.sellerFirstName, "Example");
    assert.equal(publicItem.donorName, undefined);
    const input = { itemId: id, version: publicItem.version, email: `buyer-${tid}@example.com` };
    assert.equal((await call("/public/checkout", "POST", { ...input, amountCents: 1 })).status, 400);
    const results = await Promise.all([call("/public/checkout", "POST", input), call("/public/checkout", "POST", { ...input, email: "another@example.com" })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const order = await results.find(r => r.status === 200)!.json();
    const row = (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1", [order.orderId])).rows[0];
    assert.equal(row.data.platformRevenueCents, 250);
    assert.equal(row.data.facebookContactUrl, item.facebookContactUrl, "contact path is snapshotted for pickup");
    assert.equal(communityOrderView(row, true).facebookContactUrl, item.facebookContactUrl);
    assert.equal(JSON.stringify(row.data.stripeParams).includes(order.token), false);
    assert.equal((await call(`/public/orders/${order.orderId}`, "GET", undefined, { "X-Community-Token": "" })).status, 401);
    assert.equal((await call(`/public/items/${id}/price`, "POST", { askingCents: 6000, version: publicItem.version })).status, 409);
    const s = sessions.get(row.session_id); s.payment_status = "paid"; s.status = "complete"; s.payment_intent = "pi_fake";
    failMail = true;
    await syncCommunityOrder(row.id, tid);
    await syncCommunityOrder(row.id, tid);
    assert.equal(sends, 2, "unknown delivery must not duplicate either recipient");
    const paid = (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1", [row.id])).rows[0];
    assert.equal(paid.status, "paid"); assert.equal(paid.stripe_fee_cents, 175);
    assert.equal(communityOrderView(paid).pickupCode, undefined);
    assert.equal((await call(`/admin/orders/${row.id}/retry-email`, "POST", { recipient: "buyer" }, { admin: "1" })).status, 200);
    assert.equal(sends, 3);
    await pool.query("UPDATE community_resale_partners SET opted_in=false WHERE tenant_id=$1", [tid]);
    assert.equal((await call(`/public/orders/${row.id}`, "GET", undefined, { "X-Order-Token": order.token })).status, 200);
    assert.equal((await call("/public/me")).status, 200);
    assert.equal((await call(`/admin/ledger?tenantId=${tid}`, "GET", undefined, { admin: "1", other: "1" })).status, 403);
    assert.equal((await call("/admin/ledger.csv", "GET", undefined, { admin: "1" })).status, 200);
    assert.equal((await call(`/public/orders/${row.id}/confirm-pickup`, "POST", { code: "000000000000" })).status, 409);
    assert.equal((await call(`/public/orders/${row.id}/confirm-pickup`, "POST", { code: paid.data.pickupCode })).status, 200);
  } finally {
    stripeService.getPlatformStripeClient = originalStripe; EmailService.forTenant = originalEmail;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    for (const table of ["community_resale_splits", "community_resale_orders", "community_resale_items", "community_resale_images", "community_resale_audit", "community_resale_partners"])
      await pool.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`, [[tid, other]]);
    await pool.query("DELETE FROM community_resale_auth WHERE email=$1", [email]);
    await db.delete(tenants).where(eq(tenants.id, tid)); await db.delete(tenants).where(eq(tenants.id, other));
    await pool.end();
  }
});
