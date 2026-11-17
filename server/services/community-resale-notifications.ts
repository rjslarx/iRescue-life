import { pool } from "../db";
import { decrypt } from "../lib/encryption";
import { withCommunityOrderLock, communityReleaseBlocked } from "./community-resale-lock";
import { communityBase, sendCommunityEmail, syncCommunityOrder } from "./community-resale";

const dollars = (n: number | null) => n == null ? "Pending confirmation" : `$${(n / 100).toFixed(2)}`;
async function deliver(c: any, row: any, key: string, to: string, subject: string, text: string, send: typeof sendCommunityEmail) {
  const claim = await c.query(`UPDATE community_resale_orders SET data=jsonb_set(data,ARRAY[$2],'"sending"')
    WHERE id=$1 AND data->>$2 IS NULL RETURNING id`, [row.id, key]);
  if (!claim.rows.length) return;
  let status = "unknown";
  try { status = (await send(row.tenant_id, to, subject, text)).success ? "accepted" : "unknown"; }
  catch { /* Provider may have accepted; no blind resend. */ }
  await c.query("UPDATE community_resale_orders SET data=jsonb_set(data,ARRAY[$2],to_jsonb($3::text)) WHERE id=$1", [row.id, key, status]);
}
export async function notifyCommunityProceeds(id: string, testSend?: typeof sendCommunityEmail) {
  if (!testSend && process.env.REPLIT_DEPLOYMENT !== "1") return;
  await withCommunityOrderLock(id, async c => {
    const row = (await c.query(`SELECT o.*,i.seller_email FROM community_resale_orders o
      JOIN community_resale_items i ON i.id=o.item_id WHERE o.id=$1`, [id])).rows[0];
    if (!row || !["paid", "completed"].includes(row.status) || communityReleaseBlocked(row) ||
        row.stripe_fee_cents == null || row.platform_fee_cents == null || !row.data.finance) return;
    const d = row.data, split = d.proceedsMode === "split_50";
    const net = Math.max(0, d.amountCents - row.stripe_fee_cents - row.platform_fee_cents);
    const seller = split ? Math.floor(net / 2) : 0;
    const rescue = split ? net - seller : d.finance.rescueProceedsCents;
    if (rescue == null) return;
    const transferred = split ? d.split?.status === "transferred" : d.finance.rescueProceedsCents != null;
    const key = transferred ? "proceedsTransferredNotice" : "proceedsPendingNotice";
    await deliver(c, row, key, row.seller_email, "Your resale proceeds summary",
      `Proceeds summary for ${d.itemTitle}\nOrder: ${id}\nSale price: ${dollars(d.amountCents)}\nPlatform fee: ${dollars(row.platform_fee_cents)}\nActual Stripe processing fee: ${dollars(row.stripe_fee_cents)}\nRescue share: ${dollars(rescue)}\nSeller share: ${dollars(seller)}\nStatus: ${transferred ? "Transferred to Stripe account(s)" : "Pending transfer; pickup confirmation and available funds required"}.\n${!split ? "Rescue proceeds reflect the destination transfer less its retained application fee; the processing-recovery component may differ from Stripe's actual cost." : ""}\n\nA Stripe transfer is not a confirmed bank payout. This is a sale/proceeds summary, not a charitable tax receipt. Refunds or disputes can change these amounts; see the current sale record:\n${communityBase()}/resale/manage`,
      testSend || sendCommunityEmail);
    await c.query("UPDATE community_resale_orders SET data=jsonb_set(data,'{proceedsNotice}',data->$2) WHERE id=$1", [id, key]);
  });
}
export async function sendCommunityPickupReminders(testSend?: typeof sendCommunityEmail, skipSyncForTest = false, testTenantId?: string) {
  if (!testSend && process.env.REPLIT_DEPLOYMENT !== "1") return;
  if (testSend && !testTenantId) throw new Error("Tests must isolate reminder candidates to their disposable tenant");
  const rows = (await pool.query(`SELECT id,tenant_id FROM community_resale_orders WHERE status='paid'
    AND COALESCE(data->>'paidAt',created_at::text)::timestamptz < now()-interval '24 hours'
    AND data->>'pickupConfirmedAt' IS NULL
    AND COALESCE(data->'issue'->>'status','') <> 'open'
    AND COALESCE(data->>'disputed','false') = 'false' AND refunded_cents=0
    AND COALESCE((data->'finance'->>'pendingRefundCents')::int,0)=0
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(data->'refunds','[]')) r
      WHERE r->>'status' NOT IN ('failed','canceled'))
    AND (data->>'pickupBuyerNotice' IS NULL OR data->>'pickupSellerNotice' IS NULL)
    AND ($1::uuid IS NULL OR tenant_id=$1) ORDER BY created_at LIMIT 100`, [testSend ? testTenantId : null])).rows;
  for (const r of rows) {
    try {
      if (!skipSyncForTest) await syncCommunityOrder(r.id, r.tenant_id);
      await withCommunityOrderLock(r.id, async c => {
        const o = (await c.query(`SELECT o.*,i.seller_email FROM community_resale_orders o
          JOIN community_resale_items i ON i.id=o.item_id WHERE o.id=$1`, [r.id])).rows[0];
        if (o.status !== "paid" || o.data.pickupConfirmedAt || communityReleaseBlocked(o) ||
            o.data.finance?.pendingRefundCents > 0) return;
        for (const role of ["Buyer", "Seller"]) {
          const url = role === "Buyer"
            ? `${communityBase()}/resale/order/${o.id}#token=${decrypt(o.data.encryptedOrderToken)}`
            : `${communityBase()}/resale/manage`;
          await deliver(c, o, `pickup${role}Notice`, role === "Buyer" ? o.buyer_email : o.seller_email,
            "Reminder: confirm your resale pickup",
            `Your pickup for ${o.data.itemTitle} has not been confirmed. If pickup is planned for later, keep your agreed time—there is no automatic payout deadline.\n\nOnly share the pickup code after receiving the item. If you forgot the code at handoff, the seller can request staff assistance. Buyers can report a problem from their private order page.\n\n${url}\n\nNo payout is released simply because time passes. Do not post private order links or pickup codes publicly.`,
            testSend || sendCommunityEmail);
        }
      });
    } catch { console.warn("[Community resale] Pickup reminder deferred"); }
  }
}
