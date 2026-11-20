import { pool as defaultPool } from "../db";
import { EmailService } from "../lib/email-service";

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]!));

export function createFundraiserConfirmationService(
  database = defaultPool,
  emailFactory = (tenantId: string) => EmailService.forTenant(tenantId),
) {
const pool = database;
// Paid state and the immutable email payload commit together. Existing paid
// orders without a ledger predate this system: never guess whether they sent.
async function reconcileFundraiserConfirmation(
  orderId: string, sessionId: string, tenantId: string, title: string, amountCents: number,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [order] } = await client.query(`
      UPDATE fundraiser_orders o SET payment_status = 'paid'
      FROM fundraiser_events e
      WHERE o.id = $1 AND o.stripe_session_id = $2 AND o.payment_status = 'pending'
        AND e.id = o.event_id AND e.tenant_id = $3 RETURNING o.*`,
    [orderId, sessionId, tenantId]);
    if (order) {
      await client.query(`
        INSERT INTO fundraiser_confirmation_deliveries (order_id, tenant_id, recipient, subject, html)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (order_id) DO NOTHING`,
      [order.id, tenantId, order.customer_email,
        `Order F-${order.order_number} confirmed - ${title}`,
        `<h2>Thank you for your purchase!</h2>
        <p><strong>Order #F-${order.order_number}</strong> — please show this number at pickup.</p>
        <p>${escape(title)}</p><p>Quantity: ${order.quantity}</p>
        <p>Amount paid: $${(amountCents / 100).toFixed(2)}</p>
        ${order.pickup_time ? `<p>Pickup: ${escape(order.pickup_time)}</p>` : ""}`]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  // A dispatch/database failure must not undo or hide the durable paid state.
  await dispatchFundraiserConfirmation(orderId, tenantId).catch(error =>
    console.error("[Fundraiser confirmation] Dispatch deferred", error));
}

async function dispatchFundraiserConfirmation(orderId: string, tenantId: string) {
  const { rows: [job] } = await pool.query(`
    UPDATE fundraiser_confirmation_deliveries SET status = 'sending',
      attempts = attempts + 1, started_at = now()
    WHERE order_id = $1 AND tenant_id = $2 AND status IN ('pending','failed')
      AND next_attempt_at <= now() RETURNING *`, [orderId, tenantId]);
  if (!job) return;
  let result: { success: boolean; messageId?: string; error?: string; retrySafe?: boolean };
  let email: Awaited<ReturnType<typeof emailFactory>>;
  try {
    email = await emailFactory(tenantId);
  } catch {
    // Service initialization cannot have sent the confirmation.
    email = null;
  }
  if (!email) {
    result = { success: false, error: "Email service unavailable", retrySafe: true };
  } else {
    try {
      result = await email.sendDurable({
        to: job.recipient, subject: job.subject, html: job.html,
      });
    } catch {
      result = { success: false, error: "Delivery outcome unknown; review provider before retrying" };
    }
  }
  // Failure to persist an accepted send deliberately leaves 'sending', not a
  // retryable job. Never re-send automatically when acceptance is uncertain.
  await pool.query(`
    UPDATE fundraiser_confirmation_deliveries
    SET status = $3, message_id = $4, last_error = $5,
      sent_at = CASE WHEN $3 = 'sent' THEN now() ELSE NULL END,
      next_attempt_at = now() + interval '15 minutes'
    WHERE order_id = $1 AND tenant_id = $2 AND status = 'sending'`,
  [orderId, tenantId, result.success ? "sent" : result.retrySafe ? "failed" : "review",
    result.messageId || null, result.success ? null : result.error || "Delivery failed"]);
}

async function retryFundraiserConfirmations() {
  await pool.query(`UPDATE fundraiser_confirmation_deliveries
    SET status = 'review', last_error = 'Interrupted delivery; provider outcome must be reviewed'
    WHERE status = 'sending' AND started_at < now() - interval '30 minutes'`);
  const { rows } = await pool.query(`SELECT order_id, tenant_id FROM fundraiser_confirmation_deliveries
    WHERE status IN ('pending','failed') AND next_attempt_at <= now()
    ORDER BY next_attempt_at LIMIT 50`);
  for (const job of rows) {
    try { await dispatchFundraiserConfirmation(job.order_id, job.tenant_id); }
    catch (error) { console.error("[Fundraiser confirmation] Retry deferred", error); }
  }
}
return { reconcileFundraiserConfirmation, dispatchFundraiserConfirmation, retryFundraiserConfirmations };
}

export const { reconcileFundraiserConfirmation, dispatchFundraiserConfirmation, retryFundraiserConfirmations } =
  createFundraiserConfirmationService();
