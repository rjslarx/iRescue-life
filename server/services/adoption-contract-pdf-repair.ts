export const PDF_IMAGE_FIX_CUTOFF = new Date('2026-03-13T03:44:22.000Z');

type RepairCandidateFields = {
  createdAt: Date;
  signedAt: Date | null;
  signatureImageUrl: string | null;
  driversLicenseImageUrl: string | null;
};

export function isHistoricalPdfRepairCandidate(candidate: RepairCandidateFields): boolean {
  return candidate.createdAt < PDF_IMAGE_FIX_CUTOFF
    && candidate.signedAt !== null
    && Boolean(candidate.signatureImageUrl || candidate.driversLicenseImageUrl);
}

export function resolveHistoricalDriversLicenseReference(params: {
  contractImageUrl: string | null;
  sessionImageUrl: string | null;
  signedAt: Date;
  sessionObjectCreatedAt?: Date;
}): string | null {
  if (params.contractImageUrl) {
    return params.contractImageUrl;
  }
  if (!params.sessionImageUrl) {
    return null;
  }
  if (!params.sessionObjectCreatedAt) {
    throw new Error('Historical ID reference has no verifiable object creation timestamp');
  }
  if (params.sessionObjectCreatedAt.getTime() > params.signedAt.getTime()) {
    throw new Error('Current checkout-session ID was uploaded after the contract was signed');
  }
  return params.sessionImageUrl;
}

export function canRecoverAbandonedSignatureClaim(params: {
  signatureClaimedAt: Date | null;
  contractId: number | null;
}): boolean {
  return params.signatureClaimedAt !== null && params.contractId === null;
}