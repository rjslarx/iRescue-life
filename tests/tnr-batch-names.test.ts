import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { animals, tenants, vaccineRecords } from "../shared/schema";
import { insertTnrAnimal } from "../server/services/tnr-batch-names";

test("TNR collisions, simultaneous inserts and rollback preserve existing records", async () => {
  const tenantId = randomUUID();
  const other = randomUUID();
  const values = (name: string) => ({ tenantId, animalId: `test-${randomUUID()}`, name, species: "cat", breed: "Domestic Short Hair", age: "Adult", status: "returned_to_field" as const, recordType: "tnr" as const });
  try {
    await db.insert(tenants).values([
      { id: tenantId, name: "TNR test", subdomain: `tnr-test-${tenantId}` },
      { id: other, name: "TNR other test", subdomain: `tnr-test-${other}` },
    ]);
    await db.insert(animals).values([values("TNR-A1"), values("TNR-A1-20261115-1")]);
    const created = await db.transaction(tx => insertTnrAnimal(tx, values("tnr-a1"), "20261115-1"));
    assert.match(created.name, /^tnr-a1-20261115-1-[a-f0-9]{8}$/);
    const otherAnimal = await db.transaction(tx => insertTnrAnimal(tx, { ...values("TNR-A1"), tenantId: other }, "20261115-1"));
    assert.equal(otherAnimal.name, "TNR-A1");
    const concurrent = await Promise.all([1, 2].map(() => db.transaction(tx => insertTnrAnimal(tx, values("Concurrent"), "20261115-2"))));
    assert.equal(new Set(concurrent.map(a => a.name.toLowerCase())).size, 2);
    const before = await db.select({ id: animals.id }).from(animals).where(eq(animals.tenantId, tenantId));
    await assert.rejects(db.transaction(async tx => {
      const animal = await insertTnrAnimal(tx, values("Rollback"), "20261115-3");
      await tx.insert(vaccineRecords).values({ tenantId, animalId: animal.id, itemName: "Rabies", dateGiven: new Date(), status: "given" });
      // An unrelated constraint error must escape instead of becoming a name retry.
      await insertTnrAnimal(tx, { ...values("Other"), animalId: animal.animalId }, "20261115-4");
    }));
    assert.deepEqual(await db.select({ id: animals.id }).from(animals).where(eq(animals.tenantId, tenantId)), before);
    assert.equal((await db.select().from(vaccineRecords).where(eq(vaccineRecords.tenantId, tenantId))).length, 0);
  } finally {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, other));
    await pool.end();
  }
});
