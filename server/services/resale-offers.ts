import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { z } from "zod";

export const resaleOfferAction = z.object({
  action: z.enum(["accept", "decline", "counter"]),
  amountCents: z.number().int().min(100).max(500000).optional(),
}).strict();

/** Exact commands only: ordinary conversational sentences must not accept a sale. */
export function parseResaleCommand(text: string) {
  const value = text.trim();
  if (/^(yes|accept)$/i.test(value)) return { action: "accept" as const };
  if (/^(no|decline)$/i.test(value)) return { action: "decline" as const };
  const counter = /^counter\s+\$?(\d{1,4})(?:\.(\d{1,2}))?$/i.exec(value);
  if (counter) {
    const amountCents = Number(counter[1]) * 100 + Number((counter[2] || "").padEnd(2, "0"));
    if (amountCents >= 100 && amountCents <= 500000) return { action: "counter" as const, amountCents };
  }
  if (/^(yes|no|accept|decline|counter)(?:\s|$)/i.test(value)) return { error: "Use YES, NO, ACCEPT, or COUNTER $20 (from $1 to $5,000). Use My activity to review the current offer." };
  return null;
}

/** Shared by authenticated web actions and signature-validated SMS.
 * The item lock matches checkout's lock order. A webhook receipt and its state
 * transition commit together, so a repeated MessageSid can never accept a later offer.
 */
export async function applyResaleOffer(tenantId: string, conversationId: string, phone: string,
  input: z.infer<typeof resaleOfferAction>, inboundSid?: string) {
  input = resaleOfferAction.parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const item = (await client.query(`SELECT i.id,i.status FROM rescue_resale_items i
      JOIN rescue_resale_conversations c ON c.item_id=i.id
      WHERE c.id=$1 AND c.tenant_id=$2 AND (c.buyer_phone=$3 OR i.phone=$3) FOR UPDATE OF i`,
    [conversationId, tenantId, phone])).rows[0];
    if (!item) throw new Error("Conversation not found");
    const c = (await client.query(`SELECT c.*,i.phone AS donor_phone,c.expires_at>now() AS unexpired
      FROM rescue_resale_conversations c JOIN rescue_resale_items i ON i.id=c.item_id
      WHERE c.id=$1 AND c.tenant_id=$2 FOR UPDATE OF c`, [conversationId, tenantId])).rows[0];
    const role = c.buyer_phone === phone ? "buyer" : "donor";
    let receipt: string | undefined;
    if (inboundSid) {
      receipt = randomUUID();
      const inserted = await client.query(`INSERT INTO rescue_resale_messages
        (id,conversation_id,sender,body,status,inbound_sid) VALUES($1,$2,$3,$4,'command',$5)
        ON CONFLICT(inbound_sid) DO NOTHING RETURNING id`,
      [receipt, c.id, role, `SMS offer command: ${input.action}${input.amountCents ? ` $${(input.amountCents / 100).toFixed(2)}` : ""}`, inboundSid]);
      if (!inserted.rows.length) { await client.query("COMMIT"); return { duplicate: true as const }; }
    }
    let error: string | undefined;
    if (input.action === "counter" && (role !== "donor" || !input.amountCents))
      error = "Only the donor may counter a pending offer.";
    else if (item.status !== "active" || !c.unexpired || c.offer_status !== (role === "donor" ? "pending" : "countered"))
      error = "The offer expired, changed, or the item is no longer available. Review My activity before responding.";
    if (error) {
      if (receipt) await client.query("UPDATE rescue_resale_messages SET status='rejected',body=body || $2 WHERE id=$1", [receipt, ` — ${error}`]);
      await client.query("COMMIT");
      return { error };
    }
    const status = input.action === "accept" ? "accepted" : input.action === "decline" ? "declined" : "countered";
    const amountCents = input.action === "counter" ? input.amountCents! : c.offer_cents;
    await client.query(`UPDATE rescue_resale_conversations SET offer_status=$2,offer_cents=$3,
      expires_at=now()+interval '2 hours',updated_at=now() WHERE id=$1`, [c.id, status, amountCents]);
    await client.query("COMMIT");
    return { status, amountCents };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
