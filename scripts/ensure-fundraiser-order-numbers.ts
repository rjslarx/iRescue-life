import { pool } from "../server/db";
import { fundraiserOrderNumbersSql } from "../server/lib/fundraiser-order-numbers";

try {
  await pool.query(fundraiserOrderNumbersSql);
  console.log("Fundraiser order numbers ensured.");
} finally {
  await pool.end();
}
