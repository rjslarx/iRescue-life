export interface TransportBroadcastResult {
  number: string;
  status: "sent" | "failed";
  error?: string;
  uncertain?: boolean;
}

// Match broadcastTransportUpdate's delivery deduplication, not array length.
export function transportPhoneKey(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

export const broadcastOutcomeCopy = {
  sent: { label: "Accepted for sending", guidance: "The SMS provider accepted these messages; delivery is not yet confirmed." },
  paused: { label: "Communications paused", guidance: "Ask an administrator to review the organization's communication pause. No messages were sent to these numbers." },
  unsubscribed: { label: "Recorded unsubscribes", guidance: "Respect these opt-outs. Do not resend or re-add these numbers to bypass consent." },
  failed: { label: "Provider or configuration failures", guidance: "Review the error details and SMS configuration with an administrator. Do not resend the entire broadcast, which could duplicate successful messages." },
  uncertain: { label: "Outcome uncertain", guidance: "Do not resend these messages. Check the SMS logs and provider records first; the provider may already have accepted them." },
};

export type BroadcastOutcome = keyof typeof broadcastOutcomeCopy;

export function summarizeTransportBroadcast(results: TransportBroadcastResult[]) {
  const groups: Record<BroadcastOutcome, TransportBroadcastResult[]> = {
    sent: [], paused: [], unsubscribed: [], failed: [], uncertain: [],
  };
  const seen = new Set<string>();
  for (const result of results) {
    const key = transportPhoneKey(result.number);
    if (seen.has(key)) continue;
    seen.add(key);
    const outcome: BroadcastOutcome = result.uncertain ? "uncertain"
      : result.status === "sent" ? "sent"
      : result.error === "Outbound communications are paused for this organization" ? "paused"
      : result.error === "Recipient has opted out of SMS for this organization" ? "unsubscribed"
      : result.status === "failed" ? "failed" : "uncertain";
    groups[outcome].push(result);
  }
  return { groups, total: seen.size, duplicates: results.length - seen.size };
}
