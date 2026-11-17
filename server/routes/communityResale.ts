import { Router } from "express";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import { pool } from "../db";
import { hashResale } from "../services/rescue-resale";
import { communityItemSchema, communityPublicItem, facebookContactSchema } from "@shared/community-resale";
import { communityBase, communityOrderView, communityPartner, failCommunity as fail, readyCommunityPartner,
  sendCommunityEmail, syncCommunityOrder } from "../services/community-resale";
import { createPayoutAccount, payoutAccount, payoutAccountView, requirePayoutAccount } from "../services/resale-payout-accounts";
import { stripeService } from "../lib/stripe-service";
import { encrypt } from "../lib/encryption";
import { resalePlatformFee } from "@shared/rescue-resale";
import { calculateDestinationChargeEconomics, getDestinationChargeEconomicsMetadata } from "../config/platform";
import { settleResaleSplit } from "../services/resale-split-settlement";

export const communityRoute = (fn: any) => async (req: any, res: any) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues.map(i => i.message).join("; ") });
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("[Community resale] Request failed", e.code || e.name);
    res.status(503).json({ error: "Unable to finish this action. Please try again or contact the rescue." });
  }
};
export function communitySafety(req: any, res: any, next: any) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && (req.get("sec-fetch-site") === "cross-site" ||
      (!req.is("application/json") && !req.is("multipart/form-data"))))
    return res.status(403).json({ error: "Same-site request required" });
  next();
}
const router = Router();
router.use(communitySafety);
const uuid = z.string().uuid();
const emailSchema = z.string().trim().email().max(200).transform(s => s.toLowerCase());
const limit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
router.use(limit);
export async function communityVerified(req: any) {
  const token = req.get("X-Community-Token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail("Verify your email to continue.", 401);
  const r = (await pool.query("SELECT email FROM community_resale_auth WHERE token_hash=$1 AND expires_at>now()", [hashResale(token)])).rows[0];
  if (!r) fail("Your verification expired. Verify the same email again.", 401);
  return r.email as string;
}
const sellerIdentity = (email: string) => `community:${hashResale(email)}`;
router.post("/auth/request", communityRoute(async (req: any, res: any) => {
  const input = z.object({ email: emailSchema, tenantId: uuid }).strict().parse(req.body);
  // Existing participants retain recovery even if new business is paused.
  const { partner } = await communityPartner(input.tenantId);
  if (!partner.approved || !partner.optedIn) {
    const existing = await pool.query(`SELECT 1 FROM community_resale_items WHERE tenant_id=$1 AND seller_email=$2
      UNION ALL SELECT 1 FROM community_resale_orders WHERE tenant_id=$1 AND buyer_email=$2 LIMIT 1`, [input.tenantId, input.email]);
    if (!existing.rows.length) fail("This rescue is not accepting new participants.", 409);
  }
  const id = randomUUID(), code = String(randomInt(100000, 1000000));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`community-auth:${input.email}`]);
    const recent = (await c.query("SELECT count(*)::int n FROM community_resale_auth WHERE email=$1 AND created_at>now()-interval '1 hour'", [input.email])).rows[0].n;
    if (recent >= 3) fail("Too many verification requests. Try again in an hour.", 429);
    await c.query("INSERT INTO community_resale_auth(id,email,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
      [id, input.email, hashResale(`${id}:${code}`)]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  const sent = await sendCommunityEmail(input.tenantId, input.email, "Your Acadiana Rescue Resale verification code",
    `Your verification code is ${code}.\n\nIt expires in 10 minutes. Enter it on the resale page to manage your listings or recover your orders. Do not share it.\n\nIf you didn't request this, ignore this email.`);
  if (!sent.success) fail("We couldn't confirm sending your email. Check your inbox and spam folder before requesting another code.", 503);
  res.json({ challengeId: id });
}));
router.post("/auth/verify", communityRoute(async (req: any, res: any) => {
  const input = z.object({ challengeId: uuid, code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
  const token = randomBytes(32).toString("hex");
  const r = await pool.query(`UPDATE community_resale_auth SET attempts=attempts+1,
    token_hash=CASE WHEN code_hash=$2 THEN $3 ELSE token_hash END,
    expires_at=CASE WHEN code_hash=$2 THEN now()+interval '7 days' ELSE expires_at END
    WHERE id=$1 AND expires_at>now() AND attempts<5 AND token_hash IS NULL RETURNING token_hash`,
    [input.challengeId, hashResale(`${input.challengeId}:${input.code}`), hashResale(token)]);
  if (r.rows[0]?.token_hash !== hashResale(token)) fail("Invalid or expired code.", 401);
  res.json({ token });
}));
router.get("/partners", communityRoute(async (req: any, res: any) => {
  const recovery = req.query.recovery === "1";
  const rows = (await pool.query(`SELECT tenant_id FROM community_resale_partners p WHERE
    (approved AND opted_in) OR ($1 AND EXISTS(SELECT 1 FROM community_resale_items i WHERE i.tenant_id=p.tenant_id)) ORDER BY updated_at`, [recovery])).rows;
  const partners = [];
  for (const r of rows) {
    const { partner, tenant } = await communityPartner(r.tenant_id);
    if (recovery || (tenant.stripeEnabled && tenant.stripeConnectedAccountId)) {
      const { note, nonprofitReviewed, ...publicPartner } = partner;
      partners.push(publicPartner);
    }
  }
  res.json({ partners });
}));
router.get("/items", communityRoute(async (req: any, res: any) => {
  const tenantId = req.query.tenantId ? uuid.parse(req.query.tenantId) : null;
  const rows = (await pool.query(`SELECT i.*,p.data->>'publicName' AS rescue_name FROM community_resale_items i
    JOIN community_resale_partners p ON p.tenant_id=i.tenant_id
    WHERE i.status='active' AND p.approved AND p.opted_in AND ($1::uuid IS NULL OR i.tenant_id=$1)
    ORDER BY i.created_at DESC LIMIT 200`, [tenantId])).rows;
  res.json({ items: rows.map(r => ({ ...communityPublicItem(r), rescueName: r.rescue_name })) });
}));
router.get("/items/:id", communityRoute(async (req: any, res: any) => {
  const r = (await pool.query(`SELECT i.*,p.approved,p.opted_in FROM community_resale_items i
    JOIN community_resale_partners p ON p.tenant_id=i.tenant_id
    WHERE i.id=$1 AND i.status IN ('active','reserved','paid','completed')`, [uuid.parse(req.params.id)])).rows[0];
  if (!r) fail("Listing not available", 404);
  const { partner } = await communityPartner(r.tenant_id);
  const { note, nonprofitReviewed, ...publicPartner } = partner;
  res.json({ item: communityPublicItem(r), partner: publicPartner });
}));
router.get("/me", communityRoute(async (req: any, res: any) => {
  const email = await communityVerified(req);
  const items = (await pool.query("SELECT * FROM community_resale_items WHERE seller_email=$1 ORDER BY created_at DESC LIMIT 200", [email])).rows;
  const sales = (await pool.query(`SELECT o.* FROM community_resale_orders o JOIN community_resale_items i ON i.id=o.item_id
    WHERE i.seller_email=$1 OR o.buyer_email=$1 ORDER BY o.created_at DESC LIMIT 200`, [email])).rows;
  res.json({ items: items.map(r => ({ ...communityPublicItem(r), reviewNote: r.review_note })),
    sales: sales.map(r => communityOrderView(r, r.buyer_email === email)) });
}));
router.get("/payout-account", communityRoute(async (req: any, res: any) => {
  res.json(await payoutAccountView(uuid.parse(req.query.tenantId), sellerIdentity(await communityVerified(req))));
}));
router.post("/payout-account/onboard", communityRoute(async (req: any, res: any) => {
  const { tenantId } = z.object({ tenantId: uuid }).strict().parse(req.body);
  const identity = sellerIdentity(await communityVerified(req));
  const { partner } = await communityPartner(tenantId);
  if (!await payoutAccount(tenantId, identity)) {
    await readyCommunityPartner(tenantId);
    if (!partner.allowSplit) fail("This rescue has not enabled split sales.", 409);
  }
  const account = await createPayoutAccount(tenantId, identity);
  const link = await stripeService.getPlatformStripeClient()!.accountLinks.create({ account, type: "account_onboarding",
    refresh_url: `${communityBase()}/resale/manage?payout=refresh`, return_url: `${communityBase()}/resale/manage?payout=return` });
  res.json({ url: link.url });
}));
router.post("/payout-account/dashboard", communityRoute(async (req: any, res: any) => {
  const { tenantId } = z.object({ tenantId: uuid }).strict().parse(req.body);
  const r = await payoutAccount(tenantId, sellerIdentity(await communityVerified(req)));
  if (!r?.stripe_account_id) fail("Complete bank setup first.", 409);
  res.json({ url: (await stripeService.getPlatformStripeClient()!.accounts.createLoginLink(r.stripe_account_id)).url });
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
router.post("/images", upload.single("file"), communityRoute(async (req: any, res: any) => {
  const email = await communityVerified(req), tenantId = uuid.parse(req.body.tenantId);
  await communityPartner(tenantId, true);
  if (!req.file || !["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) fail("Choose a JPEG, PNG or WebP photo.");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`community-images:${email}`]);
    const count = (await c.query("SELECT count(*)::int n FROM community_resale_images WHERE seller_email=$1 AND created_at>now()-interval '1 day'", [email])).rows[0].n;
    if (count >= 20) fail("Daily photo limit reached.", 429);
    let content: Buffer;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 25000000 });
      const meta = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format || "")) fail("Unsupported image format.");
      content = await image.rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    } catch { fail("Unable to read this image. Choose a smaller valid photo."); }
    const { TenantFileStorage } = await import("../lib/tenantFileStorage");
    const result = await new TenantFileStorage(tenantId).uploadFile({ tenantId, userId: sellerIdentity(email),
      category: "animal-photos", visibility: "public", fileName: `community-${randomUUID()}.jpg`, mimeType: "image/jpeg", content: content! });
    if (!result.success || !result.fileUrl) fail("Photo upload failed", 503);
    await c.query("INSERT INTO community_resale_images(url,tenant_id,seller_email) VALUES($1,$2,$3)", [result.fileUrl, tenantId, email]);
    await c.query("COMMIT");
    res.json({ imageUrl: result.fileUrl });
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}));
async function validateListing(data: z.infer<typeof communityItemSchema>, email: string) {
  const { partner } = await communityPartner(data.tenantId, true);
  if (/https?:|www\.|@|\+?\d[\d\s().-]{6,}\d/i.test(`${data.title} ${data.description}`)) fail("Remove contact details and links from the public listing.");
  if (data.proceedsMode === "split_50") {
    if (!partner.allowSplit || data.askingCents < partner.splitMinimumCents) fail(`Split sales require at least $${(partner.splitMinimumCents / 100).toFixed(2)} and rescue approval.`);
    await requirePayoutAccount(data.tenantId, sellerIdentity(email));
  }
  const images = (await pool.query("SELECT url FROM community_resale_images WHERE tenant_id=$1 AND seller_email=$2 AND url=ANY($3::text[])",
    [data.tenantId, email, data.photos])).rows;
  if (new Set(images.map(r => r.url)).size !== new Set(data.photos).size) fail("Use photos uploaded by you for this rescue.");
}
router.post("/items", communityRoute(async (req: any, res: any) => {
  const email = await communityVerified(req), data = communityItemSchema.parse(req.body);
  await validateListing(data, email);
  const c = await pool.connect(), id = randomUUID();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`community-listings:${email}`]);
    if ((await c.query("SELECT count(*)::int n FROM community_resale_items WHERE seller_email=$1 AND created_at>now()-interval '1 day'", [email])).rows[0].n >= 10)
      fail("Daily listing limit reached.", 429);
    await c.query("INSERT INTO community_resale_items(id,tenant_id,seller_email,data) VALUES($1,$2,$3,$4)", [id, data.tenantId, email, data]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  res.json({ id });
}));
router.put("/items/:id", communityRoute(async (req: any, res: any) => {
  const email = await communityVerified(req), id = uuid.parse(req.params.id);
  const { version, ...body } = req.body, v = z.number().int().positive().parse(version);
  const data = communityItemSchema.parse(body);
  await validateListing(data, email);
  // Full edits trigger moderation again. Beneficiary cannot change; any checkout history locks proceeds choice.
  const updated = await pool.query(`UPDATE community_resale_items i SET data=$4,status='pending_review',version=version+1
    WHERE id=$1 AND seller_email=$2 AND version=$3 AND tenant_id=$5 AND status IN ('active','rejected','pending_review')
    AND (data->>'proceedsMode'=$6 OR NOT EXISTS(SELECT 1 FROM community_resale_orders o WHERE o.item_id=i.id)) RETURNING id`,
    [id, email, v, data, data.tenantId, data.proceedsMode]);
  if (!updated.rows.length) fail("Listing changed or has payment activity. Refresh before editing.", 409);
  res.json({ id });
}));
router.post("/items/:id/price", communityRoute(async (req: any, res: any) => {
  const email = await communityVerified(req), id = uuid.parse(req.params.id);
  const input = z.object({ askingCents: z.number().int().min(100).max(500000), version: z.number().int().positive() }).strict().parse(req.body);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const item = (await c.query("SELECT * FROM community_resale_items WHERE id=$1 AND seller_email=$2 FOR UPDATE", [id, email])).rows[0];
    if (!item || item.version !== input.version || !["active", "pending_review", "rejected"].includes(item.status))
      fail("Price is locked during checkout or after payment. Refresh the listing.", 409);
    const { partner } = await communityPartner(item.tenant_id, true);
    if (item.data.proceedsMode === "split_50" && (!partner.allowSplit || input.askingCents < partner.splitMinimumCents))
      fail(`Split sales require at least $${(partner.splitMinimumCents / 100).toFixed(2)}.`, 409);
    await c.query("UPDATE community_resale_items SET data=jsonb_set(data,'{askingCents}',to_jsonb($2::int)),version=version+1 WHERE id=$1", [id, input.askingCents]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  res.json({ ok: true });
}));
router.post("/items/:id/withdraw", communityRoute(async (req: any, res: any) => {
  const r = await pool.query("UPDATE community_resale_items SET status='withdrawn',version=version+1 WHERE id=$1 AND seller_email=$2 AND status IN ('active','pending_review','rejected') RETURNING id",
    [uuid.parse(req.params.id), await communityVerified(req)]);
  if (!r.rows.length) fail("This listing is reserved or already sold.", 409);
  res.json({ ok: true });
}));

router.post("/checkout", communityRoute(async (req: any, res: any) => {
  const input = z.object({ itemId: uuid, version: z.number().int().positive(), email: emailSchema }).strict().parse(req.body);
  const item = (await pool.query("SELECT * FROM community_resale_items WHERE id=$1", [input.itemId])).rows[0];
  if (!item) fail("Listing not available", 404);
  const { tenant: t } = await readyCommunityPartner(item.tenant_id);
  const stripe = stripeService.getPlatformStripeClient()!;
  const held = (await pool.query("SELECT * FROM community_resale_orders WHERE item_id=$1 AND status='checkout'", [item.id])).rows[0];
  if (held && Date.now() - new Date(held.created_at).getTime() > 32 * 60000) await syncCommunityOrder(held.id, t.id);
  const c = await pool.connect();
  const token = randomBytes(32).toString("hex"), id = randomUUID();
  let order: any;
  try {
    await c.query("BEGIN");
    const i = (await c.query("SELECT * FROM community_resale_items WHERE id=$1 FOR UPDATE", [item.id])).rows[0];
    if (i.status !== "active" || i.version !== input.version) fail("This item is reserved, sold, or its price changed. Refresh before paying.", 409);
    if (i.seller_email === input.email) fail("Use a buyer email different from the seller.");
    facebookContactSchema.parse(i.data.facebookContactUrl);
    // Serialize approval/opt-in changes with checkout. Existing paid orders remain accessible.
    const p = (await c.query("SELECT * FROM community_resale_partners WHERE tenant_id=$1 FOR SHARE", [t.id])).rows[0];
    if (!p?.approved || !p.opted_in) fail("This rescue has paused new sales.", 409);
    const split = i.data.proceedsMode === "split_50", amount = i.data.askingCents;
    if (split && (!p.data.allowSplit || amount < (p.data.splitMinimumCents || 5000))) fail("This split sale no longer meets the rescue's settings.", 409);
    const contributorAccountId = split ? await requirePayoutAccount(t.id, sellerIdentity(i.seller_email)) : null;
    const economics = calculateDestinationChargeEconomics(amount, resalePlatformFee(amount));
    const metadata = { type: "community_resale", tenantId: t.id, resaleOrderId: id, proceedsMode: i.data.proceedsMode,
      ...(split ? { iRescueRevenueCents: String(economics.iRescueRevenueCents) } : getDestinationChargeEconomicsMetadata(economics)) };
    const stripeParams = { mode: "payment", payment_method_types: ["card"], customer_email: input.email,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${communityBase()}/resale/order/${id}`,
      cancel_url: `${communityBase()}/resale/order/${id}?cancelled=1`,
      line_items: [{ price_data: { currency: "usd", unit_amount: amount, product_data: { name: i.data.title,
        description: "Secondhand goods. Arrange local pickup in Messenger. Not a charitable purchase receipt." } }, quantity: 1 }],
      metadata, payment_intent_data: split ? { transfer_group: `resale_${id}`, metadata }
        : { on_behalf_of: t.stripeConnectedAccountId, transfer_data: { destination: t.stripeConnectedAccountId },
          application_fee_amount: economics.applicationFeeTotalCents, metadata } };
    const data = { itemTitle: i.data.title, facebookContactUrl: i.data.facebookContactUrl, amountCents: amount, version: i.version,
      proceedsMode: i.data.proceedsMode, platformRevenueCents: economics.iRescueRevenueCents,
      rescueAccountId: t.stripeConnectedAccountId, contributorAccountId, pickupCode: randomBytes(6).toString("hex"),
      encryptedOrderToken: encrypt(token), stripeParams,
      ...(split ? { split: { status: "awaiting_payment", contributorCents: null, rescueCents: null } } : {}) };
    order = (await c.query("INSERT INTO community_resale_orders(id,tenant_id,item_id,buyer_email,token_hash,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [id, t.id, i.id, input.email, hashResale(token), data])).rows[0];
    await c.query("UPDATE community_resale_items SET status='reserved' WHERE id=$1", [i.id]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  const session = await stripe.checkout.sessions.create(order.data.stripeParams, { idempotencyKey: `community-resale-${id}` });
  await pool.query("UPDATE community_resale_orders SET session_id=$2 WHERE id=$1", [id, session.id]);
  if (!session.url || session.status !== "open") fail("Checkout is not open. Recover the order using your email.", 409);
  res.json({ url: session.url, orderId: id, token });
}));
async function ownedOrder(req: any) {
  const r = (await pool.query("SELECT * FROM community_resale_orders WHERE id=$1", [uuid.parse(req.params.id)])).rows[0];
  if (!r) fail("Order not found", 404);
  const token = req.get("X-Order-Token");
  if (token && /^[a-f0-9]{64}$/.test(token) && r.token_hash === hashResale(token)) return r;
  const email = await communityVerified(req);
  if (email !== r.buyer_email) fail("Order not found", 404);
  return r;
}
router.get("/orders/:id/recovery", communityRoute(async (req: any, res: any) => {
  const r = (await pool.query("SELECT tenant_id FROM community_resale_orders WHERE id=$1", [uuid.parse(req.params.id)])).rows[0];
  if (!r) fail("Order not found", 404);
  const { partner } = await communityPartner(r.tenant_id);
  res.json({ tenantId: r.tenant_id, rescueName: partner.name });
}));
router.get("/orders/:id", communityRoute(async (req: any, res: any) => {
  const r = await ownedOrder(req);
  res.json(communityOrderView(await syncCommunityOrder(r.id, r.tenant_id), true));
}));
router.post("/orders/:id/cancel", communityRoute(async (req: any, res: any) => {
  const r = await ownedOrder(req), updated = await syncCommunityOrder(r.id, r.tenant_id);
  if (updated.status === "checkout") {
    await stripeService.getPlatformStripeClient()!.checkout.sessions.expire(updated.session_id);
    await syncCommunityOrder(r.id, r.tenant_id);
  } else if (updated.status !== "expired") fail("A paid order cannot be cancelled here. Contact the rescue.", 409);
  res.json({ ok: true });
}));
router.post("/orders/:id/confirm-pickup", communityRoute(async (req: any, res: any) => {
  const email = await communityVerified(req), id = uuid.parse(req.params.id);
  const { code } = z.object({ code: z.string().trim().regex(/^[a-f0-9]{12}$/i) }).strict().parse(req.body);
  const r = (await pool.query(`SELECT o.* FROM community_resale_orders o JOIN community_resale_items i ON i.id=o.item_id
    WHERE o.id=$1 AND i.seller_email=$2`, [id, email])).rows[0];
  if (!r) fail("Sale not found", 404);
  await syncCommunityOrder(id, r.tenant_id);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const update = await c.query(`UPDATE community_resale_orders SET status='completed',data=jsonb_set(data,'{pickupConfirmedAt}',to_jsonb(now()::text))
      WHERE id=$1 AND status='paid' AND data->>'pickupCode'=$2 AND COALESCE(data->>'disputed','false')='false' RETURNING item_id`,
      [id, code.toLowerCase()]);
    if (!update.rows.length) fail("Incorrect code or payment is not eligible for handoff.", 409);
    await c.query("UPDATE community_resale_items SET status='completed' WHERE id=$1", [r.item_id]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  if (r.data.proceedsMode === "split_50") {
    try { await settleResaleSplit(id, r.tenant_id, undefined, "community"); }
    catch { console.warn("[Community resale] Settlement queued for reconciliation"); }
  }
  res.json({ ok: true });
}));
router.use((error: any, _req: any, res: any, _next: any) => {
  res.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Photo must be smaller than 8 MB." : "Unable to upload this photo." });
});
export default router;
