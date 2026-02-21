import puppeteer from 'puppeteer';
import DOMPurify from 'isomorphic-dompurify';
import { objectStorageClient } from '../objectStorage';

async function uploadCustomFormPdfToStorage(pdfBuffer: Buffer, folder: string): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/${folder}/${folder}_${timestamp}_${randomId}.pdf`;
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

  return `/objects/${folder}/${file.name.split('/').pop()}`;
}

export async function generateCustomFormPDF(
  renderedHtml: string,
  folder: string,
  metadata?: { ipAddress?: string; signedAt?: Date; sessionId?: string }
): Promise<{ objectPath: string; pdfBuffer: Buffer }> {
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

  const metadataHtml = metadata ? `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #666;">
      <p><strong>Document Verification</strong></p>
      <p>Signed electronically on: ${metadata.signedAt?.toISOString() || new Date().toISOString()}</p>
      ${metadata.ipAddress ? `<p>Signer IP Address: ${metadata.ipAddress}</p>` : ''}
      ${metadata.sessionId ? `<p>Session ID: ${metadata.sessionId}</p>` : ''}
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
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
        }
        h1, h2, h3 { color: #222; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
        th { background-color: #f5f5f5; }
        .signature-section { margin-top: 40px; }
        .signature-line { border-bottom: 1px solid #333; width: 300px; margin-bottom: 5px; }
        img { max-width: 100%; height: auto; }
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

    const pdfUint8 = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
    });

    const pdfBuffer = Buffer.from(pdfUint8);
    const objectPath = await uploadCustomFormPdfToStorage(pdfBuffer, folder);

    console.log(`[custom-form-pdf] Generated and uploaded PDF (${pdfBuffer.length} bytes) to ${objectPath}`);

    return { objectPath, pdfBuffer };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
