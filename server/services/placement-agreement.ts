import puppeteer from 'puppeteer';
import DOMPurify from 'isomorphic-dompurify';
import { objectStorageClient, signObjectURL } from '../objectStorage';
import { db } from '../db';
import { 
  placementAgreementSessions, 
  placementAgreementTemplates, 
  animals, 
  tenants, 
  users,
  personDocuments,
  fosterAnimals 
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

const DEFAULT_PLACEMENT_TEMPLATE = `
<html>
<head>
<style>
  body { font-family: 'Georgia', serif; color: #333; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { text-align: center; color: #1a1a2e; border-bottom: 2px solid #e2725b; padding-bottom: 10px; }
  h2 { color: #1a1a2e; margin-top: 24px; }
  .section { margin: 16px 0; padding: 12px 16px; background: #f9f9f9; border-left: 3px solid #e2725b; }
  .disclosures { margin: 16px 0; padding: 12px 16px; background: #fff3cd; border-left: 3px solid #ffc107; }
  .agreement-line { margin: 20px 0; padding: 12px; background: #e8f5e9; border: 1px solid #4caf50; border-radius: 4px; font-weight: bold; }
  .signature-block { margin-top: 30px; border-top: 2px solid #333; padding-top: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  td { padding: 6px 12px; border: 1px solid #ddd; }
  td:first-child { font-weight: bold; width: 40%; background: #f5f5f5; }
</style>
</head>
<body>
<h1>Animal Placement Agreement</h1>
<p style="text-align:center;color:#666;">{{organization_name}}</p>

<h2>Animal Information</h2>
<table>
  <tr><td>Animal Name</td><td>{{animal_name}}</td></tr>
  <tr><td>Animal ID</td><td>{{animal_id}}</td></tr>
  <tr><td>Breed</td><td>{{animal_breed}}</td></tr>
  <tr><td>Species</td><td>{{animal_species}}</td></tr>
  <tr><td>Sex</td><td>{{animal_sex}}</td></tr>
  <tr><td>Age</td><td>{{animal_age}}</td></tr>
  <tr><td>Microchip</td><td>{{animal_microchip}}</td></tr>
  <tr><td>Weight</td><td>{{animal_weight}}</td></tr>
</table>

<h2>Foster Information</h2>
<table>
  <tr><td>Foster Name</td><td>{{foster_name}}</td></tr>
  <tr><td>Email</td><td>{{foster_email}}</td></tr>
  <tr><td>Phone</td><td>{{foster_phone}}</td></tr>
</table>

<div class="disclosures">
<h2>Medical &amp; Behavioral Disclosures</h2>
<p><strong>Medical Notes:</strong> {{medical_disclosures}}</p>
<p><strong>Behavioral Assessment:</strong> {{behavioral_notes}}</p>
<p><strong>Special Needs:</strong> {{special_needs}}</p>
<p><strong>Dietary Restrictions:</strong> {{dietary_restrictions}}</p>
<p><strong>Requires Fenced Yard:</strong> {{needs_fence}}</p>
</div>

<div class="section">
<h2>Special Care Instructions</h2>
<p><strong>Medical Needs:</strong> {{care_instructions_medical}}</p>
<p><strong>Behavioral:</strong> {{care_instructions_behavioral}}</p>
<p><strong>Diet:</strong> {{care_instructions_diet}}</p>
<p><strong>Flight Risk:</strong> {{care_instructions_flight_risk}}</p>
</div>

<div class="section">
<h2>Additional Notes</h2>
<p>{{additional_notes}}</p>
</div>

<div class="agreement-line">
I agree this placement is subject to my Master Foster Agreement signed with {{organization_name}}.
</div>

<p>By signing below, I acknowledge that I have reviewed the above animal information and medical/behavioral disclosures, and I agree to foster this animal in accordance with the terms of my Master Foster Agreement and any additional instructions provided by {{organization_name}}.</p>

<p><strong>Date:</strong> {{date}}</p>

<div class="signature-block">
  <p><strong>Foster Signature:</strong></p>
  {{signature_image}}
  <p>{{foster_name}} — {{date}}</p>
</div>
</body>
</html>
`.trim();

export function getDefaultPlacementTemplate(): string {
  return DEFAULT_PLACEMENT_TEMPLATE;
}

export const PLACEMENT_MERGE_FIELDS: Record<string, string> = {
  '{{organization_name}}': 'Organization name',
  '{{animal_name}}': 'Animal name',
  '{{animal_id}}': 'Animal internal ID',
  '{{animal_breed}}': 'Breed',
  '{{animal_species}}': 'Species',
  '{{animal_sex}}': 'Sex',
  '{{animal_age}}': 'Age',
  '{{animal_microchip}}': 'Microchip number',
  '{{animal_weight}}': 'Weight',
  '{{foster_name}}': 'Foster parent name',
  '{{foster_email}}': 'Foster email',
  '{{foster_phone}}': 'Foster phone',
  '{{medical_disclosures}}': 'Medical alert memo',
  '{{behavioral_notes}}': 'Behavioral assessment',
  '{{special_needs}}': 'Special needs',
  '{{dietary_restrictions}}': 'Dietary restrictions',
  '{{needs_fence}}': 'Fenced yard requirement',
  '{{care_instructions_medical}}': 'Staff care notes - medical',
  '{{care_instructions_behavioral}}': 'Staff care notes - behavioral',
  '{{care_instructions_diet}}': 'Staff care notes - diet',
  '{{care_instructions_flight_risk}}': 'Staff care notes - flight risk',
  '{{care_instructions_combined}}': 'All staff care notes combined',
  '{{date}}': 'Current date',
  '{{signature_image}}': 'Signature image (auto-inserted)',
};

export async function getAllPlacementTemplates(tenantId: string) {
  return db
    .select()
    .from(placementAgreementTemplates)
    .where(eq(placementAgreementTemplates.tenantId, tenantId))
    .orderBy(placementAgreementTemplates.createdAt);
}

export async function getPlacementTemplateById(id: number, tenantId: string) {
  const [template] = await db
    .select()
    .from(placementAgreementTemplates)
    .where(
      and(
        eq(placementAgreementTemplates.id, id),
        eq(placementAgreementTemplates.tenantId, tenantId)
      )
    )
    .limit(1);
  return template || null;
}

export async function createPlacementTemplate(data: any) {
  const [template] = await db
    .insert(placementAgreementTemplates)
    .values(data)
    .returning();
  return template;
}

export async function updatePlacementTemplate(id: number, tenantId: string, updates: any) {
  const [template] = await db
    .update(placementAgreementTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(
        eq(placementAgreementTemplates.id, id),
        eq(placementAgreementTemplates.tenantId, tenantId)
      )
    )
    .returning();
  return template || null;
}

export async function deletePlacementTemplate(id: number, tenantId: string) {
  await db
    .delete(placementAgreementTemplates)
    .where(
      and(
        eq(placementAgreementTemplates.id, id),
        eq(placementAgreementTemplates.tenantId, tenantId)
      )
    );
}

export async function setDefaultPlacementTemplate(id: number, tenantId: string) {
  await db
    .update(placementAgreementTemplates)
    .set({ isDefault: false })
    .where(eq(placementAgreementTemplates.tenantId, tenantId));

  const [template] = await db
    .update(placementAgreementTemplates)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(
      and(
        eq(placementAgreementTemplates.id, id),
        eq(placementAgreementTemplates.tenantId, tenantId)
      )
    )
    .returning();
  return template || null;
}

export function validatePlacementTemplate(html: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!html || html.trim().length === 0) {
    errors.push('Template HTML cannot be empty');
  }
  if (html.length > 500000) {
    errors.push('Template HTML is too large (max 500KB)');
  }
  return { valid: errors.length === 0, errors };
}

