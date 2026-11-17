import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, requireRoleOrPageAccess } from "../middleware/auth";
import { requirePlatformAdmin, requireTenant } from "../middleware/tenant";
import { communityPublicItem, partnerReviewSchema, partnerSettingsSchema, facebookContactSchema } from "@shared/community-resale";
import { resaleCsvCell } from "@shared/rescue-resale";
import { communityRoute as route, communitySafety } from "./communityResale";
import { communityAudit, communityPartner, communityOrderView, failCommunity as fail,
  notifyCommunityOrder, readyCommunityPartner, syncCommunityOrder } from "../services/community-resale";
import { requirePayoutAccount } from "../services/resale-payout-accounts";
import { hashResale } from "../services/rescue-resale";
import { requestCommunityRefund, recoverCommunityRefundIntent } from "../services/community-resale-refunds";
import { updateCommunityPickup } from "../services/community-resale-pickup";
import { communityAttentionOrders } from "../services/community-resale-notifications";
const uuid = z.string().uuid();
export const tenantCommunityRouter = Router();
export const platformCommunityRouter = Router();
tenantCommunityRouter.use(communitySafety, requireTenant, requireAuth,
  requireRoleOrPageAccess("finance", "owner", "admin", "staff", "board_member"), (req: any, res, next) => {
    if (req.user?.tenantId !== req.tenant.id) return res.status(403).json({ error: "Rescue access denied" });
    next();
  });
