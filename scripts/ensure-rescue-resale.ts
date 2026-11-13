import { pool } from "../server/db";
import { rescueResaleSchemaSql } from "../server/lib/rescue-resale-schema";
try {
  await pool.query(rescueResaleSchemaSql);
  console.log("Rescue Resale storage ready.");
} finally { await pool.end(); }
