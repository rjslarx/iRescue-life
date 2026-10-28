import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import * as coverage from "../server/lib/current-rabies-coverage";
import * as vaccineCoverage from "../server/lib/vaccine-renewal-coverage";

// Exercise the real loaders and reminder jobs with a read-only DB double.
// SQL predicates are inspected as well as evaluated for tenant/animal scoping.
function harness(vaccines: any[], care: any[], annualCandidates: any[] = []) {
  const sent: any[] = [];
  const dialect = new PgDialect();
  const db = {
    select(selection: any) {
      let table: any;
      let joined = false;
      const query: any = {
        from(t: any) { table = t; return query; },
        innerJoin() { joined = true; return query; },
        where(condition: any) {
          const sql = dialect.sqlToQuery(condition);
          assert.match(sql.sql, /tenant_id/);
          let rows: any[] = [];
          if (joined) rows = annualCandidates;
          else if (table === schema.vaccineRecords || table === schema.preventativeCareRecords) {
            assert.match(sql.sql, /animal_id/);
            rows = (table === schema.vaccineRecords ? vaccines : care)
              .filter(r => sql.params.includes(r.tenantId) && sql.params.includes(r.animalId));
          }
          const projected = joined ? rows : rows.map(row => Object.fromEntries(
            Object.entries(selection).map(([key, col]: [string, any]) => [key, row[col.name]]),
          ));
          const result: any = Promise.resolve(projected);
          result.limit = () => result;
          return result;
        },
      };
      return query;
    },
  };
  function load(file: string, deps: Record<string, any>) {
    const code = transformSync(readFileSync(file, "utf8"), { loader: "ts", format: "cjs" }).code;
    const module = { exports: {} as any };
    new Function("require", "module", "exports", code)((name: string) => {
      if (!(name in deps)) throw new Error(`Unexpected dependency: ${name}`);
      return deps[name];
    }, module, module.exports);
    return module.exports;
  }
  const common = { "../db": { db }, "@shared/schema": schema, "drizzle-orm": orm };
  const loader = load("server/services/portal-rabies-coverage.ts", {
    ...common, "../lib/current-rabies-coverage": coverage,
    "../lib/vaccine-renewal-coverage": vaccineCoverage,
  });
  const jobs = load("server/lib/adopter-compliance-notifications.ts", {
    ...common,
    "../services/portal-rabies-coverage": loader,
    "./vaccine-renewal-coverage": vaccineCoverage,
    "./unified-comms": { sendCommunication: async (input: any) => { sent.push(input); return { status: "delivered" }; } },
    "./app-base-url": { getAppBaseUrl: () => "https://example.org" },
  });
  return { ...jobs, ...loader, sent };
}

