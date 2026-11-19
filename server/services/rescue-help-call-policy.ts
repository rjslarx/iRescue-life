import type { PoolClient } from "pg";
import { effectiveHelpSettings } from "./rescue-help-settings";
import { helpRecipientPhone } from "./rescue-help-recipient-phone";
import { smsPhoneKey } from "../lib/sms-suppression";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export function callError(message: string, status=409): never {
  throw Object.assign(new Error(message), { status });
}
export const isUsCallPhone = (phone: string) => {
  const parsed = parsePhoneNumberFromString(phone);
  return !!parsed?.isValid() && parsed.country === "US" &&
    ["MOBILE","FIXED_LINE","FIXED_LINE_OR_MOBILE"].includes(parsed.getType() || "");
};

export async function callPolicy(client: Pick<PoolClient,"query">, tenantId: string, threadId: string, userId: string) {
  const thread = (await client.query("SELECT * FROM rescue_help_threads WHERE id=$1 AND tenant_id=$2",[threadId,tenantId])).rows[0];
  if (!thread) callError("Conversation not found",404);
  const config = (await client.query(`SELECT h.enabled,h.phone,h.data,t.comms_paused,t.is_active
    FROM rescue_help_settings h JOIN tenants t ON t.id=h.tenant_id WHERE h.tenant_id=$1`,[tenantId])).rows[0];
  const user = (await client.query(`SELECT u.*, ARRAY(SELECT c.phone FROM contacts c
    WHERE c.user_id=u.id AND c.tenant_id=u.tenant_id AND c.phone IS NOT NULL) AS contact_phones
    FROM users u WHERE u.id=$1 AND u.tenant_id=$2`,[userId,tenantId])).rows[0];
  const settings = effectiveHelpSettings(tenantId,config?.data);
  const admin = user?.roles?.some((r:string)=>["owner","admin"].includes(r));
  if (!user?.is_active || (!admin && (!settings.teamIds.includes(userId) || thread.assignee_id!==userId)))
    callError("Only the assigned volunteer or a rescue administrator can call back.",403);
  if (!config?.enabled || !config.is_active || config.comms_paused) callError("The help line is disabled or communications are paused.");
  if (user.sms_opt_out_at) callError("Your account has opted out of phone notifications. Update your preferences before calling.");
  const staffPhone = helpRecipientPhone(user.phone,user.contact_phones);
  if (!staffPhone) callError("Add a valid mobile number to your account or linked contact profile before calling.");
  const callerPhone = thread.phone;
  if (!isUsCallPhone(staffPhone) || !isUsCallPhone(callerPhone)) callError("Callbacks require eligible US phone numbers. Withheld and international numbers cannot be called.");
  if (new Set([staffPhone,callerPhone,config.phone]).size!==3) callError("Staff, caller, and rescue phone numbers must be different.");
  if ((await client.query("SELECT id FROM tenants WHERE twilio_phone_number=$1",[config.phone])).rows.length)
    callError("Callbacks require a separate public help number, not an operational number.");
  const suppressed = await client.query(`SELECT 1 FROM sms_phone_suppressions
    WHERE tenant_id=$1 AND phone_key=ANY($2::text[]) AND suppressed=true LIMIT 1`,
    [tenantId,[smsPhoneKey(staffPhone),smsPhoneKey(callerPhone)]]);
  if (suppressed.rows.length) callError("A participant has opted out of contact from this rescue. Callback blocked.");
  // Apply existing account opt-outs to linked contact numbers too.
  const opted = (await client.query(`SELECT u.phone,ARRAY(SELECT c.phone FROM contacts c
    WHERE c.user_id=u.id AND c.tenant_id=u.tenant_id AND c.phone IS NOT NULL) AS contact_phones
    FROM users u WHERE u.tenant_id=$1 AND u.sms_opt_out_at IS NOT NULL`,[tenantId])).rows;
  if (opted.some(u=>[u.phone,...u.contact_phones].filter(Boolean).some(p=>[staffPhone,callerPhone].includes(helpRecipientPhone(p)!))))
    callError("A participant has opted out of contact from this rescue. Callback blocked.");
  return { thread, user, settings, fromPhone: config.phone as string, staffPhone, callerPhone };
}