export interface PlacementMergeData {
  organization_name: string;
  animal_name: string;
  animal_id: string;
  animal_breed: string;
  animal_species: string;
  animal_sex: string;
  animal_age: string;
  animal_microchip: string;
  animal_weight: string;
  foster_name: string;
  foster_email: string;
  foster_phone: string;
  medical_disclosures: string;
  behavioral_notes: string;
  special_needs: string;
  dietary_restrictions: string;
  needs_fence: string;
  additional_notes: string;
  care_instructions_medical: string;
  care_instructions_behavioral: string;
  care_instructions_diet: string;
  care_instructions_flight_risk: string;
  care_instructions_combined: string;
  date: string;
  signature_image?: string;
}

export function mergePlacementPlaceholders(html: string, data: PlacementMergeData): string {
  let result = html;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || 'N/A');
  }
  return result;
}

export function buildPlacementMergeData(
  animal: any,
  foster: { fullName: string; email: string; phone?: string | null },
  tenant: { name: string },
  signatureImageHtml?: string,
  carePriorities?: any,
  additionalNotes?: string
): PlacementMergeData {
  const behaviorLabels: Record<string, string> = {
    green: 'Green - Safe for all handlers',
    yellow: 'Yellow - Experienced handlers recommended',
    red: 'Red - Staff only, restricted handling',
    purple: 'Purple - Management protocol required',
  };

  return {
    organization_name: tenant.name,
    animal_name: animal.name || 'N/A',
    animal_id: animal.animalId || 'N/A',
    animal_breed: animal.breed || 'N/A',
    animal_species: animal.species || 'N/A',
    animal_sex: animal.sex || 'N/A',
    animal_age: animal.age || 'N/A',
    animal_microchip: animal.microchipNumber || 'None on file',
    animal_weight: animal.weight || 'N/A',
    foster_name: foster.fullName,
    foster_email: foster.email,
    foster_phone: foster.phone || 'N/A',
    medical_disclosures: animal.medicalAlertMemo || 'No medical alerts on file',
    behavioral_notes: animal.behaviorColor 
      ? `${behaviorLabels[animal.behaviorColor] || animal.behaviorColor}${animal.behaviorRestrictionReason ? ` — ${animal.behaviorRestrictionReason}` : ''}`
      : 'No behavioral restrictions noted',
    special_needs: animal.specialNeeds ? 'Yes — see medical notes' : 'None noted',
    dietary_restrictions: animal.dietaryRestrictions || 'None noted',
    needs_fence: animal.needsFence ? 'Yes' : 'No',
    additional_notes: additionalNotes || 'None',
    ...buildCarePriorityFields(carePriorities),
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    signature_image: signatureImageHtml || '',
  };
}

