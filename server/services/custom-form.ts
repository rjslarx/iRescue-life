import DOMPurify from 'isomorphic-dompurify';
import { db } from '../db';
import { customForms, customFormSubmissions, animals, tenants } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { InsertCustomForm, CustomForm, InsertCustomFormSubmission, CustomFormSubmission } from '@shared/schema';
import crypto from 'crypto';

// Available merge fields for standalone forms
export const STANDALONE_MERGE_FIELDS = {
  '{{signer_name}}': 'Full name of the person signing',
  '{{signer_email}}': 'Email address of the signer',
  '{{signer_phone}}': 'Phone number of the signer',
  '{{date}}': 'Current date',
  '{{organization_name}}': 'Organization name',
  '{{signature_image_url}}': 'Signature image URL',
  '{{signed_timestamp}}': 'Signature timestamp (ISO format)',
  '{{signed_ip}}': 'Signer IP address (for legal verification)',
};

// Additional merge fields for animal-specific forms
export const ANIMAL_MERGE_FIELDS = {
  ...STANDALONE_MERGE_FIELDS,
  '{{animal_name}}': 'Animal name',
  '{{animal_species}}': 'Animal species (Dog, Cat, etc.)',
  '{{animal_breed}}': 'Animal breed',
  '{{animal_age}}': 'Animal age',
  '{{animal_sex}}': 'Animal sex/gender',
  '{{animal_color}}': 'Animal color/markings',
  '{{animal_microchip}}': 'Microchip number',
  '{{animal_weight}}': 'Animal weight',
};

