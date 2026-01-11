import puppeteer from 'puppeteer';
import { db } from '../db';
import { 
  adoptionPayments, 
  adoptionCheckoutSessions, 
  animals, 
  contacts, 
  applications, 
  tenants 
} from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Generate payment receipt PDF from adoption payment record
 */
export async function generatePaymentReceiptPDF(sessionId: string): Promise<Buffer> {
  // Fetch payment record
  const [payment] = await db
    .select()
    .from(adoptionPayments)
    .where(eq(adoptionPayments.sessionId, sessionId))
    .limit(1);

  if (!payment) {
    throw new Error('Payment record not found');
  }

  // Fetch session details
  const [session] = await db
    .select()
    .from(adoptionCheckoutSessions)
    .where(eq(adoptionCheckoutSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Adoption session not found');
  }

  // Fetch animal details
  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, session.animalId))
    .limit(1);

  // Fetch adopter details
  let adopterName = '';
  let adopterEmail = '';
  let adopterPhone = '';
  let adopterAddress = '';

  if (session.adopterContactId) {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, session.adopterContactId))
      .limit(1);

    if (contact) {
      adopterName = contact.name;
      adopterEmail = contact.email;
      adopterPhone = contact.phone || '';
      adopterAddress = contact.address || '';
    }
  }

  if (!adopterName) {
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, session.applicationId))
      .limit(1);

    if (application) {
      adopterName = application.applicantName;
      adopterEmail = application.applicantEmail;
      adopterPhone = application.applicantPhone || '';
    }
  }

  // Fetch tenant details
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  const breakdown = payment.amountBreakdown as { baseFee: string; donationBoost: string; processingFee: string; total: string };
  
  const html = generateReceiptHTML({
    receiptNumber: payment.id.toString(),
    paymentDate: payment.createdAt.toLocaleDateString(),
    organizationName: tenant?.name || 'Animal Rescue Organization',
    organizationEmail: tenant?.resendFromEmail || '',
    organizationPhone: tenant?.contactPhone || '',
    adopterName,
    adopterEmail,
    adopterPhone,
    adopterAddress,
    animalName: animal?.name || 'Animal',
    animalSpecies: animal?.species || '',
    animalBreed: animal?.breed || '',
    adoptionFee: breakdown.baseFee,
    donationBoost: breakdown.donationBoost || '0.00',
    processingFee: breakdown.processingFee || '0.00',
    totalAmount: breakdown.total,
    processor: payment.processor,
    chargeId: payment.chargeId || '',
  });

  // Generate PDF using Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
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
 * Generate HTML for payment receipt
 */
function generateReceiptHTML(data: {
  receiptNumber: string;
  paymentDate: string;
  organizationName: string;
  organizationEmail: string;
  organizationPhone: string;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string;
  adopterAddress: string;
  animalName: string;
  animalSpecies: string;
  animalBreed: string;
  adoptionFee: string;
  donationBoost: string;
  processingFee: string;
  totalAmount: string;
  processor: string;
  chargeId: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Adoption Payment Receipt</title>
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
      margin-bottom: 40px;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #2563eb;
      font-size: 32px;
      margin-bottom: 10px;
    }
    .receipt-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
      padding: 20px;
      background-color: #f8fafc;
      border-radius: 8px;
    }
    .info-section {
      flex: 1;
    }
    .info-section h3 {
      color: #2563eb;
      margin-bottom: 10px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-section p {
      margin: 5px 0;
      font-size: 14px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 30px;
      margin-bottom: 30px;
    }
    .items-table th {
      background-color: #2563eb;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    .items-table td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .items-table tr:last-child td {
      border-bottom: none;
    }
    .total-row {
      background-color: #f1f5f9;
      font-weight: bold;
      font-size: 16px;
    }
    .total-row td {
      padding: 15px 12px;
      border-top: 2px solid #2563eb;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
    .thank-you {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
      background-color: #f0fdf4;
      border-left: 4px solid #10b981;
      border-radius: 4px;
    }
    .thank-you h2 {
      color: #10b981;
      margin-bottom: 10px;
    }
    .thank-you p {
      color: #166534;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Payment Receipt</h1>
    <p style="color: #64748b; font-size: 14px;">${data.organizationName}</p>
  </div>

  <div class="receipt-info">
    <div class="info-section">
      <h3>Receipt Information</h3>
      <p><strong>Receipt #:</strong> ${data.receiptNumber}</p>
      <p><strong>Date:</strong> ${data.paymentDate}</p>
      <p><strong>Payment Method:</strong> ${data.processor.charAt(0).toUpperCase() + data.processor.slice(1)}</p>
      ${data.chargeId ? `<p><strong>Transaction ID:</strong> ${data.chargeId}</p>` : ''}
    </div>
    
    <div class="info-section">
      <h3>Organization Details</h3>
      <p>${data.organizationName}</p>
      ${data.organizationEmail ? `<p>${data.organizationEmail}</p>` : ''}
      ${data.organizationPhone ? `<p>${data.organizationPhone}</p>` : ''}
    </div>
    
    <div class="info-section">
      <h3>Adopter Information</h3>
      <p><strong>${data.adopterName}</strong></p>
      <p>${data.adopterEmail}</p>
      ${data.adopterPhone ? `<p>${data.adopterPhone}</p>` : ''}
      ${data.adopterAddress ? `<p>${data.adopterAddress}</p>` : ''}
    </div>
  </div>

  <h3 style="color: #2563eb; margin-bottom: 15px;">Adoption Details</h3>
  <p style="margin-bottom: 20px;">
    <strong>Animal:</strong> ${data.animalName} (${data.animalSpecies}${data.animalBreed ? ', ' + data.animalBreed : ''})
  </p>

  <table class="items-table">
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Adoption Fee</td>
        <td style="text-align: right;">$${data.adoptionFee}</td>
      </tr>
      ${parseFloat(data.donationBoost) > 0 ? `
      <tr>
        <td>Additional Donation</td>
        <td style="text-align: right;">$${data.donationBoost}</td>
      </tr>
      ` : ''}
      ${parseFloat(data.processingFee) > 0 ? `
      <tr>
        <td>Processing Fee</td>
        <td style="text-align: right;">$${data.processingFee}</td>
      </tr>
      ` : ''}
      <tr class="total-row">
        <td>TOTAL PAID</td>
        <td style="text-align: right;">$${data.totalAmount}</td>
      </tr>
    </tbody>
  </table>

  <div class="thank-you">
    <h2>Thank You for Adopting!</h2>
    <p>Your adoption fee helps us continue our mission to rescue and care for animals in need.</p>
    <p>We're grateful for your compassion and generosity.</p>
  </div>

  <div class="footer">
    <p>This receipt was generated electronically and is valid without a signature.</p>
    <p>For questions about this receipt, please contact ${data.organizationEmail || data.organizationName}</p>
  </div>
</body>
</html>
  `;
}
