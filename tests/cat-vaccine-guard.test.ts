import {test} from "node:test";
import assert from "node:assert/strict";
import {isCatSpecies, isCanineCombination, assertCatVaccineCompatible} from "../shared/vaccine-species";
import {pool} from "../server/db";
import {catVaccineGuardSql} from "../server/lib/cat-vaccine-guard";

test("species classification does not confuse feline distemper with DHPP", () => {
  assert.ok(isCatSpecies(" Feline "));
  for (const name of ["DHPP", "DAPP-L4", "DA2PP", "DHLPP"]) {
    assert.ok(isCanineCombination(name));
    assert.throws(() => assertCatVaccineCompatible("Cat", name));
    assert.doesNotThrow(() => assertCatVaccineCompatible("Dog", name));
  }
  for (const name of ["FVRCP", "Feline distemper", "HCP", "Rabies"]) {
    assert.doesNotThrow(() => assertCatVaccineCompatible("cat", name));
  }
});

test("database guards prevent cat assignments and retain correction evidence", async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`
      CREATE TEMP TABLE animals(id text, tenant_id text,species text);
      CREATE TEMP TABLE compliance_obligations(id text,animal_id text,tenant_id text,obligation_type text,label text,status text,notes text);
      CREATE TEMP TABLE preventative_care_records(id text,animal_id text,tenant_id text,care_name text,status text,next_due_date timestamp,notes text);
      CREATE TEMP TABLE vaccine_records(id text,animal_id text,tenant_id text,item_name text);
      CREATE TEMP TABLE compliance_reminders(animal_id text,tenant_id text,care_name text,state text,updated_at timestamp);
      INSERT INTO animals VALUES ('cat','t','Cat'),('dog','t','Dog');
      INSERT INTO compliance_reminders VALUES ('cat','t','DHPP','overdue',now());
      INSERT INTO compliance_obligations VALUES ('a','cat','t','dhpp_booster','DHPP','pending',null),('b','cat','t','dhpp_booster','DHPP','completed',null);
      INSERT INTO preventative_care_records VALUES ('p','cat','t','DHPP (DA2PP)','given','2026-10-01',null);
    `);
    await c.query(catVaccineGuardSql);
    await c.query(catVaccineGuardSql);
    assert.deepEqual((await c.query("SELECT status FROM compliance_obligations ORDER BY id")).rows.map(r=>r.status), ["waived","completed"]);
    const p = (await c.query("SELECT * FROM preventative_care_records")).rows[0];
    assert.equal(p.next_due_date,null);
    assert.equal(p.status,"given");
    assert.equal((await c.query("SELECT state FROM compliance_reminders")).rows[0].state,"skipped");
    assert.ok(p.species_correction_snapshot.originalNextDueDate.startsWith("2026-10-01"));
    for (const sql of [
      "INSERT INTO vaccine_records VALUES ('v','cat','t','DHPP')",
      "INSERT INTO preventative_care_records(id,animal_id,tenant_id,care_name) VALUES ('x','cat','t','DAPP')",
      "INSERT INTO compliance_obligations VALUES ('x','cat','t','dhpp_booster','Booster','pending',null)",
      "UPDATE preventative_care_records SET next_due_date='2027-01-01'",
    ]) {
      await c.query("SAVEPOINT negative_case");
      await assert.rejects(c.query(sql), (e:any)=>e.constraint==="cat_canine_vaccine_guard");
      await c.query("ROLLBACK TO SAVEPOINT negative_case");
    }
    await c.query("INSERT INTO vaccine_records VALUES ('d','dog','t','DHPP'),('f','cat','t','FVRCP')");
  } finally {
    await c.query("ROLLBACK"); c.release(); await pool.end();
  }
});
