import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

function load(file: string, deps: Record<string, any>, extra = "") {
  const code = transformSync(readFileSync(file, "utf8") + extra, {
    loader: "ts", format: "cjs",
  }).code;
  const module = { exports: {} as any };
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(name in deps, `Unexpected dependency: ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports;
}

function harness(rows: any[]) {
  const updates: any[] = [];
  const dialect = new PgDialect();
  const db = {
    select() {
      let table: any;
      const query: any = {
        from(t: any) { table = t; return query; },
        leftJoin() { return query; },
        async where(condition: any) {
          const sql = dialect.sqlToQuery(condition);
          assert.match(sql.sql, /tenant_id/);
          assert.ok(sql.params.includes("tenant"));
          if (table !== schema.vaccineRecords) return [];
          if (sql.sql.includes("animal_id")) {
            assert.ok(sql.params.includes("animal"));
            assert.ok(sql.params.includes("new"));
          }
          return rows;
        },
      };
      return query;
    },
    update(table: any) {
      assert.equal(table, schema.vaccineRecords);
      return { set(values: any) {
        assert.deepEqual(values, { dateDue: null });
        return { async where(condition: any) {
          const sql = dialect.sqlToQuery(condition);
          assert.match(sql.sql, /tenant_id/);
          assert.ok(sql.params.includes("tenant"));
          const ids = rows.filter(r => sql.params.includes(r.id)).map(r => r.id);
          updates.push(ids);
          return { rowCount: ids.length };
        } };
      } };
    },
  };
  const deps = { "../db": { db }, "@shared/schema": schema, "drizzle-orm": orm };
  const service = load("server/services/medical-supersession.ts", deps);
  const backfill = load("server/scripts/backfill-superseded-preventative-care.ts", {
    ...deps, "../services/medical-supersession": service,
  }, "\nexport { backfillTenant };");
  return { ...service, ...backfill, updates };
}

const row = (id: string, itemName: string, dateDue = "2026-01-01") => ({
  id, animalId: "animal", itemName, dateDue,
});

test("standalone doses cannot null combination deadlines at write time or in backfill", async () => {
  for (const combo of ["DHPP", "DAPP", "DA2PP", "DA2P", "DHPP (distemper/parvo)"]) {
    for (const single of ["Distemper", "Parvovirus", "Parvo"]) {
      const older = row("old", combo);
      const newer = row("new", single, "2027-01-01");
      const h = harness([older]);
      const before = JSON.stringify(older);
      assert.notEqual(h.vaccineFamily(single), h.vaccineFamily(combo));
      assert.equal(await h.supersedeOlderVaccineRecords("animal", "tenant", newer), 0);
      assert.deepEqual(h.updates, []);
      assert.equal(JSON.stringify(older), before);
      const historical = harness([older, newer]);
      assert.deepEqual(await historical.backfillTenant("tenant"), { pcr: 0, vax: 0 });
      assert.deepEqual(historical.updates, []);
    }
  }
});

test("combination aliases still supersede only older combination deadlines", async () => {
  for (const name of ["DHPP", "DAPP", "DA2PP"]) {
    const rows = [
      row("old-combo", "DHPP"), row("single", "Distemper"),
      row("parvo", "Parvovirus"), row("rabies", "Rabies"),
      row("tie", "DAPP", "2027-01-01"), row("later", "DA2PP", "2028-01-01"),
    ];
    const h = harness(rows);
    assert.equal(await h.supersedeOlderVaccineRecords("animal", "tenant",
      row("new", name, "2027-01-01")), 1);
    assert.deepEqual(h.updates, [["old-combo"]]);
    const historical = harness([row("old-combo", "DHPP"), row("single", "Distemper"),
      row("new", name, "2027-01-01")]);
    assert.deepEqual(await historical.backfillTenant("tenant"), { pcr: 0, vax: 1 });
    assert.deepEqual(historical.updates, [["old-combo"]]);
  }
});

test("same standalone series still renews, while missing or invalid deadlines do nothing", async () => {
  const h = harness([row("old", "Distemper")]);
  assert.equal(await h.supersedeOlderVaccineRecords("animal", "tenant",
    row("new", "  DISTEMPER ", "2027-01-01")), 1);
  assert.deepEqual(h.updates, [["old"]]);
  for (const dateDue of [null, "invalid"]) {
    const invalid = harness([row("old", "DHPP")]);
    assert.equal(await invalid.supersedeOlderVaccineRecords("animal", "tenant",
      { id: "new", itemName: "DAPP", dateDue }), 0);
    assert.deepEqual(invalid.updates, []);
  }
});
