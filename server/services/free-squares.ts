import type { Pool, PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  freeSquareBoardSchema, freeSquareReservationSchema, freeSquareMessageSchema,
  SQUARE_SMS_CONSENT,
} from "../../shared/free-squares";

export class SquareError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function normalizeSquarePhone(value?: string) {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\+[1-9]\d{7,14}$/.test(value.trim())) return value.trim();
  throw new SquareError(400, "Enter a valid phone number with country code.");
}
export const reservationColumns = `id, name, email, phone, squares, sms_consent_at,
  sms_revoked_at, email_revoked_at, cancelled_at, created_at`;
export const messageColumns = `id, reservation_id, channel, subject, body, status, error, created_at`;

export class FreeSquaresStore {
  private ready?: Promise<void>;
  constructor(public pool: Pool) {}

  ensureSchema() {
    // Additive, feature-local bootstrap for deployments without a merge step.
    // Never runs a global schema push or modifies existing rescue tables.
    return this.ready ??= this.initialize().catch(error => { this.ready = undefined; throw error; });
  }
  private async initialize() {
    const existing = await this.pool.query(`SELECT
      to_regclass('free_square_boards') IS NOT NULL AND
      to_regclass('free_square_reservations') IS NOT NULL AND
      to_regclass('free_square_claims') IS NOT NULL AND
      to_regclass('free_square_messages') IS NOT NULL AS ready`);
    if (existing.rows[0].ready) return;
    const ddl = await readFile(resolve(process.cwd(), "scripts/free-squares.sql"), "utf8");
    await this.transaction(async client => {
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      await client.query(`SELECT pg_advisory_xact_lock(840143022)`);
      await client.query(ddl);
    });
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async getBoard(tenantId: string, boardId: string, client: Pool | PoolClient = this.pool, lock = false) {
    const result = await client.query(`SELECT * FROM free_square_boards
      WHERE tenant_id=$1 AND id=$2 ${lock ? "FOR UPDATE" : ""}`, [tenantId, boardId]);
    if (!result.rows[0]) throw new SquareError(404, "Board not found.");
    return result.rows[0];
  }
  async list(tenantId: string) {
    return (await this.pool.query(`SELECT b.*,
      (SELECT count(*)::int FROM free_square_claims c WHERE c.board_id=b.id) AS claimed_count,
      (SELECT count(*)::int FROM free_square_reservations r WHERE r.board_id=b.id AND r.cancelled_at IS NULL) AS reservation_count
      FROM free_square_boards b WHERE b.tenant_id=$1 ORDER BY b.created_at DESC`, [tenantId])).rows;
  }
  async create(tenantId: string, userId: string, input: unknown) {
    const data = freeSquareBoardSchema.parse(input);
    // Column names come exclusively from the strict server schema, never input.
    const columns = Object.keys(data);
    return (await this.pool.query(`INSERT INTO free_square_boards
      (tenant_id,created_by,${columns.join(",")}) VALUES
      ($1,$2,${columns.map((_, i) => `$${i + 3}`).join(",")}) RETURNING *`,
    [tenantId, userId, ...Object.values(data)])).rows[0];
  }
  async update(tenantId: string, boardId: string, input: unknown) {
    const changes = freeSquareBoardSchema.partial().parse(input);
    if (!Object.keys(changes).length) throw new SquareError(400, "No changes supplied.");
    return this.transaction(async client => {
      await this.getBoard(tenantId, boardId, client, true);
      return (await client.query(`UPDATE free_square_boards SET
        ${Object.keys(changes).map((k, i) => `${k}=$${i + 3}`).join(",")}
        WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, boardId, ...Object.values(changes)])).rows[0];
    });
  }
  async detail(tenantId: string, boardId: string) {
    const board = await this.getBoard(tenantId, boardId);
    const [reservations, messages] = await Promise.all([
      this.pool.query(`SELECT ${reservationColumns} FROM free_square_reservations WHERE tenant_id=$1 AND board_id=$2 ORDER BY created_at DESC`, [tenantId, boardId]),
      this.pool.query(`SELECT ${messageColumns} FROM free_square_messages WHERE tenant_id=$1 AND board_id=$2 ORDER BY created_at DESC`, [tenantId, boardId]),
    ]);
    return { board, reservations: reservations.rows, messages: messages.rows };
  }
  async publicBoard(tenantId: string, boardId: string) {
    const b = await this.getBoard(tenantId, boardId);
    if (!["open", "closed"].includes(b.status)) throw new SquareError(404, "Board not found.");
    const claims = await this.pool.query(`SELECT square FROM free_square_claims WHERE board_id=$1 ORDER BY square`, [boardId]);
    // Explicit public whitelist: never return names, contacts, message templates,
    // tokens, staff identifiers, or reservation IDs belonging to other people.
    return {
      board: { id: b.id, title: b.title, description: b.description, status: b.status,
        home_team: b.home_team, away_team: b.away_team, home_score: b.home_score, away_score: b.away_score },
      claimedSquares: claims.rows.map(row => row.square),
    };
  }
  async reserve(tenantId: string, boardId: string, input: unknown) {
    const data = freeSquareReservationSchema.parse(input);
    const phone = normalizeSquarePhone(data.phone);
    const squares = [...data.squares].sort((a, b) => a - b);
    return this.transaction(async client => {
      const board = await this.getBoard(tenantId, boardId, client, true);
      const prior = await client.query(`SELECT id, board_id, squares, cancelled_at
        FROM free_square_reservations WHERE tenant_id=$1 AND request_key=$2`, [tenantId, data.requestKey]);
      if (prior.rows[0]) {
        const r = prior.rows[0];
        if (r.board_id !== boardId || r.cancelled_at || JSON.stringify(r.squares) !== JSON.stringify(squares))
          throw new SquareError(409, "This reservation request was already used. Start a new reservation.");
        return { reservation: { id: r.id, squares: r.squares }, replay: true };
      }
      if (board.status !== "open") throw new SquareError(409, "This board is not accepting reservations.");
      const taken = await client.query(`SELECT square FROM free_square_claims WHERE board_id=$1 AND square=ANY($2::int[])`, [boardId, squares]);
      if (taken.rows.length) throw new SquareError(409, `Squares ${taken.rows.map(r => `#${r.square}`).join(", ")} were just reserved. Please choose again.`);
      const result = await client.query(`INSERT INTO free_square_reservations
        (tenant_id,board_id,request_key,name,email,phone,squares,sms_consent_at,sms_consent_text)
        VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN now() ELSE NULL END,$9) RETURNING id,squares`,
      [tenantId, boardId, data.requestKey, data.name, data.email?.toLowerCase() || null, phone, squares, data.smsConsent, data.smsConsent ? SQUARE_SMS_CONSENT : null]);
      const reservation = result.rows[0];
      await client.query(`INSERT INTO free_square_claims(board_id,square,reservation_id)
        SELECT $1,unnest($2::int[]),$3`, [boardId, squares, reservation.id]);
      return { reservation };
    });
  }
  async cancel(tenantId: string, boardId: string, reservationId: string) {
    await this.transaction(async client => {
      await this.getBoard(tenantId, boardId, client, true);
      const result = await client.query(`UPDATE free_square_reservations SET cancelled_at=COALESCE(cancelled_at,now())
        WHERE id=$1 AND tenant_id=$2 AND board_id=$3 RETURNING id`, [reservationId, tenantId, boardId]);
      if (!result.rows[0]) throw new SquareError(404, "Reservation not found.");
      await client.query(`DELETE FROM free_square_claims WHERE board_id=$1 AND reservation_id=$2`, [boardId, reservationId]);
    });
  }
  async prepareMessage(tenantId: string, boardId: string, reservationId: string, userId: string, input: unknown) {
    const data = freeSquareMessageSchema.parse(input);
    return this.transaction(async client => {
      // The board lock serializes cancel/archive/send preparations for this board.
      const board = await this.getBoard(tenantId, boardId, client, true);
      const old = await client.query(`SELECT * FROM free_square_messages WHERE tenant_id=$1 AND request_key=$2`, [tenantId, data.requestKey]);
      if (old.rows[0]) {
        const message = old.rows[0];
        if (message.board_id !== boardId || message.reservation_id !== reservationId ||
            message.channel !== data.channel || message.body !== data.body || (message.subject || "") !== (data.subject || ""))
          throw new SquareError(409, "This send request was already used for a different message.");
        return { message, fresh: false, board, reservation: null };
      }
      if (board.status === "archived") throw new SquareError(409, "Reopen this board before sending messages.");
      const found = await client.query(`SELECT * FROM free_square_reservations WHERE tenant_id=$1 AND board_id=$2 AND id=$3 FOR UPDATE`, [tenantId, boardId, reservationId]);
      const reservation = found.rows[0];
      if (!reservation || reservation.cancelled_at) throw new SquareError(404, "Active reservation not found.");
      if (data.channel === "email" && (!reservation.email || reservation.email_revoked_at))
        throw new SquareError(400, "This participant has no email address or has unsubscribed.");
      if (data.channel === "sms" && (!reservation.phone || !reservation.sms_consent_at || reservation.sms_revoked_at))
        throw new SquareError(400, "This participant has not consented to texts or has opted out.");
      const result = await client.query(`INSERT INTO free_square_messages
        (tenant_id,board_id,reservation_id,request_key,channel,subject,body,status,sent_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'sending',$8) RETURNING *`,
      [tenantId, boardId, reservationId, data.requestKey, data.channel, data.subject || null, data.body, userId]);
      return { message: result.rows[0], fresh: true, board, reservation };
    });
  }
  async finishMessage(tenantId: string, id: string, status: string, error: string | null, providerId?: string) {
    return (await this.pool.query(`UPDATE free_square_messages SET status=$3,error=$4,provider_id=$5
      WHERE tenant_id=$1 AND id=$2 RETURNING ${messageColumns}`, [tenantId, id, status, error, providerId || null])).rows[0];
  }
  async unsubscribe(token: string) {
    return this.transaction(async client => {
      const result = await client.query(`SELECT tenant_id,email,phone FROM free_square_reservations WHERE unsubscribe_token=$1`, [token]);
      const target = result.rows[0];
      if (!target) throw new SquareError(404, "Preference link not found.");
      await client.query(`UPDATE free_square_reservations SET
        email_revoked_at=CASE WHEN email=$2 THEN now() ELSE email_revoked_at END,
        sms_revoked_at=CASE WHEN phone=$3 THEN now() ELSE sms_revoked_at END
        WHERE tenant_id=$1 AND (email=$2 OR phone=$3)`, [target.tenant_id, target.email, target.phone]);
    });
  }
}
