import puppeteer from 'puppeteer';
import sharp from 'sharp';
import DOMPurify from 'isomorphic-dompurify';
import { objectStorageClient, signObjectURL } from '../objectStorage';
import { db } from '../db';
import { animals, contacts, applications, tenants, adoptionContractTemplates, adoptionFormFields, type AdoptionCheckoutSession } from '@shared/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { getDefaultTemplate, ensureDefaultTemplate, mergePlaceholders, type MergeData } from './contract-template';

/**
 * Format a date string for display in the contract
 * Handles special values like "not_applicable" and formats dates to a readable format
 */
function formatContractDate(dateValue: string | null | undefined): string {
  if (!dateValue) return '';
  
  // Handle "not_applicable" special value
  if (dateValue === 'not_applicable') {
    return 'Not applicable';
  }
  
  // Try to parse and format the date (YYYY-MM-DD -> readable format)
  try {
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  } catch (e) {
    // If parsing fails, return the original value
  }
  
  return dateValue;
}

function buildCarePriorityMergeFields(carePriorities: any): Partial<MergeData> {
  if (!carePriorities || !carePriorities.enabled) {
    return {
      care_instructions_medical: 'None',
      care_instructions_behavioral: 'None',
      care_instructions_diet: 'None',
      care_instructions_flight_risk: 'None',
      care_instructions_combined: 'No special care instructions.',
    };
  }

  const flags = carePriorities.flags || {};
  const parts: string[] = [];

  const medical = flags.medicalNeeds?.checked ? flags.medicalNeeds.notes : '';
  const behavioral = flags.behavioral?.checked ? flags.behavioral.notes : '';
  const diet = flags.diet?.checked ? flags.diet.notes : '';
  const flightRisk = flags.flightRisk?.checked ? flags.flightRisk.notes : '';

  if (medical) parts.push(`Medical Needs: ${medical}`);
  if (behavioral) parts.push(`Behavioral: ${behavioral}`);
  if (diet) parts.push(`Diet: ${diet}`);
  if (flightRisk) parts.push(`Flight Risk: ${flightRisk}`);

  return {
    care_instructions_medical: medical || 'None',
    care_instructions_behavioral: behavioral || 'None',
    care_instructions_diet: diet || 'None',
    care_instructions_flight_risk: flightRisk || 'None',
    care_instructions_combined: parts.length > 0 ? parts.join('\n') : 'No special care instructions.',
  };
}

/**
 * Download an image from object storage and convert to a base64 data URI
 * so it can be embedded directly in HTML for Puppeteer PDF rendering.
 * Puppeteer uses page.setContent() with no base URL, so relative /objects/... paths
 * cannot be resolved. This converts them to inline data URIs.
 */
async function objectStorageImageToDataUri(objectUrl: string): Promise<string> {
  try {
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      console.error('[contract-pdf] PRIVATE_OBJECT_DIR not configured, cannot resolve image');
      return objectUrl;
    }

    const filename = objectUrl.split('/').pop();
    if (!filename) return objectUrl;

    const folder = objectUrl.includes('/signatures/') ? 'signatures'
      : objectUrl.includes('/drivers-licenses/') ? 'drivers-licenses'
      : null;
    if (!folder) return objectUrl;

    const objectPath = `${privateObjectDir}/${folder}/${filename}`;
    const pathParts = objectPath.split('/');
    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join('/');

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    const [exists] = await file.exists();
    if (!exists) {
      console.error(`[contract-pdf] Image not found in storage: ${objectName}`);
      return objectUrl;
    }

    const [buffer] = await file.download();
    const contentType = folder === 'drivers-licenses' ? 'image/jpeg' : 'image/png';
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('[contract-pdf] Failed to convert image to data URI:', error);
    return objectUrl;
  }
}

/**
 * Convert base64 signature data to PNG and upload to object storage
 * @param signatureBase64 - Base64 encoded signature image (data:image/png;base64,...)
 * @returns Object storage URL for the signature image
 */
