export type WarningResolution = 'unresolved' | 'pending_review' | 'approved' | 'completed' | 'waived';

/** Warning resolution is not a claim about current medical coverage. */
export function warningResolution(proofStatus?: string | null, obligationStatus?: string | null): WarningResolution {
  if (obligationStatus === 'completed' || obligationStatus === 'waived') return obligationStatus;
  if (proofStatus === 'approved' || proofStatus === 'pending_review') return proofStatus;
  return 'unresolved';
}

export function warningHistoryDisplay(resolution?: WarningResolution, proofUploaded = false) {
  // Older API responses cannot distinguish pending from approved proof.
  const status = resolution ?? (proofUploaded ? 'pending_review' : 'unresolved');
  const labels: Record<WarningResolution, string> = {
    unresolved: 'Past-due notice',
    pending_review: 'Awaiting review',
    approved: 'Proof approved',
    completed: 'Requirement completed',
    waived: 'Requirement waived',
  };
  return {
    label: labels[status],
    resolved: ['approved', 'completed', 'waived'].includes(status),
    needsProof: status === 'unresolved',
  };
}
