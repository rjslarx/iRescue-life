import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canRecoverAbandonedSignatureClaim,
  isHistoricalPdfRepairCandidate,
  PDF_IMAGE_FIX_CUTOFF,
  resolveHistoricalDriversLicenseReference,
} from '../server/services/adoption-contract-pdf-repair';

const beforeFix = new Date(PDF_IMAGE_FIX_CUTOFF.getTime() - 1);
const atFix = new Date(PDF_IMAGE_FIX_CUTOFF.getTime());
const signedAt = new Date('2026-02-10T10:00:00.000Z');

test('historical PDF repair selects only signed pre-fix contracts with a saved image reference', () => {
  assert.equal(isHistoricalPdfRepairCandidate({
    createdAt: beforeFix,
    signedAt,
    signatureImageUrl: '/objects/signatures/sig_older.png',
    driversLicenseImageUrl: null,
  }), true);

  assert.equal(isHistoricalPdfRepairCandidate({
    createdAt: beforeFix,
    signedAt,
    signatureImageUrl: null,
    driversLicenseImageUrl: '/objects/drivers-licenses/id_older.jpg',
  }), true);
});

test('historical PDF repair never selects unsigned, image-free, or post-fix contracts', () => {
  const common = {
    signatureImageUrl: '/objects/signatures/sig.png',
    driversLicenseImageUrl: null,
  };

  assert.equal(isHistoricalPdfRepairCandidate({ ...common, createdAt: beforeFix, signedAt: null }), false);
  assert.equal(isHistoricalPdfRepairCandidate({
    createdAt: beforeFix,
    signedAt,
    signatureImageUrl: null,
    driversLicenseImageUrl: null,
  }), false);
  assert.equal(isHistoricalPdfRepairCandidate({ ...common, createdAt: atFix, signedAt }), false);
});

test('historical PDF repair uses contract creation time for the exact fix cutoff', () => {
  assert.equal(isHistoricalPdfRepairCandidate({
    createdAt: beforeFix,
    signedAt: new Date(PDF_IMAGE_FIX_CUTOFF.getTime() + 86_400_000),
    signatureImageUrl: '/objects/signatures/sig.png',
    driversLicenseImageUrl: null,
  }), true);

  assert.equal(isHistoricalPdfRepairCandidate({
    createdAt: atFix,
    signedAt,
    signatureImageUrl: '/objects/signatures/sig.png',
    driversLicenseImageUrl: null,
  }), false);
});

test('immutable contract ID evidence wins over a later mutable session upload', () => {
  assert.equal(resolveHistoricalDriversLicenseReference({
    contractImageUrl: '/objects/drivers-licenses/signed-id.jpg',
    sessionImageUrl: '/objects/drivers-licenses/later-id.jpg',
    signedAt,
    sessionObjectCreatedAt: new Date(signedAt.getTime() + 60_000),
  }), '/objects/drivers-licenses/signed-id.jpg');
});

test('historical session ID references are pinned only when they existed at signing', () => {
  assert.equal(resolveHistoricalDriversLicenseReference({
    contractImageUrl: null,
    sessionImageUrl: '/objects/drivers-licenses/original-id.jpg',
    signedAt,
    sessionObjectCreatedAt: new Date(signedAt.getTime() - 1),
  }), '/objects/drivers-licenses/original-id.jpg');

  assert.throws(() => resolveHistoricalDriversLicenseReference({
    contractImageUrl: null,
    sessionImageUrl: '/objects/drivers-licenses/replaced-id.jpg',
    signedAt,
    sessionObjectCreatedAt: new Date(signedAt.getTime() + 1),
  }), /uploaded after the contract was signed/);
});

test('an abandoned signing claim is recoverable only before a contract exists', () => {
  assert.equal(canRecoverAbandonedSignatureClaim({
    signatureClaimedAt: new Date('2026-02-10T10:00:00.000Z'),
    contractId: null,
  }), true);
  assert.equal(canRecoverAbandonedSignatureClaim({
    signatureClaimedAt: new Date('2026-02-10T10:00:00.000Z'),
    contractId: 42,
  }), false);
  assert.equal(canRecoverAbandonedSignatureClaim({
    signatureClaimedAt: null,
    contractId: null,
  }), false);
});