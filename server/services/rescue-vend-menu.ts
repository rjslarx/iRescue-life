import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { rescueVendMenus, tenants } from "@shared/schema";
import { DEFAULT_VENDING_MENU, vendingMenuSchema, type VendingMenu } from "@shared/rescue-vend";

export async function getVendingMenu(tenantId: string, version?: string): Promise<VendingMenu> {
  if (version === "1") return DEFAULT_VENDING_MENU;
  const [row] = await db.select().from(rescueVendMenus)
    .where(version ? and(eq(rescueVendMenus.tenantId, tenantId), eq(rescueVendMenus.version, version)) : eq(rescueVendMenus.tenantId, tenantId))
    .orderBy(desc(rescueVendMenus.id)).limit(1);
  if (!row) {
    if (version) throw new Error("Unknown vending menu version");
    return DEFAULT_VENDING_MENU;
  }
  return vendingMenuSchema.parse({ version: row.version, items: row.items });
}

/** Historical reporting: missing/invalid versions are unattributed; database failures must surface. */
export async function findVendingMenuVersion(tenantId: string, version: string): Promise<VendingMenu | null> {
  if (version === DEFAULT_VENDING_MENU.version) return DEFAULT_VENDING_MENU;
  const [row] = await db.select().from(rescueVendMenus)
    .where(and(eq(rescueVendMenus.tenantId, tenantId), eq(rescueVendMenus.version, version))).limit(1);
  if (!row) return null;
  const parsed = vendingMenuSchema.safeParse({ version: row.version, items: row.items });
  return parsed.success ? parsed.data : null;
}

export async function saveVendingMenu(tenantId: string, menu: VendingMenu): Promise<VendingMenu | null> {
  return db.transaction(async tx => {
    // Serialize edits for this rescue; reject a stale editor instead of losing edits.
    const [tenant] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for("update");
    if (!tenant) throw new Error("Rescue not found");
    const [latest] = await tx.select().from(rescueVendMenus).where(eq(rescueVendMenus.tenantId, tenantId))
      .orderBy(desc(rescueVendMenus.id)).limit(1);
    if (menu.version !== (latest?.version ?? "1")) return null;
    const saved = { version: randomUUID(), items: menu.items };
    await tx.insert(rescueVendMenus).values({ tenantId, ...saved });
    return saved;
  });
}
