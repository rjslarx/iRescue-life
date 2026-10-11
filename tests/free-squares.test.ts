import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { pool } from "../server/db";
import { FreeSquaresStore, normalizeSquarePhone, shuffleScoreDigits } from "../server/services/free-squares";
import { registerFreeSquaresRoutes, type SquareDelivery } from "../server/routes/free-squares";
import { FREE_SQUARES_TENANTS, hasFreeSquaresAccess, renderSquareMessage, freeSquareReservationSchema } from "../shared/free-squares";
import { createReservationNotifier } from "../server/services/free-square-notifications";

// Run only against the isolated development database, never NEON/production.
const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== "helium" || process.env.REPLIT_DEPLOYMENT === "1")
  throw new Error("These tests require the isolated helium development database.");
const store = new FreeSquaresStore(pool);
const tenantId = FREE_SQUARES_TENANTS[0];
const otherTenant = FREE_SQUARES_TENANTS[1];
let userId: string;
let boardId: string;
let server: Server;
let base: string;
let deliveryCount = 0;
const notifications: string[][] = [];
let notificationFails = false;
let deliveryMode: "accept" | "reject" | "throw" = "accept";
const deliver: SquareDelivery = async () => {
  deliveryCount++;
  if (deliveryMode === "throw") throw new Error("Simulated timeout");
  if (deliveryMode === "reject") return { accepted: false, error: "Provider unavailable" };
  return { accepted: true, providerId: `test-${deliveryCount}` };
};
const request = async (path: string, method = "GET", body?: unknown, options: { tenant?: string; role?: string; anonymous?: boolean } = {}) => {
  const response = await fetch(base + "/api/free-squares" + path, {
    method, headers: { "content-type": "application/json", "x-test-tenant": options.tenant || tenantId,
      "x-test-role": options.role || "staff", ...(options.anonymous ? { "x-test-anonymous": "true" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
};
const reservationInput = (squares: number[], overrides = {}) => ({
  requestKey: randomUUID(), name: "Square Test Participant", displayName: "Grid Friend", email: "square-test@example.invalid",
  phone: "2025550147", smsConsent: false, squares, ...overrides,
});
before(async () => {
  await store.ensureSchema();
  userId = (await pool.query(`INSERT INTO users(tenant_id,email,password_hash,full_name,roles)
    VALUES ($1,$2,'not-a-real-password-hash','Square Backend Test',ARRAY['staff']) RETURNING id`,
  [tenantId, `squares-${randomUUID()}@example.invalid`])).rows[0].id;
  boardId = (await store.create(tenantId, userId, { title: `Test free squares ${randomUUID()}`, status: "open" })).id;
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { id: req.headers["x-test-tenant"] || tenantId };
    if (!req.headers["x-test-anonymous"])
      req.user = { id: userId, tenantId: req.tenant.id, activeRole: req.headers["x-test-role"] || "staff", fullName: "Test" };
    next();
  });
  registerFreeSquaresRoutes(app, {
    store, email: deliver, sms: deliver,
    notifyReservation: async (...ids) => {
      notifications.push(ids);
      if (notificationFails) throw new Error("Simulated notification failure");
    },
    requireTenant: (_req, _res, next) => next(),
    requireAuth: (req, res, next) => req.user ? next() : void res.status(401).json({ error: "Sign in" }),
    requireRole: () => (req, res, next) => ["staff", "admin"].includes(req.user!.activeRole) ? next() : void res.status(403).json({ error: "No access" }),
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (boardId) await pool.query("DELETE FROM free_square_boards WHERE id=$1 AND tenant_id=$2", [boardId, tenantId]);
  if (userId) await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  await pool.end();
});
test("access is exact-ID limited, authenticated, role limited and tenant isolated", async () => {
  assert.equal(hasFreeSquaresAccess(tenantId), true);
  assert.equal(hasFreeSquaresAccess("haseyas"), false);
  assert.equal((await request("", "GET", undefined, { tenant: randomUUID() })).status, 404);
  assert.equal((await request("", "GET", undefined, { anonymous: true })).status, 401);
  assert.equal((await request("", "GET", undefined, { role: "volunteer" })).status, 403);
  assert.equal((await request(`/${boardId}`, "GET", undefined, { tenant: otherTenant })).status, 404);
  assert.equal((await request(`/public/${boardId}`, "GET", undefined, { tenant: otherTenant })).status, 404);
});
test("rescue notification includes contact details and all squares, with safe HTML", async () => {
  let sent: any;
  const notify = createReservationNotifier({
    query: async (_sql: string, values: string[]) => {
      assert.deepEqual(values, [tenantId, boardId, "reservation-test"]);
      return { rows: [{ contact_email: "rescue@example.invalid", title: "Sunday Game",
        name: "<script>Test</script>", email: "participant@example.invalid", phone: "+12025550147", squares: [7, 18] }] };
    },
  } as any, async (id, message) => {
    assert.equal(id, tenantId);
    sent = message;
  });
  await notify(tenantId, boardId, "reservation-test");
  assert.equal(sent.to, "rescue@example.invalid");
  assert.match(sent.text, /Selected squares: #7, #18/);
  assert.match(sent.text, /participant@example.invalid/);
  assert.match(sent.text, /\+12025550147/);
  assert.match(sent.subject, /Sunday Game/);
  assert.ok(!sent.html.includes("<script>"));
  assert.match(sent.html, /&lt;script&gt;/);
});
test("display names are explicit, validated, public on every claimed square, and never expose private names", async () => {
  for (const displayName of [undefined, "", "   ", "x".repeat(31), "Line\nBreak"]) {
    assert.equal(freeSquareReservationSchema.safeParse(reservationInput([1], { displayName })).success, false);
  }
  const board = await store.create(tenantId, userId, { title: "Display name privacy test", status: "open" });
  try {
    const input = reservationInput([1, 10, 100], { displayName: "  Grid Pal  ", name: "Private Legal Identity" });
    const { reservation } = await store.reserve(tenantId, board.id, input);
    const publicData = await store.publicBoard(tenantId, board.id);
    assert.deepEqual(publicData.squareDisplayNames, { 1: "Grid Pal", 10: "Grid Pal", 100: "Grid Pal" });
    for (const privateValue of [input.name, input.email, input.phone, reservation.id, input.requestKey]) {
      assert.ok(!JSON.stringify(publicData).includes(privateValue));
    }
    const detail = await store.detail(tenantId, board.id);
    assert.equal(detail.reservations[0].display_name, "Grid Pal");
    assert.equal(detail.reservations[0].name, input.name);
    assert.equal((await store.reserve(tenantId, board.id, input)).replay, true);
    await assert.rejects(store.reserve(tenantId, board.id, { ...input, displayName: "Different Label" }), /already used/);
    // Simulate a reservation from before display-name collection. No private-name fallback.
    await pool.query("UPDATE free_square_reservations SET display_name=NULL WHERE id=$1", [reservation.id]);
    const legacy = await store.publicBoard(tenantId, board.id);
    assert.deepEqual(legacy.squareDisplayNames, { 1: null, 10: null, 100: null });
    assert.ok(!JSON.stringify(legacy).includes(input.name));
    await store.cancel(tenantId, board.id, reservation.id);
    assert.deepEqual((await store.publicBoard(tenantId, board.id)).squareDisplayNames, {});
  } finally {
    await pool.query("DELETE FROM free_square_boards WHERE id=$1", [board.id]);
  }
});
test("score-digit shuffles contain each digit once and return independent arrays", () => {
  const expected = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const shuffles = Array.from({ length: 25 }, () => shuffleScoreDigits());
  for (const digits of shuffles) assert.deepEqual([...digits].sort((a, b) => a - b), expected);
  assert.notEqual(shuffles[0], shuffles[1]);
  // Do not assert that random sequences differ: equality is a valid random result.
});
test("score digits require a full board, persist once, stay private-safe and lock the roster", async () => {
  const board = await store.create(tenantId, userId, { title: "Score digit test", status: "open" });
  const path = `/${board.id}/assign-digits`;
  try {
    assert.equal((await request(path, "POST", {}, { anonymous: true })).status, 401);
    assert.equal((await request(path, "POST", {}, { role: "volunteer" })).status, 403);
    assert.equal((await request(path, "POST", {}, { tenant: otherTenant })).status, 404);
    assert.equal((await request(path, "POST", { row_digits: [0] })).status, 400);
    assert.equal((await store.publicBoard(tenantId, board.id)).board.row_digits, null);
    for (let start = 1; start <= 91; start += 10) {
      await store.reserve(tenantId, board.id, reservationInput(
        Array.from({ length: Math.min(10, 100 - start) }, (_, index) => start + index)));
    }
    assert.equal((await request(path, "POST", {})).status, 409); // 99 squares
    const last = await store.reserve(tenantId, board.id, reservationInput([100]));
    await store.update(tenantId, board.id, { status: "draft" });
    assert.equal((await request(path, "POST", {})).status, 409);
    await store.update(tenantId, board.id, { status: "archived" });
    assert.equal((await request(path, "POST", {})).status, 409);
    await store.update(tenantId, board.id, { status: "closed" });
    const assigned = await Promise.all([request(path, "POST", {}), request(path, "POST", {})]);
    assert.ok(assigned.every(result => result.status === 200));
    assert.deepEqual(assigned[0].data.board, assigned[1].data.board);
    const digits = assigned[0].data.board;
    assert.equal(digits.status, "closed");
    assert.equal(digits.digits_assigned_by, userId);
    assert.ok(digits.digits_assigned_at);
    for (const array of [digits.row_digits, digits.column_digits])
      assert.deepEqual([...array].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const published = await store.publicBoard(tenantId, board.id);
    assert.deepEqual(published.board.row_digits, digits.row_digits);
    assert.deepEqual(published.board.column_digits, digits.column_digits);
    assert.ok(!("digits_assigned_by" in published.board));
    assert.ok(!("email_template" in published.board));
    assert.equal((await request(`/${board.id}`, "PATCH", { row_digits: [0] })).status, 400);
    assert.equal((await request(`/${board.id}`, "PATCH", { home_team: "Changed" })).status, 409);
    assert.equal((await request(`/${board.id}`, "PATCH", { status: "open" })).status, 409);
    assert.equal((await request(`/${board.id}/reservations/${last.reservation.id}/cancel`, "POST", {})).status, 409);
    await assert.rejects(store.reserve(tenantId, board.id, reservationInput([100])), /not accepting/);
    assert.equal((await request(`/${board.id}`, "PATCH", { home_score: 27, away_score: 10 })).status, 200);
    const reloaded = await new FreeSquaresStore(pool).getBoard(tenantId, board.id);
    assert.deepEqual(reloaded.row_digits, digits.row_digits);
    assert.deepEqual(reloaded.column_digits, digits.column_digits);
    await assert.rejects(pool.query("UPDATE free_square_boards SET row_digits=ARRAY[0,0,2,3,4,5,6,7,8,9] WHERE id=$1", [board.id]),
      /free_square_boards_digits_check/);
  } finally {
    await pool.query("DELETE FROM free_square_boards WHERE id=$1", [board.id]);
  }
});
test("score assignment and releasing a reservation serialize on the same board lock", async () => {
  const board = await store.create(tenantId, userId, { title: "Assignment race test", status: "open" });
  try {
    let firstId = "";
    for (let start = 1; start <= 91; start += 10) {
      const result = await store.reserve(tenantId, board.id, reservationInput(Array.from({ length: 10 }, (_, i) => start + i)));
      if (!firstId) firstId = result.reservation.id;
    }
    const results = await Promise.allSettled([
      store.assignDigits(tenantId, board.id, userId),
      store.cancel(tenantId, board.id, firstId),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const afterRace = await store.publicBoard(tenantId, board.id);
    assert.equal(afterRace.claimedSquares.length, afterRace.board.digits_assigned_at ? 100 : 90);
  } finally {
    await pool.query("DELETE FROM free_square_boards WHERE id=$1", [board.id]);
  }
});
test("concurrent reservation retries notify rescue only once; notification failure preserves booking", async () => {
  const input = reservationInput([91, 92]);
  const count = notifications.length;
  const results = await Promise.all([
    request(`/public/${boardId}/reservations`, "POST", input, { anonymous: true }),
    request(`/public/${boardId}/reservations`, "POST", input, { anonymous: true }),
  ]);
  assert.ok(results.every(result => result.status === 201));
  assert.equal(notifications.length, count + 1);
  assert.deepEqual(notifications.at(-1), [tenantId, boardId, results[0].data.reservation.id]);
  notificationFails = true;
  try {
    const failedEmailInput = reservationInput([93]);
    const booked = await request(`/public/${boardId}/reservations`, "POST", failedEmailInput, { anonymous: true });
    assert.equal(booked.status, 201);
    const retry = await request(`/public/${boardId}/reservations`, "POST", failedEmailInput, { anonymous: true });
    assert.equal(retry.status, 201);
    assert.equal(notifications.length, count + 2);
    assert.deepEqual(retry.data.reservation.squares, [93]);
  } finally {
    notificationFails = false;
    await pool.query("DELETE FROM free_square_reservations WHERE board_id=$1 AND squares && ARRAY[91,92,93]", [boardId]);
  }
});
test("validates squares, consent, contact and normalizes phone", async () => {
  for (const value of [
    reservationInput([0]), reservationInput([101]), reservationInput([1, 1]),
    reservationInput([1], { email: "", phone: "" }),
    reservationInput([1], { phone: "", smsConsent: true }),
    reservationInput([1], { phone: "abc" }),
    reservationInput([1], { amount: 10 }),
  ]) assert.equal((await request(`/public/${boardId}/reservations`, "POST", value)).status, 400);
  assert.equal(normalizeSquarePhone("(202) 555-0147"), "+12025550147");
  assert.equal(renderSquareMessage("{name} {event}: {squares}", { name: "Alex", event: "Community game", squares: [1, 2] }), "Alex Community game: #1, #2");
});
test("simultaneous claims cannot double-book or partially allocate multi-square requests", async () => {
  const result = await Promise.allSettled([
    store.reserve(tenantId, boardId, reservationInput([11, 12])),
    store.reserve(tenantId, boardId, reservationInput([12, 13])),
  ]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(result.filter(r => r.status === "rejected").length, 1);
  const claims = await store.publicBoard(tenantId, boardId);
  assert.equal(claims.claimedSquares.length, 2);
});
test("retrying one reservation returns the same record, with no public contact disclosure", async () => {
  const body = reservationInput([20, 21]);
  const first = await store.reserve(tenantId, boardId, body);
  const second = await store.reserve(tenantId, boardId, body);
  assert.equal(first.reservation.id, second.reservation.id);
  assert.equal(second.replay, true);
  const response = await request(`/public/${boardId}`, "GET", undefined, { anonymous: true });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.data).sort(), ["board", "claimedSquares", "squareDisplayNames"]);
  const json = JSON.stringify(response.data);
  for (const hidden of ["square-test", "phone", "email", "unsubscribe", "request_key", "Square Test Participant"])
    assert.equal(json.includes(hidden), false);
  assert.equal(deliveryCount, 0, "Reservations must not send unsolicited messages");
});
test("close/draft/archive stop reservations and draft/archive stop public reads", async () => {
  for (const status of ["closed", "draft", "archived"]) {
    await store.update(tenantId, boardId, { status });
    await assert.rejects(() => store.reserve(tenantId, boardId, reservationInput([30])), /not accepting/);
    assert.equal((await request(`/public/${boardId}`)).status, status === "closed" ? 200 : 404);
  }
  await store.update(tenantId, boardId, { status: "open" });
});
test("staff cancellation releases every square and is idempotent", async () => {
  const { reservation } = await store.reserve(tenantId, boardId, reservationInput([40, 41]));
  const path = `/${boardId}/reservations/${reservation.id}/cancel`;
  assert.equal((await request(path, "POST", {})).status, 200);
  assert.equal((await request(path, "POST", {})).status, 200);
  const free = await store.reserve(tenantId, boardId, reservationInput([40, 41]));
  assert.notEqual(free.reservation.id, reservation.id);
});
test("SMS requires consent; email is provider-accepted and a double submit sends once", async () => {
  const { reservation } = await store.reserve(tenantId, boardId, reservationInput([50]));
  const path = `/${boardId}/reservations/${reservation.id}/messages`;
  assert.equal((await request(path, "POST", { requestKey: randomUUID(), channel: "sms", body: "Hello" })).status, 400);
  assert.equal(deliveryCount, 0);
  const body = { requestKey: randomUUID(), channel: "email", subject: "Your free squares", body: "Hello" };
  const replies = await Promise.all([request(path, "POST", body), request(path, "POST", body)]);
  assert.equal(replies[0].status, 200);
  assert.equal(replies[1].status, 200);
  assert.equal(replies[0].data.message.id, replies[1].data.message.id);
  assert.equal(deliveryCount, 1);
  assert.equal((await request(path, "POST", body)).data.message.status, "accepted");
  assert.equal(deliveryCount, 1);
  assert.equal((await request(path, "POST", { ...body, body: "Changed" })).status, 409);
});
test("consented SMS and provider failures/unknown outcomes persist without automatic resend", async () => {
  const { reservation } = await store.reserve(tenantId, boardId, reservationInput([60], { smsConsent: true }));
  const path = `/${boardId}/reservations/${reservation.id}/messages`;
  for (const [mode, expected] of [["accept", "accepted"], ["reject", "failed"], ["throw", "unknown"]] as const) {
    deliveryMode = mode;
    const before = deliveryCount;
    const body = { requestKey: randomUUID(), channel: "sms", body: "Free event update" };
    assert.equal((await request(path, "POST", body)).data.message.status, expected);
    assert.equal((await request(path, "POST", body)).data.message.status, expected);
    assert.equal(deliveryCount, before + 1);
  }
  deliveryMode = "accept";
});
test("opt-out GET is scanner safe; explicit opt-out prevents further sends", async () => {
  const { reservation } = await store.reserve(tenantId, boardId, reservationInput([70], { smsConsent: true }));
  const token = (await pool.query(`SELECT unsubscribe_token FROM free_square_reservations WHERE id=$1`, [reservation.id])).rows[0].unsubscribe_token;
  const get = await fetch(`${base}/api/free-squares/unsubscribe/${token}`);
  assert.equal(get.status, 200);
  assert.equal((await pool.query(`SELECT sms_revoked_at FROM free_square_reservations WHERE id=$1`, [reservation.id])).rows[0].sms_revoked_at, null);
  const post = await fetch(`${base}/api/free-squares/unsubscribe/${token}`, { method: "POST" });
  assert.equal(post.status, 200);
  const before = deliveryCount;
  const path = `/${boardId}/reservations/${reservation.id}/messages`;
  for (const channel of ["sms", "email"])
    assert.equal((await request(path, "POST", { requestKey: randomUUID(), channel, subject: "Update", body: "Hello" })).status, 400);
  assert.equal(deliveryCount, before);
});
