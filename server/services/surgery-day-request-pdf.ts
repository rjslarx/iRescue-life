import puppeteer from 'puppeteer';
import { objectStorageClient, signObjectURL } from '../objectStorage';
import { db } from '../db';
import { surgeryDayRequests, surgeryDayRequestAnimals, tenants, partnerOrganizations } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { format } from 'date-fns';

const STORAGE_PREFIX = 'surgery-day-requests';

function escapeHtml(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strictly validate that a captured signature is a base64-encoded raster image
// data URI. We deliberately reject SVG (which can carry script), non-base64
// data URIs, and anything with stray characters that could break out of the
// HTML attribute we render it into. Returns the canonical, safe data URI on
// success, or null if the input is missing/untrusted.
function sanitizeSignatureDataUri(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.length > 2_000_000) return null; // ~1.5MB decoded cap
  const match = raw.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const b64 = match[2];
  // base64 must be a multiple of 4 chars
  if (b64.length === 0 || b64.length % 4 !== 0) return null;
  return `data:image/${mime};base64,${b64}`;
}

function humanize(s: string | null | undefined): string {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function uploadSurgeryDayRequestPdfToStorage(pdfBuffer: Buffer, requestId: string): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const objectPath = `${privateObjectDir}/${STORAGE_PREFIX}/surgery_day_request_${requestId}_${timestamp}_${randomId}.pdf`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(pdfBuffer, {
    metadata: {
      contentType: 'application/pdf',
    },
  });

  return `/objects/${STORAGE_PREFIX}/${file.name.split('/').pop()}`;
}

export async function generateSignedSurgeryDayRequestPdfUrl(
  contractPath: string,
  ttlSec: number = 900,
  disposition: 'inline' | 'attachment' = 'attachment',
): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const filename = contractPath.split('/').pop();
  if (!filename) {
    throw new Error('Invalid surgery day request PDF path');
  }

  const objectPath = `${privateObjectDir}/${STORAGE_PREFIX}/${filename}`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('Surgery day request PDF file not found');
  }

  const responseDisposition = disposition === 'attachment'
    ? `attachment; filename="surgery-day-request-${filename}"`
    : `inline; filename="surgery-day-request-${filename}"`;

  try {
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
      responseDisposition,
    });
    return signedUrl;
  } catch (gcsError: any) {
    console.log('[surgery-day-request-pdf] GCS signing unavailable, using Replit sidecar:', gcsError?.message);
    const signedUrl = await signObjectURL({
      bucketName,
      objectName,
      method: 'GET',
      ttlSec,
    });
    return signedUrl;
  }
}

