/**
 * Adoption Agreement Direct Sends
 *
 * Lets staff send an adoption agreement straight to a specific person to fill
 * out and sign — without a prior application (edge case for rescues that take
 * applications offline). Mirrors the surrender-agreement session pattern:
 * sha256-hashed token, expiring public link, e-sign, PDF with audit stamp.
 *
 * SECURITY: the raw token only ever travels inside the recipient's email.
 * API responses to the browser never include it.
 */
import crypto from 'crypto';
import puppeteer from 'puppeteer';
import DOMPurify from 'isomorphic-dompurify';
import { objectStorageClient, signObjectURL } from '../objectStorage';
import { setObjectAclPolicy, type ObjectAclPolicy } from '../objectAcl';
import { db } from '../db';
import { adoptionAgreementDirectSends, type Tenant } from '@shared/schema';
import { eq } from 'drizzle-orm';

export const DIRECT_SEND_EXPIRATION_DAYS = 14;

export function generateDirectSendToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DIRECT_SEND_EXPIRATION_DAYS);
  return { token, tokenHash, expiresAt };
}

export function hashDirectSendToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Public signing URL — custom domain if verified, else irescue.life/{subdomain} (dev: path-based). */
export function buildDirectSendSigningUrl(
  tenant: Pick<Tenant, 'customDomain' | 'subdomain'>,
  token: string,
): string {
  if (tenant.customDomain) {
    return `https://${tenant.customDomain}/adoption-agreement/sign/${token}`;
  }
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const baseUrl = isProduction
    ? 'https://irescue.life'
    : process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';
  return `${baseUrl}/${tenant.subdomain}/adoption-agreement/sign/${token}`;
}

export async function sendDirectSendEmail(params: {
  tenantId: string;
  tenantName: string;
  tenantContactEmail: string | null;
  recipientName: string;
  recipientEmail: string;
  animalName: string | null;
  signingUrl: string;
}): Promise<void> {
  const { EmailService } = await import('../lib/email-service');
  const emailService = await EmailService.forTenant(params.tenantId);
  if (!emailService) {
    throw new Error('Email is not configured for this organization');
  }
  const animalLabel = params.animalName ? ` for ${params.animalName}` : '';
  const buttonStyle = 'display:inline-block;padding:12px 24px;background-color:#4F46E5;color:white;text-decoration:none;border-radius:6px;';
  await emailService.send({
    to: params.recipientEmail,
    subject: `Action Required: Complete Your Adoption Agreement - ${params.tenantName}`,
    html: `
<h2>Adoption Agreement Ready to Complete</h2>
<p>Hello ${params.recipientName},</p>
<p><strong>${params.tenantName}</strong> has sent you an adoption agreement${animalLabel} to review, fill out, and sign online.</p>
<p><a href="${params.signingUrl}" style="${buttonStyle}">Review &amp; Sign Adoption Agreement</a></p>
<p style="color:#666;font-size:14px;">Or copy and paste this link into your browser:</p>
<p><a href="${params.signingUrl}" style="color:#4F46E5;">${params.signingUrl}</a></p>
<p style="color:#666;font-size:14px;">This link will expire in ${DIRECT_SEND_EXPIRATION_DAYS} days.</p>
<p style="color:#666;font-size:14px;">Questions? Contact us at ${params.tenantContactEmail || 'our contact email'}.</p>
    `.trim(),
  });
}

export function buildDirectAgreementAcl(tenantId: string): ObjectAclPolicy {
  return {
    owner: tenantId,
    tenantId,
    visibility: 'private',
  };
}

async function uploadDirectSendPdfToStorage(pdfBuffer: Buffer, tenantId: string): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/adoption-direct-agreements/adoption_agreement_${timestamp}_${randomId}.pdf`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } });
  try {
    await setObjectAclPolicy(file, buildDirectAgreementAcl(tenantId));
  } catch (error) {
    // A stored agreement without ACL metadata is treated as public by the
    // legacy object route, so never leave the uploaded PDF behind on failure.
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }

  return `/objects/adoption-direct-agreements/${file.name.split('/').pop()}`;
}

export async function generateDirectSendAgreementPDF(
  sendId: string,
  tenantId: string,
  renderedHtml: string,
  signatureMetadata?: { ipAddress?: string; signedAt?: Date },
): Promise<string> {
  const sanitizedHtml = DOMPurify.sanitize(renderedHtml, {
    ALLOWED_TAGS: [
      'html', 'head', 'body', 'style', 'div', 'span', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'ul', 'ol', 'li',
      'strong', 'em', 'b', 'i', 'u', 's',
      'img', 'a',
      'blockquote', 'pre', 'code',
      'header', 'footer', 'section', 'article', 'aside', 'nav', 'main',
    ],
    ALLOWED_ATTR: [
      'style', 'class', 'id', 'src', 'alt', 'href', 'target',
      'width', 'height', 'border', 'cellpadding', 'cellspacing',
      'colspan', 'rowspan', 'align', 'valign',
    ],
    ALLOW_DATA_ATTR: false,
    ADD_DATA_URI_TAGS: ['img'],
  });

  const metadataHtml = signatureMetadata ? `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #666;">
      <p><strong>Document Verification</strong></p>
      <p>Signed electronically on: ${signatureMetadata.signedAt?.toISOString() || 'N/A'}</p>
      <p>Signer IP Address: ${signatureMetadata.ipAddress || 'N/A'}</p>
      <p>Session ID: ${sendId}</p>
      <p>This document was electronically signed and is legally binding.</p>
    </div>
  ` : '';

  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          font-size: 12px;
          line-height: 1.5;
          color: #333;
        }
        img { max-width: 300px; }
      </style>
    </head>
    <body>
      ${sanitizedHtml}
      ${metadataHtml}
    </body>
    </html>
  `;

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
    });

    const objectPath = await uploadDirectSendPdfToStorage(Buffer.from(pdfBuffer), tenantId);

    await db
      .update(adoptionAgreementDirectSends)
      .set({ contractPdfUrl: objectPath, updatedAt: new Date() })
      .where(eq(adoptionAgreementDirectSends.id, sendId));

    return objectPath;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function generateSignedDirectSendPdfUrl(
  contractPath: string,
  ttlSec: number = 900,
  disposition: 'inline' | 'attachment' = 'inline',
): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }
  const filename = contractPath.split('/').pop();
  if (!filename) {
    throw new Error('Invalid contract path');
  }
  const objectPath = `${privateObjectDir}/adoption-direct-agreements/${filename}`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('Agreement file not found');
  }

  try {
    const responseDisposition = disposition === 'attachment'
      ? `attachment; filename="adoption-agreement-${filename}"`
      : `inline; filename="adoption-agreement-${filename}"`;
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
      responseDisposition,
    });
    return signedUrl;
  } catch (gcsError: any) {
    console.log('[adoption-direct-agreement] GCS signing unavailable, using Replit sidecar:', gcsError.message);
    return await signObjectURL({ bucketName, objectName, method: 'GET', ttlSec });
  }
}
