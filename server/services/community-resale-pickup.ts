import { randomUUID } from "node:crypto";
import { stripeService } from "../lib/stripe-service";
import { communityAudit, failCommunity as fail } from "./community-resale";
import { withCommunityOrderLock, communityReleaseBlocked } from "./community-resale-lock";
import { verifiedCommunityCharge } from "./community-resale-refunds";

export async function updateCommunityPickup(id: string, tenantId: string, actor: string,
  action: "issue" | "pickup_help" | "resolve_issue" | "staff_handoff" | "code_handoff",
  input: { description?: string; reason?: string; evidence?: string; issueId?: string; requestId?: string; code?: string }) {
  return withCommunityOrderLock(id, async c => {
    const o = (await c.query("SELECT * FROM community_resale_orders WHERE id=$1 AND tenant_id=$2", [id, tenantId])).rows[0];
    if (!o) fail("Order not found.", 404);
    const now = new Date().toISOString(), d = o.data;
    if (action === "issue") {
      if (!["paid", "completed", "partially_refunded", "refunded"].includes(o.status)) fail("Only paid orders can report an issue.", 409);
      if (d.issue?.status === "open") return;
      d.issue = { id: randomUUID(), status: "open", description: input.description, createdAt: now };
    } else if (action === "pickup_help") {
      if (o.status !== "paid" || d.pickupConfirmedAt) fail("This order does not need pickup assistance.", 409);
      if (d.pickupHelp?.status === "open") return;
      d.pickupHelp = { id: randomUUID(), status: "open", description: input.description, createdAt: now };
    } else if (action === "resolve_issue") {
      if (d.issue?.status !== "open" || d.issue.id !== input.issueId) fail("Issue changed. Refresh before resolving.", 409);
      d.issue = { ...d.issue, status: "resolved", resolvedAt: now };
    } else {
      if (o.status !== "paid" || d.pickupConfirmedAt || communityReleaseBlocked(o))
        fail("Handoff is blocked by the order status, an issue, refund, or dispute.", 409);
      if (action === "staff_handoff" && (d.pickupHelp?.status !== "open" || d.pickupHelp.id !== input.requestId))
        fail("An open seller assistance request is required.", 409);
      if (action === "code_handoff" && d.pickupCode !== input.code?.toLowerCase()) fail("Incorrect pickup code.", 409);
      const stripe = stripeService.getPlatformStripeClient();
      if (!stripe) fail("Stripe is unavailable.", 503);
      const charge = await verifiedCommunityCharge(stripe, o);
      if (charge.disputed || charge.amount_refunded > 0) fail("Stripe reports a refund or dispute. Handoff is blocked.", 409);
      const pending = await stripe.refunds.list({ charge: charge.id, limit: 100 }).autoPagingToArray({ limit: 1000 });
      if (pending.length >= 1000 || pending.some((r: any) => !["failed", "canceled"].includes(r.status)))
        fail("A refund is pending or completed. Handoff is blocked.", 409);
      d.pickupConfirmedAt = now;
      if (d.pickupHelp) d.pickupHelp = { ...d.pickupHelp, status: "resolved", resolvedAt: now };
    }
    await c.query("BEGIN");
    try {
      // Only update own JSON keys; preserve concurrent email/reconciliation fields.
      const changes = { issue: d.issue || null, pickupHelp: d.pickupHelp || null,
        ...(d.pickupConfirmedAt ? { pickupConfirmedAt: d.pickupConfirmedAt } : {}) };
      await c.query("UPDATE community_resale_orders SET data=data || $2::jsonb,status=CASE WHEN $3 THEN 'completed' ELSE status END WHERE id=$1",
        [id, JSON.stringify(changes), action.endsWith("handoff")]);
      if (action.endsWith("handoff")) await c.query("UPDATE community_resale_items SET status='completed' WHERE id=$1", [o.item_id]);
      const { code, ...audited } = input; // Never log the private pickup code.
      await communityAudit(c, tenantId, actor, action, { orderId: id, ...audited, issueId: d.issue?.id, requestId: d.pickupHelp?.id });
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
  });
}