// Default standalone form template
export const DEFAULT_STANDALONE_FORM_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .info-item { background: #fafafa; padding: 10px; border: 1px solid #ddd; }
  .label { font-weight: bold; font-size: 0.9em; color: #666; display: block; }
  .value { font-size: 1.1em; }
  .signature-block { margin-top: 50px; background-color: #f9f9f9; padding: 20px; border: 1px dashed #ccc; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 10px; font-family: 'Courier New', monospace; }
</style>
</head>
<body>
  <h1>Form Title</h1>
  <p style="text-align: center;"><strong>{{organization_name}}</strong></p>

  <h2>Participant Information</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Name:</span>
      <span class="value">{{signer_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Date:</span>
      <span class="value">{{date}}</span>
    </div>
    <div class="info-item">
      <span class="label">Email:</span>
      <span class="value">{{signer_email}}</span>
    </div>
    <div class="info-item">
      <span class="label">Phone:</span>
      <span class="value">{{signer_phone}}</span>
    </div>
  </div>

  <h2>Agreement Terms</h2>
  <p>Add your form content and terms here...</p>

  <div class="signature-block">
    <p>I, <strong>{{signer_name}}</strong>, have read and agree to the terms outlined above.</p>
    
    <div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
      <img src="{{signature_image_url}}" alt="Signature" style="max-height: 80px;" />
    </div>
    <br>
    <strong>Signature</strong>
    
    <div class="digital-stamp">
      <p>Digitally Signed via iRescue.life</p>
      <p>Timestamp: {{signed_timestamp}}</p>
      <p>IP Address: {{signed_ip}}</p>
    </div>
  </div>
</body>
</html>`;

// Default animal-specific form template
export const DEFAULT_ANIMAL_FORM_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .info-item { background: #fafafa; padding: 10px; border: 1px solid #ddd; }
  .label { font-weight: bold; font-size: 0.9em; color: #666; display: block; }
  .value { font-size: 1.1em; }
  .signature-block { margin-top: 50px; background-color: #f9f9f9; padding: 20px; border: 1px dashed #ccc; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 10px; font-family: 'Courier New', monospace; }
</style>
</head>
<body>
  <h1>Animal Form</h1>
  <p style="text-align: center;"><strong>{{organization_name}}</strong></p>

  <h2>Animal Information</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Animal Name:</span>
      <span class="value">{{animal_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Species/Breed:</span>
      <span class="value">{{animal_species}} / {{animal_breed}}</span>
    </div>
    <div class="info-item">
      <span class="label">Sex:</span>
      <span class="value">{{animal_sex}}</span>
    </div>
    <div class="info-item">
      <span class="label">Age:</span>
      <span class="value">{{animal_age}}</span>
    </div>
  </div>

  <h2>Participant Information</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Name:</span>
      <span class="value">{{signer_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Date:</span>
      <span class="value">{{date}}</span>
    </div>
    <div class="info-item">
      <span class="label">Email:</span>
      <span class="value">{{signer_email}}</span>
    </div>
    <div class="info-item">
      <span class="label">Phone:</span>
      <span class="value">{{signer_phone}}</span>
    </div>
  </div>

  <h2>Agreement Terms</h2>
  <p>Add your form content and terms here...</p>

  <div class="signature-block">
    <p>I, <strong>{{signer_name}}</strong>, have read and agree to the terms outlined above.</p>
    
    <div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
      <img src="{{signature_image_url}}" alt="Signature" style="max-height: 80px;" />
    </div>
    <br>
    <strong>Signature</strong>
    
    <div class="digital-stamp">
      <p>Digitally Signed via iRescue.life</p>
      <p>Timestamp: {{signed_timestamp}}</p>
      <p>IP Address: {{signed_ip}}</p>
    </div>
  </div>
</body>
</html>`;

// Validate HTML template
export function validateTemplateHtml(html: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!html || html.trim().length === 0) {
    errors.push('Template HTML cannot be empty');
  }
  
  if (html.length > 500000) {
    errors.push('Template HTML exceeds maximum size of 500KB');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// Generate URL-safe slug from name
export function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
  
  const uniqueSuffix = crypto.randomBytes(4).toString('hex');
  return `${baseSlug}-${uniqueSuffix}`;
}

// Sanitize HTML template for storage
export function sanitizeTemplate(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'html', 'head', 'body', 'style', 'div', 'span', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'a',
      'blockquote', 'pre', 'code',
    ],
    ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'href', 'target', 'rel', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });
}

// Get all custom forms for a tenant
export async function getAllForms(tenantId: string): Promise<CustomForm[]> {
  return db
    .select()
    .from(customForms)
    .where(eq(customForms.tenantId, tenantId))
    .orderBy(desc(customForms.createdAt));
}

// Get active custom forms for a tenant
export async function getActiveForms(tenantId: string): Promise<CustomForm[]> {
  return db
    .select()
    .from(customForms)
    .where(and(
      eq(customForms.tenantId, tenantId),
      eq(customForms.isActive, true)
    ))
    .orderBy(customForms.name);
}

// Get a single form by ID
export async function getFormById(formId: string, tenantId: string): Promise<CustomForm | null> {
  const [form] = await db
    .select()
    .from(customForms)
    .where(and(
      eq(customForms.id, formId),
      eq(customForms.tenantId, tenantId)
    ))
    .limit(1);
  
  return form || null;
}

// Get a form by public slug
export async function getFormBySlug(slug: string, tenantId: string): Promise<CustomForm | null> {
  const [form] = await db
    .select()
    .from(customForms)
    .where(and(
      eq(customForms.publicSlug, slug),
      eq(customForms.tenantId, tenantId),
      eq(customForms.isActive, true),
      eq(customForms.isPublic, true)
    ))
    .limit(1);
  
  return form || null;
}

// Create a new custom form
export async function createForm(data: InsertCustomForm): Promise<CustomForm> {
  const sanitizedHtml = sanitizeTemplate(data.htmlTemplate);
  const slug = data.isPublic ? generateSlug(data.name) : null;
  
  const [form] = await db
    .insert(customForms)
    .values({
      ...data,
      htmlTemplate: sanitizedHtml,
      publicSlug: slug,
    })
    .returning();
  
  return form;
}

// Update a custom form
export async function updateForm(
  formId: string,
  tenantId: string,
  updates: Partial<InsertCustomForm>
): Promise<CustomForm | null> {
  const updateData: any = {
    ...updates,
    updatedAt: new Date(),
  };
  
  if (updates.htmlTemplate) {
    updateData.htmlTemplate = sanitizeTemplate(updates.htmlTemplate);
  }
  
  // Generate new slug if isPublic changed to true and no slug exists
  if (updates.isPublic === true && updates.name) {
    const existingForm = await getFormById(formId, tenantId);
    if (existingForm && !existingForm.publicSlug) {
      updateData.publicSlug = generateSlug(updates.name || existingForm.name);
    }
  }
  
  const [form] = await db
    .update(customForms)
    .set(updateData)
    .where(and(
      eq(customForms.id, formId),
      eq(customForms.tenantId, tenantId)
    ))
    .returning();
  
  return form || null;
}

// Delete a custom form
export async function deleteForm(formId: string, tenantId: string): Promise<void> {
  await db
    .delete(customForms)
    .where(and(
      eq(customForms.id, formId),
      eq(customForms.tenantId, tenantId)
    ));
}

// Get form submissions for a form
export async function getFormSubmissions(
  formId: string,
  tenantId: string
): Promise<CustomFormSubmission[]> {
  return db
    .select()
    .from(customFormSubmissions)
    .where(and(
      eq(customFormSubmissions.formId, formId),
      eq(customFormSubmissions.tenantId, tenantId)
    ))
    .orderBy(desc(customFormSubmissions.createdAt));
}

// Get a single submission by ID
export async function getSubmissionById(
  submissionId: string,
  tenantId: string
): Promise<CustomFormSubmission | null> {
  const [submission] = await db
    .select()
    .from(customFormSubmissions)
    .where(and(
      eq(customFormSubmissions.id, submissionId),
      eq(customFormSubmissions.tenantId, tenantId)
    ))
    .limit(1);
  
  return submission || null;
}

// Get submission by secure token
export async function getSubmissionByToken(tokenHash: string): Promise<CustomFormSubmission | null> {
  const [submission] = await db
    .select()
    .from(customFormSubmissions)
    .where(eq(customFormSubmissions.secureTokenHash, tokenHash))
    .limit(1);
  
  return submission || null;
}

// Create a new form submission
export async function createSubmission(
  data: InsertCustomFormSubmission
): Promise<CustomFormSubmission> {
  const [submission] = await db
    .insert(customFormSubmissions)
    .values(data)
    .returning();
  
  return submission;
}

// Update a form submission
export async function updateSubmission(
  submissionId: string,
  tenantId: string,
  updates: Partial<InsertCustomFormSubmission>
): Promise<CustomFormSubmission | null> {
  const [submission] = await db
    .update(customFormSubmissions)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(
      eq(customFormSubmissions.id, submissionId),
      eq(customFormSubmissions.tenantId, tenantId)
    ))
    .returning();
  
  return submission || null;
}

// Replace merge fields in template with actual values
export async function renderFormHtml(
  form: CustomForm,
  submission: CustomFormSubmission,
  tenantName: string,
  animal?: any
): Promise<string> {
  let html = form.htmlTemplate;
  
  // Common replacements
  const replacements: Record<string, string> = {
    '{{signer_name}}': submission.signerName || '',
    '{{signer_email}}': submission.signerEmail || '',
    '{{signer_phone}}': submission.signerPhone || '',
    '{{date}}': new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    '{{organization_name}}': tenantName,
    '{{signed_timestamp}}': submission.signedAt?.toISOString() || '',
    '{{signed_ip}}': submission.signerIpAddress || '',
  };
  
  // Add animal fields if animal-specific
  if (form.formType === 'animal_specific' && animal) {
    replacements['{{animal_name}}'] = animal.name || '';
    replacements['{{animal_species}}'] = animal.species || '';
    replacements['{{animal_breed}}'] = animal.breed || '';
    replacements['{{animal_age}}'] = animal.age || '';
    replacements['{{animal_sex}}'] = animal.sex || '';
    replacements['{{animal_color}}'] = animal.color || '';
    replacements['{{animal_microchip}}'] = animal.microchipNumber || '';
    replacements['{{animal_weight}}'] = animal.weight ? `${animal.weight} lbs` : '';
  }
  
  // Handle signature image
  if (submission.signatureData) {
    replacements['{{signature_image_url}}'] = submission.signatureData;
  } else {
    replacements['{{signature_image_url}}'] = '';
  }
  
  // Apply all replacements
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  // Replace any custom form data fields
  if (submission.formData) {
    for (const [key, value] of Object.entries(submission.formData)) {
      const placeholder = `{{${key}}}`;
      html = html.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
    }
  }
  
  return html;
}

// Generate secure token for form submission
export function generateSecureToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

// Hash a token for lookup
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Generate PDF for a completed custom form submission
export async function generateCustomFormPdf(
  submissionId: string,
  tenantId: string
): Promise<{ pdfUrl: string } | null> {
  const submission = await getSubmissionById(submissionId, tenantId);
  
  if (!submission || submission.status !== 'completed' || !submission.renderedHtml) {
    console.error(`[CustomFormPdf] Cannot generate PDF: submission not found or not completed`);
    return null;
  }

  const form = await getFormById(submission.formId, tenantId);
  if (!form) {
    console.error(`[CustomFormPdf] Cannot generate PDF: form not found`);
    return null;
  }

  // Create full HTML document for PDF generation
  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
        }
        h1 { font-size: 24px; margin-bottom: 20px; color: #1a1a1a; }
        h2 { font-size: 18px; margin: 20px 0 10px; color: #333; }
        h3 { font-size: 16px; margin: 15px 0 8px; color: #444; }
        p { margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        .signature-block { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ccc; }
        .signature-img { max-height: 80px; margin: 10px 0; }
        .meta-info { font-size: 12px; color: #666; margin-top: 20px; }
      </style>
    </head>
    <body>
      <h1>${form.name}</h1>
      ${submission.renderedHtml}
      
      ${submission.signatureData ? `
        <div class="signature-block">
          <p><strong>Signature:</strong></p>
          <img src="${submission.signatureData}" alt="Signature" class="signature-img" />
        </div>
      ` : ''}
      
      <div class="meta-info">
        <p><strong>Signed by:</strong> ${submission.signerName} (${submission.signerEmail})</p>
        <p><strong>Date:</strong> ${submission.signedAt ? new Date(submission.signedAt).toLocaleString() : 'N/A'}</p>
        <p><strong>IP Address:</strong> ${submission.signerIpAddress || 'N/A'}</p>
      </div>
    </body>
    </html>
  `;

  try {
    const puppeteer = await import('puppeteer');
    
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });

    await browser.close();

    // Upload to object storage
    const { objectStorageClient } = await import('../objectStorage');
    
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      throw new Error('PRIVATE_OBJECT_DIR not configured');
    }

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const objectPath = `${privateObjectDir}/forms/form_${timestamp}_${randomId}.pdf`;
    const pathParts = objectPath.split('/');
    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join('/');

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(Buffer.from(pdfBuffer), {
      metadata: {
        contentType: 'application/pdf',
      },
    });

    // Return the object path (not a signed URL) for permanent storage
    const pdfPath = `/objects/forms/${file.name.split('/').pop()}`;
    
    console.log(`[CustomFormPdf] PDF generated for submission ${submissionId} at ${pdfPath}`);
    return { pdfUrl: pdfPath };
  } catch (error) {
    console.error(`[CustomFormPdf] Error generating PDF:`, error);
    return null;
  }
}

// Generate a time-limited signed URL for downloading a custom form PDF
export async function generateSignedFormUrl(pdfPath: string, signerName: string, ttlSec: number = 900): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  // Parse the path to get filename - pdfPath is like /objects/forms/form_123_abc.pdf
  const filename = pdfPath.split('/').pop();
  if (!filename) {
    throw new Error('Invalid PDF path');
  }

  const objectPath = `${privateObjectDir}/forms/${filename}`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const { objectStorageClient } = await import('../objectStorage');
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('Form PDF file not found');
  }

  // Generate signed URL using Google Cloud Storage
  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + ttlSec * 1000,
    responseDisposition: `attachment; filename="form_${signerName.replace(/\s+/g, '_')}_${Date.now()}.pdf"`,
  });

  return signedUrl;
}