function buildCarePriorityFields(carePriorities: any): Record<string, string> {
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

async function uploadPlacementPdfToStorage(pdfBuffer: Buffer): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const objectPath = `${privateObjectDir}/placement-agreements/placement_${timestamp}_${randomId}.pdf`;
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

  return `/objects/placement-agreements/${file.name.split('/').pop()}`;
}

export async function generateSignedPlacementUrl(
  contractPath: string,
  ttlSec: number = 900,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  const filename = contractPath.split('/').pop();
  if (!filename) {
    throw new Error('Invalid contract path');
  }

  const objectPath = `${privateObjectDir}/placement-agreements/${filename}`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('Placement agreement file not found');
  }

  try {
    const responseDisposition = disposition === 'attachment'
      ? `attachment; filename="placement-agreement-${filename}"`
      : `inline; filename="placement-agreement-${filename}"`;

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
      responseDisposition,
    });
    return signedUrl;
  } catch (gcsError: any) {
    console.log('[placement-agreement] GCS signing unavailable, using Replit sidecar:', gcsError.message);
    const signedUrl = await signObjectURL({
      bucketName,
      objectName,
      method: 'GET',
      ttlSec,
    });
    return signedUrl;
  }
}

export async function generatePlacementAgreementPDF(
  sessionId: string,
  renderedHtml: string
): Promise<string> {
  const [session] = await db
    .select()
    .from(placementAgreementSessions)
    .where(eq(placementAgreementSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Placement agreement session not found');
  }

  const safeHtml = DOMPurify.sanitize(renderedHtml, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
    ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });

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

    const pdfUrl = await uploadPlacementPdfToStorage(pdfBuffer);
    return pdfUrl;
  } finally {
    await browser.close();
  }
}

export function buildSigningUrl(
  token: string,
  tenant: { customDomain?: string | null; subdomain: string }
): string {
  if (tenant.customDomain) {
    return `https://${tenant.customDomain}/placement-agreement/sign/${token}`;
  }
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const baseUrl = isProduction
    ? 'https://irescue.life'
    : process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';
  return `${baseUrl}/${tenant.subdomain}/placement-agreement/sign/${token}`;
}

export async function getOrCreateDefaultTemplate(tenantId: string): Promise<typeof placementAgreementTemplates.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(placementAgreementTemplates)
    .where(
      and(
        eq(placementAgreementTemplates.tenantId, tenantId),
        eq(placementAgreementTemplates.isActive, true),
        eq(placementAgreementTemplates.isDefault, true)
      )
    )
    .limit(1);

  if (existing) return existing;

  const [anyActive] = await db
    .select()
    .from(placementAgreementTemplates)
    .where(
      and(
        eq(placementAgreementTemplates.tenantId, tenantId),
        eq(placementAgreementTemplates.isActive, true)
      )
    )
    .limit(1);

  if (anyActive) return anyActive;

  const [created] = await db
    .insert(placementAgreementTemplates)
    .values({
      tenantId,
      name: 'Default Animal Placement Agreement',
      description: 'Standard animal placement agreement for foster care assignments',
      htmlTemplate: DEFAULT_PLACEMENT_TEMPLATE,
      isDefault: true,
      isActive: true,
    })
    .returning();

  return created;
}
