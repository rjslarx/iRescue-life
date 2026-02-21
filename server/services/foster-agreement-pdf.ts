import puppeteer from 'puppeteer';
import DOMPurify from 'isomorphic-dompurify';
import { objectStorageClient, signObjectURL } from '../objectStorage';
import { db } from '../db';
import { fosterAgreementSessions, fosterApplications, fosterContractTemplates, tenants, animals } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { mergeFosterPlaceholders, ensureDefaultFosterTemplate, type FosterMergeData } from './foster-contract-template';

async function uploadFosterPdfToStorage(pdfBuffer: Buffer): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/foster-contracts/foster_contract_${timestamp}_${randomId}.pdf`;
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

  return `/objects/foster-contracts/${file.name.split('/').pop()}`;
}

export async function generateSignedFosterContractUrl(
  contractPath: string, 
  ttlSec: number = 900,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const filename = contractPath.split('/').pop();
  if (!filename) {
    throw new Error('Invalid contract path');
  }

  const objectPath = `${privateObjectDir}/foster-contracts/${filename}`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('Foster contract file not found');
  }

  try {
    const responseDisposition = disposition === 'attachment'
      ? `attachment; filename="foster-agreement-${filename}"`
      : `inline; filename="foster-agreement-${filename}"`;

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
      responseDisposition,
    });
    return signedUrl;
  } catch (gcsError: any) {
    console.log('[foster-agreement-pdf] GCS signing unavailable, using Replit sidecar:', gcsError.message);
    const signedUrl = await signObjectURL({
      bucketName,
      objectName,
      method: 'GET',
      ttlSec,
    });
    return signedUrl;
  }
}

export async function generateFosterAgreementPDF(
  sessionId: string,
  renderedHtml: string,
  signatureMetadata?: { ipAddress?: string; signedAt?: Date }
): Promise<string> {
  const [session] = await db
    .select()
    .from(fosterAgreementSessions)
    .where(eq(fosterAgreementSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Foster agreement session not found');
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const safeHtml = DOMPurify.sanitize(renderedHtml, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
    ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });

  // Use system Chromium for Replit environment
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(safeHtml, {
      waitUntil: 'networkidle0',
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    const pdfUrl = await uploadFosterPdfToStorage(pdfBuffer);

    return pdfUrl;
  } finally {
    await browser.close();
  }
}
