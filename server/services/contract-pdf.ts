import puppeteer from 'puppeteer';
import sharp from 'sharp';
import DOMPurify from 'isomorphic-dompurify';
import { objectStorageClient } from '../objectStorage';
import { db } from '../db';
import { animals, contacts, applications, tenants, adoptionContractTemplates, type AdoptionCheckoutSession } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getDefaultTemplate, ensureDefaultTemplate, mergePlaceholders, type MergeData } from './contract-template';

/**
 * Convert base64 signature/image data to PNG and upload to object storage
 * @param imageBase64 - Base64 encoded image (data:image/png;base64,...)
 * @param type - Type of image: 'signature' or 'drivers-license'
 * @returns Object storage URL for the image
 */
export async function processSignatureImage(imageBase64: string, type: 'signature' | 'drivers-license' = 'signature'): Promise<string> {
  // Remove data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Configure resize options based on type
  const resizeOptions = type === 'signature' 
    ? { width: 800, height: 200, fit: 'contain' as const, background: { r: 255, g: 255, b: 255, alpha: 0 } }
    : { width: 1200, height: 800, fit: 'inside' as const }; // Larger for license photos

  // Process image with sharp - optimize and convert to PNG/JPEG
  const processedImage = type === 'signature'
    ? await sharp(buffer)
        .resize(resizeOptions.width, resizeOptions.height, { fit: resizeOptions.fit, background: resizeOptions.background })
        .png({ quality: 90 })
        .toBuffer()
    : await sharp(buffer)
        .resize(resizeOptions.width, resizeOptions.height, { fit: resizeOptions.fit })
        .jpeg({ quality: 85 }) // JPEG for photos to save space
        .toBuffer();

  // Upload to object storage
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const folder = type === 'signature' ? 'signatures' : 'drivers-licenses';
  const prefix = type === 'signature' ? 'sig' : 'dl';
  const ext = type === 'signature' ? 'png' : 'jpg';
  const objectPath = `${privateObjectDir}/${folder}/${prefix}_${timestamp}_${randomId}.${ext}`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(processedImage, {
    metadata: {
      contentType: type === 'signature' ? 'image/png' : 'image/jpeg',
    },
  });

  // Return storage URL
  return `/objects/${folder}/${file.name.split('/').pop()}`;
}

/**
 * Upload PDF buffer to object storage
 * @param pdfBuffer - PDF file buffer
 * @returns Object storage URL for the PDF
 */