function buildHtml(params: {
  tenantName: string;
  request: typeof surgeryDayRequests.$inferSelect;
  animals: Array<typeof surgeryDayRequestAnimals.$inferSelect>;
  partnerName: string | null;
}): string {
  const { tenantName, request, animals, partnerName } = params;

  const submittedFormatted = request.submittedAt
    ? format(new Date(request.submittedAt), 'PPpp')
    : '—';
  const signedFormatted = request.signedAt
    ? format(new Date(request.signedAt), 'PPpp')
    : '—';
  const requestedDateFormatted = request.requestedDate
    ? format(new Date(request.requestedDate), 'PP')
    : '—';
  const scheduledDateFormatted = request.scheduledDate
    ? format(new Date(request.scheduledDate), 'PP')
    : '—';

  const animalRows = animals.map((a, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(a.name) || '—'}</td>
      <td>${escapeHtml(humanize(a.species))}</td>
      <td>${escapeHtml(a.breed) || '—'}</td>
      <td>${escapeHtml(a.age) || '—'}</td>
      <td>${escapeHtml(humanize(a.sex))}</td>
      <td>${escapeHtml(a.weight) || '—'}</td>
      <td>${escapeHtml(humanize(a.heartwormStatus))}</td>
      <td>${escapeHtml(humanize(a.needsRabies))}</td>
      <td>${a.hasMedicalIssues ? escapeHtml(a.medicalIssues || 'Yes') : 'None reported'}</td>
    </tr>
  `).join('');

  const partnerLine = partnerName
    ? `<div><span class="muted">Linked partner organization:</span> <strong>${escapeHtml(partnerName)}</strong></div>`
    : '';

  const signatureSrc = sanitizeSignatureDataUri(request.signatureDataUrl);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Surgery Day Request – ${escapeHtml(request.organizationName)}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #222;
      margin: 0;
      padding: 0;
    }
    .doc {
      max-width: 800px;
      margin: 0 auto;
      padding: 32px;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 4px 0;
      color: #111;
    }
    h2 {
      font-size: 14px;
      margin: 24px 0 8px 0;
      color: #111;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
    }
    .header-meta {
      color: #555;
      font-size: 11px;
      margin-bottom: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 24px;
    }
    .grid > div { padding: 2px 0; }
    .muted { color: #666; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 10.5px;
    }
    th, td {
      border: 1px solid #d4d4d4;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f3f4f6;
      font-weight: 600;
    }
    .ack-box {
      border: 1px solid #d4d4d4;
      background: #fafafa;
      padding: 12px 14px;
      white-space: pre-wrap;
      font-size: 11px;
      border-radius: 4px;
    }
    .signature-block {
      margin-top: 12px;
      padding: 12px 14px;
      border: 1px solid #d4d4d4;
      border-radius: 4px;
    }
    .signature-block img {
      display: block;
      max-height: 120px;
      max-width: 360px;
      margin: 4px 0;
    }
    .signature-line {
      border-top: 1px solid #333;
      width: 320px;
      margin-top: 24px;
      padding-top: 4px;
      font-size: 10px;
      color: #555;
    }
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 9.5px;
      color: #777;
    }
  </style>
</head>
<body>
  <div class="doc">
    <h1>${escapeHtml(tenantName)}</h1>
    <div class="header-meta">
      Surgery Day Request &mdash; Signed Agreement
      <br />
      Request ID: <code>${escapeHtml(request.id)}</code>
      <br />
      Status: <strong>${escapeHtml(humanize(request.status))}</strong>
    </div>

    <h2>Submitter</h2>
    <div class="grid">
      <div><span class="muted">Organization:</span> <strong>${escapeHtml(request.organizationName)}</strong></div>
      <div><span class="muted">Contact name:</span> ${escapeHtml(request.contactName)}</div>
      <div><span class="muted">Contact phone:</span> ${escapeHtml(request.contactPhone)}</div>
      <div><span class="muted">Contact email:</span> ${escapeHtml(request.contactEmail) || '—'}</div>
      <div><span class="muted">Submitted at:</span> ${escapeHtml(submittedFormatted)}</div>
      <div><span class="muted">Requested date:</span> ${escapeHtml(requestedDateFormatted)}</div>
      <div><span class="muted">Scheduled date:</span> ${escapeHtml(scheduledDateFormatted)}</div>
    </div>
    ${partnerLine ? `<div style="margin-top:8px">${partnerLine}</div>` : ''}

    <h2>Animals (${animals.length})</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Species</th>
          <th>Breed</th>
          <th>Age</th>
          <th>Sex</th>
          <th>Weight</th>
          <th>Heartworm</th>
          <th>Rabies needed</th>
          <th>Medical notes</th>
        </tr>
      </thead>
      <tbody>
        ${animalRows || '<tr><td colspan="10" style="text-align:center;color:#777">No animals on this request.</td></tr>'}
      </tbody>
    </table>

    <h2>Liability Acknowledgment</h2>
    <div class="ack-box">${escapeHtml(request.acknowledgmentText)}</div>

    <h2>Signature</h2>
    <div class="signature-block">
      <div><span class="muted">Signed by:</span> <strong>${escapeHtml(request.signedByName)}</strong></div>
      <div><span class="muted">Signed at:</span> ${escapeHtml(signedFormatted)}</div>
      ${signatureSrc ? `<img src="${signatureSrc}" alt="Signature" />` : '<div style="margin-top:8px;color:#a00;">[Signature image unavailable]</div>'}
      <div class="signature-line">Authorized signature</div>
    </div>

    <div class="footer">
      This document was generated from the electronic submission stored in
      ${escapeHtml(tenantName)}'s records. The signature image and
      acknowledgment text above are reproduced verbatim from the original
      submission and are legally binding under the terms accepted by the
      signer at the time of signing.
    </div>
  </div>
</body>
</html>`;
}

export async function generateSurgeryDayRequestPDF(
  requestId: string,
  tenantId: string,
): Promise<string> {
  const [request] = await db
    .select()
    .from(surgeryDayRequests)
    .where(and(eq(surgeryDayRequests.id, requestId), eq(surgeryDayRequests.tenantId, tenantId)))
    .limit(1);

  if (!request) {
    throw new Error('Surgery day request not found');
  }

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const animals = await db
    .select()
    .from(surgeryDayRequestAnimals)
    .where(eq(surgeryDayRequestAnimals.requestId, requestId))
    .orderBy(surgeryDayRequestAnimals.sortIndex);

  let partnerName: string | null = null;
  if (request.partnerOrganizationId) {
    const [p] = await db
      .select({ name: partnerOrganizations.name })
      .from(partnerOrganizations)
      .where(and(
        eq(partnerOrganizations.id, request.partnerOrganizationId),
        eq(partnerOrganizations.tenantId, tenantId),
      ))
      .limit(1);
    partnerName = p?.name ?? null;
  }

  const html = buildHtml({
    tenantName: tenant.name,
    request,
    animals,
    partnerName,
  });

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
    });

    const objectPath = await uploadSurgeryDayRequestPdfToStorage(Buffer.from(pdfBuffer), requestId);

    await db
      .update(surgeryDayRequests)
      .set({ signedPdfUrl: objectPath, updatedAt: new Date() })
      .where(and(eq(surgeryDayRequests.id, requestId), eq(surgeryDayRequests.tenantId, tenantId)));

    return objectPath;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
