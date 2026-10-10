import type { Express, Request, Response, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db";
import { hasFreeSquaresAccess } from "../../shared/free-squares";
import { FreeSquaresStore, SquareError } from "../services/free-squares";
import { getAppBaseUrl } from "../lib/app-base-url";
import { createReservationNotifier, type ReservationNotifier } from "../services/free-square-notifications";

type DeliveryResult = { accepted: boolean; providerId?: string; error?: string; uncertain?: boolean };
export type SquareDelivery = (input: {
  tenantId: string; to: string; subject: string; body: string; unsubscribeUrl: string;
  sentBy: { id: string; name: string };
}) => Promise<DeliveryResult>;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const deliverSquareEmail: SquareDelivery = async input => {
  const { EmailService } = await import("../lib/email-service");
  const service = await EmailService.forTenant(input.tenantId);
  if (!service) return { accepted: false, error: "Email is not configured or the email quota is exhausted." };
  const result = await service.send({
    to: input.to, subject: input.subject,
    html: `<div style="white-space:pre-wrap">${escapeHtml(input.body)}</div><p><a href="${escapeHtml(input.unsubscribeUrl)}">Stop reservation messages</a></p>`,
    text: `${input.body}\n\nStop reservation messages: ${input.unsubscribeUrl}`,
  });
  // The existing provider reports success with no ID for suppressed recipients.
  // That is not an accepted send.
  return { accepted: result.success && !!result.messageId, providerId: result.messageId,
    uncertain: !result.success && !/Email API error: 4\d\d|quota|limit|suppressed|not configured/i.test(result.error || ""),
    error: result.error || (!result.messageId ? "Message was not accepted; the address may be suppressed." : undefined) };
};
export const deliverSquareSms: SquareDelivery = async input => {
  const { sendSms } = await import("../lib/twilio-service");
  const result = await sendSms(input.tenantId, input.to,
    `${input.body}\nReply STOP to unsubscribe.`, "notification", { sentBy: input.sentBy });
  return { accepted: result.status === "sent" && !!result.sid, providerId: result.sid, error: result.error,
    uncertain: result.status === "failed" && !/not configured|quiet hours|paused|21610|unsubscribed|opted.out|not a valid|invalid.*number/i.test(result.error || "") };
};

export function registerFreeSquaresRoutes(app: Express, deps: {
  requireTenant: RequestHandler;
  requireAuth: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  store?: FreeSquaresStore;
  email?: SquareDelivery;
  sms?: SquareDelivery;
  notifyReservation?: ReservationNotifier;
}) {
  const store = deps.store || new FreeSquaresStore(pool);
  const notifyReservation = deps.notifyReservation || createReservationNotifier(store.pool);
  const wrap = (handler: (req: Request, res: Response) => Promise<any>): RequestHandler =>
    (req, res, next) => { Promise.resolve(handler(req, res)).catch(error => {
      if (error instanceof SquareError) return res.status(error.status).json({ error: error.message });
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message || "Invalid request." });
      // An idempotency-key collision between different boards can also race.
      if (error?.code === "23505") return res.status(409).json({ error: "This square or request was already reserved. Refresh and try again." });
      console.error("[free-squares] Request failed", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Unable to complete this request. Please try again." });
    }); };
  const enabled: RequestHandler = (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex, nofollow");
    if (!hasFreeSquaresAccess(req.tenant?.id)) return res.status(404).json({ error: "Feature not available." });
    next();
  };
  const ready: RequestHandler = (_req, res, next) => {
    store.ensureSchema().then(() => next()).catch(error => {
      console.error("[free-squares] Schema unavailable", error.message);
      res.status(503).json({ error: "The squares board is temporarily unavailable." });
    });
  };
  const ids: RequestHandler = (req, res, next) => {
    for (const key of ["id", "reservationId"]) {
      if (req.params[key] && !z.string().uuid().safeParse(req.params[key]).success)
        return res.status(400).json({ error: "Invalid board or reservation ID." });
    }
    next();
  };
  const sameTenant: RequestHandler = (req, res, next) => {
    if (req.user?.tenantId !== req.tenant?.id)
      return res.status(403).json({ error: "This user does not belong to this rescue." });
    next();
  };
  const publicGuards = [deps.requireTenant, enabled, ready, ids];
  const staffGuards = [deps.requireTenant, enabled, deps.requireAuth, sameTenant,
    deps.requireRole("staff"), ready, ids];
  const reservationLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 15,
    standardHeaders: true, legacyHeaders: false, message: { error: "Too many reservation attempts. Please try again later." } });
  const messageLimit = rateLimit({ windowMs: 60 * 1000, max: 20,
    standardHeaders: true, legacyHeaders: false, message: { error: "Please wait before sending more messages." } });

  // Scanner-safe preference page. GET never changes consent; explicit POST does.
  app.get("/api/free-squares/unsubscribe/:token", ready, wrap(async (req, res) => {
    z.string().uuid().parse(req.params.token);
    const result = await store.pool.query(`SELECT id FROM free_square_reservations WHERE unsubscribe_token=$1`, [req.params.token]);
    if (!result.rowCount) throw new SquareError(404, "Preference link not found.");
    res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex, nofollow")
      .set("Referrer-Policy", "no-referrer").type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reservation messages</title></head><body><main><h1>Stop reservation messages</h1><p>This stops email and text updates for your existing free-square reservations with this rescue. It does not cancel your squares.</p><form method="post"><button type="submit">Stop reservation messages</button></form></main></body></html>`);
  }));
  app.post("/api/free-squares/unsubscribe/:token", ready, wrap(async (req, res) => {
    z.string().uuid().parse(req.params.token);
    await store.unsubscribe(req.params.token);
    res.set("Cache-Control", "no-store").type("html").send("<h1>You have unsubscribed</h1><p>Your squares are still reserved.</p>");
  }));
  app.get("/api/free-squares/public/:id", ...publicGuards, wrap(async (req, res) =>
    res.json(await store.publicBoard(req.tenant!.id, req.params.id))));
  app.post("/api/free-squares/public/:id/reservations", ...publicGuards, reservationLimit, wrap(async (req, res) => {
    const result = await store.reserve(req.tenant!.id, req.params.id, req.body);
    // reserve() serializes concurrent requests and marks idempotent replays.
    // Only the request that created the reservation may send this notification.
    if (!result.replay) {
      try {
        await notifyReservation(req.tenant!.id, req.params.id, result.reservation.id);
      } catch (error) {
        // Email failure must not undo booked squares or invite a second booking.
        // Do not auto-retry an uncertain provider response (could duplicate mail).
        console.error("[free-squares] Rescue notification failed", {
          tenantId: req.tenant!.id, reservationId: result.reservation.id,
          error: error instanceof Error ? error.message : "Unknown notification error",
        });
      }
    }
    res.status(201).json(result);
  }));
  app.get("/api/free-squares", ...staffGuards, wrap(async (req, res) =>
    res.json({ boards: await store.list(req.tenant!.id) })));
  app.post("/api/free-squares", ...staffGuards, wrap(async (req, res) =>
    res.status(201).json({ board: await store.create(req.tenant!.id, req.user!.id, req.body) })));
  app.get("/api/free-squares/:id", ...staffGuards, wrap(async (req, res) =>
    res.json(await store.detail(req.tenant!.id, req.params.id))));
  app.patch("/api/free-squares/:id", ...staffGuards, wrap(async (req, res) =>
    res.json({ board: await store.update(req.tenant!.id, req.params.id, req.body) })));
  app.post("/api/free-squares/:id/assign-digits", ...staffGuards, wrap(async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json({ board: await store.assignDigits(req.tenant!.id, req.params.id, req.user!.id) });
  }));
  app.post("/api/free-squares/:id/reservations/:reservationId/cancel", ...staffGuards, wrap(async (req, res) => {
    await store.cancel(req.tenant!.id, req.params.id, req.params.reservationId);
    res.json({ success: true });
  }));
  app.post("/api/free-squares/:id/reservations/:reservationId/messages", ...staffGuards, messageLimit, wrap(async (req, res) => {
    const tenantId = req.tenant!.id;
    // Honor the rescue's global communications pause for email AND SMS.
    const settings = await store.pool.query(`SELECT comms_paused FROM tenants WHERE id=$1`, [tenantId]);
    if (settings.rows[0]?.comms_paused) throw new SquareError(409, "Outbound communications are paused for this rescue.");
    const prepared = await store.prepareMessage(tenantId, req.params.id, req.params.reservationId, req.user!.id, req.body);
    const { message, reservation } = prepared;
    if (!prepared.fresh) {
      const { id, reservation_id, channel, subject, body, status, error, created_at } = message;
      return res.json({ message: { id, reservation_id, channel, subject, body, status, error, created_at } });
    }
    const deliver = message.channel === "email" ? deps.email || deliverSquareEmail : deps.sms || deliverSquareSms;
    let result: DeliveryResult;
    try {
      result = await deliver({
        tenantId, to: message.channel === "email" ? reservation.email : reservation.phone,
        subject: message.subject || "", body: message.body,
        unsubscribeUrl: `${getAppBaseUrl()}/api/free-squares/unsubscribe/${reservation.unsubscribe_token}`,
        sentBy: { id: req.user!.id, name: req.user!.fullName || "Rescue staff" },
      });
    } catch {
      // A timeout may occur after provider acceptance. Never auto-retry.
      const saved = await store.finishMessage(tenantId, message.id, "unknown",
        "Delivery could not be confirmed. Check your provider before sending again.");
      return res.json({ message: saved });
    }
    if (message.channel === "sms" && !result.accepted && /21610|unsubscribed|opted.out/i.test(result.error || "")) {
      await store.pool.query(`UPDATE free_square_reservations SET sms_revoked_at=now()
        WHERE tenant_id=$1 AND phone=$2`, [tenantId, reservation.phone]);
    }
    const saved = await store.finishMessage(tenantId, message.id,
      result.accepted ? "accepted" : result.uncertain ? "unknown" : "failed",
      result.accepted ? null : result.uncertain
        ? "Delivery could not be confirmed. Check your provider before sending again."
        : result.error || "Provider rejected this message.", result.providerId);
    res.json({ message: saved });
  }));
}
