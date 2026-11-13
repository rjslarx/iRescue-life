import { Router } from "express";
import { randomUUID, randomInt, randomBytes } from "node:crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import { pool } from "../db";
import { requireAuth, requireRoleOrPageAccess } from "../middleware/auth";
import { isTwilioEnabled, sendSms } from "../lib/twilio-service";
import { stripeService } from "../lib/stripe-service";
import { calculatePlatformFee, calculateDestinationChargeEconomics, getDestinationChargeEconomicsMetadata } from "../config/platform";
import { resaleItemSchema, resaleSettingsSchema, resalePhone, resaleMessageAllowed, resaleCsvCell } from "@shared/rescue-resale";
import { hashResale, resaleTenant, resaleBase, resaleSettings, resalePublicItem, resaleOrder, resaleConversation, sendResaleMessage, syncResaleOrder } from "../services/rescue-resale";
import { applyResaleOffer, resaleOfferAction } from "../services/resale-offers";
import { resaleAuditFilter, resaleAuditQuery } from "../services/resale-audit";

const router = Router();
const uuid = z.string().uuid();
const route = (fn: any) => async (req: any, res: any, next: any) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues.map(i => i.message).join("; ") });
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("[Resale]", e.message);
    res.status(503).json({ error: "This action could not finish. Please try again or contact the rescue." });
  }
};
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.get("/config", route(async (req: any, res: any) => {
  const tenant = await resaleTenant(req.tenant.id);
  const enabled = await isTwilioEnabled(req.tenant.id);
  const settings = enabled ? await resaleSettings(req.tenant.id) : { pickupOptions: [] };
  res.json({ enabled, checkoutEnabled: enabled && !!tenant.stripeEnabled && !!tenant.stripeConnectedAccountId && !!stripeService.getPlatformStripeClient(),
    rescueName: tenant.name, pickupOptions: settings.pickupOptions.filter((p: any) => Date.parse(p.startsAt) > Date.now()) });
}));
router.use(async (req, res, next) => {
  try {
    if (!await isTwilioEnabled(req.tenant!.id)) return res.status(403).json({ error: "Rescue Resale requires this rescue's Twilio SMS setup." });
    next();
  } catch (e) { next(e); }
});
const smsLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });
const writeLimit = rateLimit({ windowMs: 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });
router.post("/auth/request", smsLimit, route(async (req: any, res: any) => {
  const input = z.object({ phone: z.string().max(30), consent: z.literal(true) }).parse(req.body);
  let phone: string;
  try { phone = resalePhone(input.phone); } catch { fail("Enter a valid US phone number"); }
  // Durable phone throttle, across replicas.
  const client = await pool.connect();
  const id = randomUUID(), code = String(randomInt(100000, 1000000));
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`resale-auth:${req.tenant.id}:${phone!}`]);
    const { rows } = await client.query(`SELECT count(*)::int AS count FROM rescue_resale_auth WHERE tenant_id=$1 AND phone=$2 AND created_at>now()-interval '1 hour'`, [req.tenant.id, phone!]);
    if (rows[0].count >= 3) fail("Too many verification requests for this number. Try again in an hour.", 429);
    await client.query("INSERT INTO rescue_resale_auth(id,tenant_id,phone,code_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
      [id, req.tenant.id, phone!, hashResale(`${id}:${code}`)]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  const result = await sendSms(req.tenant.id, phone!, `Your Rescue Resale verification code is ${code}. It expires in 10 minutes. Do not share it. Reply STOP to unsubscribe.`, "notification", { bypassQuietHours: true });
  if (result.status !== "sent") fail("We couldn't send a verification text. Check the number or contact the rescue.", 503);
  res.json({ challengeId: id });
}));
router.post("/auth/verify", smsLimit, route(async (req: any, res: any) => {
  const input = z.object({ challengeId: uuid, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const token = randomBytes(32).toString("hex");
  // Atomically consume at most one successful code. Invalid attempts also consume the budget.
  const r = await pool.query(`UPDATE rescue_resale_auth SET attempts=attempts+1,
    token_hash=CASE WHEN code_hash=$3 THEN $4 ELSE token_hash END,
    expires_at=CASE WHEN code_hash=$3 THEN now()+interval '7 days' ELSE expires_at END
    WHERE id=$1 AND tenant_id=$2 AND expires_at>now() AND attempts<5 AND token_hash IS NULL
    RETURNING token_hash`, [input.challengeId, req.tenant.id, hashResale(`${input.challengeId}:${input.code}`), hashResale(token)]);
  if (!r.rows.length || r.rows[0].token_hash !== hashResale(token)) fail("Invalid or expired code. Request a new code if needed.", 401);
  res.json({ token });
}));
async function verified(req: any) {
  const token = req.get("X-Resale-Token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail("Verify your phone to continue.", 401);
  const row = (await pool.query("SELECT phone FROM rescue_resale_auth WHERE tenant_id=$1 AND token_hash=$2 AND expires_at>now()", [req.tenant.id, hashResale(token)])).rows[0];
  if (!row) fail("Your verification expired. Verify your phone again.", 401);
  return row.phone as string;
}
router.get("/items", route(async (req: any, res: any) => {
  const { rows } = await pool.query("SELECT * FROM rescue_resale_items WHERE tenant_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 200", [req.tenant.id]);
  res.json({ items: rows.map(resalePublicItem) });
}));
router.get("/items/:id", route(async (req: any, res: any) => {
  const r = (await pool.query("SELECT * FROM rescue_resale_items WHERE id=$1 AND tenant_id=$2 AND status='active'", [uuid.parse(req.params.id), req.tenant.id])).rows[0];
  if (!r) fail("Listing not available", 404);
  res.json(resalePublicItem(r));
}));
async function conversationView(c: any, phone?: string) {
  const messages = (await pool.query(`SELECT m.body,m.sender,m.status,m.created_at AS "createdAt",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('recipient',d.recipient,'status',d.status,
      'errorCode',d.error_code,'updatedAt',d.updated_at) ORDER BY d.created_at)
      FROM rescue_resale_deliveries d WHERE d.message_id=m.id AND d.tenant_id=$2),'[]'::jsonb) AS deliveries
    FROM rescue_resale_messages m WHERE m.conversation_id=$1 ORDER BY m.created_at LIMIT 300`, [c.id, c.tenant_id])).rows;
  const expired = c.expires_at && new Date(c.expires_at).getTime() <= Date.now() && ["accepted", "countered", "pending"].includes(c.offer_status);
  return { id: c.id, code: c.code, itemId: c.item_id, itemTitle: c.item_title,
    role: c.buyer_phone === phone ? "buyer" : "donor", offerCents: c.offer_cents,
    offerStatus: expired ? "expired" : c.offer_status, expiresAt: c.expires_at, updatedAt: c.updated_at, messages,
    ...(c.delivery_summary ? { deliverySummary: c.delivery_summary } : {}) };
}
router.get("/me", route(async (req: any, res: any) => {
  const phone = await verified(req);
  const items = (await pool.query("SELECT * FROM rescue_resale_items WHERE tenant_id=$1 AND phone=$2 ORDER BY created_at DESC", [req.tenant.id, phone])).rows;
  const conversations = (await pool.query(`SELECT c.*,i.data->>'title' AS item_title FROM rescue_resale_conversations c JOIN rescue_resale_items i ON i.id=c.item_id
    WHERE c.tenant_id=$1 AND (c.buyer_phone=$2 OR i.phone=$2) ORDER BY c.updated_at DESC LIMIT 100`, [req.tenant.id, phone])).rows;
  const orders = (await pool.query("SELECT * FROM rescue_resale_orders WHERE tenant_id=$1 AND buyer_phone=$2 ORDER BY created_at DESC LIMIT 100", [req.tenant.id, phone])).rows;
  res.json({ items: items.map((i: any) => ({ ...resalePublicItem(i), reviewNote: i.review_note })),
    conversations: await Promise.all(conversations.map(c => conversationView(c, phone))), orders: orders.map(r => resaleOrder(r)) });
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
router.post("/images", writeLimit, async (req: any, res, next) => {
  try { req.resalePhone = await verified(req); next(); } catch (e: any) { res.status(e.status || 400).json({ error: e.message }); }
}, upload.single("file"), route(async (req: any, res: any) => {
  if (!req.file) fail("Choose an image");
  const count = (await pool.query("SELECT count(*)::int n FROM rescue_resale_images WHERE tenant_id=$1 AND phone=$2 AND created_at>now()-interval '1 day'", [req.tenant.id, req.resalePhone])).rows[0].n;
  if (count >= 30) fail("Daily photo limit reached", 429);
  let content: Buffer;
  try { content = await sharp(req.file.buffer, { limitInputPixels: 25000000 }).rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); }
  catch { fail("Please upload a valid JPEG, PNG, or WebP photo."); }
  const { TenantFileStorage } = await import("../lib/tenantFileStorage");
  const result = await new TenantFileStorage(req.tenant.id).uploadFile({
    tenantId: req.tenant.id, userId: `resale-${hashResale(req.resalePhone)}`, category: "animal-photos",
    visibility: "public", fileName: `resale-${randomUUID()}.jpg`, mimeType: "image/jpeg", content: content!,
  });
  if (!result.success) fail("Photo upload failed", 503);
  await pool.query("INSERT INTO rescue_resale_images(url,tenant_id,phone) VALUES($1,$2,$3)", [result.fileUrl, req.tenant.id, req.resalePhone]);
  res.json({ imageUrl: result.fileUrl });
}));
router.post("/items", writeLimit, route(async (req: any, res: any) => {
  const phone = await verified(req), data = resaleItemSchema.parse(req.body);
  if (!resaleMessageAllowed(data.title) || !resaleMessageAllowed(data.description.slice(0, 1000)) ||
    /https?:|www\.|@|\+?\d[\d\s().-]{6,}\d/.test(data.description)) fail("Remove personal contact details and links from the public listing.");
  const images = (await pool.query("SELECT url FROM rescue_resale_images WHERE tenant_id=$1 AND phone=$2 AND url=ANY($3::text[])", [req.tenant.id, phone, data.photos])).rows;
  if (new Set(images.map(i => i.url)).size !== new Set(data.photos).size) fail("Use photos uploaded for your verified account.");
  const count = (await pool.query("SELECT count(*)::int n FROM rescue_resale_items WHERE tenant_id=$1 AND phone=$2 AND created_at>now()-interval '1 day'", [req.tenant.id, phone])).rows[0].n;
  if (count >= 10) fail("Daily listing limit reached", 429);
  const id = randomUUID();
  await pool.query("INSERT INTO rescue_resale_items(id,tenant_id,phone,data) VALUES($1,$2,$3,$4)", [id, req.tenant.id, phone, data]);
  res.json({ id });
}));
router.post("/items/:id/withdraw", writeLimit, route(async (req: any, res: any) => {
  const phone = await verified(req);
  const r = await pool.query("UPDATE rescue_resale_items SET status='withdrawn' WHERE id=$1 AND tenant_id=$2 AND phone=$3 AND status IN ('active','pending_review','rejected') RETURNING id", [uuid.parse(req.params.id), req.tenant.id, phone]);
  if (!r.rows.length) fail("Listing cannot be withdrawn while reserved or sold.", 409);
  res.json({ ok: true });
}));
const messageSchema = z.object({ body: z.string().trim().min(1).max(1000), offerCents: z.number().int().min(100).max(500000).optional() }).strict();
router.post("/items/:id/messages", writeLimit, route(async (req: any, res: any) => {
  const phone = await verified(req), input = messageSchema.parse(req.body);
  if (!resaleMessageAllowed(input.body)) fail("Remove contact details, addresses, links, or outside payment instructions.");
  const i = (await pool.query("SELECT * FROM rescue_resale_items WHERE id=$1 AND tenant_id=$2 AND status='active'", [uuid.parse(req.params.id), req.tenant.id])).rows[0];
  if (!i || i.phone === phone) fail("This listing cannot receive your inquiry.", 409);
  let c = (await pool.query("SELECT * FROM rescue_resale_conversations WHERE item_id=$1 AND buyer_phone=$2", [i.id, phone])).rows[0];
  if (!c) {
    for (let tries = 0; tries < 5 && !c; tries++) {
      await pool.query(`INSERT INTO rescue_resale_conversations(id,tenant_id,item_id,buyer_phone,code) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [randomUUID(), req.tenant.id, i.id, phone, String(randomInt(100000, 1000000))]);
      c = (await pool.query("SELECT * FROM rescue_resale_conversations WHERE item_id=$1 AND buyer_phone=$2", [i.id, phone])).rows[0];
    }
  }
  if (!c) fail("Please try your inquiry again", 503);
  if (input.offerCents) {
    const auto = i.data.minCents && input.offerCents >= i.data.minCents;
    const updated = await pool.query(`UPDATE rescue_resale_conversations SET offer_cents=$2,offer_status=$3,expires_at=now()+interval '2 hours',updated_at=now()
      WHERE id=$1 AND (offer_status IN ('none','declined','expired') OR expires_at<=now()) RETURNING id`, [c.id, input.offerCents, auto ? "accepted" : "pending"]);
    if (!updated.rows.length) fail("An offer is already open. View My activity to respond.", 409);
  }
  const t = await resaleTenant(req.tenant.id);
  const text = `${input.body}${input.offerCents ? ` Offer: $${(input.offerCents / 100).toFixed(2)}.` : ""}`;
  // User text is filtered separately; secure site link is system-generated.
  try {
    await sendResaleMessage(req.tenant.id, c.id, "buyer", text);
    if (input.offerCents) await sendResaleMessage(req.tenant.id, c.id, "system", `Review the offer in My activity: ${resaleBase(t)}/rescue-resale . For pending offers, the donor can reply R${c.code} YES, R${c.code} NO, or R${c.code} COUNTER $20. Offers expire after two hours; items are not reserved until checkout.`);
  } catch (e: any) { fail(e.message, 502); }
  res.json({ id: c.id });
}));
async function ownedConversation(req: any) {
  const phone = await verified(req), c = await resaleConversation(uuid.parse(req.params.id), req.tenant.id);
  if (!c || (c.buyer_phone !== phone && c.donor_phone !== phone)) fail("Conversation not found", 404);
  return { c, phone, role: phone === c.buyer_phone ? "buyer" : "donor" };
}
router.post("/conversations/:id/messages", writeLimit, route(async (req: any, res: any) => {
  const { c, role } = await ownedConversation(req), input = messageSchema.parse(req.body);
  if (!["active","reserved","paid","completed"].includes(c.item_status)) fail("This conversation is closed.", 409);
  try { await sendResaleMessage(req.tenant.id, c.id, role, input.body); } catch (e: any) { fail(e.message, 502); }
  res.json({ ok: true });
}));
router.post("/conversations/:id/offer", writeLimit, route(async (req: any, res: any) => {
  const { c, phone } = await ownedConversation(req);
  const input = resaleOfferAction.parse(req.body);
  const result = await applyResaleOffer(req.tenant.id, c.id, phone, input);
  if (result.error) fail(result.error, 409);
  const t = await resaleTenant(req.tenant.id);
  try { await sendResaleMessage(req.tenant.id, c.id, "system", `Offer ${result.status} at $${(result.amountCents! / 100).toFixed(2)}. View My activity: ${resaleBase(t)}/rescue-resale . Accepted prices are valid for two hours, subject to availability. Donors can reply R${c.code} YES, R${c.code} NO, or R${c.code} COUNTER $20 to pending offers. Buyers can reply R${c.code} ACCEPT or R${c.code} NO to counteroffers.`); }
  catch (e: any) { fail(e.message, 502); }
  res.json({ ok: true });
}));

router.post("/checkout", writeLimit, route(async (req: any, res: any) => {
  const phone = await verified(req);
  const input = z.object({ itemId: uuid, conversationId: uuid.optional(), pickupId: uuid }).strict().parse(req.body);
  const t = await resaleTenant(req.tenant.id), stripe = stripeService.getPlatformStripeClient();
  if (!stripe || !t.stripeEnabled || !t.stripeConnectedAccountId) fail("The rescue must finish Stripe Connect setup before selling.", 409);
  // Reconcile stale holds against Stripe, never release an item based only on the browser clock.
  const held = (await pool.query("SELECT * FROM rescue_resale_orders WHERE item_id=$1 AND tenant_id=$2 AND status='checkout'", [input.itemId, t.id])).rows[0];
  if (held) {
    if (held.buyer_phone === phone || new Date(held.created_at).getTime() < Date.now() - 31 * 60000) {
      await syncResaleOrder(held.id, t.id);
    }
  }
  const client = await pool.connect();
  let order: any;
  try {
    await client.query("BEGIN");
    const i = (await client.query("SELECT * FROM rescue_resale_items WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [input.itemId, t.id])).rows[0];
    if (!i || i.phone === phone) fail("This item is not available to purchase.", 409);
    const existing = (await client.query("SELECT * FROM rescue_resale_orders WHERE item_id=$1 AND status='checkout'", [i.id])).rows[0];
    if (existing) {
      if (existing.buyer_phone !== phone) fail("Another buyer is checking out. Please try later.", 409);
      if (existing.data.pickup.id !== input.pickupId || (existing.data.conversationId || null) !== (input.conversationId || null)) fail("You have an open checkout with different details. Cancel it in My activity before changing pickup or price.", 409);
      order = existing;
    } else {
      if (i.status !== "active") fail("This item is no longer available.", 409);
      let amount = i.data.askingCents;
      if (input.conversationId) {
        const c = (await client.query(`SELECT * FROM rescue_resale_conversations WHERE id=$1 AND tenant_id=$2 AND item_id=$3 AND buyer_phone=$4
          AND offer_status='accepted' AND expires_at>now() FOR UPDATE`, [input.conversationId, t.id, i.id, phone])).rows[0];
        if (!c) fail("Your private offer is invalid or expired.", 409);
        amount = c.offer_cents;
      }
      const settings = await resaleSettings(t.id);
      const pickup = settings.pickupOptions.find((p: any) => p.id === input.pickupId && Date.parse(p.startsAt) > Date.now() + 35 * 60000 && i.data.fulfillment.includes(p.kind));
      if (!pickup) fail("Choose an available pickup starting at least 35 minutes from now.");
      const id = randomUUID();
      const economics = calculateDestinationChargeEconomics(amount, calculatePlatformFee(amount, t.subscriptionTier || "free", t.platformFeePercent));
      const metadata = { type: "rescue_resale", tenantId: t.id, resaleOrderId: id, ...getDestinationChargeEconomicsMetadata(economics) };
      const stripeParams = {
        mode: "payment", payment_method_types: ["card"], expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${resaleBase(t)}/rescue-resale?order=${id}`,
        cancel_url: `${resaleBase(t)}/rescue-resale?order=${id}&cancelled=1`,
        line_items: [{ price_data: { currency: "usd", unit_amount: amount, product_data: { name: i.data.title,
          description: `Rescue Resale purchase. Local pickup: ${pickup.label}. No charitable purchase receipt.` } }, quantity: 1 }],
        metadata,
        payment_intent_data: { on_behalf_of: t.stripeConnectedAccountId, transfer_data: { destination: t.stripeConnectedAccountId },
          application_fee_amount: economics.applicationFeeTotalCents, metadata },
      };
      const data = { itemTitle: i.data.title, amountCents: amount, pickup, conversationId: input.conversationId || null, stripeParams };
      order = (await client.query("INSERT INTO rescue_resale_orders(id,tenant_id,item_id,buyer_phone,data) VALUES($1,$2,$3,$4,$5) RETURNING *", [id, t.id, i.id, phone, data])).rows[0];
      await client.query("UPDATE rescue_resale_items SET status='reserved' WHERE id=$1", [i.id]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  // The persisted request and key make repeated clicks, network loss, and retries the same checkout.
  const session = order.session_id ? await stripe.checkout.sessions.retrieve(order.session_id) :
    await stripe.checkout.sessions.create(order.data.stripeParams, { idempotencyKey: `resale-${order.id}` });
  await pool.query("UPDATE rescue_resale_orders SET session_id=$2 WHERE id=$1", [order.id, session.id]);
  if (!session.url || session.status !== "open") fail("Checkout is no longer open. Check My activity for your order status.", 409);
  res.json({ url: session.url });
}));
router.get("/orders/:id", route(async (req: any, res: any) => {
  const phone = await verified(req), id = uuid.parse(req.params.id);
  const owned = (await pool.query("SELECT id FROM rescue_resale_orders WHERE id=$1 AND tenant_id=$2 AND buyer_phone=$3", [id, req.tenant.id, phone])).rows[0];
  if (!owned) fail("Order not found", 404);
  res.json(resaleOrder(await syncResaleOrder(id, req.tenant.id)));
}));
router.post("/orders/:id/cancel", writeLimit, route(async (req: any, res: any) => {
  const phone = await verified(req), id = uuid.parse(req.params.id);
  const r = (await pool.query("SELECT * FROM rescue_resale_orders WHERE id=$1 AND tenant_id=$2 AND buyer_phone=$3 AND status='checkout'", [id, req.tenant.id, phone])).rows[0];
  if (!r) fail("This order cannot be cancelled here.", 409);
  const synced = await syncResaleOrder(id, req.tenant.id);
  if (synced.status === "checkout") {
    await stripeService.getPlatformStripeClient()!.checkout.sessions.expire(synced.session_id);
    await syncResaleOrder(id, req.tenant.id);
  }
  res.json({ ok: true });
}));

router.use("/admin", requireAuth, requireRoleOrPageAccess("finance", "owner", "admin", "staff", "board_member"), (req, res, next) => {
  if (req.user?.tenantId !== req.tenant!.id) return res.status(403).json({ error: "Rescue access denied" });
  next();
});
router.get("/admin", route(async (req: any, res: any) => {
  const deliveryStatus = resaleAuditFilter.parse(req.query.deliveryStatus ?? "all");
  const [items, cs, orders, settings] = await Promise.all([
    pool.query("SELECT * FROM rescue_resale_items WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500", [req.tenant.id]),
    pool.query(resaleAuditQuery, [req.tenant.id, deliveryStatus]),
    pool.query("SELECT * FROM rescue_resale_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500", [req.tenant.id]),
    resaleSettings(req.tenant.id),
  ]);
  res.json({ settings, items: items.rows.map(i => ({ ...resalePublicItem(i), donorName: i.data.donorName, donorEmail: i.data.donorEmail, donorPhone: i.phone, reviewNote: i.review_note })),
    conversations: await Promise.all(cs.rows.map(c => conversationView(c))), orders: orders.rows.map(r => resaleOrder(r, true)) });
}));
router.put("/admin/settings", route(async (req: any, res: any) => {
  const data = resaleSettingsSchema.parse(req.body);
  if (new Set(data.pickupOptions.map(p => p.id)).size !== data.pickupOptions.length) fail("Each pickup window must have a unique ID.");
  await pool.query("INSERT INTO rescue_resale_settings(tenant_id,data) VALUES($1,$2) ON CONFLICT(tenant_id) DO UPDATE SET data=excluded.data", [req.tenant.id, data]);
  res.json(data);
}));
router.post("/admin/items/:id/review", route(async (req: any, res: any) => {
  const input = z.object({ status: z.enum(["active","rejected"]), note: z.string().trim().max(1000).default("") }).parse(req.body);
  const r = await pool.query("UPDATE rescue_resale_items SET status=$3,review_note=$4 WHERE id=$1 AND tenant_id=$2 AND status IN ('pending_review','active','rejected') RETURNING id",
    [uuid.parse(req.params.id), req.tenant.id, input.status, input.note]);
  if (!r.rows.length) fail("This listing cannot be changed while reserved or sold.", 409);
  res.json({ ok: true });
}));
router.post("/admin/orders/:id/sync", route(async (req: any, res: any) => {
  await syncResaleOrder(uuid.parse(req.params.id), req.tenant.id);
  res.json({ ok: true });
}));
router.post("/admin/orders/:id/complete", route(async (req: any, res: any) => {
  const id = uuid.parse(req.params.id), r = await syncResaleOrder(id, req.tenant.id);
  if (r.status !== "paid") fail("Only a confirmed paid sale can be marked picked up.", 409);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const changed = await client.query("UPDATE rescue_resale_orders SET status='completed' WHERE id=$1 AND status='paid' RETURNING item_id", [id]);
    if (changed.rows.length) await client.query("UPDATE rescue_resale_items SET status='completed' WHERE id=$1", [changed.rows[0].item_id]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  res.json({ ok: true });
}));
router.get("/admin/ledger.csv", route(async (req: any, res: any) => {
  const { rows } = await pool.query("SELECT * FROM rescue_resale_orders WHERE tenant_id=$1 ORDER BY created_at", [req.tenant.id]);
  const csv = [["Order ID","Item","Created","Status","Gross USD","Stripe Fee USD","Original Platform Revenue USD","Actual Rescue Proceeds USD","Refunded USD","Payment Intent","Pickup"],
    ...rows.map(r => [r.id,r.data.itemTitle,r.created_at.toISOString(),r.status,(r.data.amountCents/100).toFixed(2),
      r.stripe_fee_cents === null ? "" : (r.stripe_fee_cents/100).toFixed(2),
      r.platform_fee_cents === null ? "" : (r.platform_fee_cents/100).toFixed(2),
      r.rescue_proceeds_cents === null ? "" : (r.rescue_proceeds_cents/100).toFixed(2),
      (r.refunded_cents/100).toFixed(2),r.payment_intent_id,r.data.pickup.label])]
    .map(row => row.map(resaleCsvCell).join(",")).join("\r\n");
  res.type("text/csv").attachment("rescue-resale-sales.csv").send(csv);
}));
export default router;
