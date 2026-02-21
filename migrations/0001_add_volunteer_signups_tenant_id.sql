-- Add tenantId column to volunteer_signups
ALTER TABLE "volunteer_signups" ADD COLUMN "tenant_id" uuid;

-- Populate tenant_id from the related opportunity
UPDATE "volunteer_signups" 
SET "tenant_id" = (
  SELECT "tenant_id" 
  FROM "volunteer_opportunities" 
  WHERE "volunteer_opportunities"."id" = "volunteer_signups"."opportunity_id"
);

-- Make tenant_id NOT NULL
ALTER TABLE "volunteer_signups" ALTER COLUMN "tenant_id" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "volunteer_signups" ADD CONSTRAINT "volunteer_signups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
