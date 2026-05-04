import { db } from '../db';
import {
  adoptions,
  animals,
  applications,
  microchipRecords,
  type Adoption,
  type Animal,
} from '@shared/schema';
import { and, eq, ne, inArray, sql, desc } from 'drizzle-orm';
import { ensureAdoptionRowForAnimal } from './applications';
import { logAnimalAudit } from '../lib/animal-audit-logger';

/**
 * How an entry point wants the microchip-pending guard to behave when an
 * animal still has chip records that have not yet been transferred to the
 * adopter:
 *
 *   - 'block': hard-fail with MICROCHIP_TRANSFER_PENDING (caller may retry
 *             with confirmMicrochipPending=true to override).
 *   - 'warn':  proceed, but report the pending chips back to the caller so
 *             it can surface a warning to staff.
 *   - 'skip':  ignore — no chip query, no warning. Used by entry points
 *             where staff explicitly know they're not in a chip-verification
 *             context (Kanban drag, animal edit-form save).
 */
export type MicrochipPolicy = 'block' | 'warn' | 'skip';

export interface PendingMicrochip {
  id: string;
  microchipNumber: string;
  registrationStatus: string;
}

export interface FinalizeAdoptionOptions {
  /** Optional application to link the adoption row to. Path A passes this
   *  from validatedData.applicationId; Paths B and C pass the resolved id. */
  applicationId?: string;
  /** When omitted, defaults to now. */
  adoptionDate?: Date | null;
  /**
   * Pre-validated adopter contact info. When provided (Path A — the
   * Record Adoption form), the service inserts an adoption row directly
   * from this info instead of looking up an application. When omitted,
   * the service falls back to {@link ensureAdoptionRowForAnimal} which
   * resolves the adopter from the linked / latest application.
   */
  adopterInfo?: {
    name: string;
    email: string;
    phone: string;
    adoptionFee?: string | null;
    notes?: string | null;
  };
  microchipPolicy: MicrochipPolicy;
  /** Required override for `microchipPolicy: 'block'` to bypass pending chips. */
  confirmMicrochipPending?: boolean;
  /** Actor used for the animal audit log entry. */
  actor?: { id: string; name?: string | null };
  /** Free-form note attached to the animal audit log entry. */
  auditNote?: string;
}

export type FinalizeAdoptionResult =
  | {
      ok: true;
      adoption: Adoption;
      animal: Animal;
      /** Populated for `microchipPolicy: 'warn'` if any chips were still pending. */
      pendingMicrochips?: PendingMicrochip[];
    }
  | {
      ok: false;
      code: 'ANIMAL_NOT_FOUND';
    }
  | {
      ok: false;
      code: 'MICROCHIP_TRANSFER_PENDING';
      pendingMicrochips: PendingMicrochip[];
    }
  | {
      ok: false;
      code: 'ADOPTION_INFO_REQUIRED';
      reason: 'no_application' | 'race_no_application';
    };

/**
 * Single source of truth for "mark this animal as adopted". All three
 * entry points (POST /api/adoptions, PATCH /api/applications/:id/stage =>
 * 'adopted', PATCH /api/animals/:id with status='adopted') call this so
 * the side effects stay consistent:
 *
 *   1. Microchip-pending guard (per caller policy).
 *   2. Ensure an `adoptions` row exists for (tenant, animal). Either from
 *      explicit adopterInfo (Path A) or by resolving from an application
 *      (Paths B and C).
 *   3. Flip animal: status='adopted', adoptionDate, clear locationType /
 *      locationName / fosterId.
 *   4. If an application is linked, mark its stage='adopted' (idempotent).
 *   5. Mark unregistered / registered_rescue chip records as 'transferred'.
 *   6. Emit an animal audit log entry with the pre-flip state.
 *
 * Tenant-scoped on every read and write.
 */
