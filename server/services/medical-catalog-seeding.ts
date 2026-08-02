import { db } from '../db';
import { medicalCatalog, orderSets, orderSetItems } from '@shared/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';

interface CatalogSeedItem {
  name: string;
  category: 'Medication' | 'Vaccine' | 'Lab' | 'Procedure' | 'Preventative' | 'Exam';
  defaultDose?: string;
  defaultFrequency?: string;
  defaultIntervalDays?: number;
  speciesTarget?: 'Dog' | 'Cat' | 'Both';
  defaultRoute?: 'PO' | 'Topical' | 'Collar' | 'Injection';
  manufacturer?: string;
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
  { name: 'Convenia Injection (Cefovecin)', category: 'Medication', defaultDose: '8mg/kg', defaultFrequency: 'Single SQ injection, lasts 14 days' },
  { name: 'Ponazuril (Marquis)', category: 'Medication', defaultDose: '50mg/kg', defaultFrequency: 'SID x 5 days' },
  { name: 'Capstar (Nitenpyram)', category: 'Medication', defaultDose: '1mg/kg', defaultFrequency: 'Once PRN' },
  { name: 'Erythromycin Ophthalmic', category: 'Medication', defaultDose: 'Topical', defaultFrequency: 'TID x 7-10 days' },

  { name: 'DHPP (DA2PP)', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Rabies (1-Year)', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Rabies (3-Year)', category: 'Vaccine', defaultIntervalDays: 1095 },
  { name: 'Bordetella', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Bordetella (Intranasal)', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Bordetella (Oral)', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'FVRCP', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'FeLV (Feline Leukemia)', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Leptospirosis', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Lyme Disease', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Canine Influenza (CIV H3N2/H3N8)', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Distemper (Single)', category: 'Vaccine', defaultIntervalDays: 365 },
  { name: 'Parvovirus (Single)', category: 'Vaccine', defaultIntervalDays: 365 },

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
  { name: 'Skin Scrape Recheck', category: 'Lab' },
  { name: 'Giardia ELISA / Fecal Recheck', category: 'Lab' },
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
  { name: 'Subcutaneous (SQ) Fluids', category: 'Procedure' },
  { name: 'Syringe Feeding / Nutritional Support', category: 'Procedure' },
  { name: 'Medicated/Sanitary Bath', category: 'Procedure' },

