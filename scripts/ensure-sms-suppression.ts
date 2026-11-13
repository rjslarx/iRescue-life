import { pool } from "../server/db";
import { smsSuppressionSchemaSql } from "../server/lib/sms-suppression-schema";
try {
  await pool.query(smsSuppressionSchemaSql);
  console.log("SMS suppression storage ready.");
} finally { await pool.end(); }