const day = (offset: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const vax = (extra = {}) => ({
  tenantId: "tenant-a", animalId: "animal-a",
  item_name: "Rabies", date_given: day(-100), date_due: day(100), ...extra,
});
const placeholder = (extra = {}) => ({
  tenantId: "tenant-a", animalId: "animal-a", id: "placeholder",
  care_name: "Rabies", care_category: "vaccine",
  date_administered: day(-10), next_due_date: "2009-08-24",
  administered_by: "Set at adoption", ...extra,
});

test("daily email/SMS candidate list uses both sources and does not mutate history", async () => {
  for (const source of ["vaccine", "care"]) {
    const evidence = source === "vaccine" ? [vax()] : [];
    const care = [placeholder(), ...(source === "care" ? [placeholder({
      id: "actual", administered_by: "Veterinarian", date_administered: day(-100), next_due_date: day(100),
    })] : [])];
    const before = JSON.stringify({ evidence, care });
    const h = harness(evidence, care);
    assert.deepEqual(await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog"), []);
    assert.equal(JSON.stringify({ evidence, care }), before);
  }
});

test("expired evidence advances obsolete deadline; duplicate rows produce one renewal", async () => {
  const h = harness([vax({ date_due: day(-2) })], [placeholder(), placeholder({ id: "duplicate" })]);
  const items = await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog");
  assert.equal(items.length, 1);
  assert.equal(items[0].dueDate, day(-2));
  assert.equal(items[0].type, "vaccination_overdue");
});

test("future, missing expiration, invalid interval and placeholders cannot suppress reminders", async () => {
  for (const evidence of [
    vax({ date_given: day(10) }),
    vax({ date_due: null }),
    vax({ date_due: day(-200) }),
  ]) {
    const h = harness([evidence], [placeholder()]);
    assert.equal((await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog"))[0].dueDate, "2009-08-24");
  }
  const h = harness([], [placeholder({ next_due_date: day(100) }), placeholder()]);
  assert.equal((await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog"))[0].dueDate, "2009-08-24");
});

test("renewal at expiry stays actionable, later deadlines and other vaccines stay unchanged", async () => {
  const h = harness([vax({ date_due: day(1) })], [placeholder({ next_due_date: day(1) })]);
  const items = await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog");
  assert.equal(items[0].dueDate, day(1));
  assert.equal(items[0].type, "vaccination_due");
  const due = new Date(day(2));
  assert.equal(coverage.rabiesReminderDeadline("rabies", due, new Date(day(1))), due);
  assert.equal(coverage.rabiesReminderDeadline("DHPP", due, new Date(day(100))), due);
});

test("other tenants and animals cannot establish coverage in either source", async () => {
  const h = harness([
    vax({ tenantId: "tenant-b" }), vax({ animalId: "animal-b" }),
  ], [
    placeholder(),
    placeholder({ tenantId: "tenant-b", administered_by: "Vet", next_due_date: day(100) }),
    placeholder({ animalId: "animal-b", administered_by: "Vet", next_due_date: day(100) }),
  ]);
  assert.equal(await h.getLatestRabiesExpiry("tenant-a", "animal-a"), null);
  assert.equal((await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog"))[0].dueDate, "2009-08-24");
});

test("annual SMS skips obsolete vaccine deadlines but sends renewal at actual expiry", async () => {
  const candidate = {
    vaccineId: "old-vax", animalId: "animal-a", animalName: "Dog",
    itemName: "Rabies", dateDue: new Date(day(30)),
    adopterName: "Test Adopter", adopterPhone: "test-phone",
  };
  for (const expiry of [day(100), day(30)]) {
    const h = harness([vax({ date_due: expiry })], [], [candidate]);
    const result = await h.sendAnnualVaccineReminders("tenant-a");
    assert.deepEqual(result.errors, []);
    assert.equal(h.sent.length, expiry === day(30) ? 1 : 0);
  }
});

const families = [
  ["DHPP", "DAPP"],
  ["DHPP (DA2PP)", "DA2PP"],
  ["Bordetella", "Bordetella (Oral)"],
  ["FVRCP", "FVRCP"],
  ["FeLV", "FeLV (Feline Leukemia)"],
  ["Leptospirosis", "Lepto"],
  ["Lyme Disease", "Lyme"],
  ["Canine Influenza", "CIV H3N2/H3N8"],
  ["Custom vaccine", " custom   vaccine "],
];

test("daily and annual reminders use same-family evidence from either source", async () => {
  for (const [name, renewalName] of families) {
    for (const source of ["vaccine", "care"]) {
      for (const offset of [100, 30, 1, -2]) {
        const vaccines = source === "vaccine" ? [vax({ item_name: renewalName, date_due: day(offset) })] : [];
        const care = [placeholder({ care_name: name }), placeholder({ id: "duplicate", care_name: name })];
        if (source === "care") care.push(placeholder({
          id: "actual", care_name: renewalName, administered_by: "Vet",
          date_administered: day(-100), next_due_date: day(offset),
        }));
        const before = JSON.stringify({ vaccines, care });
        const candidate = {
          vaccineId: "old", animalId: "animal-a", animalName: "Dog",
          itemName: name, dateDue: new Date(day(30)), adopterName: "Adopter", adopterPhone: "phone",
        };
        const h = harness(vaccines, care, [candidate]);
        const items = await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog");
        assert.equal(items.length, offset > 3 ? 0 : 1, `${name}/${source}/${offset}`);
        if (items.length) assert.equal(items[0].dueDate, day(offset));
        const annual = await h.sendAnnualVaccineReminders("tenant-a");
        assert.deepEqual(annual.errors, []);
        assert.equal(h.sent.length, offset > 30 ? 0 : 1);
        assert.equal(JSON.stringify({ vaccines, care }), before);
      }
    }
  }
});

test("renewing one family never suppresses another family or parasite prevention", async () => {
  for (const [name] of families) {
    const otherNames = families.map(([n]) => n).filter(n =>
      vaccineCoverage.reminderVaccineFamily(n) !== vaccineCoverage.reminderVaccineFamily(name));
    for (const other of [...otherNames, "Rabies", "Distemper (Single)", "Parvovirus (Single)"]) {
      const h = harness([vax({ item_name: name })], [
        placeholder({ care_name: other }),
        placeholder({ id: "prevention", care_name: name, care_category: "parasite_prevention" }),
      ], [{
        vaccineId: "old", animalId: "animal-a", animalName: "Dog", itemName: other,
        dateDue: new Date(day(30)), adopterName: "Adopter", adopterPhone: "phone",
      }]);
      const items = await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog");
      assert.equal(items.length, 2, `${name} must not clear ${other}`);
      assert.ok(items.every((item: any) => item.dueDate === "2009-08-24"));
      await h.sendAnnualVaccineReminders("tenant-a");
      assert.equal(h.sent.length, 1);
    }
  }
});

test("non-rabies evidence validates dates, placeholders, tenant and animal boundaries", async () => {
  for (const invalid of [
    { date_given: day(10) }, { date_given: "invalid" }, { date_due: null },
    { date_due: day(-200) }, { tenantId: "tenant-b" }, { animalId: "animal-b" },
  ]) {
    const h = harness([vax({ item_name: "DAPP", ...invalid })], [placeholder({ care_name: "DHPP" })]);
    const items = await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog");
    assert.equal(items[0].dueDate, "2009-08-24");
  }
  for (const extra of [
    { administered_by: "Set at adoption" },
    { tenantId: "tenant-b" }, { animalId: "animal-b" },
    { date_administered: day(10) }, { next_due_date: null },
  ]) {
    const h = harness([], [
      placeholder({ care_name: "DHPP" }),
      placeholder({ id: "invalid", care_name: "DAPP", administered_by: "Vet",
        date_administered: day(-100), next_due_date: day(100), ...extra }),
    ]);
    assert.equal((await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog"))[0].dueDate, "2009-08-24");
  }
});

test("latest administration wins, and distinct later deadlines remain actionable", async () => {
  const h = harness([
    vax({ item_name: "DHPP", date_given: day(-200), date_due: day(100) }),
    vax({ item_name: "DAPP", date_given: day(-10), date_due: day(-2) }),
  ], [
    placeholder({ care_name: "DHPP" }),
    placeholder({ id: "later", care_name: "DAPP", next_due_date: day(1) }),
  ]);
  const items = await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog");
  assert.deepEqual(items.map((i: any) => i.dueDate), [day(-2), day(1)]);
});

test("unfulfilled scheduled doses and backfill deadlines are not renewal evidence", async () => {
  for (const [name, renewalName] of families) {
    for (const extra of [
      { status: "pending", administered_by: null },
      { status: "given", administered_by: "Set during backfill import" },
    ]) {
      const vaccines = [vax({ item_name: name, date_given: day(-200), date_due: day(-2) })];
      const care = [
        placeholder({ care_name: name }),
        placeholder({
          id: "not-a-dose", care_name: renewalName, date_administered: day(-10),
          next_due_date: day(100), ...extra,
        }),
      ];
      const before = JSON.stringify({ vaccines, care });
      const h = harness(vaccines, care, [{
        vaccineId: "annual", animalId: "animal-a", animalName: "Dog", itemName: name,
        dateDue: new Date(day(30)), adopterName: "Adopter", adopterPhone: "phone",
      }]);
      const items = await h.getComplianceItemsForAnimal("tenant-a", "animal-a", "Dog");
      assert.equal(items.length, 1);
      assert.equal(items[0].dueDate, day(-2), `${name}: ${JSON.stringify(extra)}`);
      const annual = await h.sendAnnualVaccineReminders("tenant-a");
      assert.deepEqual(annual.errors, []);
      assert.equal(h.sent.length, 1);
      assert.equal(JSON.stringify({ vaccines, care }), before);
    }
  }
});
