import puppeteer from 'puppeteer';
import { db } from '../db';
import {
  animals,
  vaccineRecords,
  preventativeCareRecords,
  microchipRecords,
  tenants,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { formatAnimalSex } from '@shared/animal-sex';

export async function generateAdoptionPacketPDF(animalId: string, tenantId: string): Promise<Buffer> {
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.tenantId, tenantId)))
    .limit(1);

  if (!animal) {
    throw new Error('Animal not found');
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const vaccines = await db
    .select({
      id: vaccineRecords.id,
      dateGiven: vaccineRecords.dateGiven,
      itemName: vaccineRecords.itemName,
      manufacturer: vaccineRecords.manufacturer,
      lotNumber: vaccineRecords.lotNumber,
      dateDue: vaccineRecords.dateDue,
      validDurationMonths: vaccineRecords.validDurationMonths,
      administeredBy: vaccineRecords.administeredBy,
      clinicName: vaccineRecords.clinicName,
    })
    .from(vaccineRecords)
    .where(and(eq(vaccineRecords.animalId, animalId), eq(vaccineRecords.tenantId, tenantId)))
    .orderBy(desc(vaccineRecords.dateGiven));

  const preventativeCare = await db
    .select({
      id: preventativeCareRecords.id,
      careName: preventativeCareRecords.careName,
      careCategory: preventativeCareRecords.careCategory,
      dateAdministered: preventativeCareRecords.dateAdministered,
      manufacturer: preventativeCareRecords.manufacturer,
      lotNumber: preventativeCareRecords.lotNumber,
      nextDueDate: preventativeCareRecords.nextDueDate,
      administeredBy: preventativeCareRecords.administeredBy,
      clinicName: preventativeCareRecords.clinicName,
    })
    .from(preventativeCareRecords)
    .where(
      and(
        eq(preventativeCareRecords.animalId, animalId),
        eq(preventativeCareRecords.tenantId, tenantId),
        eq(preventativeCareRecords.status, 'given')
      )
    )
    .orderBy(desc(preventativeCareRecords.dateAdministered));

  const microchips = await db
    .select({
      id: microchipRecords.id,
      microchipNumber: microchipRecords.microchipNumber,
      manufacturer: microchipRecords.manufacturer,
      implantDate: microchipRecords.implantDate,
    })
    .from(microchipRecords)
    .where(and(eq(microchipRecords.animalId, animalId), eq(microchipRecords.tenantId, tenantId)));

  const html = generateAdoptionPacketHTML({
    organizationName: tenant?.name || 'Animal Rescue Organization',
    organizationLogo: tenant?.logoUrl || null,
    organizationEmail: tenant?.resendFromEmail || '',
    organizationPhone: tenant?.contactPhone || '',
    animalName: animal.name,
    animalSpecies: animal.species,
    animalBreed: animal.breed || '',
    animalAge: animal.age || '',
    animalSex: formatAnimalSex(animal),
    animalDOB: animal.dateOfBirth ? new Date(animal.dateOfBirth).toLocaleDateString() : '',
    animalColor: animal.color || '',
    microchipId: animal.microchipId || '',
    microchips,
    vaccines,
    preventativeCare,
    generatedDate: new Date().toLocaleDateString(),
  });

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '15px',
      right: '15px',
      bottom: '15px',
      left: '15px',
    },
  });

  await browser.close();

  return pdfBuffer;
}

function calculateExpirationDate(dateGiven: Date, validDurationMonths: number | null, dateDue: Date | null): string {
  if (dateDue) {
    return new Date(dateDue).toLocaleDateString();
  }
  if (validDurationMonths && dateGiven) {
    const expDate = new Date(dateGiven);
    expDate.setMonth(expDate.getMonth() + validDurationMonths);
    return expDate.toLocaleDateString();
  }
  return 'N/A';
}

