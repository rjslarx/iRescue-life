import { pool } from "../server/db";
import { fundraisingFeePolicySql } from "../server/lib/fundraising-fee-policy-schema";
try {
  await pool.query(fundraisingFeePolicySql);
  console.log("Fundraising fee policy schema ready.");
} finally {
  await pool.end();
}
