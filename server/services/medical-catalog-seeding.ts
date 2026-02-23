import { db } from '../db';
import { medicalCatalog, orderSets, orderSetItems } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface CatalogSeedItem {
  name: string;
  category: 'Medication' | 'Vaccine' | 'Lab' | 'Procedure' | 'Preventative' | 'Exam';
  defaultDose?: string;
  defaultFrequency?: string;
}

const DEFAULT_CATALOG_ITEMS: CatalogSeedItem[] = [
  { name: 'Doxycycline', category: 'Medication', defaultDose: '5mg/kg', defaultFrequency: 'BID x 14 days' },
  { name: 'Amoxicillin', category: 'Medication', defaultDose: '10mg/kg', defaultFrequency: 'BID x 10 days' },
  { name: 'Clavamox (Amoxicillin-Clavulanate)', category: 'Medication', defaultDose: '13.75mg/kg', defaultFrequency: 'BID x 10 days' },
  { name: 'Metronidazole', category: 'Medication', defaultDose: '10mg/kg', defaultFrequency: 'BID x 7 days' },
  { name: 'Cephalexin', category: 'Medication', defaultDose: '22mg/kg', defaultFrequency: 'BID x 10 days' },
  { name: 'Enrofloxacin (Baytril)', category: 'Medication', defaultDose: '5mg/kg', defaultFrequency: 'SID x 10 days' },
  { name: 'Clindamycin', category: 'Medication', defaultDose: '11mg/kg', defaultFrequency: 'BID x 10 days' },
  { name: 'Gabapentin', category: 'Medication', defaultDose: '5mg/kg', defaultFrequency: 'BID-TID' },
  { name: 'Trazodone', category: 'Medication', defaultDose: '3mg/kg', defaultFrequency: 'BID PRN' },
  { name: 'Prednisone', category: 'Medication', defaultDose: '1mg/kg', defaultFrequency: 'SID x 5 days, taper' },
  { name: 'Prednisolone', category: 'Medication', defaultDose: '1mg/kg', defaultFrequency: 'SID x 5 days, taper' },
  { name: 'Dexamethasone', category: 'Medication', defaultDose: '0.1mg/kg', defaultFrequency: 'Once' },
  { name: 'Carprofen (Rimadyl)', category: 'Medication', defaultDose: '2mg/kg', defaultFrequency: 'BID' },
  { name: 'Meloxicam (Metacam)', category: 'Medication', defaultDose: '0.1mg/kg', defaultFrequency: 'SID' },
  { name: 'Cerenia (Maropitant)', category: 'Medication', defaultDose: '2mg/kg', defaultFrequency: 'SID x 5 days' },
  { name: 'Famotidine (Pepcid)', category: 'Medication', defaultDose: '0.5mg/kg', defaultFrequency: 'BID' },
  { name: 'Omeprazole (Prilosec)', category: 'Medication', defaultDose: '1mg/kg', defaultFrequency: 'SID' },
  { name: 'Sucralfate (Carafate)', category: 'Medication', defaultDose: '0.5g', defaultFrequency: 'TID, 1hr before meals' },
  { name: 'Apoquel (Oclacitinib)', category: 'Medication', defaultDose: '0.4mg/kg', defaultFrequency: 'BID x 14 days, then SID' },
  { name: 'Diphenhydramine (Benadryl)', category: 'Medication', defaultDose: '2mg/kg', defaultFrequency: 'BID-TID' },
  { name: 'Cetirizine (Zyrtec)', category: 'Medication', defaultDose: '1mg/kg', defaultFrequency: 'SID' },
  { name: 'Fluoxetine (Prozac)', category: 'Medication', defaultDose: '1mg/kg', defaultFrequency: 'SID' },
  { name: 'Tramadol', category: 'Medication', defaultDose: '5mg/kg', defaultFrequency: 'BID-TID' },
  { name: 'Acepromazine', category: 'Medication', defaultDose: '0.025mg/kg', defaultFrequency: 'PRN' },
  { name: 'Ondansetron (Zofran)', category: 'Medication', defaultDose: '0.5mg/kg', defaultFrequency: 'BID PRN' },
  { name: 'Furosemide (Lasix)', category: 'Medication', defaultDose: '2mg/kg', defaultFrequency: 'BID' },
  { name: 'Enalapril', category: 'Medication', defaultDose: '0.5mg/kg', defaultFrequency: 'BID' },
  { name: 'Pimobendan (Vetmedin)', category: 'Medication', defaultDose: '0.25mg/kg', defaultFrequency: 'BID' },
  { name: 'Phenobarbital', category: 'Medication', defaultDose: '2.5mg/kg', defaultFrequency: 'BID' },
  { name: 'Methimazole (Tapazole)', category: 'Medication', defaultDose: '2.5mg', defaultFrequency: 'BID' },
  { name: 'Levothyroxine (Thyro-Tabs)', category: 'Medication', defaultDose: '0.02mg/kg', defaultFrequency: 'BID' },
  { name: 'Fenbendazole (Panacur)', category: 'Medication', defaultDose: '50mg/kg', defaultFrequency: 'SID x 3-5 days' },
  { name: 'Pyrantel (Strongid)', category: 'Medication', defaultDose: '1ml/10lbs', defaultFrequency: 'Once, repeat in 2 weeks' },
  { name: 'Praziquantel (Droncit)', category: 'Medication', defaultDose: '5mg/kg', defaultFrequency: 'Once' },
  { name: 'Mirtazapine (Mirataz)', category: 'Medication', defaultDose: '1.88mg', defaultFrequency: 'Every 48hrs' },
  { name: 'Galliprant (Grapiprant)', category: 'Medication', defaultDose: '2mg/kg', defaultFrequency: 'SID' },
  { name: 'Metoclopramide (Reglan)', category: 'Medication', defaultDose: '0.3mg/kg', defaultFrequency: 'TID' },
  { name: 'Ponazuril (Marquis)', category: 'Medication', defaultDose: '50mg/kg', defaultFrequency: 'SID x 5 days' },
  { name: 'Capstar (Nitenpyram)', category: 'Medication', defaultDose: '1mg/kg', defaultFrequency: 'Once PRN' },
  { name: 'Erythromycin Ophthalmic', category: 'Medication', defaultDose: 'Topical', defaultFrequency: 'TID x 7-10 days' },

  { name: 'DHPP (DA2PP)', category: 'Vaccine' },
  { name: 'Rabies (1-Year)', category: 'Vaccine' },
  { name: 'Rabies (3-Year)', category: 'Vaccine' },
  { name: 'Bordetella', category: 'Vaccine' },
  { name: 'Bordetella (Intranasal)', category: 'Vaccine' },
  { name: 'Bordetella (Oral)', category: 'Vaccine' },
  { name: 'FVRCP', category: 'Vaccine' },
  { name: 'FeLV (Feline Leukemia)', category: 'Vaccine' },
  { name: 'Leptospirosis', category: 'Vaccine' },
  { name: 'Lyme Disease', category: 'Vaccine' },
  { name: 'Canine Influenza (CIV H3N2/H3N8)', category: 'Vaccine' },
  { name: 'Distemper (Single)', category: 'Vaccine' },
  { name: 'Parvovirus (Single)', category: 'Vaccine' },

  { name: 'CBC (Complete Blood Count)', category: 'Lab' },
  { name: 'Chemistry Panel', category: 'Lab' },
  { name: 'Comprehensive Metabolic Panel', category: 'Lab' },
  { name: 'Urinalysis', category: 'Lab' },
  { name: 'Fecal Float', category: 'Lab' },
  { name: 'Heartworm/Tick 4DX SNAP', category: 'Lab' },
  { name: 'FeLV/FIV SNAP Test', category: 'Lab' },
  { name: 'Parvo SNAP Test', category: 'Lab' },
  { name: 'T4 (Thyroid)', category: 'Lab' },
  { name: 'Free T4', category: 'Lab' },
  { name: 'Cytology', category: 'Lab' },
  { name: 'Culture & Sensitivity', category: 'Lab' },
  { name: 'Bile Acids (Pre & Post)', category: 'Lab' },
  { name: 'ACTH Stimulation Test', category: 'Lab' },
  { name: 'Blood Type', category: 'Lab' },
  { name: 'Progesterone', category: 'Lab' },
  { name: 'Coagulation Panel (PT/PTT)', category: 'Lab' },
  { name: 'Urine Protein:Creatinine Ratio (UPC)', category: 'Lab' },
  { name: 'Reticulocyte Count', category: 'Lab' },
  { name: 'Skin Scrape', category: 'Lab' },
  { name: 'Bloodwork (CBC/Chem)', category: 'Lab' },

  { name: 'Spay (Ovariohysterectomy)', category: 'Procedure' },
  { name: 'Neuter (Orchiectomy)', category: 'Procedure' },
  { name: 'Microchip Implant', category: 'Procedure' },
  { name: 'Dental Cleaning (Prophylaxis)', category: 'Procedure' },
  { name: 'Dental Extraction', category: 'Procedure' },
  { name: 'Mass/Lump Removal', category: 'Procedure' },
  { name: 'Laceration Repair', category: 'Procedure' },
  { name: 'Foreign Body Surgery (Exploratory)', category: 'Procedure' },
  { name: 'Cherry Eye Repair', category: 'Procedure' },
  { name: 'Entropion Repair', category: 'Procedure' },
  { name: 'Enucleation (Eye Removal)', category: 'Procedure' },
  { name: 'Amputation', category: 'Procedure' },
  { name: 'Cystotomy (Bladder Stone Removal)', category: 'Procedure' },
  { name: 'Gastropexy', category: 'Procedure' },
  { name: 'C-Section (Cesarean)', category: 'Procedure' },
  { name: 'Aural Hematoma Repair', category: 'Procedure' },
  { name: 'Hernia Repair', category: 'Procedure' },
  { name: 'Euthanasia', category: 'Procedure' },
  { name: 'TPLO (Cruciate Repair)', category: 'Procedure' },

  { name: 'Simparica Trio', category: 'Preventative', defaultFrequency: 'Monthly' },
  { name: 'Heartgard Plus', category: 'Preventative', defaultFrequency: 'Monthly' },
  { name: 'NexGard', category: 'Preventative', defaultFrequency: 'Monthly' },
  { name: 'Bravecto', category: 'Preventative', defaultFrequency: 'Every 3 months' },
  { name: 'Revolution Plus', category: 'Preventative', defaultFrequency: 'Monthly' },
  { name: 'Interceptor Plus', category: 'Preventative', defaultFrequency: 'Monthly' },
  { name: 'Seresto Collar', category: 'Preventative', defaultFrequency: 'Every 8 months' },
  { name: 'Flea/Tick Prevention', category: 'Preventative', defaultFrequency: 'Monthly' },
  { name: 'Deworming Protocol', category: 'Preventative' },
  { name: 'Heartworm Prevention', category: 'Preventative', defaultFrequency: 'Monthly' },

  { name: 'Intake Exam', category: 'Exam' },
  { name: 'Wellness Exam', category: 'Exam' },
  { name: 'Sick Visit', category: 'Exam' },
  { name: 'Recheck Exam', category: 'Exam' },
  { name: 'Pre-Surgical Exam', category: 'Exam' },
  { name: 'Adoption Exam', category: 'Exam' },
  { name: 'Emergency Exam', category: 'Exam' },
  { name: 'Behavioral Consult', category: 'Exam' },
];

