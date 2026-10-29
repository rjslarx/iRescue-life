import { pool } from "../server/db";
import { donationAuditSchemaSql } from "../server/lib/donation-audit";

try {
  await pool.query(donationAuditSchemaSql);
  console.log("Donation attribution schema and historical evidence reconciliation applied.");
} finally {
  await pool.end();
}