export async function finalizeAdoption(
  tenantId: string,
  animalId: string,
  options: FinalizeAdoptionOptions,
): Promise<FinalizeAdoptionResult> {
  // 1. Load pre-state animal (for audit + 404).
  const [existingAnimal] = await db
    .select({
      id: animals.id,
      status: animals.status,
      locationType: animals.locationType,
      locationName: animals.locationName,
    })
    .from(animals)
    .where(and(eq(animals.tenantId, tenantId), eq(animals.id, animalId)))
    .limit(1);

  if (!existingAnimal) {
    return { ok: false, code: 'ANIMAL_NOT_FOUND' };
  }

  // 2. Microchip-pending guard.
  let pendingChipsForWarn: PendingMicrochip[] | undefined;
  if (options.microchipPolicy !== 'skip') {
    const pending = await db
      .select({
        id: microchipRecords.id,
        microchipNumber: microchipRecords.microchipNumber,
        registrationStatus: microchipRecords.registrationStatus,
      })
      .from(microchipRecords)
      .where(
        and(
          eq(microchipRecords.tenantId, tenantId),
          eq(microchipRecords.animalId, animalId),
          ne(microchipRecords.registrationStatus, 'transferred'),
        ),
      );

    if (pending.length > 0) {
      if (options.microchipPolicy === 'block' && !options.confirmMicrochipPending) {
        return {
          ok: false,
          code: 'MICROCHIP_TRANSFER_PENDING',
          pendingMicrochips: pending,
        };
      }
      if (options.microchipPolicy === 'warn') {
        pendingChipsForWarn = pending;
      }
    }
  }

  // 3. Ensure an adoptions row exists.
  const adoptionDate = options.adoptionDate ?? new Date();
  let adoptionRow: Adoption | null = null;

  if (options.adopterInfo) {
    // Path A — explicit adopter info from the Record Adoption form. Always
    // insert (the form represents an explicit "this is who took the animal
    // home" event and may differ from any application on file).
    const [inserted] = await db
      .insert(adoptions)
      .values({
        tenantId,
        animalId,
        applicationId: options.applicationId ?? null,
        adopterName: options.adopterInfo.name,
        adopterEmail: options.adopterInfo.email,
        adopterPhone: options.adopterInfo.phone,
        adoptionDate,
        adoptionFee: options.adopterInfo.adoptionFee ?? null,
        notes: options.adopterInfo.notes ?? null,
      })
      .returning();
    adoptionRow = inserted ?? null;
  } else {
    const result = await ensureAdoptionRowForAnimal(tenantId, animalId, {
      applicationId: options.applicationId,
      adoptionDate,
    });
    if (result.reason === 'no_application' || !result.adoption) {
      return {
        ok: false,
        code: 'ADOPTION_INFO_REQUIRED',
        reason: result.reason === 'no_application' ? 'no_application' : 'race_no_application',
      };
    }
    adoptionRow = result.adoption;
  }

  if (!adoptionRow) {
    return {
      ok: false,
      code: 'ADOPTION_INFO_REQUIRED',
      reason: 'race_no_application',
    };
  }

  // 4. Flip animal status + clear location.
  const [updatedAnimal] = await db
    .update(animals)
    .set({
      status: 'adopted',
      adoptionDate,
      locationType: null,
      locationName: null,
      fosterId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(animals.tenantId, tenantId), eq(animals.id, animalId)))
    .returning();

  // 5. Sync linked application stage (idempotent). Prefer the application
  // id stored on the adoption row (which is the authoritative link, set
  // either by ensureAdoptionRowForAnimal's stage-priority resolver or by
  // the Path A caller) so that Path C — which doesn't pass an explicit
  // applicationId — still promotes the resolved application's stage.
  const linkedAppId = adoptionRow.applicationId ?? options.applicationId ?? null;
  if (linkedAppId) {
    await db
      .update(applications)
      .set({ stage: 'adopted', updatedAt: new Date() })
      .where(
        and(
          eq(applications.tenantId, tenantId),
          eq(applications.id, linkedAppId),
        ),
      );
  }

  // 6. Mark microchip records as transferred (best-effort).
  try {
    await db
      .update(microchipRecords)
      .set({
        registrationStatus: 'transferred' as const,
        transferredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(microchipRecords.tenantId, tenantId),
          eq(microchipRecords.animalId, animalId),
          inArray(microchipRecords.registrationStatus, [
            'unregistered',
            'registered_rescue',
          ]),
        ),
      );
  } catch (chipErr) {
    console.error(
      `[finalizeAdoption] Failed to mark microchip records as transferred for animal ${animalId}:`,
      chipErr,
    );
  }

  // 7. Animal audit log (best-effort, captures pre-state). Wrapped in
  // try/catch so an audit-table failure never breaks an otherwise-
  // successful adoption — the row + status flip are already committed.
  try {
    await logAnimalAudit({
      tenantId,
      animalId,
      previousStatus: existingAnimal.status,
      newStatus: 'adopted',
      previousLocationType: existingAnimal.locationType,
      newLocationType: null,
      previousLocationName: existingAnimal.locationName,
      newLocationName: null,
      changedBy: options.actor?.id ?? null,
      changedByName: options.actor?.name ?? null,
      notes: options.auditNote ?? 'Adoption finalized',
    });
  } catch (auditErr) {
    console.error(
      `[finalizeAdoption] Failed to write animal audit log for animal ${animalId}:`,
      auditErr,
    );
  }

  return {
    ok: true,
    adoption: adoptionRow,
    animal: updatedAnimal!,
    ...(pendingChipsForWarn ? { pendingMicrochips: pendingChipsForWarn } : {}),
  };
}
