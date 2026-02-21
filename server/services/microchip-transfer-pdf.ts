import puppeteer from 'puppeteer';
import { db } from '../db';
import { animals, microchipRecords, applications, tenants } from '@shared/schema';
import { eq, and, or, desc } from 'drizzle-orm';

interface MicrochipTransferData {
  microchipNumber: string;
  manufacturer: string;
  registryName?: string;
  animalName: string;
  animalSpecies: string;
  animalBreed?: string;
  adoptionDate?: Date;
  rescueName: string;
  rescueAddress?: string;
  rescuePhone?: string;
  rescueEmail?: string;
  adopterName: string;
  adopterAddress?: string;
  adopterPhone?: string;
  adopterEmail?: string;
  transferDate: Date;
  transferredBy?: string;
  transferNotes?: string;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function generateTransferConfirmationHtml(data: MicrochipTransferData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          font-size: 12px;
          line-height: 1.5;
          color: #333;
          padding: 40px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #2563eb;
          padding-bottom: 20px;
        }
        .header h1 {
          font-size: 24px;
          color: #1e40af;
          margin-bottom: 5px;
        }
        .header p {
          color: #6b7280;
          font-size: 14px;
        }
        .section {
          margin-bottom: 25px;
        }
        .section-title {
          font-size: 14px;
          font-weight: bold;
          color: #1e40af;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 5px;
          margin-bottom: 10px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        .info-block {
          background: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        .info-block h3 {
          font-size: 12px;
          color: #6b7280;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .info-row {
          margin-bottom: 5px;
        }
        .info-label {
          font-weight: bold;
          color: #374151;
        }
        .microchip-number {
          font-family: 'Courier New', monospace;
          font-size: 18px;
          font-weight: bold;
          color: #1e40af;
          background: #dbeafe;
          padding: 10px 15px;
          border-radius: 6px;
          display: inline-block;
          margin: 10px 0;
        }
        .confirmation-box {
          background: #ecfdf5;
          border: 2px solid #10b981;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          margin: 25px 0;
        }
        .confirmation-box h2 {
          color: #047857;
          font-size: 16px;
          margin-bottom: 5px;
        }
        .signature-section {
          margin-top: 40px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
        }
        .signature-line {
          border-top: 1px solid #374151;
          padding-top: 5px;
          margin-top: 40px;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 10px;
          color: #9ca3af;
          border-top: 1px solid #e5e7eb;
          padding-top: 15px;
        }
        .notes {
          background: #fffbeb;
          border: 1px solid #f59e0b;
          border-radius: 6px;
          padding: 15px;
          margin-top: 15px;
        }
        .notes-title {
          font-weight: bold;
          color: #b45309;
          margin-bottom: 5px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Microchip Registration Transfer Confirmation</h1>
        <p>Official Documentation of Microchip Ownership Transfer</p>
      </div>

      <div class="confirmation-box">
        <h2>Transfer Completed</h2>
        <p>The microchip registration for the animal below has been transferred to the new owner.</p>
      </div>

      <div class="section">
        <div class="section-title">Microchip Information</div>
        <div class="info-block">
          <div class="info-row">
            <span class="info-label">Microchip Number:</span>
            <div class="microchip-number">${data.microchipNumber}</div>
          </div>
          <div class="info-row">
            <span class="info-label">Manufacturer:</span> ${data.manufacturer || 'Unknown'}
          </div>
          ${data.registryName ? `<div class="info-row"><span class="info-label">Registry:</span> ${data.registryName}</div>` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Animal Information</div>
        <div class="info-block">
          <div class="info-row">
            <span class="info-label">Name:</span> ${data.animalName}
          </div>
          <div class="info-row">
            <span class="info-label">Species:</span> ${data.animalSpecies}
          </div>
          ${data.animalBreed ? `<div class="info-row"><span class="info-label">Breed:</span> ${data.animalBreed}</div>` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Transfer Details</div>
        <div class="info-grid">
          <div class="info-block">
            <h3>Previous Registrant (Rescue Organization)</h3>
            <div class="info-row">
              <span class="info-label">Name:</span> ${data.rescueName}
            </div>
            ${data.rescueAddress ? `<div class="info-row"><span class="info-label">Address:</span> ${data.rescueAddress}</div>` : ''}
            ${data.rescuePhone ? `<div class="info-row"><span class="info-label">Phone:</span> ${data.rescuePhone}</div>` : ''}
            ${data.rescueEmail ? `<div class="info-row"><span class="info-label">Email:</span> ${data.rescueEmail}</div>` : ''}
          </div>
          <div class="info-block">
            <h3>New Registrant (Adopter)</h3>
            <div class="info-row">
              <span class="info-label">Name:</span> ${data.adopterName}
            </div>
            ${data.adopterAddress ? `<div class="info-row"><span class="info-label">Address:</span> ${data.adopterAddress}</div>` : ''}
            ${data.adopterPhone ? `<div class="info-row"><span class="info-label">Phone:</span> ${data.adopterPhone}</div>` : ''}
            ${data.adopterEmail ? `<div class="info-row"><span class="info-label">Email:</span> ${data.adopterEmail}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Transfer Date</div>
        <div class="info-block">
          <div class="info-row">
            <span class="info-label">Adoption Date:</span> ${formatDate(data.adoptionDate)}
          </div>
          <div class="info-row">
            <span class="info-label">Transfer Verified:</span> ${formatDate(data.transferDate)}
          </div>
          ${data.transferredBy ? `<div class="info-row"><span class="info-label">Verified By:</span> ${data.transferredBy}</div>` : ''}
        </div>
      </div>

      ${data.transferNotes ? `
      <div class="notes">
        <div class="notes-title">Notes</div>
        <p>${data.transferNotes}</p>
      </div>
      ` : ''}

      <div class="footer">
        <p>This document confirms the microchip registration transfer was completed through the ${data.rescueName} adoption process.</p>
        <p>Generated on ${formatDate(new Date())} | Document ID: MCT-${Date.now().toString(36).toUpperCase()}</p>
      </div>
    </body>
    </html>
  `;
}

export async function generateMicrochipTransferPdf(
  microchipId: string,
  tenantId: string
): Promise<Buffer> {
  const [microchip] = await db
    .select()
    .from(microchipRecords)
    .where(and(
      eq(microchipRecords.id, microchipId),
      eq(microchipRecords.tenantId, tenantId)
    ))
    .limit(1);

  if (!microchip) {
    throw new Error('Microchip record not found');
  }

  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, microchip.animalId))
    .limit(1);

  if (!animal) {
    throw new Error('Animal not found');
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const [application] = await db
    .select()
    .from(applications)
    .where(and(
      eq(applications.animalId, microchip.animalId),
      eq(applications.tenantId, tenantId),
      or(
        eq(applications.stage, 'adopted'),
        eq(applications.stage, 'approved')
      )
    ))
    .orderBy(desc(applications.updatedAt))
    .limit(1);

  const transferData: MicrochipTransferData = {
    microchipNumber: microchip.microchipNumber,
    manufacturer: microchip.manufacturer || 'Unknown',
    registryName: microchip.registryName || undefined,
    animalName: animal.name,
    animalSpecies: animal.species || 'Dog',
    animalBreed: animal.breed || undefined,
    adoptionDate: animal.adoptionDate || undefined,
    rescueName: tenant?.name || 'Rescue Organization',
    rescueAddress: tenant?.address || undefined,
    rescuePhone: tenant?.phone || undefined,
    rescueEmail: tenant?.email || undefined,
    adopterName: application 
      ? `${application.applicantFirstName || ''} ${application.applicantLastName || ''}`.trim() 
      : 'Adopter',
    adopterAddress: application 
      ? [application.applicantAddress, application.applicantCity, application.applicantState, application.applicantZip].filter(Boolean).join(', ')
      : undefined,
    adopterPhone: application?.applicantPhone || undefined,
    adopterEmail: application?.applicantEmail || undefined,
    transferDate: microchip.transferredAt || new Date(),
    transferNotes: microchip.transferNotes || undefined,
  };

  const html = generateTransferConfirmationHtml(transferData);

  // Use system Chromium for Replit environment
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
