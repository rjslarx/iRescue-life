import type { ResaleConversation } from "@/hooks/use-rescue-resale";

export function deliveryLabel(status: string) {
  return ({
    accepted: "Accepted by Twilio — delivery not confirmed",
    sent: "Sent — delivery not confirmed",
    queued: "Queued — delivery not confirmed",
    scheduled: "Scheduled — delivery not confirmed",
    sending: "Sending — outcome not confirmed; do not resend",
    unknown: "Unknown outcome — do not resend",
    delivered: "Delivered", read: "Read", failed: "Failed", not_sent: "Not sent — blocked or rejected before acceptance",
    undelivered: "Undelivered", canceled: "Canceled",
    tracked: "See recipient statuses", command: "Command recorded",
    rejected: "Command rejected", blocked: "Blocked", pending: "Pending",
  } as Record<string, string>)[status] || status;
}

export function ResaleDeliveryStatus({ message }: { message: ResaleConversation["messages"][number] }) {
  if (!message.deliveries?.length) return <span>{deliveryLabel(message.status)}</span>;
  return <span>{message.deliveries.map((d, index) => <span className="block" key={index}>
    To {d.recipient}: {deliveryLabel(d.status)}{d.errorCode && ` · Twilio error ${d.errorCode}`}
    {" · "}{new Date(d.updatedAt).toLocaleString()}
  </span>)}</span>;
}
