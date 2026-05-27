import puppeteer from 'puppeteer';

export interface ReclaimAgreementPdfInput {
  tenantName: string;
  animalName: string;
  animalSpecies?: string | null;
  animalBreed?: string | null;
  ownerName: string;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  ownerAddress?: string | null;
  reclaimFeePaid: string;
  feeWaived: boolean;
  ownershipVerified: boolean;
  signatureDataUrl: string;
  signedAt: Date;
  ipAddress?: string | null;
  staffName?: string | null;
}

function escapeHtml(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeImageSrc(value: string): string {
  if (typeof value !== 'string') return '';
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  if (/^https:\/\//i.test(value)) return value;
  return '';
}

export function renderReclaimAgreementHtml(input: ReclaimAgreementPdfInput): string {
  const safeTenant = escapeHtml(input.tenantName);
  const safeAnimal = escapeHtml(input.animalName);
  const safeSpecies = escapeHtml(input.animalSpecies || '');
  const safeBreed = escapeHtml(input.animalBreed || '');
  const safeOwnerName = escapeHtml(input.ownerName);
  const safeOwnerEmail = escapeHtml(input.ownerEmail || '');
  const safeOwnerPhone = escapeHtml(input.ownerPhone || '');
  const safeOwnerAddress = escapeHtml(input.ownerAddress || '');
  const safeStaff = escapeHtml(input.staffName || '');
  const safeIp = escapeHtml(input.ipAddress || '');
  const signedAtIso = input.signedAt.toISOString();
  const signedAtPretty = input.signedAt.toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
  const feeLine = input.feeWaived
    ? 'Reclaim fee waived by Organization.'
    : `Reclaim fee paid: $${escapeHtml(Number(input.reclaimFeePaid || '0').toFixed(2))}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Reclaim &amp; Release of Liability Waiver - ${safeAnimal}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.55; color: #222; max-width: 800px; margin: 0 auto; padding: 40px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 4px; letter-spacing: 0.5px; }
  h2 { font-size: 13px; margin-top: 22px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; color: #111; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  .subtitle { text-align: center; color: #555; margin-bottom: 24px; font-size: 11px; }
  table.kv { width: 100%; border-collapse: collapse; margin: 8px 0 18px; }
  table.kv td { padding: 4px 6px; vertical-align: top; }
  table.kv td.label { width: 30%; color: #555; }
  ol { padding-left: 20px; }
  ol li { margin-bottom: 4px; }
  .signature-block { margin-top: 28px; padding: 14px; border: 1px solid #ccc; border-radius: 4px; background: #fafafa; }
  .signature-img { display: block; max-height: 120px; max-width: 360px; border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 6px; background: #fff; }
  .verification { margin-top: 28px; padding-top: 14px; border-top: 1px solid #ddd; font-size: 10px; color: #555; }
  .verification p { margin: 2px 0; }
</style>
</head>
<body>
  <h1>Reclaim &amp; Release of Liability Waiver</h1>
  <p class="subtitle">${safeTenant}</p>

  <h2>Parties</h2>
  <table class="kv">
    <tr><td class="label">Organization</td><td>${safeTenant}</td></tr>
    <tr><td class="label">Owner</td><td>${safeOwnerName}</td></tr>
    ${safeOwnerEmail ? `<tr><td class="label">Owner Email</td><td>${safeOwnerEmail}</td></tr>` : ''}
    ${safeOwnerPhone ? `<tr><td class="label">Owner Phone</td><td>${safeOwnerPhone}</td></tr>` : ''}
    ${safeOwnerAddress ? `<tr><td class="label">Owner Address</td><td>${safeOwnerAddress}</td></tr>` : ''}
  </table>

  <h2>Animal Reclaimed</h2>
  <table class="kv">
    <tr><td class="label">Name</td><td>${safeAnimal}</td></tr>
    ${safeSpecies ? `<tr><td class="label">Species</td><td>${safeSpecies}</td></tr>` : ''}
    ${safeBreed ? `<tr><td class="label">Breed</td><td>${safeBreed}</td></tr>` : ''}
  </table>

  <h2>Reclamation of Animal</h2>
  <p>Owner hereby reclaims the animal known as <strong>${safeAnimal}</strong> and acknowledges that ${safeTenant} (the "Organization") has held this animal in its care. Owner affirms that they are the rightful owner of this animal and assumes full responsibility for its care, health, and well-being effective immediately upon execution of this Agreement.</p>

  <h2>Release of Liability</h2>
  <p>Owner hereby releases, waives, and forever discharges the Organization, its officers, directors, employees, agents, volunteers, and representatives from any and all claims, demands, actions, causes of action, suits, damages, losses, or expenses of any kind, whether known or unknown, arising out of or in connection with the Organization's custody, care, or handling of the animal.</p>

  <h2>Assumption of Risk</h2>
  <p>Owner acknowledges and accepts that:</p>
  <ol>
    <li>The animal may have been exposed to illness, disease, or behavioral stressors while in the Organization's care.</li>
    <li>The Organization has provided reasonable care but makes no warranties regarding the animal's health, behavior, or condition.</li>
    <li>Owner assumes all risks associated with reclaiming and caring for the animal.</li>
  </ol>

  <h2>Indemnification</h2>
  <p>Owner agrees to indemnify, defend, and hold harmless the Organization from and against any claims, liabilities, damages, losses, or expenses arising from the animal's actions or condition after reclamation.</p>

  <h2>Acknowledgment of Fees</h2>
  <p>Owner acknowledges that any applicable reclaim fees, boarding fees, or veterinary fees have been discussed and, if applicable, paid prior to the release of the animal.</p>
  <p><strong>${feeLine}</strong></p>

  <h2>Governing Law</h2>
  <p>This Agreement shall be governed by the laws of the state in which the Organization operates.</p>

  <p style="margin-top: 18px;">By signing below, Owner acknowledges that they have read, understand, and agree to the terms of this Reclaim and Release of Liability Waiver.</p>

  <div class="signature-block">
    <p style="margin: 0 0 6px; font-size: 11px; color: #555;"><strong>Owner Signature</strong></p>
    <img class="signature-img" src="${escapeHtml(safeImageSrc(input.signatureDataUrl))}" alt="Owner signature" />
    <p style="margin: 2px 0; font-size: 11px;"><strong>${safeOwnerName}</strong></p>
    <p style="margin: 2px 0; font-size: 10px; color: #555;">Signed on ${escapeHtml(signedAtPretty)}</p>
  </div>

  <div class="verification">
    <p><strong>Document Verification</strong></p>
    <p>Electronically signed at: ${escapeHtml(signedAtIso)}</p>
    ${safeIp ? `<p>Signer IP address: ${safeIp}</p>` : ''}
    ${safeStaff ? `<p>Processed by staff member: ${safeStaff}</p>` : ''}
    <p>Ownership verification confirmed: ${input.ownershipVerified ? 'Yes' : 'No'}</p>
    <p>This document was electronically signed and is intended as a legally binding record of the return-to-owner transaction.</p>
  </div>
</body>
</html>`;
}

export async function generateReclaimAgreementPdfBuffer(input: ReclaimAgreementPdfInput): Promise<Buffer> {
  const html = renderReclaimAgreementHtml(input);
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}
