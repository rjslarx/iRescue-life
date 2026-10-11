import type { Pool } from "pg";

type NotificationEmail = { to: string; subject: string; text: string; html: string };
export type ReservationNotifier = (tenantId: string, boardId: string, reservationId: string) => Promise<void>;
type SendEmail = (tenantId: string, message: NotificationEmail) => Promise<void>;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

const sendNotification: SendEmail = async (tenantId, message) => {
  const { EmailService } = await import("../lib/email-service");
  const service = await EmailService.forTenant(tenantId);
  if (!service) throw new Error("Rescue email is not configured or its quota is exhausted.");
  const result = await service.send(message);
  if (!result.success || !result.messageId) {
    throw new Error("Reservation notification was not confirmed by the email provider.");
  }
};

export function createReservationNotifier(database: Pick<Pool, "query">, send: SendEmail = sendNotification): ReservationNotifier {
  return async (tenantId, boardId, reservationId) => {
    // Read the committed reservation, not contact details supplied in a replay.
    // The recipient is the rescue's configured contact address, never the visitor.
    const result = await database.query(`
      SELECT t.contact_email, b.title, r.name, r.display_name, r.email, r.phone, r.squares
      FROM free_square_reservations r
      JOIN free_square_boards b ON b.id=r.board_id AND b.tenant_id=r.tenant_id
      JOIN tenants t ON t.id=r.tenant_id
      WHERE r.tenant_id=$1 AND r.board_id=$2 AND r.id=$3`,
    [tenantId, boardId, reservationId]);
    const reservation = result.rows[0];
    if (!reservation) throw new Error("Reservation not found for notification.");
    if (!reservation.contact_email?.trim()) throw new Error("Rescue contact email is not configured.");
    const text = [
      `New square reservation for ${reservation.title}`,
      "",
      `Participant: ${reservation.name}`,
      `Display name: ${reservation.display_name || "Not provided"}`,
      `Email: ${reservation.email || "Not provided"}`,
      `Phone: ${reservation.phone || "Not provided"}`,
      `Selected squares: ${reservation.squares.map((square: number) => `#${square}`).join(", ")}`,
      "",
      "These squares have been reserved. View the reservation in Community → Football squares in your rescue dashboard.",
    ].join("\n");
    await send(tenantId, {
      to: reservation.contact_email.trim(),
      subject: `New square reservation: ${reservation.title}`.replace(/[\r\n]/g, " "),
      text,
      html: `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`,
    });
  };
}
