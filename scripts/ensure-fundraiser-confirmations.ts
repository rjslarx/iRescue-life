import { pool } from "../server/db";
import { fundraiserConfirmationSql } from "../server/lib/fundraiser-confirmation-schema";
try {
  await pool.query(fundraiserConfirmationSql);
  console.log("Fundraiser confirmation delivery schema ensured.");
} finally {
  await pool.end();
}
