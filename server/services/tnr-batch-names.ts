import { randomUUID } from "node:crypto";
import type { db } from "../db";
import { animals } from "@shared/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Retry only name collisions, within savepoints so the whole batch stays atomic. */
export async function insertTnrAnimal(tx: Transaction, values: typeof animals.$inferInsert, suffix: string) {
  const baseName = values.name.trim();
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = attempt === 0 ? baseName
      : attempt === 1 ? `${baseName}-${suffix}`
      : `${baseName}-${suffix}-${randomUUID().slice(0, 8)}`;
    try {
      return await tx.transaction(async savepoint => {
        const [animal] = await savepoint.insert(animals).values({ ...values, name }).returning();
        return animal;
      });
    } catch (error: any) {
      const cause = error?.cause ?? error;
      if (cause?.code !== "23505" || cause?.constraint !== "idx_animals_tenant_name_unique") throw error;
    }
  }
  throw new Error("Could not assign a unique TNR name. No records in this batch were saved.");
}