const DEFAULT_ORDER_SETS = [
  {
    setName: 'Standard Dog Intake',
    description: 'Standard canine intake protocol: DHPP, fecal, dewormer, heartworm test',
    itemNames: ['DHPP (DA2PP)', 'Fecal Float', 'Pyrantel (Strongid)', 'Heartworm/Tick 4DX SNAP', 'Intake Exam'],
  },
  {
    setName: 'Standard Cat Intake',
    description: 'Standard feline intake protocol: FVRCP, FeLV/FIV snap, fecal, dewormer',
    itemNames: ['FVRCP', 'FeLV/FIV SNAP Test', 'Fecal Float', 'Pyrantel (Strongid)', 'Intake Exam'],
  },
  {
    setName: 'Puppy Protocol',
    description: 'Initial puppy vaccination and preventative care series',
    itemNames: ['DHPP (DA2PP)', 'Fecal Float', 'Pyrantel (Strongid)', 'Simparica Trio', 'Wellness Exam'],
  },
  {
    setName: 'Pre-Surgical Workup',
    description: 'Pre-operative bloodwork and exam',
    itemNames: ['CBC (Complete Blood Count)', 'Chemistry Panel', 'Pre-Surgical Exam'],
  },
];

export async function seedMedicalCatalog(tenantId: string): Promise<{ catalogCreated: number; catalogSkipped: number; orderSetsCreated: number }> {
  const existingItems = await db
    .select({ id: medicalCatalog.id, name: medicalCatalog.name })
    .from(medicalCatalog)
    .where(eq(medicalCatalog.tenantId, tenantId));

  const existingNames = new Set(existingItems.map(item => item.name.toLowerCase()));

  const newItems = DEFAULT_CATALOG_ITEMS.filter(item => !existingNames.has(item.name.toLowerCase()));
  const skippedCount = DEFAULT_CATALOG_ITEMS.length - newItems.length;

  let createdItems: any[] = [];

  if (newItems.length > 0) {
    const catalogRows = newItems.map(item => ({
      tenantId,
      name: item.name,
      category: item.category,
      defaultDose: item.defaultDose || null,
      defaultFrequency: item.defaultFrequency || null,
    }));

    createdItems = await db
      .insert(medicalCatalog)
      .values(catalogRows)
      .returning();

    console.log(`[MedicalCatalog] Seeded ${createdItems.length} new catalog items for tenant ${tenantId} (${skippedCount} already existed)`);
  } else {
    console.log(`[MedicalCatalog] All ${DEFAULT_CATALOG_ITEMS.length} default items already exist for tenant ${tenantId}`);
  }

  const allCatalogItems = await db
    .select({ id: medicalCatalog.id, name: medicalCatalog.name })
    .from(medicalCatalog)
    .where(eq(medicalCatalog.tenantId, tenantId));

  const catalogByName = new Map(allCatalogItems.map(c => [c.name, c]));

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

  return { catalogCreated: createdItems.length, catalogSkipped: skippedCount, orderSetsCreated };
}
