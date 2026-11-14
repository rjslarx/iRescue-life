/** Additive, shared by startup and post-merge setup so published menus stay readable. */
export const rescueVendSchemaSql = `
  CREATE TABLE IF NOT EXISTS rescue_vend_menus (
    id serial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    version text NOT NULL,
    items jsonb NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS rescue_vend_menus_tenant_version
    ON rescue_vend_menus (tenant_id, version);
  ALTER TABLE rescue_vend_menus ADD COLUMN IF NOT EXISTS machine_style text NOT NULL DEFAULT 'classic';
  ALTER TABLE rescue_vend_menus ADD COLUMN IF NOT EXISTS short_name text NOT NULL DEFAULT '';
  ALTER TABLE rescue_vend_menus ADD COLUMN IF NOT EXISTS show_in_navigation boolean NOT NULL DEFAULT false;
`;
