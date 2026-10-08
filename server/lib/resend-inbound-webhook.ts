import { Webhook } from "svix";
import { z } from "zod";

const receivedData = z.object({
  email_id: z.string().uuid(),
  from: z.string(),
  to: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  subject: z.string().optional(),
}).passthrough();

export function verifyInboundWebhook(
  rawBody: unknown,
  headers: Record<string, string | string[] | undefined>,
  secret: string | undefined,
) {
  if (!secret) return { ok: false as const, status: 503, error: "Webhook verification is not configured" };
  if (!Buffer.isBuffer(rawBody)) return { ok: false as const, status: 400, error: "Raw webhook body required" };
  const names = ["svix-id", "svix-timestamp", "svix-signature"] as const;
  if (names.some(name => typeof headers[name] !== "string")) {
    return { ok: false as const, status: 401, error: "Missing webhook signature" };
  }
  let verified: unknown;
  try {
    verified = new Webhook(secret).verify(rawBody.toString("utf8"), {
      "svix-id": headers["svix-id"] as string,
      "svix-timestamp": headers["svix-timestamp"] as string,
      "svix-signature": headers["svix-signature"] as string,
    });
  } catch {
    return { ok: false as const, status: 401, error: "Invalid webhook signature" };
  }
  const envelope = z.object({ type: z.string(), created_at: z.string().optional(), data: z.unknown() }).safeParse(verified);
  if (!envelope.success) return { ok: false as const, status: 400, error: "Invalid webhook event" };
  if (envelope.data.type !== "email.received") return { ok: true as const, event: null };
  const event = z.object({
    type: z.literal("email.received"),
    created_at: z.string().datetime({ offset: true }),
    data: receivedData,
  }).safeParse(verified);
  if (!event.success) return { ok: false as const, status: 400, error: "Invalid received-email event" };
  return { ok: true as const, event: event.data };
}

export function inboundRecipients(to: string | string[]) {
  return [...new Set((Array.isArray(to) ? to : [to]).map(address => {
    const match = address.match(/<([^<>]+)>/);
    return (match ? match[1] : address).trim().toLowerCase();
  }).filter(Boolean))];
}
