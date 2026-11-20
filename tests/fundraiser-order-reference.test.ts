import test from "node:test";
import assert from "node:assert/strict";
import { fundraiserOrderReference, matchesFundraiserOrder } from "../shared/fundraiser-order-reference";
import { fundraiserOrderNumbersSql } from "../server/lib/fundraiser-order-numbers";

test("order references and pickup searches support numbers, names, and email", () => {
  const order = { orderNumber: 1042, customerName: "Example Buyer", customerEmail: "buyer@example.test" };
  assert.equal(fundraiserOrderReference(order.orderNumber), "F-1042");
  for (const query of ["1042", "#F-1042", "f-1042", " BUYER ", "example.test", ""]) {
    assert.equal(matchesFundraiserOrder(order, query), true);
  }
  assert.equal(matchesFundraiserOrder(order, "1043"), false);
  assert.equal(matchesFundraiserOrder({ ...order, orderNumber: undefined }, "F-1042"), false);
});

test("number migration backfills once and allocates unique references", { skip: process.env.RUN_RESALE_DB_TEST !== "1" }, async () => {
  const { pool } = await import("../server/db");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA fundraiser_number_test");
    await client.query("SET LOCAL search_path TO fundraiser_number_test");
    await client.query("CREATE TABLE fundraiser_orders (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY)");
    await client.query("INSERT INTO fundraiser_orders DEFAULT VALUES");
    await client.query(fundraiserOrderNumbersSql);
    const first = await client.query("SELECT order_number FROM fundraiser_orders");
    assert.equal(first.rows[0].order_number, 1001);
    await client.query(fundraiserOrderNumbersSql);
    assert.deepEqual((await client.query("SELECT order_number FROM fundraiser_orders")).rows, first.rows);
    await client.query("INSERT INTO fundraiser_orders (order_number) SELECT nextval('fundraiser_order_number_seq') FROM generate_series(1,100)");
    const counts = await client.query("SELECT count(*)::int n, count(DISTINCT order_number)::int u FROM fundraiser_orders");
    assert.equal(counts.rows[0].n, 101);
    assert.equal(counts.rows[0].u, 101);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
