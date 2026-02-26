import { db } from '../db';
import { animals } from '@shared/schema';
import { and, eq, sql, max } from 'drizzle-orm';

/**
 * Get the species initial for the local_shelter_id format.
 * D-26-0015 → D = Dog, C = Cat, R = Rabbit, etc.
 */
function getSpeciesInitial(species: string): string {
  const trimmed = (species || '').trim().toUpperCase();
  if (!trimmed) return 'A';
  return trimmed.charAt(0);
}

/**
 * Generate a per-tenant sequential local shelter ID.
 *
 * Format: [SpeciesInitial]-[2-digit year]-[4-digit zero-padded sequence]
 * Examples: D-26-0001, C-26-0042, R-26-0003
 *
 * The sequence is scoped to (tenant, species initial, year), so each species
 * starts its own counter per year. Reads MAX from DB at call time for safety
 * under concurrent intake without requiring a DB-level sequence object.
 */
export async function generateLocalShelterId(
  tenantId: string,
  species: string,
  _db = db
): Promise<string> {
  const now = new Date();
  const yearSuffix = now.getFullYear().toString().slice(-2); // "26"
  const speciesInitial = getSpeciesInitial(species);         // "D"
  const prefix = `${speciesInitial}-${yearSuffix}-`;        // "D-26-"

  // Query the current MAX sequence for this tenant + year + species
  const [row] = await _db
    .select({ maxId: max(animals.localShelterId) })
    .from(animals)
    .where(
      and(
        eq(animals.tenantId, tenantId),
        sql`${animals.localShelterId} LIKE ${prefix + '%'}`
      )
    );

  let nextSeq = 1;
  if (row?.maxId) {
    // Parse the sequence number from the last segment: "D-26-0042" → 42
    const parts = row.maxId.split('-');
    const parsed = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(parsed)) {
      nextSeq = parsed + 1;
    }
  }

  const seqPadded = nextSeq.toString().padStart(4, '0');
  return `${speciesInitial}-${yearSuffix}-${seqPadded}`;
}
