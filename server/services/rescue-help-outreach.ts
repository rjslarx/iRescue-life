import { randomUUID } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { pool } from "../db";
import { helpCanSend, helpSettings } from "./rescue-help";
import { canClaimHelp } from "@shared/rescue-help";

export function outreachPhone(value: string) {
  const phone = parsePhoneNumberFromString(value, "US");
  if (!phone?.isValid() || phone.country !== "US")
    throw Object.assign(new Error("Enter a valid US phone number."), { status: 400 });
  return phone.number;
}

// Preparing a conversation never calls Twilio. A unique tenant/phone key makes
// retries safe, while the row lock prevents stealing an existing assignment.
export async function prepareHelpOutreach(tenantId: string, userId: string, rawPhone: string) {
  const phone = outreachPhone(rawPhone);
  const client = await pool.connect();
  const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };
  try {
    await client.query("BEGIN");
    const user = (await client.query("SELECT roles,is_active FROM users WHERE id=$1 AND tenant_id=$2", [userId, tenantId])).rows[0];
    const help = await helpSettings(tenantId);
    const admin = user?.roles?.some((r: string) => ["owner", "admin"].includes(r));
    if (!user?.is_active || (!admin && !help.settings.teamIds.includes(userId))) fail("Inbox team access required.", 403);
    if (!help.enabled) fail("The rescue help line is not active.");
    if (phone === help.number) fail("Enter the recipient’s number, not the rescue’s number.");
    if (!await helpCanSend(tenantId, phone)) fail("Communications are paused or this recipient has opted out.");
    await client.query(`INSERT INTO rescue_help_threads(id,tenant_id,phone,status,assignee_id)
      VALUES($1,$2,$3,'human',$4) ON CONFLICT(tenant_id,phone) DO NOTHING`, [randomUUID(), tenantId, phone, userId]);
    const t = (await client.query("SELECT * FROM rescue_help_threads WHERE tenant_id=$1 AND phone=$2 FOR UPDATE", [tenantId, phone])).rows[0];
    if (!admin && t.assignee_id && t.assignee_id !== userId) fail("This conversation is assigned to another volunteer. Ask an administrator to reassign it.", 403);
    if (!t.assignee_id) {
      if (!canClaimHelp(help.settings, t, userId, !!admin)) fail("This conversation belongs to another category team.", 403);
      await client.query("UPDATE rescue_help_threads SET assignee_id=$2,status='human',updated_at=now() WHERE id=$1", [t.id, userId]);
    }
    await client.query("COMMIT");
    return { id: t.id, phone };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
