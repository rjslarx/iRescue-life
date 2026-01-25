import { db } from "./db";
import { tenants, users, animals } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";

// SECURITY WARNING: This is a development-only default password
// In production, ALWAYS set DEMO_ADMIN_PASSWORD environment variable or disable this seed script
const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "Demo123!";

async function seed() {
  console.log("Starting database seed...");
  console.log("⚠️  DEVELOPMENT ONLY: Do not use this seed script in production!");

  try {
    // Get or create demo tenant
    let demoTenant = await db.select().from(tenants).where(eq(tenants.subdomain, "demo")).limit(1);
    
    let tenant;
    if (demoTenant.length === 0) {
      console.log("Creating demo tenant...");
      const newTenant = await db.insert(tenants).values({
        subdomain: "demo",
        name: "Demo Rescue",
        tagline: "Helping animals find loving homes",
        contactEmail: "demo@example.com",
        isActive: true,
      }).returning();
      tenant = newTenant[0];
      console.log(`✓ Created demo tenant: ${tenant.name}`);
    } else {
      tenant = demoTenant[0];
      console.log(`✓ Found existing demo tenant: ${tenant.name}`);
    }

    // Check if demo admin user exists
    const existingUser = await db.select().from(users)
      .where(and(
        eq(users.tenantId, tenant.id),
        eq(users.email, "admin@demo.com")
      ))
      .limit(1);

    if (existingUser.length > 0) {
      console.log("✓ Demo admin user already exists");
    } else {
      // Create demo admin user with environment-configured password
      const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);
      const newUser = await db.insert(users).values({
        tenantId: tenant.id,
        email: "admin@demo.com",
        passwordHash,
        fullName: "Demo Admin",
        roles: ["admin"],
        isActive: true,
      }).returning();
      console.log(`✓ Created demo admin user: ${newUser[0].email}`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`  Login: admin@demo.com / ${DEMO_ADMIN_PASSWORD}`);
      }
    }

    // Get or create platform tenant (for platform admins)
    let platformTenantData = await db.select().from(tenants).where(eq(tenants.subdomain, "platform")).limit(1);
    
    let platformTenant;
    if (platformTenantData.length === 0) {
      console.log("Creating platform tenant...");
      const newPlatformTenant = await db.insert(tenants).values({
        subdomain: "platform",
        name: "iRescue Platform",
        tagline: "Platform Administration",
        contactEmail: "platform@irescue.life",
        isActive: true,
      }).returning();
      platformTenant = newPlatformTenant[0];
      console.log(`✓ Created platform tenant: ${platformTenant.name}`);
    } else {
      platformTenant = platformTenantData[0];
      console.log(`✓ Found existing platform tenant: ${platformTenant.name}`);
    }

    // Check if platform admin user exists
    const existingPlatformAdmin = await db.select().from(users)
      .where(and(
        eq(users.tenantId, platformTenant.id),
        eq(users.email, "platform@irescue.life")
      ))
      .limit(1);

    if (existingPlatformAdmin.length > 0) {
      console.log("✓ Platform admin user already exists");
    } else {
      // Create platform admin user with environment-configured password
      const platformPasswordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);
      const newPlatformAdmin = await db.insert(users).values({
        tenantId: platformTenant.id,
        email: "platform@irescue.life",
        passwordHash: platformPasswordHash,
        fullName: "Platform Administrator",
        roles: ["platform_admin"],
        isActive: true,
      }).returning();
      console.log(`✓ Created platform admin user: ${newPlatformAdmin[0].email}`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`  Login: platform@irescue.life / ${DEMO_ADMIN_PASSWORD}`);
      }
    }

    // Check if demo animals exist
    const existingAnimals = await db.select().from(animals)
      .where(eq(animals.tenantId, tenant.id))
      .limit(1);

    if (existingAnimals.length > 0) {
      console.log("✓ Demo animals already exist");
    } else {
      // Create some demo animals
      const demoAnimals = [
        {
          tenantId: tenant.id,
          animalId: "A001",
          name: "Buddy",
          species: "Dog",
          breed: "Golden Retriever",
          age: "3 years",
          gender: "Male",
          bio: "Buddy is a friendly and energetic golden retriever who loves playing fetch and going for walks.",
          status: "available" as const,
        },
        {
          tenantId: tenant.id,
          animalId: "A002",
          name: "Luna",
          species: "Cat",
          breed: "Siamese",
          age: "2 years",
          gender: "Female",
          bio: "Luna is a gentle and affectionate cat who enjoys cuddles and sunny windowsills.",
          status: "available" as const,
        },
        {
          tenantId: tenant.id,
          animalId: "A003",
          name: "Max",
          species: "Dog",
          breed: "German Shepherd",
          age: "5 years",
          gender: "Male",
          bio: "Max is a loyal and protective companion who would do well with an experienced owner.",
          status: "available" as const,
        },
      ];

      await db.insert(animals).values(demoAnimals);
      console.log(`✓ Created ${demoAnimals.length} demo animals`);
    }

    console.log("\n✅ Seed complete!");
    console.log("   Tenant Admin Login: admin@demo.com");
    console.log("   Platform Admin Login: platform@irescue.life");
    if (process.env.NODE_ENV !== 'production') {
      console.log(`   Password: ${DEMO_ADMIN_PASSWORD}\n`);
    }
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    throw error;
  }
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
