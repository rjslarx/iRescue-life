import puppeteer from 'puppeteer';
import DOMPurify from 'isomorphic-dompurify';
import { objectStorageClient } from '../objectStorage';
import { db } from '../db';
import { 
  applications, 
  fosterApplications, 
  volunteerApplications, 
  surrenderRequests,
  animals,
  tenants
} from '@shared/schema';
import { eq } from 'drizzle-orm';

type ApplicationType = 'adoption' | 'foster' | 'volunteer' | 'surrender';

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
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
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

async function uploadApplicationPdfToStorage(pdfBuffer: Buffer, applicationType: ApplicationType, applicationId: string): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/applications/${applicationType}/${applicationType}_app_${applicationId}_${timestamp}_${randomId}.pdf`;
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

  return `/objects/applications/${applicationType}/${file.name.split('/').pop()}`;
}

export async function generateSignedApplicationUrl(
  applicationPath: string, 
  ttlSec: number = 900,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const pathParts = applicationPath.split('/');
  const filename = pathParts.pop();
  const applicationType = pathParts.pop();
  
  if (!filename || !applicationType) {
    throw new Error('Invalid application path');
  }

  const objectPath = `${privateObjectDir}/applications/${applicationType}/${filename}`;
  const objectPathParts = objectPath.split('/');
  const bucketName = objectPathParts[1];
  const objectName = objectPathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('Application PDF file not found');
  }

  // Try GCS signed URL first (supports responseDisposition), fall back to Replit sidecar
  try {
    const responseDisposition = disposition === 'attachment'
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`;

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
      responseDisposition,
    });
    return signedUrl;
  } catch (gcsError: any) {
    // GCS signing failed (likely missing credentials), use Replit sidecar
    // Note: Replit sidecar doesn't support responseDisposition
    console.log('[application-pdf] GCS signing unavailable, using Replit sidecar:', gcsError.message);
    const signedUrl = await signObjectURL({
      bucketName,
      objectName,
      method: 'GET',
      ttlSec,
    });
    return signedUrl;
  }
}

function formatDate(date: Date | string | null): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCustomResponses(responses: Record<string, any> | null | undefined): string {
  if (!responses || Object.keys(responses).length === 0) {
    return '';
  }
  
  let html = '<div class="section"><h2>Additional Information</h2><div class="info-grid">';
  for (const [key, value] of Object.entries(responses)) {
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const formattedValue = Array.isArray(value) ? value.join(', ') : String(value || 'N/A');
    html += `<div class="info-label">${formattedKey}:</div><div class="info-value">${formattedValue}</div>`;
  }
  html += '</div></div>';
  return html;
}

function getBaseStyles(): string {
  return `
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
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .section {
      margin-bottom: 30px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 180px 1fr;
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
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .status-new { background: #E0F2FE; color: #0369A1; }
    .status-pending { background: #FEF3C7; color: #92400E; }
    .status-approved { background: #D1FAE5; color: #065F46; }
    .status-rejected { background: #FEE2E2; color: #991B1B; }
    .status-denied { background: #FEE2E2; color: #991B1B; }
    .notes-section {
      margin: 20px 0;
      padding: 20px;
      background: #f9f9f9;
      border-left: 4px solid #4F46E5;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      font-size: 12px;
      color: #777;
      border-top: 1px solid #ddd;
      padding-top: 20px;
    }
  `;
}

