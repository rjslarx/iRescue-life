import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { sendSms } from "../lib/twilio-service";
import { getAppBaseUrl } from "../lib/app-base-url";

export const deliveryRank: Record<string, number> = {
  unknown: 0, accepted: 1, scheduled: 1, queued: 2, sending: 3, sent: 4,
  not_sent: 5, failed: 5, undelivered: 5, canceled: 5, delivered: 6, read: 7,
};

/** Persist before sending: callbacks can arrive before the create response. Never retry here. */
export async function sendResaleSms(input: {
  tenantId: string; messageId?: string; orderId?: string;
  recipient: string; number: string; body: string; bypassQuietHours?: boolean;
}, transport: typeof sendSms = sendSms) {
  const id = randomUUID();
  await pool.query(`INSERT INTO rescue_resale_deliveries(id,tenant_id,message_id,order_id,recipient)
    VALUES($1,$2,$3,$4,$5)`, [id, input.tenantId, input.messageId || null, input.orderId || null, input.recipient]);
  const url = new URL("/api/webhooks/twilio/status", getAppBaseUrl());
  url.searchParams.set("resaleDelivery", id);
  let status = "unknown", sid: string | undefined;
  try {
    const result = await transport(input.tenantId, input.number, input.body, "proxy_message", {
      bypassQuietHours: input.bypassQuietHours, statusCallbackUrl: url.toString(),
    });
    sid = result.sid;
    status = sid ? "accepted" : result.uncertain ? "unknown" : "not_sent";
  } catch {
    // A transport or persistence exception cannot prove Twilio did not accept the SMS.
  }
  await pool.query(`UPDATE rescue_resale_deliveries SET provider_sid=COALESCE(provider_sid,$2),
    status=CASE WHEN status='unknown' THEN $3 ELSE status END,updated_at=now() WHERE id=$1`,
  [id, sid || null, status]);
  return status;
}

/** Only called after signature validation using this delivery's tenant credentials. */
export async function recordResaleDelivery(tenantId: string, id: string, sid: string, status: string, errorCode?: string) {
  if (!Object.hasOwn(deliveryRank, status)) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query(`SELECT * FROM rescue_resale_deliveries
      WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [id, tenantId])).rows[0];
    if (row && (!row.provider_sid || row.provider_sid === sid) &&
      deliveryRank[status] > (deliveryRank[row.status] ?? 0)) {
      await client.query(`UPDATE rescue_resale_deliveries SET provider_sid=$2,status=$3,error_code=$4,updated_at=now() WHERE id=$1`,
      [id, sid, status, /^\d{1,10}$/.test(errorCode || "") ? errorCode : null]);
      if (row.order_id) await client.query(`UPDATE rescue_resale_orders SET data=jsonb_set(data,ARRAY[$2],to_jsonb($3::text))
        WHERE id=$1 AND tenant_id=$4`, [row.order_id, `${row.recipient}Notice`, status, tenantId]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
