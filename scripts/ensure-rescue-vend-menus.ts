import { pool } from "../server/db";

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rescue_vend_menus (
      id serial PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      version text NOT NULL,
      items jsonb NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS rescue_vend_menus_tenant_version
      ON rescue_vend_menus (tenant_id, version);
  `);
  console.log("Vending menu version storage ready.");
} finally {
  await pool.end();
}