function generateAdoptionApplicationHTML(data: {
  tenantName: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  animalName: string;
  stage: string;
  notes: string | null;
  customResponses: Record<string, any> | null;
  smsConsent: boolean;
  createdAt: string;
}): string {
  const stageClass = ['approved', 'adopted'].includes(data.stage) ? 'status-approved' : 
                     ['denied', 'trial_failed'].includes(data.stage) ? 'status-denied' : 'status-pending';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Adoption Application</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <h1>Adoption Application</h1>
    <p><strong>${data.tenantName}</strong></p>
    <p style="margin-top: 10px;">
      <span class="${stageClass} status-badge">${data.stage.replace(/_/g, ' ')}</span>
    </p>
  </div>

  <div class="section">
    <h2>Applicant Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">${data.applicantName}</div>
      <div class="info-label">Email:</div>
      <div class="info-value">${data.applicantEmail}</div>
      <div class="info-label">Phone:</div>
      <div class="info-value">${data.applicantPhone}</div>
      <div class="info-label">SMS Consent:</div>
      <div class="info-value">${data.smsConsent ? 'Yes' : 'No'}</div>
    </div>
  </div>

  <div class="section">
    <h2>Animal Information</h2>
    <div class="info-grid">
      <div class="info-label">Animal Name:</div>
      <div class="info-value">${data.animalName}</div>
    </div>
  </div>

  ${formatCustomResponses(data.customResponses)}

  ${data.notes ? `
  <div class="section">
    <h2>Staff Notes</h2>
    <div class="notes-section">
      <p>${data.notes}</p>
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p>Application submitted on ${data.createdAt}</p>
    <p>Document generated on ${formatDate(new Date())}</p>
    <p>${data.tenantName}</p>
  </div>
</body>
</html>`;
}

function generateFosterApplicationHTML(data: {
  tenantName: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  address: string;
  housingType: string;
  hasYard: boolean;
  hasOtherPets: boolean;
  otherPetsDetails: string | null;
  experience: string;
  availability: string;
  preferences: string | null;
  vetReference: string | null;
  personalReference: string | null;
  status: string;
  pipelineStatus: string;
  notes: string | null;
  customResponses: Record<string, any> | null;
  smsConsent: boolean;
  createdAt: string;
}): string {
  const statusClass = data.status === 'approved' ? 'status-approved' : 
                      data.status === 'rejected' ? 'status-rejected' : 'status-pending';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Foster Application</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <h1>Foster Application</h1>
    <p><strong>${data.tenantName}</strong></p>
    <p style="margin-top: 10px;">
      <span class="${statusClass} status-badge">${data.status}</span>
      <span class="status-badge status-pending" style="margin-left: 8px;">${data.pipelineStatus.replace(/_/g, ' ')}</span>
    </p>
  </div>

  <div class="section">
    <h2>Applicant Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">${data.applicantName}</div>
      <div class="info-label">Email:</div>
      <div class="info-value">${data.applicantEmail}</div>
      <div class="info-label">Phone:</div>
      <div class="info-value">${data.applicantPhone}</div>
      <div class="info-label">Address:</div>
      <div class="info-value">${data.address}</div>
      <div class="info-label">SMS Consent:</div>
      <div class="info-value">${data.smsConsent ? 'Yes' : 'No'}</div>
    </div>
  </div>

  <div class="section">
    <h2>Living Situation</h2>
    <div class="info-grid">
      <div class="info-label">Housing Type:</div>
      <div class="info-value">${data.housingType}</div>
      <div class="info-label">Has Yard:</div>
      <div class="info-value">${data.hasYard ? 'Yes' : 'No'}</div>
      <div class="info-label">Has Other Pets:</div>
      <div class="info-value">${data.hasOtherPets ? 'Yes' : 'No'}</div>
      ${data.otherPetsDetails ? `
      <div class="info-label">Other Pets Details:</div>
      <div class="info-value">${data.otherPetsDetails}</div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <h2>Experience & Availability</h2>
    <div class="info-grid">
      <div class="info-label">Experience:</div>
      <div class="info-value">${data.experience}</div>
      <div class="info-label">Availability:</div>
      <div class="info-value">${data.availability}</div>
      ${data.preferences ? `
      <div class="info-label">Preferences:</div>
      <div class="info-value">${data.preferences}</div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <h2>References</h2>
    <div class="info-grid">
      <div class="info-label">Vet Reference:</div>
      <div class="info-value">${data.vetReference || 'Not provided'}</div>
      <div class="info-label">Personal Reference:</div>
      <div class="info-value">${data.personalReference || 'Not provided'}</div>
    </div>
  </div>

  ${formatCustomResponses(data.customResponses)}

  ${data.notes ? `
  <div class="section">
    <h2>Staff Notes</h2>
    <div class="notes-section">
      <p>${data.notes}</p>
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p>Application submitted on ${data.createdAt}</p>
    <p>Document generated on ${formatDate(new Date())}</p>
    <p>${data.tenantName}</p>
  </div>
</body>
</html>`;
}

function generateVolunteerApplicationHTML(data: {
  tenantName: string;
  name: string;
  email: string;
  phone: string;
  address: string | null;
  experience: string;
  availability: string;
  interests: string | null;
  skills: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  status: string;
  pipelineStatus: string;
  notes: string | null;
  customResponses: Record<string, any> | null;
  smsConsent: boolean;
  createdAt: string;
}): string {
  const statusClass = data.status === 'approved' ? 'status-approved' : 
                      data.status === 'rejected' ? 'status-rejected' : 'status-pending';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Volunteer Application</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <h1>Volunteer Application</h1>
    <p><strong>${data.tenantName}</strong></p>
    <p style="margin-top: 10px;">
      <span class="${statusClass} status-badge">${data.status}</span>
      <span class="status-badge status-pending" style="margin-left: 8px;">${data.pipelineStatus.replace(/_/g, ' ')}</span>
    </p>
  </div>

  <div class="section">
    <h2>Applicant Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">${data.name}</div>
      <div class="info-label">Email:</div>
      <div class="info-value">${data.email}</div>
      <div class="info-label">Phone:</div>
      <div class="info-value">${data.phone}</div>
      ${data.address ? `
      <div class="info-label">Address:</div>
      <div class="info-value">${data.address}</div>
      ` : ''}
      <div class="info-label">SMS Consent:</div>
      <div class="info-value">${data.smsConsent ? 'Yes' : 'No'}</div>
    </div>
  </div>

  <div class="section">
    <h2>Experience & Availability</h2>
    <div class="info-grid">
      <div class="info-label">Experience:</div>
      <div class="info-value">${data.experience}</div>
      <div class="info-label">Availability:</div>
      <div class="info-value">${data.availability}</div>
      ${data.interests ? `
      <div class="info-label">Interests:</div>
      <div class="info-value">${data.interests}</div>
      ` : ''}
      ${data.skills ? `
      <div class="info-label">Skills:</div>
      <div class="info-value">${data.skills}</div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <h2>Emergency Contact</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">${data.emergencyContactName || 'Not provided'}</div>
      <div class="info-label">Phone:</div>
      <div class="info-value">${data.emergencyContactPhone || 'Not provided'}</div>
    </div>
  </div>

  ${formatCustomResponses(data.customResponses)}

  ${data.notes ? `
  <div class="section">
    <h2>Staff Notes</h2>
    <div class="notes-section">
      <p>${data.notes}</p>
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p>Application submitted on ${data.createdAt}</p>
    <p>Document generated on ${formatDate(new Date())}</p>
    <p>${data.tenantName}</p>
  </div>
</body>
</html>`;
}

function generateSurrenderApplicationHTML(data: {
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  dogName: string;
  dogBreed: string;
  dogAge: string;
  dogGender: string;
  dogWeight: string | null;
  spayedNeutered: boolean | null;
  microchipped: boolean | null;
  microchipNumber: string | null;
  goodWithKids: string | null;
  goodWithDogs: string | null;
  goodWithCats: string | null;
  reasonForSurrender: string;
  medicalIssues: string | null;
  behavioralIssues: string | null;
  preferredSurrenderDate: string | null;
  status: string;
  notes: string | null;
  customResponses: Record<string, any> | null;
  smsConsent: boolean;
  createdAt: string;
}): string {
  const statusClass = data.status === 'intaken' ? 'status-approved' : 
                      data.status === 'declined' ? 'status-rejected' : 'status-pending';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Surrender/Intake Request</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <h1>Surrender/Intake Request</h1>
    <p><strong>${data.tenantName}</strong></p>
    <p style="margin-top: 10px;">
      <span class="${statusClass} status-badge">${data.status}</span>
    </p>
  </div>

  <div class="section">
    <h2>Owner Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">${data.ownerName}</div>
      <div class="info-label">Email:</div>
      <div class="info-value">${data.ownerEmail}</div>
      <div class="info-label">Phone:</div>
      <div class="info-value">${data.ownerPhone}</div>
      <div class="info-label">SMS Consent:</div>
      <div class="info-value">${data.smsConsent ? 'Yes' : 'No'}</div>
      ${data.preferredSurrenderDate ? `
      <div class="info-label">Preferred Date:</div>
      <div class="info-value">${data.preferredSurrenderDate}</div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <h2>Dog Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">${data.dogName}</div>
      <div class="info-label">Breed:</div>
      <div class="info-value">${data.dogBreed}</div>
      <div class="info-label">Age:</div>
      <div class="info-value">${data.dogAge}</div>
      <div class="info-label">Gender:</div>
      <div class="info-value">${data.dogGender}</div>
      ${data.dogWeight ? `
      <div class="info-label">Weight:</div>
      <div class="info-value">${data.dogWeight}</div>
      ` : ''}
      <div class="info-label">Spayed/Neutered:</div>
      <div class="info-value">${data.spayedNeutered === null ? 'Unknown' : data.spayedNeutered ? 'Yes' : 'No'}</div>
      <div class="info-label">Microchipped:</div>
      <div class="info-value">${data.microchipped === null ? 'Unknown' : data.microchipped ? 'Yes' : 'No'}</div>
      ${data.microchipNumber ? `
      <div class="info-label">Microchip #:</div>
      <div class="info-value">${data.microchipNumber}</div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <h2>Compatibility</h2>
    <div class="info-grid">
      <div class="info-label">Good with Kids:</div>
      <div class="info-value">${data.goodWithKids || 'Unknown'}</div>
      <div class="info-label">Good with Dogs:</div>
      <div class="info-value">${data.goodWithDogs || 'Unknown'}</div>
      <div class="info-label">Good with Cats:</div>
      <div class="info-value">${data.goodWithCats || 'Unknown'}</div>
    </div>
  </div>

  <div class="section">
    <h2>Reason for Surrender</h2>
    <div class="notes-section">
      <p>${data.reasonForSurrender}</p>
    </div>
  </div>

  ${data.medicalIssues ? `
  <div class="section">
    <h2>Medical Issues</h2>
    <div class="notes-section">
      <p>${data.medicalIssues}</p>
    </div>
  </div>
  ` : ''}

  ${data.behavioralIssues ? `
  <div class="section">
    <h2>Behavioral Issues</h2>
    <div class="notes-section">
      <p>${data.behavioralIssues}</p>
    </div>
  </div>
  ` : ''}

  ${formatCustomResponses(data.customResponses)}

  ${data.notes ? `
  <div class="section">
    <h2>Staff Notes</h2>
    <div class="notes-section">
      <p>${data.notes}</p>
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p>Request submitted on ${data.createdAt}</p>
    <p>Document generated on ${formatDate(new Date())}</p>
    <p>${data.tenantName}</p>
  </div>
</body>
</html>`;
}

export async function generateAdoptionApplicationPDF(applicationId: string, tenantId: string): Promise<string> {
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!application || application.tenantId !== tenantId) {
    throw new Error('Application not found');
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error('Tenant not found');

  const [animal] = await db.select().from(animals).where(eq(animals.id, application.animalId)).limit(1);

  const html = generateAdoptionApplicationHTML({
    tenantName: tenant.name,
    applicantName: application.applicantName,
    applicantEmail: application.applicantEmail,
    applicantPhone: application.applicantPhone,
    animalName: animal?.name || 'Unknown',
    stage: application.stage,
    notes: application.notes,
    customResponses: application.customResponses as Record<string, any> | null,
    smsConsent: application.smsConsent,
    createdAt: formatDate(application.createdAt),
  });

  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'div', 'span', 'p', 'h1', 'h2', 'strong', 'br'],
    ALLOWED_ATTR: ['class', 'style'],
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
    await page.setContent(safeHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });
    return await uploadApplicationPdfToStorage(pdfBuffer, 'adoption', applicationId);
  } finally {
    await browser.close();
  }
}

export async function generateFosterApplicationPDF(applicationId: string, tenantId: string): Promise<string> {
  const [application] = await db
    .select()
    .from(fosterApplications)
    .where(eq(fosterApplications.id, applicationId))
    .limit(1);

  if (!application || application.tenantId !== tenantId) {
    throw new Error('Application not found');
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error('Tenant not found');

  const html = generateFosterApplicationHTML({
    tenantName: tenant.name,
    applicantName: application.applicantName,
    applicantEmail: application.applicantEmail,
    applicantPhone: application.applicantPhone,
    address: application.address,
    housingType: application.housingType,
    hasYard: application.hasYard,
    hasOtherPets: application.hasOtherPets,
    otherPetsDetails: application.otherPetsDetails,
    experience: application.experience,
    availability: application.availability,
    preferences: application.preferences,
    vetReference: application.vetReference,
    personalReference: application.personalReference,
    status: application.status,
    pipelineStatus: application.pipelineStatus,
    notes: application.notes,
    customResponses: application.customResponses as Record<string, any> | null,
    smsConsent: application.smsConsent,
    createdAt: formatDate(application.createdAt),
  });

  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'div', 'span', 'p', 'h1', 'h2', 'strong', 'br'],
    ALLOWED_ATTR: ['class', 'style'],
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
    await page.setContent(safeHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });
    return await uploadApplicationPdfToStorage(pdfBuffer, 'foster', applicationId);
  } finally {
    await browser.close();
  }
}

export async function generateVolunteerApplicationPDF(applicationId: string, tenantId: string): Promise<string> {
  const [application] = await db
    .select()
    .from(volunteerApplications)
    .where(eq(volunteerApplications.id, applicationId))
    .limit(1);

  if (!application || application.tenantId !== tenantId) {
    throw new Error('Application not found');
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error('Tenant not found');

  const html = generateVolunteerApplicationHTML({
    tenantName: tenant.name,
    name: application.applicantName,
    email: application.applicantEmail,
    phone: application.applicantPhone,
    address: application.address,
    experience: application.experience,
    availability: application.availability,
    interests: application.interests,
    skills: application.skills,
    emergencyContactName: application.emergencyContactName,
    emergencyContactPhone: application.emergencyContactPhone,
    status: application.status,
    pipelineStatus: application.pipelineStatus,
    notes: application.notes,
    customResponses: application.customResponses as Record<string, any> | null,
    smsConsent: application.smsConsent,
    createdAt: formatDate(application.createdAt),
  });

  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'div', 'span', 'p', 'h1', 'h2', 'strong', 'br'],
    ALLOWED_ATTR: ['class', 'style'],
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
    await page.setContent(safeHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });
    return await uploadApplicationPdfToStorage(pdfBuffer, 'volunteer', applicationId);
  } finally {
    await browser.close();
  }
}

export async function generateSurrenderApplicationPDF(applicationId: string, tenantId: string): Promise<string> {
  const [application] = await db
    .select()
    .from(surrenderRequests)
    .where(eq(surrenderRequests.id, applicationId))
    .limit(1);

  if (!application || application.tenantId !== tenantId) {
    throw new Error('Application not found');
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error('Tenant not found');

  const html = generateSurrenderApplicationHTML({
    tenantName: tenant.name,
    ownerName: application.ownerName,
    ownerEmail: application.ownerEmail,
    ownerPhone: application.ownerPhone,
    dogName: application.dogName,
    dogBreed: application.dogBreed,
    dogAge: application.dogAge,
    dogGender: application.dogGender,
    dogWeight: application.dogWeight,
    spayedNeutered: application.spayedNeutered,
    microchipped: application.microchipped,
    microchipNumber: application.microchipNumber,
    goodWithKids: application.goodWithKids,
    goodWithDogs: application.goodWithDogs,
    goodWithCats: application.goodWithCats,
    reasonForSurrender: application.reasonForSurrender,
    medicalIssues: application.medicalIssues,
    behavioralIssues: application.behavioralIssues,
    preferredSurrenderDate: application.preferredSurrenderDate,
    status: application.status,
    notes: application.notes,
    customResponses: application.customResponses as Record<string, any> | null,
    smsConsent: application.smsConsent,
    createdAt: formatDate(application.createdAt),
  });

  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'div', 'span', 'p', 'h1', 'h2', 'strong', 'br'],
    ALLOWED_ATTR: ['class', 'style'],
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
    await page.setContent(safeHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });
    return await uploadApplicationPdfToStorage(pdfBuffer, 'surrender', applicationId);
  } finally {
    await browser.close();
  }
}
