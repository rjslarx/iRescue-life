import { pool } from "../server/db";
import { rescueVendSchemaSql } from "../server/lib/rescue-vend-schema";

try {
  await pool.query(rescueVendSchemaSql);
  console.log("Vending menu version storage ready.");
} finally {
  await pool.end();
}