  // --- DOG PREVENTATIVES ---
  { name: 'Heartgard Plus', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Boehringer Ingelheim' },
  { name: 'Simparica Trio', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Zoetis' },
  { name: 'NexGard', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Boehringer Ingelheim' },
  { name: 'Bravecto Chews', category: 'Preventative', defaultFrequency: 'Every 12 weeks', defaultIntervalDays: 84, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto 1-Month', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto Topical (Dog)', category: 'Preventative', defaultFrequency: 'Every 12 weeks', defaultIntervalDays: 84, speciesTarget: 'Dog', defaultRoute: 'Topical', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto Quantum', category: 'Preventative', defaultFrequency: 'Annually', defaultIntervalDays: 365, speciesTarget: 'Dog', defaultRoute: 'Injection', manufacturer: 'Merck Animal Health' },
  { name: 'Interceptor Plus', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Elanco' },
  { name: 'Sentinel Spectrum', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Virbac' },
  { name: 'K9 Advantix II', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'Topical', manufacturer: 'Elanco' },
  { name: 'Advantage Multi (Dog)', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'Topical', manufacturer: 'Elanco' },
  { name: 'Barrier Flea & Heartworm (Dog)', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'Topical', manufacturer: 'Aurora Pharmaceutical' },
  { name: 'Barrier Flea & Heartworm (Cat)', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Aurora Pharmaceutical' },
  { name: 'Trifexis', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Elanco' },
  { name: 'Credelio', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Elanco' },
  { name: 'Seresto Collar (Dog)', category: 'Preventative', defaultFrequency: 'Every 8 months', defaultIntervalDays: 240, speciesTarget: 'Dog', defaultRoute: 'Collar', manufacturer: 'Elanco' },
  { name: 'ProHeart 6', category: 'Preventative', defaultFrequency: 'Every 6 months', defaultIntervalDays: 180, speciesTarget: 'Dog', defaultRoute: 'Injection', manufacturer: 'Zoetis' },
  { name: 'ProHeart 12', category: 'Preventative', defaultFrequency: 'Annually', defaultIntervalDays: 365, speciesTarget: 'Dog', defaultRoute: 'Injection', manufacturer: 'Zoetis' },

  // --- CAT PREVENTATIVES ---
  { name: 'Revolution Plus', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Zoetis' },
  { name: 'Revolution (Feline)', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Zoetis' },
  { name: 'Bravecto Topical (Cat)', category: 'Preventative', defaultFrequency: 'Every 12 weeks', defaultIntervalDays: 84, speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto Plus', category: 'Preventative', defaultFrequency: 'Every 8 weeks', defaultIntervalDays: 56, speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Merck Animal Health' },
  { name: 'Cheristin', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Elanco' },
  { name: 'NexGard Combo', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Boehringer Ingelheim' },
  { name: 'Advantage II (Feline)', category: 'Preventative', defaultFrequency: 'Monthly', defaultIntervalDays: 30, speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Elanco' },
  { name: 'Seresto Collar (Cat)', category: 'Preventative', defaultFrequency: 'Every 8 months', defaultIntervalDays: 240, speciesTarget: 'Cat', defaultRoute: 'Collar', manufacturer: 'Elanco' },

  // --- GENERAL DEWORMERS ---
  { name: 'Pyrantel Pamoate (Strongid)', category: 'Preventative', defaultFrequency: 'Every 2 weeks', defaultIntervalDays: 14, speciesTarget: 'Both', defaultRoute: 'PO', manufacturer: 'Zoetis' },

  { name: 'Intake Exam', category: 'Exam' },
  { name: 'Wellness Exam', category: 'Exam' },
  { name: 'Sick Visit', category: 'Exam' },
  { name: 'Recheck Exam', category: 'Exam' },
  { name: 'Pre-Surgical Exam', category: 'Exam' },
  { name: 'Adoption Exam', category: 'Exam' },
  { name: 'Emergency Exam', category: 'Exam' },
  { name: 'Behavioral Consult', category: 'Exam' },
];

// Metadata for backfilling existing preventative items that were seeded without new fields
const PREVENTATIVE_BACKFILL: { name: string; speciesTarget: 'Dog' | 'Cat' | 'Both'; defaultRoute: 'PO' | 'Topical' | 'Collar' | 'Injection'; manufacturer: string }[] = [
  { name: 'Heartgard Plus', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Boehringer Ingelheim' },
  { name: 'Simparica Trio', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Zoetis' },
  { name: 'NexGard', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Boehringer Ingelheim' },
  { name: 'Bravecto', speciesTarget: 'Both', defaultRoute: 'PO', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto Chews', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto 1-Month', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto Topical (Dog)', speciesTarget: 'Dog', defaultRoute: 'Topical', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto Quantum', speciesTarget: 'Dog', defaultRoute: 'Injection', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto Topical (Cat)', speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto Plus', speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto (3-Month)', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto (1-Month)', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Merck Animal Health' },
  { name: 'Bravecto (Feline)', speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Merck Animal Health' },
  { name: 'Revolution Plus', speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Zoetis' },
  { name: 'Revolution (Feline)', speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Zoetis' },
  { name: 'Interceptor Plus', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Elanco' },
  { name: 'Sentinel Spectrum', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Virbac' },
  { name: 'Seresto Collar', speciesTarget: 'Dog', defaultRoute: 'Collar', manufacturer: 'Elanco' },
  { name: 'Seresto Collar (Dog)', speciesTarget: 'Dog', defaultRoute: 'Collar', manufacturer: 'Elanco' },
  { name: 'Seresto Collar (Cat)', speciesTarget: 'Cat', defaultRoute: 'Collar', manufacturer: 'Elanco' },
  { name: 'K9 Advantix II', speciesTarget: 'Dog', defaultRoute: 'Topical', manufacturer: 'Elanco' },
  { name: 'Advantage Multi (Dog)', speciesTarget: 'Dog', defaultRoute: 'Topical', manufacturer: 'Elanco' },
  { name: 'Advantage II (Feline)', speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Elanco' },
  { name: 'Trifexis', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Elanco' },
  { name: 'Credelio', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: 'Elanco' },
  { name: 'Cheristin', speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Elanco' },
  { name: 'NexGard Combo', speciesTarget: 'Cat', defaultRoute: 'Topical', manufacturer: 'Boehringer Ingelheim' },
  { name: 'Pyrantel Pamoate (Strongid)', speciesTarget: 'Both', defaultRoute: 'PO', manufacturer: 'Zoetis' },
  { name: 'Heartworm Prevention', speciesTarget: 'Dog', defaultRoute: 'PO', manufacturer: '' },
  { name: 'Flea/Tick Prevention', speciesTarget: 'Both', defaultRoute: 'Topical', manufacturer: '' },
];

interface OrderSetItemDef {
  name: string;
  offsetDays?: number;
}

interface OrderSetDef {
  setName: string;
  description: string;
  items: (string | OrderSetItemDef)[];
}

const DEFAULT_ORDER_SETS: OrderSetDef[] = [
  {
    setName: 'Standard Dog Intake',
    description: 'Standard canine intake protocol: DHPP, fecal, dewormer, heartworm test',
    items: ['DHPP (DA2PP)', 'Fecal Float', 'Pyrantel (Strongid)', 'Heartworm/Tick 4DX SNAP', 'Intake Exam'],
  },
  {
    setName: 'Standard Cat Intake',
    description: 'Standard feline intake protocol: FVRCP, FeLV/FIV snap, fecal, dewormer',
    items: ['FVRCP', 'FeLV/FIV SNAP Test', 'Fecal Float', 'Pyrantel (Strongid)', 'Intake Exam'],
  },
  {
    setName: 'Puppy Protocol',
    description: 'Initial puppy vaccination and preventative care series',
    items: ['DHPP (DA2PP)', 'Fecal Float', 'Pyrantel (Strongid)', 'Simparica Trio', 'Wellness Exam'],
  },
  {
    setName: 'Pre-Surgical Workup',
    description: 'Pre-operative bloodwork and exam',
    items: ['CBC (Complete Blood Count)', 'Chemistry Panel', 'Pre-Surgical Exam'],
  },
  {
    setName: 'Giardia Standard Protocol',
    description: 'Standard giardia treatment: Fenbendazole + Metronidazole for 5 days, medicated bath on day 5, fecal recheck at day 14',
    items: [
      { name: 'Fenbendazole (Panacur)', offsetDays: 0 },
      { name: 'Metronidazole', offsetDays: 0 },
      { name: 'Medicated/Sanitary Bath', offsetDays: 5 },
      { name: 'Giardia ELISA / Fecal Recheck', offsetDays: 14 },
    ],
  },
  {
    setName: 'Demodex Standard Protocol',
    description: 'Demodectic mange treatment: Isoxazoline preventative + antibiotics for secondary infection, skin scrape rechecks at 30/60 days',
    items: [
      { name: 'Skin Scrape', offsetDays: 0 },
      { name: 'Bravecto Chews', offsetDays: 0 },
      { name: 'Cephalexin', offsetDays: 0 },
      { name: 'Skin Scrape Recheck', offsetDays: 30 },
      { name: 'Skin Scrape Recheck', offsetDays: 60 },
    ],
  },
  {
    setName: 'Parvovirus Outpatient Support (5-Day)',
    description: 'Outpatient parvo supportive care: antibiotic injection, anti-nausea, SQ fluids, and syringe feeding for 5 days',
    items: [
      { name: 'Parvo SNAP Test', offsetDays: 0 },
      { name: 'Convenia Injection (Cefovecin)', offsetDays: 0 },
      { name: 'Cerenia (Maropitant)', offsetDays: 0 },
      { name: 'Subcutaneous (SQ) Fluids', offsetDays: 0 },
      { name: 'Syringe Feeding / Nutritional Support', offsetDays: 0 },
    ],
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
      defaultIntervalDays: item.defaultIntervalDays ?? null,
      speciesTarget: item.speciesTarget || null,
      defaultRoute: item.defaultRoute || null,
      manufacturer: item.manufacturer || null,
    }));

    createdItems = await db
      .insert(medicalCatalog)
      .values(catalogRows)
      .returning();

    console.log(`[MedicalCatalog] Seeded ${createdItems.length} new catalog items for tenant ${tenantId} (${skippedCount} already existed)`);
  } else {
    console.log(`[MedicalCatalog] All ${DEFAULT_CATALOG_ITEMS.length} default items already exist for tenant ${tenantId}`);
  }

  // Backfill species_target, default_route, manufacturer on existing rows that predate these columns
  for (const entry of PREVENTATIVE_BACKFILL) {
    await db
      .update(medicalCatalog)
      .set({
        speciesTarget: entry.speciesTarget,
        defaultRoute: entry.defaultRoute,
        ...(entry.manufacturer ? { manufacturer: entry.manufacturer } : {}),
      })
      .where(and(
        eq(medicalCatalog.tenantId, tenantId),
        eq(medicalCatalog.name, entry.name),
        isNull(medicalCatalog.speciesTarget),
      ));
  }

  // Patch Bravecto Plus interval: label says every 8 weeks (56 days), not 2 months (60 days)
  await db
    .update(medicalCatalog)
    .set({ defaultIntervalDays: 56, defaultFrequency: 'Every 8 weeks' })
    .where(and(
      eq(medicalCatalog.tenantId, tenantId),
      eq(medicalCatalog.name, 'Bravecto Plus'),
      eq(medicalCatalog.defaultIntervalDays, 60),
    ));

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

    const itemRows = osDef.items
      .map((item, idx) => {
        const itemName = typeof item === 'string' ? item : item.name;
        const offsetDays = typeof item === 'string' ? 0 : (item.offsetDays ?? 0);
        const catalogItem = catalogByName.get(itemName);
        if (!catalogItem) return null;
        return { orderSetId: createdSet.id, catalogItemId: catalogItem.id, sortOrder: idx, offsetDays };
      })
      .filter(Boolean) as { orderSetId: string; catalogItemId: string; sortOrder: number; offsetDays: number }[];

    if (itemRows.length > 0) {
      await db.insert(orderSetItems).values(itemRows);
    }

    orderSetsCreated++;
    console.log(`[MedicalCatalog] Created order set "${osDef.setName}" with ${itemRows.length} items`);
  }

  return { catalogCreated: createdItems.length, catalogSkipped: skippedCount, orderSetsCreated };
}

/**
 * Idempotent startup helper: insert newly-added default catalog items for
 * tenants that already seeded their catalog before those items existed.
 * Only tenants that have at least one catalog row get the new items
 * (tenants with an intentionally empty catalog are left alone).
 */
export async function ensureNewDefaultCatalogItems(itemNames: string[]): Promise<void> {
  const items = DEFAULT_CATALOG_ITEMS.filter(i => itemNames.includes(i.name));
  for (const item of items) {
    await db.execute(sql`
      INSERT INTO medical_catalog (tenant_id, name, category, default_dose, default_frequency, default_interval_days, species_target, default_route, manufacturer)
      SELECT t.tenant_id, ${item.name}, ${item.category}, ${item.defaultDose ?? null}, ${item.defaultFrequency ?? null}, ${item.defaultIntervalDays ?? null}, ${item.speciesTarget ?? null}, ${item.defaultRoute ?? null}, ${item.manufacturer ?? null}
      FROM (SELECT DISTINCT tenant_id FROM medical_catalog) t
      WHERE NOT EXISTS (
        SELECT 1 FROM medical_catalog mc
        WHERE mc.tenant_id = t.tenant_id AND LOWER(mc.name) = LOWER(${item.name})
      )
    `);
  }
  console.log(`[MedicalCatalog] Ensured new default items for existing tenants: ${items.map(i => i.name).join(', ')}`);
}
