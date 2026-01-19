import puppeteer from 'puppeteer';
import { db } from '../db';
import { 
  animals, 
  medicalExams,
  vaccineRecords,
  diagnosticTests,
  procedureLogs,
  medicalBills, 
  medicalPrescriptions, 
  users,
  tenants 
} from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Generate medical history PDF for an animal
 */
export async function generateMedicalHistoryPDF(animalId: string, tenantId: string): Promise<Buffer> {
  // Fetch animal details
  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, animalId))
    .limit(1);

  if (!animal) {
    throw new Error('Animal not found');
  }

  // Fetch tenant details
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  // Fetch medical exams - using correct schema column names
  const exams = await db
    .select({
      id: medicalExams.id,
      examDate: medicalExams.examDate,
      examType: medicalExams.examType,
      veterinarian: medicalExams.performedBy,
      findings: medicalExams.assessment,
      notes: medicalExams.plan,
    })
    .from(medicalExams)
    .where(eq(medicalExams.animalId, animalId));

  // Fetch vaccines - using correct schema column names
  const vaccines = await db
    .select({
      id: vaccineRecords.id,
      vaccineDate: vaccineRecords.dateGiven,
      vaccineName: vaccineRecords.itemName,
      administeredBy: vaccineRecords.administeredBy,
      lotNumber: vaccineRecords.lotNumber,
      nextDueDate: vaccineRecords.dateDue,
    })
    .from(vaccineRecords)
    .where(eq(vaccineRecords.animalId, animalId));

  // Fetch diagnostic tests - using correct schema column names
  const diagnostics = await db
    .select({
      id: diagnosticTests.id,
      testDate: diagnosticTests.testDate,
      testType: diagnosticTests.testName,
      results: diagnosticTests.result,
      performedBy: diagnosticTests.notes,
    })
    .from(diagnosticTests)
    .where(eq(diagnosticTests.animalId, animalId));

  // Fetch procedures - using correct schema column names
  const procedures = await db
    .select({
      id: procedureLogs.id,
      procedureDate: procedureLogs.procedureDate,
      procedureName: procedureLogs.procedureName,
      performedBy: procedureLogs.veterinarian,
      notes: procedureLogs.notes,
    })
    .from(procedureLogs)
    .where(eq(procedureLogs.animalId, animalId));

  // Fetch medical bills - using correct schema column names
  const bills = await db
    .select({
      id: medicalBills.id,
      billDate: medicalBills.billDate,
      vendor: medicalBills.vendor,
      totalAmount: medicalBills.amount,
      category: medicalBills.description,
    })
    .from(medicalBills)
    .where(eq(medicalBills.animalId, animalId))
    .orderBy(medicalBills.billDate);

  // Fetch prescriptions - using correct schema column names
  const prescriptions = await db
    .select({
      id: medicalPrescriptions.id,
      datePrescribed: medicalPrescriptions.startDate,
      medication: medicalPrescriptions.medicationName,
      dosage: medicalPrescriptions.dosage,
      frequency: medicalPrescriptions.frequency,
      duration: medicalPrescriptions.endDate,
      prescribedBy: medicalPrescriptions.notes,
    })
    .from(medicalPrescriptions)
    .where(eq(medicalPrescriptions.animalId, animalId))
    .orderBy(medicalPrescriptions.startDate);

  const html = generateMedicalHistoryHTML({
    organizationName: tenant?.name || 'Animal Rescue Organization',
    organizationEmail: tenant?.resendFromEmail || '',
    organizationPhone: tenant?.contactPhone || '',
    animalName: animal.name,
    animalSpecies: animal.species,
    animalBreed: animal.breed || '',
    animalAge: animal.age || '',
    animalSex: animal.sex || '',
    animalMicrochip: animal.microchipNumber || '',
    animalWeight: animal.weight || '',
    neuterStatus: animal.neuterStatus || 'unknown',
    shotsCurrent: animal.shotsCurrent,
    heartwormPositive: animal.heartwormPositive,
    specialNeeds: animal.specialNeeds,
    medicalAlertMemo: animal.medicalAlertMemo || '',
    dietaryRestrictions: animal.dietaryRestrictions || '',
    exams: exams,
    vaccines: vaccines,
    diagnostics: diagnostics,
    procedures: procedures,
    medicalBills: bills,
    prescriptions: prescriptions,
    generatedDate: new Date().toLocaleDateString(),
  });

  // Generate PDF using Puppeteer
  // Use system-installed Chromium in Nix environment
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
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

  await browser.close();

  return pdfBuffer;
}

/**
 * Generate HTML for medical history
 */
