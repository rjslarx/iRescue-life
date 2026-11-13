import type { Request, Response } from "express";
import twilio from "twilio";
import { pool, db } from "../db";
import { smsMessageLogs } from "@shared/schema";
import { and, eq, ne } from "drizzle-orm";
import { getTwilioConfigForTenant } from "../lib/twilio-service";
import { getAppBaseUrl } from "../lib/app-base-url";
import { recordResaleDelivery } from "./resale-delivery";

export async function twilioDeliveryCallback(req: Request, res: Response) {
  try {
    const { MessageSid: sid, MessageStatus: status, AccountSid: accountSid, ErrorCode: errorCode } = req.body || {};
    const signature = req.get("x-twilio-signature");
    if (!signature) return res.status(403).send("Missing Twilio signature");
    if (typeof sid !== "string" || typeof status !== "string") return res.status(400).send("Missing status fields");
    const deliveryId = req.query.resaleDelivery;
    let tenantId: string | undefined;
    if (deliveryId !== undefined) {
      if (typeof deliveryId !== "string" || !/^[0-9a-f-]{36}$/i.test(deliveryId)) return res.sendStatus(400);
      tenantId = (await pool.query("SELECT tenant_id FROM rescue_resale_deliveries WHERE id=$1", [deliveryId])).rows[0]?.tenant_id;
    } else {
      tenantId = (await db.select({ tenantId: smsMessageLogs.tenantId }).from(smsMessageLogs)
        .where(eq(smsMessageLogs.twilioMessageSid, sid)).limit(1))[0]?.tenantId;
    }
    if (!tenantId) return res.sendStatus(403);
    const config = await getTwilioConfigForTenant(tenantId);
    const url = new URL(req.originalUrl, getAppBaseUrl()).toString();
    if (!config || accountSid !== config.accountSid ||
      !twilio.validateRequest(config.authToken, signature, url, req.body)) return res.sendStatus(403);
    if (typeof deliveryId === "string") await recordResaleDelivery(tenantId, deliveryId, sid, status, errorCode);
    const mapped = status === "delivered" || status === "read" ? "delivered" :
      ["failed", "undelivered", "canceled"].includes(status) ? "failed" : null;
    if (mapped) await db.update(smsMessageLogs).set({ status: mapped })
      .where(and(eq(smsMessageLogs.tenantId, tenantId), eq(smsMessageLogs.twilioMessageSid, sid),
        ne(smsMessageLogs.status, "delivered")));
    return res.type("text/xml").send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  } catch {
    // Ask Twilio to retry persistence failures, never to resend the outbound SMS.
    return res.sendStatus(500);
  }
}