platformCommunityRouter.use(communitySafety, requireAuth, requirePlatformAdmin);
function canManage(req: any) { return req.user?.roles?.some((r: string) => ["owner", "admin"].includes(r)); }
tenantCommunityRouter.get("/attention", route(async (req: any, res: any) => {
  const rows = await communityAttentionOrders(req.tenant.id);
  const preference = (await pool.query("SELECT data->'staffAlerts'->>$2 AS enabled FROM community_resale_partners WHERE tenant_id=$1",
    [req.tenant.id, req.user.id])).rows[0];
  res.json({ enabled: preference?.enabled === "true", canSubscribe: !!canManage(req),
    orders: rows.map(o => ({ ...communityOrderView(o, false, true), attention: o.attention,
      canManageFinancialActions: !!canManage(req) })) });
}));
tenantCommunityRouter.put("/attention/preference", route(async (req: any, res: any) => {
  if (!canManage(req)) fail("Only rescue owners and admins can subscribe to alerts.", 403);
  const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(req.body);
  await pool.query(`INSERT INTO community_resale_partners(tenant_id,data) VALUES($1,
    jsonb_build_object('staffAlerts',jsonb_build_object($2::text,$3::boolean)))
    ON CONFLICT(tenant_id) DO UPDATE SET data=jsonb_set(community_resale_partners.data,'{staffAlerts}',
      COALESCE(community_resale_partners.data->'staffAlerts','{}') || jsonb_build_object($2::text,$3::boolean)),
      updated_at=now()`, [req.tenant.id, req.user.id, enabled]);
  res.json({ ok: true });
}));
tenantCommunityRouter.get("/", route(async (req: any, res: any) => {
  const { partner } = await communityPartner(req.tenant.id);
  const items = (await pool.query("SELECT * FROM community_resale_items WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500", [req.tenant.id])).rows;
  const orders = (await pool.query("SELECT * FROM community_resale_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200", [req.tenant.id])).rows;
  res.json({ partner, canManageSettings: !!canManage(req),
    items: items.map(r => ({ ...communityPublicItem(r), donorEmail: r.seller_email, donorName: r.data.donorName, reviewNote: r.review_note })),
    orders: orders.map(r => communityOrderView(r, false, true)) });
}));
tenantCommunityRouter.put("/settings", route(async (req: any, res: any) => {
  if (!canManage(req)) fail("Only rescue owners and admins can change participation.", 403);
  const data = partnerSettingsSchema.parse(req.body), c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`INSERT INTO community_resale_partners(tenant_id) VALUES($1) ON CONFLICT DO NOTHING`, [req.tenant.id]);
    await c.query(`UPDATE community_resale_partners SET opted_in=$2,data=data || $3::jsonb,updated_at=now() WHERE tenant_id=$1`,
      [req.tenant.id, data.optedIn, JSON.stringify({ allowSplit: data.allowSplit, splitMinimumCents: data.splitMinimumCents })]);
    await communityAudit(c, req.tenant.id, req.user.id, "rescue_settings", data);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  res.json({ ok: true });
}));
platformCommunityRouter.get("/partners", route(async (_req: any, res: any) => {
  const tenants = (await pool.query("SELECT id FROM tenants ORDER BY name")).rows;
  res.json({ partners: await Promise.all(tenants.map(async t => (await communityPartner(t.id)).partner)) });
}));
platformCommunityRouter.put("/partners/:tenantId", route(async (req: any, res: any) => {
  const tenantId = uuid.parse(req.params.tenantId), data = partnerReviewSchema.parse(req.body);
  await communityPartner(tenantId);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("INSERT INTO community_resale_partners(tenant_id) VALUES($1) ON CONFLICT DO NOTHING", [tenantId]);
    await c.query("UPDATE community_resale_partners SET approved=$2,data=data || $3::jsonb,updated_at=now() WHERE tenant_id=$1", [tenantId, data.approved, JSON.stringify(data)]);
    await communityAudit(c, tenantId, req.user.id, "platform_review", data);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  res.json({ ok: true });
}));
tenantCommunityRouter.post("/items/:id/review", route(async (req: any, res: any) => {
  const id = uuid.parse(req.params.id);
  const data = z.object({ status: z.enum(["active", "rejected"]), note: z.string().trim().max(1000).default("") }).strict().parse(req.body);
  if (data.status === "rejected" && !data.note) fail("Explain why the listing needs changes.");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const item = (await c.query("SELECT * FROM community_resale_items WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [id, req.tenant.id])).rows[0];
    if (!item || !["active", "rejected", "pending_review"].includes(item.status)) fail("Cannot review a reserved or sold listing.", 409);
    if (data.status === "active") {
      facebookContactSchema.parse(item.data.facebookContactUrl);
      const { partner } = await readyCommunityPartner(req.tenant.id);
      if (item.data.proceedsMode === "split_50") {
        if (!partner.allowSplit || item.data.askingCents < partner.splitMinimumCents) fail("This split listing does not meet current rescue settings.", 409);
        await requirePayoutAccount(req.tenant.id, `community:${hashResale(item.seller_email)}`);
      }
    }
    await c.query("UPDATE community_resale_items SET status=$2,review_note=$3,version=version+1 WHERE id=$1", [id, data.status, data.note]);
    await communityAudit(c, req.tenant.id, req.user.id, "listing_review", { id, ...data });
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  res.json({ ok: true });
}));
const filterSchema = z.object({
  tenantId: uuid.optional(), from: z.string().date().optional(), to: z.string().date().optional(),
  mode: z.enum(["all", "donate_all", "split_50"]).default("all"),
  status: z.enum(["all", "checkout", "expired", "paid", "completed", "refunded", "partially_refunded"]).default("all"),
  settlement: z.enum(["all", "awaiting_payment", "awaiting_pickup", "awaiting_funds", "transferred", "needs_review",
    "retry_pending", "setup_required", "awaiting_deployment", "recovering", "transferring", "refunded", "on_hold"]).default("all"),
}).strict();
async function ledger(req: any, platform: boolean) {
  const f = filterSchema.parse(req.query);
  if (!platform && f.tenantId && f.tenantId !== req.tenant.id) fail("Rescue access denied", 403);
  if (f.from && f.to && f.from > f.to) fail("End date must follow start date.");
  const tenantId = platform ? f.tenantId || null : req.tenant.id;
  return (await pool.query(`SELECT o.*,
    (SELECT COALESCE(jsonb_agg(a),'[]'::jsonb) FROM (
      SELECT id AS "auditId",actor_id AS actor,action,created_at AS "createdAt",data FROM community_resale_audit
      WHERE tenant_id=o.tenant_id AND data->>'orderId'=o.id::text ORDER BY created_at DESC LIMIT 100
    ) a) AS audit,
    s.data->'rescue'->>'transferId' AS rescue_transfer_id,
    s.data->'contributor'->>'transferId' AS contributor_transfer_id
    FROM community_resale_orders o LEFT JOIN community_resale_splits s ON s.order_id=o.id
    WHERE ($1::uuid IS NULL OR o.tenant_id=$1)
    AND ($2::date IS NULL OR o.created_at >= $2::date)
    AND ($3::date IS NULL OR o.created_at < $3::date+interval '1 day')
    AND ($4='all' OR o.data->>'proceedsMode'=$4) AND ($5='all' OR o.status=$5)
    AND ($6='all' OR o.data->'split'->>'status'=$6)
    ORDER BY o.created_at DESC LIMIT 5000`, [tenantId, f.from || null, f.to || null, f.mode, f.status, f.settlement])).rows;
}
for (const [router, platform] of [[tenantCommunityRouter, false], [platformCommunityRouter, true]] as const) {
  router.get("/ledger", route(async (req: any, res: any) => {
    const rows = await ledger(req, platform);
    res.json({ canManageFinancialActions: platform || !!canManage(req),
      orders: rows.map(r => ({ ...communityOrderView(r, false, true),
        canManageFinancialActions: platform || !!canManage(req), audit: r.audit })) });
  }));
  router.get("/ledger.csv", route(async (req: any, res: any) => {
    const rows = (await ledger(req, platform)).map(r => communityOrderView(r, false, true));
    const fields = ["id", "tenantId", "itemTitle", "createdAt", "status", "proceedsMode", "amountCents", "platformFeeCents",
      "stripeFeeCents", "netCents", "rescueShareCents", "contributorShareCents", "rescueProceedsCents", "refundedCents", "disputed",
      "rescueTransferId", "contributorTransferId", "stripePaymentIntentId"] as const;
    const csv = [fields.join(","), ...rows.map(r => fields.map(k => resaleCsvCell(r[k] ?? "Pending")).join(","))].join("\r\n");
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="community-resale-ledger-cents.csv"');
    res.send(csv);
  }));
  const adminOrder = async (req: any) => {
    const id = uuid.parse(req.params.id);
    const r = (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1 AND ($2::uuid IS NULL OR tenant_id=$2)",
      [id, platform ? null : req.tenant.id])).rows[0];
    if (!r) fail("Order not found", 404);
    return r;
  };
  router.post("/orders/:id/sync", route(async (req: any, res: any) => {
    const r = await adminOrder(req);
    res.json(communityOrderView(await syncCommunityOrder(r.id, r.tenant_id), false, true));
  }));
  router.post("/orders/:id/refund", route(async (req: any, res: any) => {
    if (!platform && !canManage(req)) fail("Only rescue owners and admins can issue refunds.", 403);
    const r = await adminOrder(req);
    const input = z.object({ requestId: uuid, amountCents: z.number().int().positive(),
      expectedRefundedCents: z.number().int().nonnegative(), reason: z.string().trim().min(10).max(2000) }).strict().parse(req.body);
    await requestCommunityRefund(r.id, r.tenant_id, req.user.id, input);
    res.json(communityOrderView(await syncCommunityOrder(r.id, r.tenant_id), false, true));
  }));
  router.post("/orders/:id/recover-refund-intent", route(async (req: any, res: any) => {
    if (!platform && !canManage(req)) fail("Only rescue owners and admins can recover saved refund requests.", 403);
    const r = await adminOrder(req);
    const { savedIntent } = z.object({ savedIntent: z.string().max(16000) }).strict().parse(req.body);
    res.json(await recoverCommunityRefundIntent(r.id, r.tenant_id, req.user.id, savedIntent));
  }));
  for (const [path, action] of [["resolve-issue", "resolve_issue"], ["confirm-handoff", "staff_handoff"]] as const) {
    router.post(`/orders/:id/${path}`, route(async (req: any, res: any) => {
      if (!platform && !canManage(req)) fail("Only rescue owners and admins can resolve pickup issues.", 403);
      const r = await adminOrder(req);
      const base = { reason: z.string().trim().min(10).max(2000), evidence: z.string().trim().min(10).max(3000) };
      const input = action === "resolve_issue"
        ? z.object({ ...base, issueId: uuid }).strict().parse(req.body)
        : z.object({ ...base, requestId: uuid }).strict().parse(req.body);
      await updateCommunityPickup(r.id, r.tenant_id, req.user.id, action, input);
      // Completion is durable even if Stripe is temporarily unavailable.
      try { await syncCommunityOrder(r.id, r.tenant_id); } catch { /* scheduled reconciliation follows */ }
      res.json({ ok: true });
    }));
  }
  router.post("/orders/:id/retry-email", route(async (req: any, res: any) => {
    const r = await adminOrder(req);
    const { recipient } = z.object({ recipient: z.enum(["buyer", "donor"]) }).strict().parse(req.body);
    const key = `${recipient}Notice`;
    // Staff explicitly requests a new attempt, acknowledging an unknown earlier outcome.
    if (!["paid", "completed"].includes(r.status)) fail("Only confirmed paid orders receive payment confirmations.", 409);
    const changed = await pool.query(`UPDATE community_resale_orders SET data=jsonb_set(data,ARRAY[$2],'"not_sent"')
      WHERE id=$1 AND COALESCE(data->>$2,'pending') IN ('unknown','not_sent') RETURNING id`, [r.id, key]);
    if (!changed.rows.length) fail("Notification was accepted, is still being sent, or has not failed.", 409);
    await communityAudit(pool, r.tenant_id, req.user.id, "manual_email_retry", { orderId: r.id, recipient });
    await notifyCommunityOrder(r.id);
    res.json({ ok: true });
  }));
}