function generateMedicalHistoryHTML(data: {
  organizationName: string;
  organizationEmail: string;
  organizationPhone: string;
  animalName: string;
  animalSpecies: string;
  animalBreed: string;
  animalAge: string;
  animalSex: string;
  animalMicrochip: string;
  animalWeight: string;
  neuterStatus: string;
  shotsCurrent: boolean | null;
  heartwormPositive: boolean | null;
  specialNeeds: boolean | null;
  medicalAlertMemo: string;
  dietaryRestrictions: string;
  exams: Array<{
    id: string;
    examDate: Date;
    examType: string;
    veterinarian: string | null;
    findings: string | null;
    notes: string | null;
  }>;
  vaccines: Array<{
    id: string;
    vaccineDate: Date;
    vaccineName: string;
    administeredBy: string | null;
    lotNumber: string | null;
    nextDueDate: Date | null;
  }>;
  diagnostics: Array<{
    id: string;
    testDate: Date;
    testType: string;
    results: string | null;
    performedBy: string | null;
  }>;
  procedures: Array<{
    id: string;
    procedureDate: Date;
    procedureName: string;
    performedBy: string | null;
    notes: string | null;
  }>;
  medicalBills: Array<{
    id: string;
    billDate: Date;
    vendor: string;
    totalAmount: string;
    category: string;
  }>;
  prescriptions: Array<{
    id: string;
    datePrescribed: Date;
    medication: string;
    dosage: string;
    frequency: string;
    duration: Date | null;
    prescribedBy: string | null;
  }>;
  generatedDate: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medical History - ${data.animalName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
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
      color: #2563eb;
      font-size: 28px;
      margin-bottom: 5px;
    }
    .header p {
      color: #64748b;
      font-size: 14px;
    }
    .animal-info {
      background-color: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid #2563eb;
    }
    .animal-info h2 {
      color: #2563eb;
      margin-bottom: 15px;
      font-size: 20px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .info-item {
      font-size: 14px;
    }
    .info-item strong {
      color: #475569;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h3 {
      color: #2563eb;
      margin-bottom: 15px;
      font-size: 18px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
    }
    .record-card {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 15px;
    }
    .record-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .record-type {
      font-weight: bold;
      color: #2563eb;
    }
    .record-date {
      color: #64748b;
      font-size: 14px;
    }
    .record-content {
      font-size: 14px;
      line-height: 1.6;
    }
    .record-content p {
      margin: 5px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      font-size: 14px;
    }
    table th {
      background-color: #f1f5f9;
      padding: 10px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #e2e8f0;
    }
    table td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .no-records {
      text-align: center;
      padding: 20px;
      color: #64748b;
      font-style: italic;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Complete Medical History</h1>
    <p>${data.organizationName}</p>
    <p style="margin-top: 5px;">Generated: ${data.generatedDate}</p>
  </div>

  <div class="animal-info">
    <h2>${data.animalName}</h2>
    <div class="info-grid">
      <div class="info-item"><strong>Species:</strong> ${data.animalSpecies}</div>
      <div class="info-item"><strong>Breed:</strong> ${data.animalBreed || 'Unknown'}</div>
      <div class="info-item"><strong>Age:</strong> ${data.animalAge || 'Unknown'}</div>
      <div class="info-item"><strong>Sex:</strong> ${data.animalSex || 'Unknown'}</div>
      ${data.animalWeight ? `<div class="info-item"><strong>Weight:</strong> ${data.animalWeight}</div>` : ''}
      ${data.animalMicrochip ? `<div class="info-item"><strong>Microchip:</strong> ${data.animalMicrochip}</div>` : ''}
    </div>
  </div>

  <div class="section">
    <h3>Health Overview</h3>
    <div class="info-grid" style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
      <div class="info-item"><strong>Spay/Neuter Status:</strong> ${data.neuterStatus === 'spayed' ? 'Spayed' : data.neuterStatus === 'neutered' ? 'Neutered' : data.neuterStatus === 'intact' ? 'Intact' : 'Unknown'}</div>
      <div class="info-item"><strong>Vaccinations Current:</strong> ${data.shotsCurrent === true ? 'Yes' : data.shotsCurrent === false ? 'No' : 'Unknown'}</div>
      <div class="info-item"><strong>Heartworm Status:</strong> ${data.heartwormPositive === true ? 'Positive' : data.heartwormPositive === false ? 'Negative' : 'Unknown'}</div>
      <div class="info-item"><strong>Special Needs:</strong> ${data.specialNeeds === true ? 'Yes' : 'No'}</div>
    </div>
    ${data.medicalAlertMemo ? `
    <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 12px; margin-bottom: 15px;">
      <strong style="color: #dc2626;">Medical Alerts:</strong>
      <p style="margin-top: 5px; color: #7f1d1d;">${data.medicalAlertMemo}</p>
    </div>
    ` : ''}
    ${data.dietaryRestrictions ? `
    <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 12px;">
      <strong style="color: #92400e;">Dietary Restrictions:</strong>
      <p style="margin-top: 5px; color: #78350f;">${data.dietaryRestrictions}</p>
    </div>
    ` : ''}
  </div>

  <div class="section">
    <h3>Medical Exams</h3>
    ${data.exams.length === 0 ? `
      <div class="no-records">No medical exams on file</div>
    ` : data.exams.map(exam => `
      <div class="record-card">
        <div class="record-header">
          <span class="record-type">${exam.examType.replace(/_/g, ' ').toUpperCase()}</span>
          <span class="record-date">${new Date(exam.examDate).toLocaleDateString()}</span>
        </div>
        <div class="record-content">
          ${exam.findings ? `<p><strong>Findings:</strong> ${exam.findings}</p>` : ''}
          ${exam.veterinarian ? `<p><strong>Veterinarian:</strong> ${exam.veterinarian}</p>` : ''}
          ${exam.notes ? `<p><strong>Notes:</strong> ${exam.notes}</p>` : ''}
        </div>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h3>Vaccinations</h3>
    ${data.vaccines.length === 0 ? `
      <div class="no-records">No vaccination records on file</div>
    ` : `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Vaccine Name</th>
            <th>Administered By</th>
            <th>Lot Number</th>
            <th>Next Due</th>
          </tr>
        </thead>
        <tbody>
          ${data.vaccines.map(vax => `
            <tr>
              <td>${new Date(vax.vaccineDate).toLocaleDateString()}</td>
              <td>${vax.vaccineName}</td>
              <td>${vax.administeredBy || 'Not specified'}</td>
              <td>${vax.lotNumber || 'N/A'}</td>
              <td>${vax.nextDueDate ? new Date(vax.nextDueDate).toLocaleDateString() : 'N/A'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}
  </div>

  <div class="section">
    <h3>Diagnostic Tests</h3>
    ${data.diagnostics.length === 0 ? `
      <div class="no-records">No diagnostic tests on file</div>
    ` : data.diagnostics.map(diag => `
      <div class="record-card">
        <div class="record-header">
          <span class="record-type">${diag.testType.replace(/_/g, ' ').toUpperCase()}</span>
          <span class="record-date">${new Date(diag.testDate).toLocaleDateString()}</span>
        </div>
        <div class="record-content">
          ${diag.results ? `<p><strong>Results:</strong> ${diag.results}</p>` : ''}
          ${diag.performedBy ? `<p><strong>Performed By:</strong> ${diag.performedBy}</p>` : ''}
        </div>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h3>Procedures</h3>
    ${data.procedures.length === 0 ? `
      <div class="no-records">No procedures on file</div>
    ` : data.procedures.map(proc => `
      <div class="record-card">
        <div class="record-header">
          <span class="record-type">${proc.procedureName.replace(/_/g, ' ').toUpperCase()}</span>
          <span class="record-date">${new Date(proc.procedureDate).toLocaleDateString()}</span>
        </div>
        <div class="record-content">
          ${proc.performedBy ? `<p><strong>Performed By:</strong> ${proc.performedBy}</p>` : ''}
          ${proc.notes ? `<p><strong>Notes:</strong> ${proc.notes}</p>` : ''}
        </div>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h3>Prescriptions</h3>
    ${data.prescriptions.length === 0 ? `
      <div class="no-records">No prescriptions on file</div>
    ` : `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Medication</th>
            <th>Dosage</th>
            <th>Frequency</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${data.prescriptions.map(rx => `
            <tr>
              <td>${new Date(rx.datePrescribed).toLocaleDateString()}</td>
              <td>${rx.medication}</td>
              <td>${rx.dosage}</td>
              <td>${rx.frequency}</td>
              <td>${rx.duration ? 'Until ' + new Date(rx.duration).toLocaleDateString() : 'Ongoing'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}
  </div>

  <div class="section">
    <h3>Medical Bills</h3>
    ${data.medicalBills.length === 0 ? `
      <div class="no-records">No medical bills on file</div>
    ` : `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Vendor</th>
            <th>Category</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.medicalBills.map(bill => `
            <tr>
              <td>${new Date(bill.billDate).toLocaleDateString()}</td>
              <td>${bill.vendor}</td>
              <td>${bill.category.replace(/_/g, ' ')}</td>
              <td style="text-align: right;">$${bill.totalAmount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}
  </div>

  <div class="footer">
    <p><strong>${data.organizationName}</strong></p>
    ${data.organizationEmail ? `<p>${data.organizationEmail}</p>` : ''}
    ${data.organizationPhone ? `<p>${data.organizationPhone}</p>` : ''}
    <p style="margin-top: 10px;">This medical history is provided for informational purposes.</p>
    <p>Please consult with a licensed veterinarian for any medical concerns.</p>
  </div>
</body>
</html>
  `;
}
