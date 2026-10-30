import { pool } from "../server/db";
import { catVaccineGuardSql } from "../server/lib/cat-vaccine-guard";
try {
  await pool.query(catVaccineGuardSql);
  console.log("Cat vaccine safeguards applied.");
} finally { await pool.end(); }