async function uploadPdfToStorage(pdfBuffer: Buffer): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/contracts/contract_${timestamp}_${randomId}.pdf`;
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

  // Return public URL
  return `/objects/contracts/${file.name.split('/').pop()}`;
}

/**
 * Generate a time-limited signed URL for downloading a contract PDF
 * Uses Replit's sidecar for URL signing
 * @param contractPath - The internal path to the contract (e.g., /objects/contracts/filename.pdf)
 * @param ttlSec - Time to live in seconds (default: 900 = 15 minutes)
 * @returns Signed URL for secure download
 */
export async function generateSignedContractUrl(contractPath: string, ttlSec: number = 900): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  // Parse the contract path to get bucket and object name
  // contractPath is like /objects/contracts/contract_123_abc.pdf
  const filename = contractPath.split('/').pop();
  if (!filename) {
    throw new Error('Invalid contract path');
  }

  const objectPath = `${privateObjectDir}/contracts/${filename}`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('Contract file not found');
  }

  // Use Replit sidecar to generate signed URL (required in Replit environment)
  const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method: "GET",
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }

  const { signed_url: signedUrl } = await response.json();
  return signedUrl;
}

/**
 * Generate HTML contract template with merged data
 */
function generateContractHTML(data: {
  tenantName: string;
  tenantContactEmail?: string;
  tenantContactPhone?: string;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string;
  adopterAddress?: string;
  animalName: string;
  animalSpecies: string;
  animalBreed: string;
  animalAge: string;
  animalSex?: string;
  animalMicrochip?: string;
  adoptionFee: string;
  donationBoost?: string;
  totalAmount: string;
  signatureImageUrl?: string;
  signedDate: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Adoption Contract</title>
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
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: #1a1a1a;
      font-size: 28px;
      margin-bottom: 10px;
      border-bottom: 3px solid #4F46E5;
      padding-bottom: 10px;
    }
    h2 {
      color: #2d2d2d;
      font-size: 20px;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    h3 {
      color: #4a4a4a;
      font-size: 16px;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    p {
      margin-bottom: 12px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .section {
      margin-bottom: 30px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      margin: 20px 0;
    }
    .info-label {
      font-weight: bold;
      color: #555;
    }
    .info-value {
      color: #333;
    }
    .terms {
      margin: 20px 0;
      padding: 20px;
      background: #f9f9f9;
      border-left: 4px solid #4F46E5;
    }
    .terms ol {
      margin-left: 20px;
    }
    .terms li {
      margin-bottom: 12px;
    }
    .signature-section {
      margin-top: 50px;
      border-top: 2px solid #ddd;
      padding-top: 30px;
    }
    .signature-box {
      margin: 20px 0;
      padding: 20px;
      border: 2px solid #ddd;
      background: white;
    }
    .signature-image {
      max-width: 400px;
      height: auto;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    .signature-line {
      border-top: 2px solid #333;
      width: 400px;
      margin: 30px 0 10px 0;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      font-size: 12px;
      color: #777;
      border-top: 1px solid #ddd;
      padding-top: 20px;
    }
    .fee-breakdown {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin: 15px 0;
    }
    .fee-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
    }
    .fee-total {
      font-weight: bold;
      font-size: 18px;
      border-top: 2px solid #333;
      margin-top: 10px;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Animal Adoption Contract</h1>
    <p><strong>${data.tenantName}</strong></p>
    ${data.tenantContactEmail ? `<p>Email: ${data.tenantContactEmail}</p>` : ''}
    ${data.tenantContactPhone ? `<p>Phone: ${data.tenantContactPhone}</p>` : ''}
  </div>

  <div class="section">
    <h2>Adopter Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">${data.adopterName}</div>
      <div class="info-label">Email:</div>
      <div class="info-value">${data.adopterEmail}</div>
      <div class="info-label">Phone:</div>
      <div class="info-value">${data.adopterPhone}</div>
      ${data.adopterAddress ? `
      <div class="info-label">Address:</div>
      <div class="info-value">${data.adopterAddress}</div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <h2>Animal Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">${data.animalName}</div>
      <div class="info-label">Species:</div>
      <div class="info-value">${data.animalSpecies}</div>
      <div class="info-label">Breed:</div>
      <div class="info-value">${data.animalBreed}</div>
      <div class="info-label">Age:</div>
      <div class="info-value">${data.animalAge}</div>
      ${data.animalSex ? `
      <div class="info-label">Sex:</div>
      <div class="info-value">${data.animalSex}</div>
      ` : ''}
      ${data.animalMicrochip ? `
      <div class="info-label">Microchip:</div>
      <div class="info-value">${data.animalMicrochip}</div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <h2>Adoption Fee</h2>
    <div class="fee-breakdown">
      <div class="fee-row">
        <span>Adoption Fee:</span>
        <span>$${data.adoptionFee}</span>
      </div>
      ${data.donationBoost && parseFloat(data.donationBoost) > 0 ? `
      <div class="fee-row">
        <span>Additional Donation:</span>
        <span>$${data.donationBoost}</span>
      </div>
      ` : ''}
      <div class="fee-row fee-total">
        <span>Total Amount Paid:</span>
        <span>$${data.totalAmount}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Terms and Conditions</h2>
    <div class="terms">
      <p><strong>By signing this contract, the adopter agrees to the following terms:</strong></p>
      <ol>
        <li><strong>Veterinary Care:</strong> The adopter agrees to provide necessary veterinary care, including annual check-ups, vaccinations, and treatment for any illnesses or injuries.</li>
        <li><strong>Living Conditions:</strong> The animal will be kept as an indoor pet and provided with adequate food, water, shelter, exercise, and companionship.</li>
        <li><strong>Spay/Neuter:</strong> If the animal is not already spayed/neutered, the adopter agrees to have this procedure completed within 30 days of adoption.</li>
        <li><strong>Identification:</strong> The adopter agrees to ensure the animal wears identification tags and to update microchip registration with current contact information.</li>
        <li><strong>No Transfer:</strong> The adopter agrees not to sell, give away, or transfer ownership of the animal without written consent from ${data.tenantName}.</li>
        <li><strong>Return Policy:</strong> If the adopter can no longer care for the animal, they agree to contact ${data.tenantName} to arrange for the animal's return.</li>
        <li><strong>Home Visits:</strong> The adopter agrees to allow ${data.tenantName} to conduct follow-up home visits to ensure the animal's welfare.</li>
        <li><strong>Non-Refundable Fee:</strong> The adoption fee is non-refundable and helps cover medical expenses, food, and shelter for animals in our care.</li>
      </ol>
    </div>
  </div>

  <div class="signature-section">
    <h2>Adopter Signature</h2>
    <p>By signing below, I acknowledge that I have read, understand, and agree to abide by all terms and conditions stated in this adoption contract.</p>
    
    <div class="signature-box">
      ${data.signatureImageUrl ? `
        <img src="${data.signatureImageUrl}" alt="Signature" class="signature-image" />
      ` : `
        <div class="signature-line"></div>
      `}
      <p style="margin-top: 10px;"><strong>Name:</strong> ${data.adopterName}</p>
      <p><strong>Date:</strong> ${data.signedDate}</p>
      <p><strong>Email:</strong> ${data.adopterEmail}</p>
    </div>
  </div>

  <div class="footer">
    <p>This is a legal document. Please retain a copy for your records.</p>
    <p>Document generated on ${new Date().toLocaleDateString()}</p>
    <p>${data.tenantName} - Committed to animal welfare</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate adoption contract PDF with session data
 * @param session - Adoption checkout session
 * @param signatureImageUrl - Optional signature image URL (if already uploaded)
 * @param signatureMetadata - Optional metadata for signature verification (IP, timestamp)
 * @returns Object storage URL for the generated PDF
 */
export async function generateAdoptionContractPDF(
  session: AdoptionCheckoutSession,
  signatureImageUrl?: string,
  signatureMetadata?: { ipAddress?: string; signedAt?: Date }
): Promise<string> {
  // Fetch all required data
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const [animal] = await db
    .select()
    .from(animals)
    .where(eq(animals.id, session.animalId))
    .limit(1);

  if (!animal) {
    throw new Error('Animal not found');
  }

  // Get adopter information
  let adopterName: string;
  let adopterEmail: string;
  let adopterPhone: string;
  let adopterAddress: string | undefined;

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
      adopterAddress = contact.address || undefined;
    } else {
      // Fallback to application
      const [application] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, session.applicationId))
        .limit(1);

      adopterName = application?.applicantName || 'Unknown';
      adopterEmail = application?.applicantEmail || '';
      adopterPhone = application?.applicantPhone || '';
    }
  } else {
    // Use application data
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, session.applicationId))
      .limit(1);

    adopterName = application?.applicantName || 'Unknown';
    adopterEmail = application?.applicantEmail || '';
    adopterPhone = application?.applicantPhone || '';
  }

  // Fetch contract template - prefer session's contractTemplateId, fall back to default
  let template;
  
  if (session.contractTemplateId) {
    // Use the specific template selected for this adoption
    const [selectedTemplate] = await db
      .select()
      .from(adoptionContractTemplates)
      .where(eq(adoptionContractTemplates.id, session.contractTemplateId))
      .limit(1);
    template = selectedTemplate;
  }
  
  // Fall back to default template if no specific template selected or not found
  if (!template) {
    template = await getDefaultTemplate(session.tenantId);
  }
  
  if (!template) {
    // Ensure tenant has a default template (creates one if needed)
    template = await ensureDefaultTemplate(session.tenantId, tenant.name);
  }

  if (!template) {
    throw new Error('Unable to load or create contract template');
  }

  // Build merge data object
  const signedAt = signatureMetadata?.signedAt || new Date();
  
  // Extract address components and commitment dates from session metadata
  const metadata = session.metadata as {
    adopterStreetAddress?: string;
    adopterStreetAddress2?: string;
    adopterCity?: string;
    adopterState?: string;
    adopterZip?: string;
    vetAppointmentDate?: string;
    spayNeuterDate?: string;
    waiveFee?: boolean;
  } | null;
  
  // Use individual address fields if available, otherwise fall back to single address
  const streetAddress = metadata?.adopterStreetAddress || '';
  const streetAddress2 = metadata?.adopterStreetAddress2 || '';
  const city = metadata?.adopterCity || '';
  const state = metadata?.adopterState || '';
  const zip = metadata?.adopterZip || '';
  
  // Build legacy full address for backwards compatibility
  const fullAddress = adopterAddress || 
    [streetAddress, streetAddress2, `${city}, ${state} ${zip}`]
      .filter(line => line.trim())
      .join('\n');
  
  // Parse first and last name from full name
  const nameParts = adopterName.trim().split(/\s+/);
  const adopterFirstName = nameParts[0] || '';
  const adopterLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  
  const mergeData: MergeData = {
    organization_name: tenant.name,
    adopter_name: adopterName,
    adopter_first_name: adopterFirstName,
    adopter_last_name: adopterLastName,
    adopter_email: adopterEmail,
    adopter_phone: adopterPhone,
    adopter_address: fullAddress,
    adopter_street_address: streetAddress,
    adopter_street_address_2: streetAddress2,
    adopter_city: city,
    adopter_state: state,
    adopter_zip: zip,
    adopter_drivers_license: session.driversLicenseNumber || undefined,
    animal_name: animal.name,
    animal_species: animal.species,
    animal_breed: animal.breed,
    animal_age: animal.age,
    animal_sex: animal.sex || undefined,
    adoption_fee: session.baseFee,
    donation_amount: session.donationBoost || '0',
    total_amount: session.totals?.total || session.baseFee,
    contract_date: signedAt.toLocaleDateString(),
    signature_image_url: signatureImageUrl,
    signed_timestamp: signedAt.toISOString(),
    signed_ip: signatureMetadata?.ipAddress || 'Not recorded',
    vet_appointment_date: metadata?.vetAppointmentDate || '_________________',
    spay_neuter_date: metadata?.spayNeuterDate || '_________________',
  };

  // Merge placeholders with actual data
  const mergedHtml = mergePlaceholders(template.htmlTemplate, mergeData);

  // Final sanitization as defense-in-depth
  // This catches any potential XSS that might have slipped through
  const safeHtml = DOMPurify.sanitize(mergedHtml, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
    ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });

  // Launch Puppeteer and generate PDF
  // Use system-installed Chromium in Nix environment
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(safeHtml, {
      waitUntil: 'networkidle0',
    });

    // Generate PDF buffer
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

    // Upload to object storage
    const pdfUrl = await uploadPdfToStorage(pdfBuffer);

    return pdfUrl;
  } finally {
    await browser.close();
  }
}
