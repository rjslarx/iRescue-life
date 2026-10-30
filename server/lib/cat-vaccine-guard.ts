import { db } from "../db";
import { animals } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { isCatSpecies, isCanineCombination, assertCatVaccineCompatible } from "@shared/vaccine-species";

export async function isInvalidCatVaccine(tenantId: string, animalId: string, name: string) {
  if (!isCanineCombination(name)) return false;
  const [animal] = await db.select({species: animals.species}).from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.tenantId, tenantId))).limit(1);
  return isCatSpecies(animal?.species);
}

export async function assertAnimalVaccine(tenantId: string, animalId: string, name: string) {
  const [animal] = await db.select({species: animals.species}).from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.tenantId, tenantId))).limit(1);
  if (!animal) throw Object.assign(new Error("Animal not found"), {status: 404});
  assertCatVaccineCompatible(animal.species, name);
}
export async function speciesAppropriateObligations<T extends {obligationType: string; label: string}>(
  tenantId: string, animalId: string, rows: T[],
) {
  const [animal] = await db.select({species: animals.species}).from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.tenantId, tenantId))).limit(1);
  return rows.filter(r => !(isCatSpecies(animal?.species) &&
    (r.obligationType === "dhpp_booster" || isCanineCombination(r.label))));
}

export const catVaccineGuardSql = String.raw`
-- Retain original records and deadlines; only waive actionable invalid obligations.
UPDATE compliance_obligations c SET status='waived',
 notes=concat_ws(E'\\n', c.notes, 'Species correction: canine DHPP requirement does not apply to a cat; original deadline retained.')
FROM animals a WHERE a.id=c.animal_id AND a.tenant_id=c.tenant_id
AND lower(trim(a.species)) IN ('cat','cats','feline')
AND (c.obligation_type='dhpp_booster' OR c.label ~* '\m(dhpp|dhlpp|da2pp|da2p|dapp|dappv|dappl)\M')
AND c.status IN ('pending','overdue');
UPDATE compliance_reminders r SET state='skipped', updated_at=now()
FROM animals a WHERE a.id=r.animal_id AND a.tenant_id=r.tenant_id
AND lower(trim(a.species)) IN ('cat','cats','feline')
AND r.care_name ~* '\m(dhpp|dhlpp|da2pp|da2p|dapp|dappv|dappl)\M'
AND r.state NOT IN ('confirmed','skipped');
-- Adoption placeholders are not administered doses. Preserve their full original
-- state in an audit snapshot, and remove the actionable due date only.
ALTER TABLE preventative_care_records ADD COLUMN IF NOT EXISTS species_correction_snapshot jsonb;
UPDATE preventative_care_records p SET
 species_correction_snapshot=jsonb_build_object('reason','Canine vaccine assigned to cat','originalNextDueDate',p.next_due_date,'originalStatus',p.status,'correctedAt',now()),
 notes=concat_ws(E'\n',p.notes,'Species correction: canine vaccine does not apply to cats. Original due date: ' || coalesce(p.next_due_date::text,'none') || '. Record retained; reminders disabled.'),
 next_due_date=NULL
FROM animals a WHERE a.id=p.animal_id AND a.tenant_id=p.tenant_id
AND lower(trim(a.species)) IN ('cat','cats','feline')
AND p.care_name ~* '\m(dhpp|dhlpp|da2pp|da2p|dapp|dappv|dappl)\M'
AND p.species_correction_snapshot IS NULL;
CREATE OR REPLACE FUNCTION reject_cat_canine_vaccine() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE label_text text;
BEGIN
 IF TG_TABLE_NAME='preventative_care_records' AND TG_OP='UPDATE' THEN
   IF NEW.next_due_date IS NULL AND NEW.care_name=OLD.care_name AND NEW.animal_id=OLD.animal_id THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='compliance_obligations' AND TG_OP='UPDATE' THEN
   IF NEW.status IN ('waived','completed') AND NEW.label=OLD.label AND NEW.animal_id=OLD.animal_id AND NEW.obligation_type=OLD.obligation_type THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='vaccine_records' THEN label_text=NEW.item_name;
 ELSIF TG_TABLE_NAME='preventative_care_records' THEN label_text=NEW.care_name;
 ELSE label_text=replace(NEW.obligation_type,'_',' ') || ' ' || NEW.label; END IF;
 IF label_text ~* '\m(dhpp|dhlpp|da2pp|da2p|dapp|dappv|dappl)\M'
 AND EXISTS (SELECT 1 FROM animals WHERE id=NEW.animal_id AND tenant_id=NEW.tenant_id AND lower(trim(species)) IN ('cat','cats','feline'))
 THEN RAISE EXCEPTION 'Canine combination vaccines cannot be assigned to cats' USING ERRCODE='23514', CONSTRAINT='cat_canine_vaccine_guard';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cat_canine_vaccine_guard ON vaccine_records;
CREATE TRIGGER cat_canine_vaccine_guard BEFORE INSERT OR UPDATE OF item_name, animal_id ON vaccine_records FOR EACH ROW EXECUTE FUNCTION reject_cat_canine_vaccine();
DROP TRIGGER IF EXISTS cat_canine_vaccine_guard ON preventative_care_records;
CREATE TRIGGER cat_canine_vaccine_guard BEFORE INSERT OR UPDATE OF care_name, animal_id, next_due_date ON preventative_care_records FOR EACH ROW EXECUTE FUNCTION reject_cat_canine_vaccine();
DROP TRIGGER IF EXISTS cat_canine_vaccine_guard ON compliance_obligations;
CREATE TRIGGER cat_canine_vaccine_guard BEFORE INSERT OR UPDATE OF obligation_type, label, animal_id, status ON compliance_obligations FOR EACH ROW EXECUTE FUNCTION reject_cat_canine_vaccine();
`;
