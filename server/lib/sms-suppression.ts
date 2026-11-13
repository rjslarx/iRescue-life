import { pool } from "../db";

export function smsPhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

export function smsOptOutCommand(body: unknown, optOutType: unknown): "STOP" | "START" | "HELP" | null {
  // Advanced Opt-Out is authoritative, including customized keywords.
  if (typeof optOutType === "string" && optOutType) {
    const type = optOutType.toUpperCase();
    return type === "STOP" || type === "START" || type === "HELP" ? type : null;
  }
  if (typeof body !== "string") return null;
  const word = body.trim().toUpperCase();
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"].includes(word)) return "STOP";
  // Bare YES already confirms medication in this application. Only provider
  // OptOutType=START may interpret YES as an opt-in event.
  if (["START", "UNSTOP"].includes(word)) return "START";
  if (["HELP", "INFO"].includes(word)) return "HELP";
  return null;
}

/** Only call with the tenant resolved by a successfully verified Twilio signature.
 * Never changes users.smsOptIn, account opt-outs, or any marketing preference.
 * Twilio provides no event timestamp here: distinct events follow database arrival
 * order; the permanent SID ledger prevents old redeliveries reversing newer state.
 */
export async function recordVerifiedSmsOptOut(tenantId: string, phone: string, sid: string, command: "STOP" | "START") {
  if (!/^SM[a-f0-9]{32}$/i.test(sid) || !smsPhoneKey(phone)) throw new Error("Invalid SMS opt-out event");
  await pool.query(`
    WITH event AS (
      INSERT INTO sms_opt_out_events (tenant_id, message_sid, phone_key, command)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (tenant_id,message_sid) DO NOTHING RETURNING tenant_id
    )
    INSERT INTO sms_phone_suppressions (tenant_id,phone_key,suppressed,updated_at)
    SELECT tenant_id,$3,$4='STOP',now() FROM event
    ON CONFLICT (tenant_id,phone_key) DO UPDATE
      SET suppressed=EXCLUDED.suppressed,updated_at=EXCLUDED.updated_at
  `, [tenantId, sid, smsPhoneKey(phone), command]);
}

export async function isSmsPhoneSuppressed(tenantId: string, phone: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT suppressed FROM sms_phone_suppressions WHERE tenant_id=$1 AND phone_key=$2",
    [tenantId, smsPhoneKey(phone)],
  );
  return result.rows[0]?.suppressed === true;
}
