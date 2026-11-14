import { pool } from "../server/db";
import { rescueHelpSchemaSql } from "../server/lib/rescue-help-schema";
try { await pool.query(rescueHelpSchemaSql); console.log("Rescue Inbox storage ready"); }
finally { await pool.end(); }
