import { pool } from "../server/db";
import { communityResaleSchemaSql } from "../server/lib/community-resale-schema";
try {
  await pool.query(communityResaleSchemaSql);
  console.log("Community resale storage ready.");
} finally { await pool.end(); }
