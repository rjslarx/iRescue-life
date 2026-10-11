import { pgTable, uuid, text, timestamp, integer, unique, primaryKey, index } from "drizzle-orm/pg-core";

// SQL migrations also add FKs/checks. Keep this module independent of schema.ts
// to avoid circular initialization; the SQL migration is authoritative for FKs.
export const freeSquareBoards = pgTable("free_square_boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("draft"),
  homeTeam: text("home_team").notNull().default("Home"),
  awayTeam: text("away_team").notNull().default("Away"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  rowDigits: integer("row_digits").array(),
  columnDigits: integer("column_digits").array(),
  digitsAssignedAt: timestamp("digits_assigned_at", { withTimezone: true }),
  digitsAssignedBy: uuid("digits_assigned_by"),
  emailSubject: text("email_subject").notNull().default("Your squares for {event}"),
  emailTemplate: text("email_template").notNull().default("Hi {name}, your squares for {event} are {squares}. Thank you for joining us!"),
  smsTemplate: text("sms_template").notNull().default("Hi {name}, your squares for {event} are {squares}. Thank you for joining us!"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ tenantIdx: index("free_square_boards_tenant_idx").on(t.tenantId) }));

export const freeSquareReservations = pgTable("free_square_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  boardId: uuid("board_id").notNull().references(() => freeSquareBoards.id, { onDelete: "cascade" }),
  requestKey: uuid("request_key").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  squares: integer("squares").array().notNull(),
  smsConsentAt: timestamp("sms_consent_at", { withTimezone: true }),
  smsConsentText: text("sms_consent_text"),
  smsRevokedAt: timestamp("sms_revoked_at", { withTimezone: true }),
  emailRevokedAt: timestamp("email_revoked_at", { withTimezone: true }),
  unsubscribeToken: uuid("unsubscribe_token").notNull().defaultRandom().unique(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  requestKeyUnique: unique("free_square_reservations_tenant_id_request_key_key").on(t.tenantId, t.requestKey),
  boardIdx: index("free_square_reservations_board_idx").on(t.boardId),
}));

export const freeSquareClaims = pgTable("free_square_claims", {
  boardId: uuid("board_id").notNull().references(() => freeSquareBoards.id, { onDelete: "cascade" }),
  square: integer("square").notNull(),
  reservationId: uuid("reservation_id").notNull().references(() => freeSquareReservations.id, { onDelete: "cascade" }),
}, t => ({ pk: primaryKey({ columns: [t.boardId, t.square] }) }));

export const freeSquareMessages = pgTable("free_square_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  boardId: uuid("board_id").notNull().references(() => freeSquareBoards.id, { onDelete: "cascade" }),
  reservationId: uuid("reservation_id").notNull().references(() => freeSquareReservations.id, { onDelete: "cascade" }),
  requestKey: uuid("request_key").notNull(),
  channel: text("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  providerId: text("provider_id"),
  sentBy: uuid("sent_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  requestKeyUnique: unique("free_square_messages_tenant_id_request_key_key").on(t.tenantId, t.requestKey),
  boardIdx: index("free_square_messages_board_idx").on(t.boardId),
}));
