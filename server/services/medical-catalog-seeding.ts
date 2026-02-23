import { db } from '../db';
import { medicalCatalog, orderSets, orderSetItems } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface CatalogSeedItem {
  name: string;
  category: 'Medication' | 'Vaccine' | 'Lab' | 'Procedure' | 'Preventative';
  defaultDose?: string;
  defaultFrequency?: string;
}

const DEFAULT_CATALOG_ITEMS: CatalogSeedItem[] = [
  { name: 'DHPP (DA2PP)', category: 'Vaccine' },
  { name: 'Rabies (1-Year)', category: 'Vaccine' },
  { name: 'Bordetella', category: 'Vaccine' },
  { name: 'FVRCP', category: 'Vaccine' },
  { name: 'Fecal (Float/Centrifugal)', category: 'Lab' },
  { name: 'Heartworm/Tick 4DX Test', category: 'Lab' },
  { name: 'FeLV/FIV Snap Test', category: 'Lab' },
  { name: 'Pyrantel (Dewormer)', category: 'Medication', defaultDose: '1ml/10lbs', defaultFrequency: 'Once' },
  { name: 'Metronidazole', category: 'Medication', defaultDose: '250mg', defaultFrequency: 'BID x 7 days' },
  { name: 'Cephalexin', category: 'Medication', defaultDose: '500mg', defaultFrequency: 'BID x 10 days' },
  { name: 'Spay', category: 'Procedure' },
  { name: 'Neuter', category: 'Procedure' },
  { name: 'Microchip Implant', category: 'Procedure' },
  { name: 'Simparica Trio', category: 'Preventative', defaultFrequency: 'Monthly' },
  { name: 'Heartgard Plus', category: 'Preventative', defaultFrequency: 'Monthly' },
];

const DEFAULT_ORDER_SETS = [
  {
    setName: 'Standard Intake',
    description: 'Standard intake protocol: vaccination, fecal test, and dewormer',
    itemNames: ['DHPP (DA2PP)', 'Fecal (Float/Centrifugal)', 'Pyrantel (Dewormer)'],
  },
];

export async function seedMedicalCatalog(tenantId: string): Promise<{ catalogCreated: number; orderSetsCreated: number }> {
  const existing = await db
    .select({ id: medicalCatalog.id })
    .from(medicalCatalog)
    .where(eq(medicalCatalog.tenantId, tenantId))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[MedicalCatalog] Tenant ${tenantId} already has catalog items, skipping seed.`);
    return { catalogCreated: 0, orderSetsCreated: 0 };
  }

  const catalogRows = DEFAULT_CATALOG_ITEMS.map(item => ({
    tenantId,
    name: item.name,
    category: item.category,
    defaultDose: item.defaultDose || null,
    defaultFrequency: item.defaultFrequency || null,
  }));

  const createdItems = await db
    .insert(medicalCatalog)
    .values(catalogRows)
    .returning();

  console.log(`[MedicalCatalog] Seeded ${createdItems.length} catalog items for tenant ${tenantId}`);

  const catalogByName = new Map(createdItems.map(c => [c.name, c]));

  let orderSetsCreated = 0;
  for (const osDef of DEFAULT_ORDER_SETS) {
    const existingSet = await db
      .select({ id: orderSets.id })
      .from(orderSets)
      .where(and(eq(orderSets.tenantId, tenantId), eq(orderSets.setName, osDef.setName)))
      .limit(1);

    if (existingSet.length > 0) continue;

    const [createdSet] = await db
      .insert(orderSets)
      .values({ tenantId, setName: osDef.setName, description: osDef.description })
      .returning();

    const itemRows = osDef.itemNames
      .map((name, idx) => {
        const catalogItem = catalogByName.get(name);
        if (!catalogItem) return null;
        return { orderSetId: createdSet.id, catalogItemId: catalogItem.id, sortOrder: idx };
      })
      .filter(Boolean) as { orderSetId: string; catalogItemId: string; sortOrder: number }[];

    if (itemRows.length > 0) {
      await db.insert(orderSetItems).values(itemRows);
    }

    orderSetsCreated++;
    console.log(`[MedicalCatalog] Created order set "${osDef.setName}" with ${itemRows.length} items`);
  }

  return { catalogCreated: createdItems.length, orderSetsCreated };
}