export async function processSignatureImage(signatureBase64: string): Promise<string> {
  // Remove data URL prefix if present
  const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Process image with sharp - optimize and convert to PNG
  const processedImage = await sharp(buffer)
    .resize(800, 200, { // Reasonable signature size
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
    })
    .png({ quality: 90 })
    .toBuffer();

  // Upload to object storage
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/signatures/sig_${timestamp}_${randomId}.png`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(processedImage, {
    metadata: {
      contentType: 'image/png',
    },
  });

  // Return public URL
  return `/objects/signatures/${file.name.split('/').pop()}`;
}

/**
 * Process and upload driver's license image
 * @param imageBase64 - Base64 encoded image data
 * @returns Object storage URL for the processed image
 */
export async function processDriversLicenseImage(imageBase64: string): Promise<string> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const processedImage = await sharp(buffer)
    .resize(1200, 800, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/drivers-licenses/dl_${timestamp}_${randomId}.jpg`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(processedImage, {
    metadata: {
      contentType: 'image/jpeg',
    },
  });

  return `/objects/drivers-licenses/${file.name.split('/').pop()}`;
}

/**
 * Upload PDF buffer to object storage
 * @param pdfBuffer - PDF file buffer
 * @returns Object storage URL for the PDF
 */
async function uploadPdfToStorage(pdfBuffer: Buffer | Uint8Array): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

  if (!buffer || buffer.length === 0) {
    throw new Error('Cannot upload empty PDF buffer');
  }

  console.log(`[contract-pdf] Uploading contract PDF (${buffer.length} bytes)`);

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/contracts/contract_${timestamp}_${randomId}.pdf`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(buffer, {
    metadata: {
      contentType: 'application/pdf',
    },
  });

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Contract PDF upload verification failed - file not found after upload: ${objectName}`);
  }

  const filename = file.name.split('/').pop();
  console.log(`[contract-pdf] Contract PDF uploaded successfully: ${filename} (${buffer.length} bytes)`);
  return `/objects/contracts/${filename}`;
}

/**
 * Generate a time-limited signed URL for downloading a contract PDF
 * @param contractPath - The internal path to the contract (e.g., /objects/contracts/filename.pdf)
 * @param ttlSec - Time to live in seconds (default: 900 = 15 minutes)
 * @returns Signed URL for secure download
 */
