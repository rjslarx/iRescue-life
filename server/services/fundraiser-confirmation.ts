import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { fundraiserOrders } from "@shared/schema";
import { EmailService } from "../lib/email-service";

// The conditional transition shares ownership with the webhook: only the
// process that first marks the order paid sends the confirmation.
export async function reconcileFundraiserConfirmation(
  orderId: string, sessionId: string, tenantId: string, title: string, amountCents: number,
) {
  const [order] = await db.update(fundraiserOrders).set({ paymentStatus: "paid" })
    .where(and(eq(fundraiserOrders.id, orderId),
      eq(fundraiserOrders.stripeSessionId, sessionId),
      eq(fundraiserOrders.paymentStatus, "pending"))).returning();
  if (!order) return;
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
  try {
    const email = await EmailService.forTenant(tenantId);
    if (!email) throw new Error("Email service unavailable");
    await email.send({
      to: order.customerEmail,
      subject: `Order F-${order.orderNumber} confirmed - ${title}`,
      html: `<h2>Thank you for your purchase!</h2>
        <p><strong>Order #F-${order.orderNumber}</strong> — please show this number at pickup.</p>
        <p>${escape(title)}</p><p>Quantity: ${order.quantity}</p>
        <p>Amount paid: $${(amountCents / 100).toFixed(2)}</p>
        ${order.pickupTime ? `<p>Pickup: ${escape(order.pickupTime)}</p>` : ""}`,
    });
  } catch (error) {
    console.error("[Fundraiser confirmation] Email failed for order", order.id, error);
  }
}
