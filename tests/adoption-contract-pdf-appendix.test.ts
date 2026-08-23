import assert from 'node:assert/strict';
import test from 'node:test';

import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

import {
  buildHistoricalAdoptionContractRepairPdf,
  buildTenantPrivateContractAcl,
} from '../server/services/contract-pdf';

test('historical PDF repair preserves original pages and appends saved signature and ID evidence', async () => {
  const original = await PDFDocument.create();
  const font = await original.embedFont(StandardFonts.Helvetica);
  const originalPage = original.addPage();
  originalPage.drawText('IMMUTABLE ORIGINAL AGREEMENT TEXT', { x: 50, y: 700, font });
  const originalBytes = await original.save();

  const signatureImage = await sharp({
    create: { width: 160, height: 60, channels: 4, background: { r: 25, g: 25, b: 25, alpha: 1 } },
  }).png().toBuffer();
  const driversLicenseImage = await sharp({
    create: { width: 240, height: 140, channels: 3, background: { r: 210, g: 220, b: 230 } },
  }).jpeg().toBuffer();

  const repairedBytes = await buildHistoricalAdoptionContractRepairPdf({
    originalPdf: originalBytes,
    signatureImage,
    driversLicenseImage,
    signerName: 'Historical Signer',
    signerEmail: 'historical@example.test',
    signedAt: new Date('2026-02-10T10:00:00.000Z'),
    signedIp: '192.0.2.10',
  });

  const repaired = await PDFDocument.load(repairedBytes);
  assert.equal(repaired.getPageCount(), 3, 'one signature page and one ID page should be appended');

  const { PDFParse }: any = await import('pdf-parse');
  const parser = new PDFParse({ data: Buffer.from(repairedBytes) });
  try {
    const text = (await parser.getText()).text as string;
    assert.match(text, /IMMUTABLE ORIGINAL AGREEMENT TEXT/);
    assert.match(text, /Electronic Signature Verification/);
    assert.match(text, /Historical Signer/);
    assert.match(text, /2026-02-10T10:00:00.000Z/);
    assert.match(text, /Uploaded Identification/);
  } finally {
    await parser.destroy?.();
  }
});

test('ACL repair preserves same-tenant ownership and rejects foreign-tenant objects', () => {
  assert.deepEqual(buildTenantPrivateContractAcl(null, 'tenant-a'), {
    owner: 'tenant-a',
    tenantId: 'tenant-a',
    visibility: 'private',
    aclRules: undefined,
  });
  assert.deepEqual(buildTenantPrivateContractAcl({
    owner: 'user-a',
    tenantId: 'tenant-a',
    visibility: 'private',
  }, 'tenant-a'), {
    owner: 'user-a',
    tenantId: 'tenant-a',
    visibility: 'private',
    aclRules: undefined,
  });
  assert.throws(() => buildTenantPrivateContractAcl({
    owner: 'user-b',
    tenantId: 'tenant-b',
    visibility: 'private',
  }, 'tenant-a'), /different tenant/);
});