export async function generateSignedContractUrl(
  contractPath: string, 
  ttlSec: number = 900,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<string> {
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

  try {
    const responseDisposition = disposition === 'attachment'
      ? `attachment; filename="adoption-contract-${filename}"`
      : `inline; filename="adoption-contract-${filename}"`;

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
      responseDisposition,
    });
    return signedUrl;
  } catch (gcsError: any) {
    console.log('[contract-pdf] GCS signing unavailable, using Replit sidecar:', gcsError.message);
    const signedUrl = await signObjectURL({
      bucketName,
      objectName,
      method: 'GET',
      ttlSec,
    });
    return signedUrl;
  }
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
  signatureMetadata?: { ipAddress?: string; signedAt?: Date; driversLicenseNumber?: string }
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
  let adopterFirstName: string = '';
  let adopterLastName: string = '';
  let adopterEmail: string;
  let adopterPhone: string;
  let adopterAddress: string | undefined;
  let adopterStreetAddress: string = '';
  let adopterStreetAddress2: string = '';
  let adopterCity: string = '';
  let adopterState: string = '';
  let adopterZip: string = '';

  // Always fetch the application to get customResponses for address
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, session.applicationId))
    .limit(1);

  // Try to extract address components from application's customResponses
  if (application?.customResponses) {
    const customResponses = application.customResponses as Record<string, any>;
    
    // Find all address-related fields for this tenant
    const addressFields = await db
      .select()
      .from(adoptionFormFields)
      .where(eq(adoptionFormFields.tenantId, session.tenantId));
    
    // Map field labels to their values
    for (const field of addressFields) {
      const fieldLabel = field.label.toLowerCase();
      const fieldValue = customResponses[field.id];
      
      if (!fieldValue || typeof fieldValue !== 'string') continue;
      const value = fieldValue.trim();
      
      // Extract individual address components by field label
      // Use regex patterns to precisely match address line 1 vs line 2
      // Line 2 patterns: "street 2", "address line 2", "address line two", "addr line 2", apt/unit/suite
      const isLine2 = /(?:street|addr(?:ess)?)\s*(?:line)?\s*(?:2|two)|apt(?:artment)?|unit|suite|secondary/i.test(fieldLabel);
      // Line 1 patterns: "street address", "address line 1", "address line", "address" (without 2/two)
      const isLine1 = (/(?:street|addr(?:ess)?)\s*(?:line)?\s*(?:1|one)?$/i.test(fieldLabel) || 
                       fieldLabel.includes('street address') ||
                       fieldLabel === 'address line 1' ||
                       fieldLabel === 'address 1') && !isLine2;
      
      if (isLine2) {
        adopterStreetAddress2 = value;
      } else if (isLine1) {
        adopterStreetAddress = value;
      } else if (fieldLabel.includes('city')) {
        adopterCity = value;
      } else if (fieldLabel.includes('state') || fieldLabel.includes('province')) {
        adopterState = value;
      } else if (fieldLabel.includes('zip') || fieldLabel.includes('postal')) {
        adopterZip = value;
      } else if (fieldLabel === 'address' || fieldLabel === 'full address' || fieldLabel.includes('mailing address')) {
        // Full combined address field
        adopterAddress = value;
      }
    }
    
    // Build combined address if we have components but no full address
    if (!adopterAddress && (adopterStreetAddress || adopterCity || adopterState || adopterZip)) {
      const addressParts = [];
      if (adopterStreetAddress) addressParts.push(adopterStreetAddress);
      if (adopterStreetAddress2) addressParts.push(adopterStreetAddress2);
      if (adopterCity || adopterState || adopterZip) {
        addressParts.push(`${adopterCity}${adopterCity && adopterState ? ', ' : ''}${adopterState} ${adopterZip}`.trim());
      }
      adopterAddress = addressParts.join(', ');
    }
  }

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
      // Contact address takes precedence if available
      if (contact.address) {
        adopterAddress = contact.address;
      }
    } else {
      // Fallback to application
      adopterName = application?.applicantName || 'Unknown';
      adopterEmail = application?.applicantEmail || '';
      adopterPhone = application?.applicantPhone || '';
    }
  } else {
    // Use application data
    adopterName = application?.applicantName || 'Unknown';
    adopterEmail = application?.applicantEmail || '';
    adopterPhone = application?.applicantPhone || '';
  }

  // Split adopter name into first and last name
  if (adopterName && adopterName !== 'Unknown') {
    const nameParts = adopterName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      adopterFirstName = nameParts[0];
      adopterLastName = nameParts.slice(1).join(' ');
    } else {
      adopterFirstName = nameParts[0] || '';
      adopterLastName = '';
    }
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
  const mergeData: MergeData = {
    organization_name: tenant.name,
    adopter_name: adopterName,
    adopter_first_name: adopterFirstName,
    adopter_last_name: adopterLastName,
    adopter_email: adopterEmail,
    adopter_phone: adopterPhone,
    adopter_address: adopterAddress,
    adopter_street_address: adopterStreetAddress,
    adopter_street_address_2: adopterStreetAddress2,
    adopter_city: adopterCity,
    adopter_state: adopterState,
    adopter_zip: adopterZip,
    adopter_drivers_license: signatureMetadata?.driversLicenseNumber || '',
    animal_name: animal.name,
    animal_species: animal.species,
    animal_breed: animal.breed,
    animal_age: animal.age,
    animal_sex: animal.sex || undefined,
    adoption_fee: session.baseFee,
    donation_amount: session.donationBoost || '0',
    total_amount: session.totals?.total || session.baseFee,
    vet_appointment_date: formatContractDate(session.vetAppointmentDate),
    spay_neuter_date: formatContractDate(session.spayNeuterDate),
    rabies_due_date: formatContractDate((session.medicalDueDates as any)?.rabiesDueDate),
    dhpp_due_date: formatContractDate((session.medicalDueDates as any)?.dhppDueDate),
    bordetella_due_date: formatContractDate((session.medicalDueDates as any)?.bordetellaDueDate),
    heartworm_due_date: formatContractDate((session.medicalDueDates as any)?.heartwormDueDate),
    flea_tick_due_date: formatContractDate((session.medicalDueDates as any)?.fleaTickDueDate),
    ...buildCarePriorityMergeFields(session.carePriorities as any),
    contract_date: signedAt.toLocaleDateString(),
    signature_image_url: signatureImageUrl
      ? await objectStorageImageToDataUri(signatureImageUrl)
      : undefined,
    signed_timestamp: signedAt.toISOString(),
    signed_ip: signatureMetadata?.ipAddress || 'Not recorded',
    drivers_license_image_url: session.driversLicenseImageUrl
      ? await objectStorageImageToDataUri(session.driversLicenseImageUrl)
      : undefined,
  };

  // Apply staff-confirmed variable values (overrides auto-filled data for custom fields)
  if (session.staffConfirmValues && typeof session.staffConfirmValues === 'object') {
    for (const [key, value] of Object.entries(session.staffConfirmValues)) {
      (mergeData as any)[key] = value;
    }
  }

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