function generateAdoptionPacketHTML(data: {
  organizationName: string;
  organizationLogo: string | null;
  organizationEmail: string;
  organizationPhone: string;
  animalName: string;
  animalSpecies: string;
  animalBreed: string;
  animalAge: string;
  animalSex: string;
  animalDOB: string;
  animalColor: string;
  microchipId: string;
  microchips: Array<{
    id: string;
    microchipNumber: string;
    manufacturer: string;
    implantDate: string | null;
  }>;
  vaccines: Array<{
    id: string;
    dateGiven: Date;
    itemName: string;
    manufacturer: string | null;
    lotNumber: string | null;
    dateDue: Date | null;
    validDurationMonths: number | null;
    administeredBy: string | null;
    clinicName: string | null;
  }>;
  preventativeCare: Array<{
    id: string;
    careName: string;
    careCategory: string;
    dateAdministered: Date;
    manufacturer: string | null;
    lotNumber: string | null;
    nextDueDate: Date | null;
    administeredBy: string | null;
    clinicName: string | null;
  }>;
  generatedDate: string;
}): string {
  const microchipDisplay = data.microchips.length > 0
    ? data.microchips.map(mc => `${mc.microchipNumber} (${mc.manufacturer})`).join(', ')
    : data.microchipId || 'Not microchipped';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vaccination Record - ${data.animalName}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Arial', 'Helvetica Neue', sans-serif;
      line-height: 1.5;
      color: #1e293b;
      padding: 32px;
      font-size: 13px;
    }
    .certificate-border {
      border: 3px solid #16a34a;
      border-radius: 8px;
      padding: 28px;
      min-height: calc(100vh - 64px);
      position: relative;
    }
    .certificate-border::before {
      content: '';
      position: absolute;
      top: 4px;
      left: 4px;
      right: 4px;
      bottom: 4px;
      border: 1px solid #bbf7d0;
      border-radius: 5px;
      pointer-events: none;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 2px solid #16a34a;
    }
    .header-logo {
      max-height: 60px;
      max-width: 200px;
      margin-bottom: 8px;
    }
    .header h1 {
      color: #16a34a;
      font-size: 22px;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .header .org-name {
      font-size: 16px;
      color: #334155;
      font-weight: 600;
    }
    .header .org-contact {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
    .animal-info {
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
      padding: 16px 20px;
      border-radius: 6px;
      margin-bottom: 20px;
      border: 1px solid #bbf7d0;
    }
    .animal-info h2 {
      color: #16a34a;
      font-size: 18px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px 16px;
    }
    .info-item {
      font-size: 12px;
    }
    .info-item strong {
      color: #334155;
      font-weight: 600;
    }
    .info-item span {
      color: #475569;
    }
    .section {
      margin-bottom: 18px;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #dcfce7;
    }
    .section-header h3 {
      color: #15803d;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .section-icon {
      width: 20px;
      height: 20px;
      background-color: #16a34a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 11px;
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    table th {
      background-color: #15803d;
      color: white;
      padding: 7px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table th:first-child {
      border-radius: 4px 0 0 0;
    }
    table th:last-child {
      border-radius: 0 4px 0 0;
    }
    table td {
      padding: 6px 8px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }
    table tr:nth-child(even) {
      background-color: #f8fafc;
    }
    table tr:last-child td {
      border-bottom: none;
    }
    .no-records {
      text-align: center;
      padding: 16px;
      color: #94a3b8;
      font-style: italic;
      font-size: 12px;
      background-color: #f8fafc;
      border-radius: 4px;
    }
    .microchip-section {
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 18px;
    }
    .microchip-section h3 {
      color: #1d4ed8;
      font-size: 13px;
      margin-bottom: 6px;
      font-weight: 700;
    }
    .microchip-details {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 12px;
    }
    .microchip-item {
      display: flex;
      gap: 4px;
    }
    .microchip-item strong {
      color: #1e40af;
    }
    .footer {
      margin-top: 20px;
      padding-top: 14px;
      border-top: 2px solid #16a34a;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .footer-left {
      font-size: 11px;
      color: #64748b;
    }
    .footer-left p {
      margin: 1px 0;
    }
    .footer-right {
      text-align: right;
      font-size: 10px;
      color: #94a3b8;
    }
    .seal {
      width: 60px;
      height: 60px;
      border: 2px solid #16a34a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 8px;
      color: #16a34a;
      font-weight: bold;
      line-height: 1.2;
      margin-left: auto;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="certificate-border">
    <div class="header">
      ${data.organizationLogo ? `<img src="${data.organizationLogo}" class="header-logo" alt="Organization Logo" />` : ''}
      <h1>Official Medical &amp; Vaccination Record</h1>
      <div class="org-name">${data.organizationName}</div>
      <div class="org-contact">
        ${[data.organizationPhone, data.organizationEmail].filter(Boolean).join(' &bull; ')}
      </div>
    </div>

    <div class="animal-info">
      <h2>${data.animalName}</h2>
      <div class="info-grid">
        <div class="info-item"><strong>Species:</strong> <span>${data.animalSpecies || 'Unknown'}</span></div>
        <div class="info-item"><strong>Breed:</strong> <span>${data.animalBreed || 'Unknown'}</span></div>
        <div class="info-item"><strong>Sex:</strong> <span>${data.animalSex || 'Unknown'}</span></div>
        <div class="info-item"><strong>Date of Birth:</strong> <span>${data.animalDOB || 'Unknown'}</span></div>
        <div class="info-item"><strong>Age:</strong> <span>${data.animalAge || 'Unknown'}</span></div>
        ${data.animalColor ? `<div class="info-item"><strong>Color:</strong> <span>${data.animalColor}</span></div>` : ''}
      </div>
    </div>

    ${data.microchips.length > 0 || data.microchipId ? `
    <div class="microchip-section">
      <h3>Microchip Information</h3>
      <div class="microchip-details">
        ${data.microchips.length > 0 ? data.microchips.map(mc => `
          <div class="microchip-item"><strong>Number:</strong> ${mc.microchipNumber}</div>
          <div class="microchip-item"><strong>Brand:</strong> ${mc.manufacturer}</div>
          ${mc.implantDate ? `<div class="microchip-item"><strong>Implanted:</strong> ${new Date(mc.implantDate).toLocaleDateString()}</div>` : ''}
        `).join('') : `
          <div class="microchip-item"><strong>Number:</strong> ${data.microchipId}</div>
        `}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-header">
        <div class="section-icon">V</div>
        <h3>Vaccination History</h3>
      </div>
      ${data.vaccines.length === 0 ? `
        <div class="no-records">No vaccination records on file</div>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Date Given</th>
              <th>Vaccine Name</th>
              <th>Manufacturer</th>
              <th>Lot Number</th>
              <th>Expiration Date</th>
              <th>Administered By</th>
            </tr>
          </thead>
          <tbody>
            ${data.vaccines.map(vax => `
              <tr>
                <td>${new Date(vax.dateGiven).toLocaleDateString()}</td>
                <td><strong>${vax.itemName}</strong></td>
                <td>${vax.manufacturer || '—'}</td>
                <td>${vax.lotNumber || '—'}</td>
                <td>${calculateExpirationDate(vax.dateGiven, vax.validDurationMonths, vax.dateDue)}</td>
                <td>${vax.administeredBy || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    <div class="section">
      <div class="section-header">
        <div class="section-icon">P</div>
        <h3>Preventative Care</h3>
      </div>
      ${data.preventativeCare.length === 0 ? `
        <div class="no-records">No preventative care records on file</div>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Date Given</th>
              <th>Product Name</th>
              <th>Manufacturer</th>
              <th>Lot Number</th>
              <th>Next Due Date</th>
              <th>Administered By</th>
            </tr>
          </thead>
          <tbody>
            ${data.preventativeCare.map(pc => `
              <tr>
                <td>${new Date(pc.dateAdministered).toLocaleDateString()}</td>
                <td><strong>${pc.careName}</strong></td>
                <td>${pc.manufacturer || '—'}</td>
                <td>${pc.lotNumber || '—'}</td>
                <td>${pc.nextDueDate ? new Date(pc.nextDueDate).toLocaleDateString() : '—'}</td>
                <td>${pc.administeredBy || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    <div class="footer">
      <div class="footer-left">
        <p><strong>${data.organizationName}</strong></p>
        ${data.organizationEmail ? `<p>${data.organizationEmail}</p>` : ''}
        ${data.organizationPhone ? `<p>${data.organizationPhone}</p>` : ''}
        <p style="margin-top: 6px; font-size: 10px;">This document certifies the vaccination and preventative care history of the above-named animal as recorded by ${data.organizationName}. Please present this record to your veterinarian.</p>
      </div>
      <div class="footer-right">
        <div class="seal">OFFICIAL<br>RECORD</div>
        <p>Generated: ${data.generatedDate}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
