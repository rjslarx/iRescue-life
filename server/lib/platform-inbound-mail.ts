import { pool } from "../db";
import { Resend } from "resend";

export const PLATFORM_INBOUND_ADDRESSES = ["admin@irescue.life", "notifications@irescue.life"];

export function isPlatformInboundMail(recipients: string[]) {
  return recipients.some(address => PLATFORM_INBOUND_ADDRESSES.includes(address));
}

export function platformMailDestination(destination: string | undefined) {
  const address = destination?.trim().toLowerCase();
  if (!address || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new Error("Platform administrator email destination is not configured");
  }
  if (PLATFORM_INBOUND_ADDRESSES.includes(address)) {
    throw new Error("Platform mail destination would create a forwarding loop");
  }
  return address;
}

/** Platform mail never enters a rescue's inbox or medical-document pipeline. */
export async function forwardPlatformInboundMail(emailId: string) {
  const destination = platformMailDestination(process.env.PLATFORM_ADMIN_EMAIL);
  if (!process.env.PLATFORM_RESEND_API_KEY) throw new Error("Platform email service is not configured");
  const resend = new Resend(process.env.PLATFORM_RESEND_API_KEY);
  const key = `platform_inbound_forward:${emailId}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize duplicate deliveries, including across application instances.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const existing = await client.query("SELECT value FROM platform_settings WHERE key=$1", [key]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return { duplicate: true };
    }
    const received = await resend.emails.receiving.get(emailId);
    if (received.error || !received.data) throw new Error("Failed to retrieve platform email");
    const email = received.data;
    // The SDK forwarding helper posts through Resend.post. Add provider-level
    // idempotency as well as our durable record, covering a crash after send.
    const post = resend.post.bind(resend);
    resend.post = ((path, payload, options) => {
      if (path !== "/emails") return post(path, payload, options);
      const headers = new Headers(options?.headers);
      headers.set("Idempotency-Key", key);
      return post(path, { ...(payload as object), reply_to: email.reply_to?.length ? email.reply_to : email.from }, { ...options, headers });
    }) as typeof resend.post;
    // Resend's receiving.forward preserves original attachments. Add an explicit
    // header so the administrator can identify and respond to the original sender.
    const forwarded = await resend.emails.receiving.forward({
      emailId,
      from: "iRescue Platform Mail <notifications@irescue.life>",
      to: destination,
      passthrough: false,
      text: `Platform email received\nFrom: ${email.from}\nTo: ${email.to.join(", ")}\nSubject: ${email.subject}\n\n${email.text || "The original message is HTML-only; see the HTML message below."}`,
      ...(email.html ? { html: `<pre>From: ${escapeHtml(email.from)}\nTo: ${escapeHtml(email.to.join(", "))}\nSubject: ${escapeHtml(email.subject)}</pre><hr>${email.html}` } : {}),
    });
    if (forwarded.error || !forwarded.data?.id) throw new Error("Failed to forward platform email");
    await client.query(
      "INSERT INTO platform_settings (key,value,category,is_public,description) VALUES ($1,$2::jsonb,'email',false,'Platform inbound forwarding delivery record')",
      [key, JSON.stringify({ sourceEmailId: emailId, forwardedEmailId: forwarded.data.id, forwardedAt: new Date().toISOString() })],
    );
    await client.query("COMMIT");
    return { duplicate: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
