/**
 * Repairs signed adoption-contract PDFs created before the March 13, 2026
 * inline-image fix. This is deliberately tenant-by-tenant: run it once for
 * each rescue, inspect the printed summary, and re-run only failures.
 *
 * Usage:
 *   npx tsx scripts/repair-adoption-contract-pdfs.ts --tenant-id <uuid> [--dry-run] [--limit <n>]
 *   npx tsx scripts/repair-adoption-contract-pdfs.ts --tenant-id <uuid> --recover-abandoned-run <run-uuid>
 *   npx tsx scripts/repair-adoption-contract-pdfs.ts --tenant-id <uuid> --recover-signature-session <session-uuid>
 */
import { randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import {
  adoptionCheckoutSessions,
  adoptionContractPdfRegenerationAudits,
  adoptionContracts,
  tenants,
} from '../shared/schema';
import { db, pool } from '../server/db';
import {
  repairHistoricalAdoptionContractPDF,
  getAdoptionContractObjectCreatedAt,
  secureAdoptionContractObject,
} from '../server/services/contract-pdf';
import {
  isHistoricalPdfRepairCandidate,
  PDF_IMAGE_FIX_CUTOFF,
  resolveHistoricalDriversLicenseReference,
  canRecoverAbandonedSignatureClaim,
} from '../server/services/adoption-contract-pdf-repair';

const REPAIR_REASON = 'pdf_image_fix_backfill';

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(error?: string): never {
  if (error) console.error(`Error: ${error}\n`);
  console.error('Usage: npx tsx scripts/repair-adoption-contract-pdfs.ts --tenant-id <uuid> [--dry-run] [--limit <n>] [--recover-abandoned-run <run-uuid>] [--recover-signature-session <session-uuid>]');
  process.exit(1);
}

async function main(): Promise<void> {
  const tenantId = readArgument('--tenant-id');
  if (!tenantId) usage('--tenant-id is required so repairs are always tenant-by-tenant');

  const dryRun = process.argv.includes('--dry-run');
  const abandonedRunId = readArgument('--recover-abandoned-run');
  const signatureSessionId = readArgument('--recover-signature-session');
  const limitValue = readArgument('--limit');
  const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;
  if (limitValue && (!Number.isInteger(limit) || limit! <= 0)) usage('--limit must be a positive integer');
  if (abandonedRunId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(abandonedRunId)) {
    usage('--recover-abandoned-run must be a valid UUID');
  }
  if (abandonedRunId && dryRun) {
    usage('--recover-abandoned-run cannot be combined with --dry-run');
  }
  if (signatureSessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(signatureSessionId)) {
    usage('--recover-signature-session must be a valid UUID');
  }
  if (signatureSessionId && (dryRun || abandonedRunId || limitValue)) {
    usage('--recover-signature-session cannot be combined with repair-run options');
  }

  const [tenant] = await db
    .select({ id: tenants.id, subdomain: tenants.subdomain })
    .from(tenants)
    .where(eq(tenants.id, tenantId!))
    .limit(1);
  if (!tenant) usage('tenant not found');

  if (signatureSessionId) {
    const [session] = await db
      .select({
        id: adoptionCheckoutSessions.id,
        signatureClaimedAt: adoptionCheckoutSessions.signatureClaimedAt,
        metadata: adoptionCheckoutSessions.metadata,
      })
      .from(adoptionCheckoutSessions)
      .where(and(
        eq(adoptionCheckoutSessions.id, signatureSessionId),
        eq(adoptionCheckoutSessions.tenantId, tenant.id),
      ))
      .limit(1);
    if (!session) usage('signature session not found for this tenant');

    const [contract] = await db
      .select({ id: adoptionContracts.id })
      .from(adoptionContracts)
      .where(eq(adoptionContracts.sessionId, session.id))
      .limit(1);

    if (!canRecoverAbandonedSignatureClaim({
      signatureClaimedAt: session.signatureClaimedAt,
      contractId: contract?.id || null,
    })) {
      usage(contract
        ? 'signature claim cannot be recovered because a contract already exists'
        : 'session has no active signature claim to recover');
    }

    const existingMetadata = session.metadata && typeof session.metadata === 'object'
      ? session.metadata
      : {};
    const recoveryHistory = Array.isArray(existingMetadata.signatureClaimRecoveryHistory)
      ? existingMetadata.signatureClaimRecoveryHistory
      : [];
    const recoveredAt = new Date();
    const [recovered] = await db
      .update(adoptionCheckoutSessions)
      .set({
        signatureClaimedAt: null,
        updatedAt: recoveredAt,
        metadata: {
          ...existingMetadata,
          signatureClaimRecoveryHistory: [
            ...recoveryHistory,
            {
              recoveredAt: recoveredAt.toISOString(),
              previousClaimedAt: session.signatureClaimedAt!.toISOString(),
              reason: 'operator_confirmed_abandoned',
            },
          ],
        },
      })
      .where(and(
        eq(adoptionCheckoutSessions.id, session.id),
        eq(adoptionCheckoutSessions.tenantId, tenant.id),
        eq(adoptionCheckoutSessions.signatureClaimedAt, session.signatureClaimedAt!),
      ))
      .returning({ id: adoptionCheckoutSessions.id });
    if (!recovered) usage('signature claim changed before it could be recovered');

    console.log(JSON.stringify({
      tenantId: tenant.id,
      recoveredSignatureSession: recovered.id,
      previousClaimedAt: session.signatureClaimedAt!.toISOString(),
    }));
    return;
  }

  if (abandonedRunId) {
    const recovered = await db
      .update(adoptionContractPdfRegenerationAudits)
      .set({
        status: 'failed',
        error: `Operator confirmed abandoned repair run ${abandonedRunId}`,
        completedAt: new Date(),
      })
      .where(and(
        eq(adoptionContractPdfRegenerationAudits.tenantId, tenant.id),
        eq(adoptionContractPdfRegenerationAudits.runId, abandonedRunId),
        eq(adoptionContractPdfRegenerationAudits.reason, REPAIR_REASON),
        eq(adoptionContractPdfRegenerationAudits.status, 'started'),
      ))
      .returning({ contractId: adoptionContractPdfRegenerationAudits.contractId });

    console.log(JSON.stringify({
      tenantId: tenant.id,
      recoveredAbandonedRun: abandonedRunId,
      releasedClaims: recovered.map(({ contractId }) => contractId),
    }));
  }

  const candidates = await db
    .select({
      contract: adoptionContracts,
      session: adoptionCheckoutSessions,
    })
    .from(adoptionContracts)
    .innerJoin(adoptionCheckoutSessions, eq(adoptionContracts.sessionId, adoptionCheckoutSessions.id))
    .where(and(
      eq(adoptionCheckoutSessions.tenantId, tenant.id),
      lt(adoptionContracts.createdAt, PDF_IMAGE_FIX_CUTOFF),
      or(
        isNotNull(adoptionContracts.signatureImageUrl),
        isNotNull(adoptionContracts.driversLicenseImageUrl),
        isNotNull(adoptionCheckoutSessions.driversLicenseImageUrl),
      ),
    ))
    .orderBy(asc(adoptionContracts.createdAt));

  const previouslyRepaired = candidates.length > 0
    ? await db
      .select({ contractId: adoptionContractPdfRegenerationAudits.contractId })
      .from(adoptionContractPdfRegenerationAudits)
      .where(and(
        eq(adoptionContractPdfRegenerationAudits.tenantId, tenant.id),
        eq(adoptionContractPdfRegenerationAudits.status, 'succeeded'),
        eq(adoptionContractPdfRegenerationAudits.reason, REPAIR_REASON),
        inArray(adoptionContractPdfRegenerationAudits.contractId, candidates.map(({ contract }) => contract.id)),
      ))
    : [];
  const repairedContractIds = new Set(previouslyRepaired.map(({ contractId }) => contractId));

  const potential = candidates
    .filter(({ contract, session }) => isHistoricalPdfRepairCandidate({
      createdAt: contract.createdAt,
      signedAt: contract.signedAt,
      signatureImageUrl: contract.signatureImageUrl,
      driversLicenseImageUrl: contract.driversLicenseImageUrl || session.driversLicenseImageUrl,
    }))
    .filter(({ contract }) => !repairedContractIds.has(contract.id))
    .slice(0, limit);

  const eligible: Array<{
    contract: (typeof potential)[number]['contract'];
    immutableDriversLicenseImageUrl: string | null;
    evidenceError?: string;
  }> = [];

  for (const { contract, session } of potential) {
    let immutableDriversLicenseImageUrl = contract.driversLicenseImageUrl;
    let evidenceError: string | undefined;

    if (!immutableDriversLicenseImageUrl && session.driversLicenseImageUrl) {
      try {
        const objectCreatedAt = await getAdoptionContractObjectCreatedAt(
          session.driversLicenseImageUrl,
          'drivers-licenses',
        );
        immutableDriversLicenseImageUrl = resolveHistoricalDriversLicenseReference({
          contractImageUrl: contract.driversLicenseImageUrl,
          sessionImageUrl: session.driversLicenseImageUrl,
          signedAt: contract.signedAt,
          sessionObjectCreatedAt: objectCreatedAt,
        });

        if (!dryRun && immutableDriversLicenseImageUrl) {
          const [pinned] = await db
            .update(adoptionContracts)
            .set({ driversLicenseImageUrl: immutableDriversLicenseImageUrl })
            .where(and(
              eq(adoptionContracts.id, contract.id),
              isNull(adoptionContracts.driversLicenseImageUrl),
            ))
            .returning({ driversLicenseImageUrl: adoptionContracts.driversLicenseImageUrl });

          if (!pinned) {
            const [current] = await db
              .select({ driversLicenseImageUrl: adoptionContracts.driversLicenseImageUrl })
              .from(adoptionContracts)
              .where(eq(adoptionContracts.id, contract.id))
              .limit(1);
            if (current?.driversLicenseImageUrl !== immutableDriversLicenseImageUrl) {
              throw new Error('Contract ID evidence was concurrently pinned to a different object');
            }
          }
        }
      } catch (error) {
        evidenceError = error instanceof Error ? error.message : String(error);
        immutableDriversLicenseImageUrl = null;
      }
    }

    eligible.push({ contract, immutableDriversLicenseImageUrl, evidenceError });
  }

  console.log(JSON.stringify({
    tenantId: tenant.id,
    tenantSubdomain: tenant.subdomain,
    cutoff: PDF_IMAGE_FIX_CUTOFF.toISOString(),
    dryRun,
    alreadyRepaired: repairedContractIds.size,
    candidates: eligible.length,
    unverifiableIdReferences: eligible.filter(({ evidenceError }) => evidenceError).length,
  }));

  if (dryRun || eligible.length === 0) return;

  const runId = randomUUID();
  let succeeded = 0;
  let claimedElsewhere = 0;
  const failures: Array<{ contractId: number; error: string }> = [];

  for (const { contract, immutableDriversLicenseImageUrl, evidenceError } of eligible) {
    try {
      const [audit] = await db
        .insert(adoptionContractPdfRegenerationAudits)
        .values({
          runId,
          tenantId: tenant.id,
          contractId: contract.id,
          status: 'started',
          reason: REPAIR_REASON,
          oldPdfUrl: contract.contractPdfUrl,
          signatureImageUrl: contract.signatureImageUrl,
          driversLicenseImageUrl: immutableDriversLicenseImageUrl,
        })
        .onConflictDoNothing()
        .returning({ id: adoptionContractPdfRegenerationAudits.id });

      if (!audit) {
        claimedElsewhere += 1;
        console.log(JSON.stringify({ contractId: contract.id, status: 'already_claimed' }));
        continue;
      }

      // A missing source object is a repair failure, not a reason to create
      // another incomplete PDF. ACL metadata is restored before rendering.
      if (!contract.contractPdfUrl) {
        throw new Error('Historical contract has no original PDF to repair safely');
      }
      if (evidenceError) {
        throw new Error(evidenceError);
      }
      await secureAdoptionContractObject(contract.contractPdfUrl, tenant.id, 'contracts');
      if (contract.signatureImageUrl) {
        await secureAdoptionContractObject(contract.signatureImageUrl, tenant.id, 'signatures');
      }
      if (immutableDriversLicenseImageUrl) {
        await secureAdoptionContractObject(immutableDriversLicenseImageUrl, tenant.id, 'drivers-licenses');
      }

      const newPdfUrl = await repairHistoricalAdoptionContractPDF({
        tenantId: tenant.id,
        originalPdfUrl: contract.contractPdfUrl,
        signatureImageUrl: contract.signatureImageUrl || undefined,
        driversLicenseImageUrl: immutableDriversLicenseImageUrl || undefined,
        signerName: contract.signerName,
        signerEmail: contract.signerEmail,
        signedAt: contract.signedAt,
        signedIp: contract.signedIp || undefined,
      });

      await db.transaction(async (tx) => {
        await tx
          .update(adoptionContracts)
          .set({ contractPdfUrl: newPdfUrl })
          .where(eq(adoptionContracts.id, contract.id));
        await tx
          .update(adoptionContractPdfRegenerationAudits)
          .set({
            status: 'succeeded',
            newPdfUrl,
            completedAt: new Date(),
          })
          .where(eq(adoptionContractPdfRegenerationAudits.id, audit.id));
      });

      succeeded += 1;
      console.log(JSON.stringify({ contractId: contract.id, status: 'succeeded' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ contractId: contract.id, error: message });
      console.error(JSON.stringify({ contractId: contract.id, status: 'failed', error: message }));

      try {
        const [audit] = await db
          .select({ id: adoptionContractPdfRegenerationAudits.id })
          .from(adoptionContractPdfRegenerationAudits)
          .where(and(
            eq(adoptionContractPdfRegenerationAudits.runId, runId),
            eq(adoptionContractPdfRegenerationAudits.contractId, contract.id),
          ))
          .limit(1);
        if (!audit) {
          throw new Error('No audit claim was created for this failed repair');
        }
        await db
          .update(adoptionContractPdfRegenerationAudits)
          .set({
            status: 'failed',
            error: message.slice(0, 4000),
            completedAt: new Date(),
          })
          .where(eq(adoptionContractPdfRegenerationAudits.id, audit.id));
      } catch (auditError) {
        const auditMessage = auditError instanceof Error ? auditError.message : String(auditError);
        failures.push({ contractId: contract.id, error: `Could not record repair failure: ${auditMessage}` });
        console.error(JSON.stringify({ contractId: contract.id, status: 'audit_failed', error: auditMessage }));
      }
    }
  }

  console.log(JSON.stringify({
    runId,
    tenantId: tenant.id,
    attempted: eligible.length,
    succeeded,
    claimedElsewhere,
    failed: failures.length,
    failures,
  }));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('repair-adoption-contract-pdfs.ts')) {
  main()
    .catch((error) => {
      console.error('[adoption-contract-pdf-repair] Fatal error:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}